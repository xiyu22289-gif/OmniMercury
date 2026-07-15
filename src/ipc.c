#include "../include/rss_reader.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../lib/cjson/cJSON.h"

/* 最大行缓冲大小 */
#define MAX_LINE 65536

/* ---- 前向声明 ---- */
static void handle_import_feed(cJSON *payload);
static void handle_refresh_feeds(void);
static void handle_list_feeds(void);
static void handle_list_articles(cJSON *payload);
static void handle_get_article_content(cJSON *payload);
static void handle_remove_feed(cJSON *payload);
static void handle_search_articles(cJSON *payload);

/* ---- 辅助函数 ---- */

/* 将 feed_t 转为 cJSON 对象 */
static cJSON *feed_to_json(const feed_t *feed)
{
    if (!feed) return NULL;
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddNumberToObject(obj, "id", feed->id);
    cJSON_AddStringToObject(obj, "title", feed->title ? feed->title : "");
    cJSON_AddStringToObject(obj, "url", feed->url ? feed->url : "");
    if (feed->link) cJSON_AddStringToObject(obj, "link", feed->link);
    if (feed->description) cJSON_AddStringToObject(obj, "description", feed->description);
    cJSON_AddStringToObject(obj, "added_at", feed->added_at ? feed->added_at : "");
    return obj;
}

/* 将 article_t 转为 cJSON 对象 */
static cJSON *article_to_json(const article_t *article)
{
    if (!article) return NULL;
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddNumberToObject(obj, "id", article->id);
    cJSON_AddNumberToObject(obj, "feed_id", article->feed_id);
    cJSON_AddStringToObject(obj, "title", article->title ? article->title : "");
    cJSON_AddStringToObject(obj, "url", article->url ? article->url : "");
    if (article->author) cJSON_AddStringToObject(obj, "author", article->author);
    if (article->summary) cJSON_AddStringToObject(obj, "summary", article->summary);
    cJSON_AddStringToObject(obj, "published_at", article->published_at ? article->published_at : "");
    cJSON_AddStringToObject(obj, "fetched_at", article->fetched_at ? article->fetched_at : "");
    cJSON_AddBoolToObject(obj, "is_read", article->is_read ? 1 : 0);
    return obj;
}

/* 发送 JSON 响应到 stdout，并刷新缓冲区 */
static void send_response(cJSON *json)
{
    if (!json) return;
    char *str = cJSON_PrintUnformatted(json);
    if (str) {
        fprintf(stdout, "%s\n", str);
        fflush(stdout);
        free(str);
    }
    cJSON_Delete(json);
}

/* 发送错误响应 */
static void send_error(int error_code, const char *type)
{
    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", type);
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "error", error_code);
    cJSON_AddItemToObject(resp, "payload", payload);
    send_response(resp);
}

/* 发送推送消息 */
static void push_message(const char *type, cJSON *payload)
{
    cJSON *msg = cJSON_CreateObject();
    cJSON_AddStringToObject(msg, "type", type);
    cJSON_AddItemToObject(msg, "payload", payload);
    send_response(msg);
}

/* ---- 处理函数实现 ---- */

static void handle_import_feed(cJSON *payload)
{
    cJSON *url_item = payload ? cJSON_GetObjectItem(payload, "url") : NULL;
    if (!url_item || !cJSON_IsString(url_item)) {
        send_error(IPC_ERROR_INVALID_PARAM, "import_feed");
        return;
    }

    const char *url = url_item->valuestring;

    /* 插入 feed 到数据库 */
    feed_t feed;
    memset(&feed, 0, sizeof(feed));
    if (db_insert_feed(url, &feed) != 0) {
        send_error(IPC_ERROR_DATABASE_ERROR, "import_feed");
        return;
    }

    /* 尝试抓取并解析该 RSS 源 */
    char *xml_body = NULL;
    size_t xml_size = 0;
    int new_count = 0;

    if (fetch_url(url, &xml_body, &xml_size) == 0) {
        parse_feed(xml_body, xml_size, feed.id, &new_count);
        fetch_free(xml_body);
    }

    /* 重新读取 feed 以获取可能更新的标题等信息 */
    feed_t *feeds = NULL;
    int feed_count = 0;
    feed_t *result_feed = NULL;

    if (db_get_all_feeds(&feeds, &feed_count) == 0) {
        for (int i = 0; i < feed_count; i++) {
            if (feeds[i].id == feed.id) {
                result_feed = &feeds[i];
                break;
            }
        }
    }

    /* 构建响应 */
    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "import_feed");
    cJSON *p = cJSON_CreateObject();
    cJSON_AddNumberToObject(p, "error", IPC_ERROR_SUCCESS);
    cJSON_AddItemToObject(p, "feed", feed_to_json(result_feed ? result_feed : &feed));
    cJSON_AddItemToObject(resp, "payload", p);
    send_response(resp);

    /* 释放临时的 feed 分配 */
    if (feeds) free_feed_list(feeds, feed_count);
    free(feed.title);
    free(feed.url);
    free(feed.added_at);

    /* 如果有新文章，推送通知 */
    if (new_count > 0) {
        cJSON *push_payload = cJSON_CreateObject();
        cJSON_AddNumberToObject(push_payload, "feed_id", feed.id);
        cJSON_AddNumberToObject(push_payload, "new_count", new_count);
        push_message("articles_updated", push_payload);
    }
}

static void handle_refresh_feeds(void)
{
    /* 先立即回复：任务已接收 */
    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "refresh_feeds");
    cJSON *p = cJSON_CreateObject();
    cJSON_AddNumberToObject(p, "error", IPC_ERROR_SUCCESS);
    cJSON_AddItemToObject(resp, "payload", p);
    send_response(resp);

    /* 获取所有 feeds，逐一刷新 */
    feed_t *feeds = NULL;
    int feed_count = 0;
    if (db_get_all_feeds(&feeds, &feed_count) != 0) {
        fprintf(stderr, "[ipc] refresh_feeds: failed to get feeds\n");
        return;
    }

    for (int i = 0; i < feed_count; i++) {
        char *xml_body = NULL;
        size_t xml_size = 0;
        fprintf(stderr, "[ipc] refreshing feed %d: %s\n", feeds[i].id, feeds[i].url);

        if (fetch_url(feeds[i].url, &xml_body, &xml_size) == 0) {
            int new_count = 0;
            if (parse_feed(xml_body, xml_size, feeds[i].id, &new_count) == 0) {
                if (new_count > 0) {
                    cJSON *push_payload = cJSON_CreateObject();
                    cJSON_AddNumberToObject(push_payload, "feed_id", feeds[i].id);
                    cJSON_AddNumberToObject(push_payload, "new_count", new_count);
                    push_message("articles_updated", push_payload);
                }
            }
            fetch_free(xml_body);
        } else {
            fprintf(stderr, "[ipc] refresh_feeds: failed to fetch %s\n", feeds[i].url);
        }
    }

    free_feed_list(feeds, feed_count);
}

static void handle_list_feeds(void)
{
    feed_t *feeds = NULL;
    int count = 0;

    if (db_get_all_feeds(&feeds, &count) != 0) {
        send_error(IPC_ERROR_DATABASE_ERROR, "list_feeds");
        return;
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "list_feeds");
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "error", IPC_ERROR_SUCCESS);

    cJSON *feeds_array = cJSON_AddArrayToObject(payload, "feeds");
    for (int i = 0; i < count; i++) {
        cJSON_AddItemToArray(feeds_array, feed_to_json(&feeds[i]));
    }

    cJSON_AddItemToObject(resp, "payload", payload);
    send_response(resp);

    free_feed_list(feeds, count);
}

static void handle_list_articles(cJSON *payload)
{
    cJSON *feed_id_item = payload ? cJSON_GetObjectItem(payload, "feed_id") : NULL;
    if (!feed_id_item || !cJSON_IsNumber(feed_id_item)) {
        send_error(IPC_ERROR_INVALID_PARAM, "list_articles");
        return;
    }

    int feed_id = feed_id_item->valueint;
    int offset = 0;
    int limit = 20;

    cJSON *offset_item = cJSON_GetObjectItem(payload, "offset");
    if (offset_item && cJSON_IsNumber(offset_item)) {
        offset = offset_item->valueint;
    }

    cJSON *limit_item = cJSON_GetObjectItem(payload, "limit");
    if (limit_item && cJSON_IsNumber(limit_item)) {
        limit = limit_item->valueint;
    }

    article_t *articles = NULL;
    int count = 0;

    if (db_get_articles_by_feed(feed_id, offset, limit, &articles, &count) != 0) {
        send_error(IPC_ERROR_DATABASE_ERROR, "list_articles");
        return;
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "list_articles");
    cJSON *p = cJSON_CreateObject();
    cJSON_AddNumberToObject(p, "error", IPC_ERROR_SUCCESS);
    cJSON *articles_array = cJSON_AddArrayToObject(p, "articles");
    for (int i = 0; i < count; i++) {
        cJSON_AddItemToArray(articles_array, article_to_json(&articles[i]));
    }
    cJSON_AddItemToObject(resp, "payload", p);
    send_response(resp);

    free_article_list(articles, count);
}

static void handle_get_article_content(cJSON *payload)
{
    cJSON *article_id_item = payload ? cJSON_GetObjectItem(payload, "article_id") : NULL;
    if (!article_id_item || !cJSON_IsNumber(article_id_item)) {
        send_error(IPC_ERROR_INVALID_PARAM, "get_article_content");
        return;
    }

    int article_id = article_id_item->valueint;
    article_content_t content;
    memset(&content, 0, sizeof(content));

    if (db_get_article_content(article_id, &content) != 0) {
        send_error(IPC_ERROR_NOT_FOUND, "get_article_content");
        return;
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "get_article_content");
    cJSON *p = cJSON_CreateObject();
    cJSON_AddNumberToObject(p, "error", IPC_ERROR_SUCCESS);
    cJSON *content_obj = cJSON_CreateObject();
    cJSON_AddNumberToObject(content_obj, "id", content.id);
    cJSON_AddStringToObject(content_obj, "content", content.content ? content.content : "");
    cJSON_AddItemToObject(p, "content", content_obj);
    cJSON_AddItemToObject(resp, "payload", p);
    send_response(resp);

    free_article_content(&content);
}

static void handle_remove_feed(cJSON *payload)
{
    cJSON *feed_id_item = payload ? cJSON_GetObjectItem(payload, "feed_id") : NULL;
    if (!feed_id_item || !cJSON_IsNumber(feed_id_item)) {
        send_error(IPC_ERROR_INVALID_PARAM, "remove_feed");
        return;
    }

    int feed_id = feed_id_item->valueint;

    if (db_delete_feed(feed_id) != 0) {
        send_error(IPC_ERROR_NOT_FOUND, "remove_feed");
        return;
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "remove_feed");
    cJSON *p = cJSON_CreateObject();
    cJSON_AddNumberToObject(p, "error", IPC_ERROR_SUCCESS);
    cJSON_AddItemToObject(resp, "payload", p);
    send_response(resp);
}

static void handle_search_articles(cJSON *payload)
{
    cJSON *query_item = payload ? cJSON_GetObjectItem(payload, "query") : NULL;
    if (!query_item || !cJSON_IsString(query_item)) {
        send_error(IPC_ERROR_INVALID_PARAM, "search_articles");
        return;
    }

    const char *query = query_item->valuestring;
    int feed_id = 0;
    int offset = 0;
    int limit = 20;

    cJSON *feed_id_item = cJSON_GetObjectItem(payload, "feed_id");
    if (feed_id_item && cJSON_IsNumber(feed_id_item)) {
        feed_id = feed_id_item->valueint;
    }

    cJSON *offset_item = cJSON_GetObjectItem(payload, "offset");
    if (offset_item && cJSON_IsNumber(offset_item)) {
        offset = offset_item->valueint;
    }

    cJSON *limit_item = cJSON_GetObjectItem(payload, "limit");
    if (limit_item && cJSON_IsNumber(limit_item)) {
        limit = limit_item->valueint;
    }

    article_t *articles = NULL;
    int count = 0;

    if (db_search_articles(query, feed_id, offset, limit, &articles, &count) != 0) {
        send_error(IPC_ERROR_DATABASE_ERROR, "search_articles");
        return;
    }

    cJSON *resp = cJSON_CreateObject();
    cJSON_AddStringToObject(resp, "type", "search_articles");
    cJSON *p = cJSON_CreateObject();
    cJSON_AddNumberToObject(p, "error", IPC_ERROR_SUCCESS);
    cJSON *articles_array = cJSON_AddArrayToObject(p, "articles");
    for (int i = 0; i < count; i++) {
        cJSON_AddItemToArray(articles_array, article_to_json(&articles[i]));
    }
    cJSON_AddItemToObject(resp, "payload", p);
    send_response(resp);

    free_article_list(articles, count);
}

/* ---- 主消息处理循环 ---- */

void ipc_loop(void)
{
    char line[MAX_LINE];

    fprintf(stderr, "[ipc] Entering IPC message loop\n");

    while (fgets(line, sizeof(line), stdin)) {
        /* 去除末尾换行符 */
        size_t len = strlen(line);
        if (len > 0 && line[len - 1] == '\n') {
            line[len - 1] = '\0';
        }

        if (len == 0 || line[0] == '\0') continue;

        /* 解析 JSON */
        cJSON *msg = cJSON_Parse(line);
        if (!msg) {
            fprintf(stderr, "[ipc] Failed to parse JSON: %s\n", line);
            send_error(IPC_ERROR_INVALID_PARAM, "");
            continue;
        }

        /* 提取 type */
        cJSON *type_item = cJSON_GetObjectItem(msg, "type");
        if (!type_item || !cJSON_IsString(type_item)) {
            fprintf(stderr, "[ipc] Message missing 'type' field\n");
            send_error(IPC_ERROR_INVALID_PARAM, "");
            cJSON_Delete(msg);
            continue;
        }

        const char *type = type_item->valuestring;
        cJSON *payload = cJSON_GetObjectItem(msg, "payload");

        fprintf(stderr, "[ipc] Received message type: %s\n", type);

        /* 路由分发 */
        if (strcmp(type, "import_feed") == 0) {
            handle_import_feed(payload);
        } else if (strcmp(type, "refresh_feeds") == 0) {
            handle_refresh_feeds();
        } else if (strcmp(type, "list_feeds") == 0) {
            handle_list_feeds();
        } else if (strcmp(type, "list_articles") == 0) {
            handle_list_articles(payload);
        } else if (strcmp(type, "get_article_content") == 0) {
            handle_get_article_content(payload);
        } else if (strcmp(type, "remove_feed") == 0) {
            handle_remove_feed(payload);
        } else if (strcmp(type, "search_articles") == 0) {
            handle_search_articles(payload);
        } else {
            fprintf(stderr, "[ipc] Unknown message type: %s\n", type);
            send_error(IPC_ERROR_INVALID_PARAM, type);
        }

        cJSON_Delete(msg);
    }

    fprintf(stderr, "[ipc] IPC message loop exited\n");
}