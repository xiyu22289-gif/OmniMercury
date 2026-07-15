#include "../include/rss_reader.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxml/HTMLparser.h>

/* ---- 内部辅助函数 ---- */

/* 获取 xmlNode 的直接子节点中第一个指定名称的元素 */
static xmlNode *find_child(xmlNode *parent, const char *name)
{
    if (!parent || !name) return NULL;
    for (xmlNode *cur = parent->children; cur; cur = cur->next) {
        if (cur->type == XML_ELEMENT_NODE && xmlStrcmp(cur->name, (const xmlChar *)name) == 0) {
            return cur;
        }
    }
    return NULL;
}

/* 获取节点文本内容 */
static char *node_text(xmlNode *node)
{
    if (!node) return NULL;
    xmlChar *content = xmlNodeGetContent(node);
    if (!content) return NULL;
    char *result = strdup((const char *)content);
    xmlFree(content);
    /* 去除首尾空白 */
    if (result) {
        char *trimmed = trim_whitespace(result);
        if (trimmed != result) {
            /* trim_whitespace 原地修改，返回指针可能不同 */
            result = trimmed;
        }
    }
    return result;
}

/* 获取当前时间 ISO 8601 字符串 */
static void get_now_iso8601(char *buf, size_t size)
{
    iso8601_now(buf, size);
}

/* ---- RSS 2.0 解析 ---- */

static int parse_rss(xmlNode *root, int feed_id, int *new_count)
{
    xmlNode *channel = find_child(root, "channel");
    if (!channel) {
        fprintf(stderr, "[parser] RSS: no <channel> element\n");
        return -1;
    }

    /* 更新 feed 标题等信息 */
    {
        xmlNode *title_node = find_child(channel, "title");
        xmlNode *link_node = find_child(channel, "link");
        xmlNode *desc_node = find_child(channel, "description");

        char *title_text = title_node ? node_text(title_node) : NULL;
        char *link_text = link_node ? node_text(link_node) : NULL;
        char *desc_text = desc_node ? node_text(desc_node) : NULL;

        /* 通过 db.c 更新 feed 信息 —— 这里暂时跳过，因为 db.c 没有
         * update_feed 接口。feed 的标题将在后续改进中通过其他方式更新。
         * 当前阶段保持初始的 url 作为标题。
         */
        (void)title_text;
        (void)link_text;
        (void)desc_text;

        /* TODO: 添加 db_update_feed 接口 */
        free(title_text);
        free(link_text);
        free(desc_text);
    }

    char now[32];
    get_now_iso8601(now, sizeof(now));

    int added = 0;

    for (xmlNode *item = channel->children; item; item = item->next) {
        if (item->type != XML_ELEMENT_NODE) continue;
        if (xmlStrcmp(item->name, (const xmlChar *)"item") != 0) continue;

        char *title = node_text(find_child(item, "title"));
        char *link = node_text(find_child(item, "link"));
        char *author = node_text(find_child(item, "author"));
        /* dc:creator 作为备选作者 */
        if (!author) {
            for (xmlNode *cur = item->children; cur; cur = cur->next) {
                if (cur->type == XML_ELEMENT_NODE &&
                    xmlStrcmp(cur->name, (const xmlChar *)"creator") == 0) {
                    author = node_text(cur);
                    break;
                }
            }
        }
        char *description = node_text(find_child(item, "description"));
        char *pub_date = node_text(find_child(item, "pubDate"));

        /* 清理 HTML 标签形成摘要 */
        if (description) {
            strip_html(description);
            char *trimmed = trim_whitespace(description);
            if (trimmed != description) {
                char *tmp = strdup(trimmed);
                free(description);
                description = tmp;
            }
            /* 截断过长的摘要 */
            if (strlen(description) > 500) {
                description[500] = '\0';
            }
        }

        /* content:encoded 作为文章全文 */
        char *content = NULL;
        for (xmlNode *cur = item->children; cur; cur = cur->next) {
            if (cur->type == XML_ELEMENT_NODE &&
                xmlStrcmp(cur->name, (const xmlChar *)"encoded") == 0) {
                content = node_text(cur);
                break;
            }
        }

        if (link && title) {
            int is_new = 0;
            db_insert_article(feed_id, title, link, author,
                              description, pub_date, now,
                              content, &is_new);
            if (is_new > 0) {
                added++;
            }
        }

        free(title);
        free(link);
        free(author);
        free(description);
        free(pub_date);
        free(content);
    }

    if (new_count) *new_count = added;
    return 0;
}

/* ---- Atom 解析 ---- */

static int parse_atom(xmlNode *root, int feed_id, int *new_count)
{
    /* Atom 命名空间 */
    char now[32];
    get_now_iso8601(now, sizeof(now));

    int added = 0;

    for (xmlNode *entry = root->children; entry; entry = entry->next) {
        if (entry->type != XML_ELEMENT_NODE) continue;
        if (xmlStrcmp(entry->name, (const xmlChar *)"entry") != 0) continue;

        char *title = node_text(find_child(entry, "title"));
        char *author_name = NULL;
        xmlNode *author_node = find_child(entry, "author");
        if (author_node) {
            author_name = node_text(find_child(author_node, "name"));
        }

        /* 获取 link href */
        char *link_href = NULL;
        for (xmlNode *link_node = entry->children; link_node; link_node = link_node->next) {
            if (link_node->type == XML_ELEMENT_NODE &&
                xmlStrcmp(link_node->name, (const xmlChar *)"link") == 0) {
                xmlChar *rel = xmlGetProp(link_node, (const xmlChar *)"rel");
                xmlChar *href = xmlGetProp(link_node, (const xmlChar *)"href");
                if (href) {
                    if (!rel || xmlStrcmp(rel, (const xmlChar *)"alternate") == 0) {
                        /* 优先取 alternate，否则取第一个 */
                        free(link_href);
                        link_href = strdup((const char *)href);
                    } else if (!link_href) {
                        link_href = strdup((const char *)href);
                    }
                }
                if (rel) xmlFree(rel);
                if (href) xmlFree(href);
                if (link_href && (!rel || xmlStrcmp(rel, (const xmlChar *)"alternate") == 0)) {
                    break;
                }
            }
        }

        /* summary */
        char *summary = node_text(find_child(entry, "summary"));
        if (!summary) {
            summary = node_text(find_child(entry, "content"));
        }

        /* 清理 HTML 形成摘要 */
        if (summary) {
            strip_html(summary);
            char *trimmed = trim_whitespace(summary);
            if (trimmed != summary) {
                char *tmp = strdup(trimmed);
                free(summary);
                summary = tmp;
            }
            if (strlen(summary) > 500) {
                summary[500] = '\0';
            }
        }

        char *published = node_text(find_child(entry, "published"));
        if (!published) {
            published = node_text(find_child(entry, "updated"));
        }

        /* 获取 content 作为全文 */
        char *content = NULL;
        xmlNode *content_node = find_child(entry, "content");
        if (content_node) {
            content = node_text(content_node);
        }

        if (link_href && title) {
            int is_new = 0;
            db_insert_article(feed_id, title, link_href, author_name,
                              summary, published, now,
                              content, &is_new);
            if (is_new > 0) {
                added++;
            }
        }

        free(title);
        free(author_name);
        free(link_href);
        free(summary);
        free(published);
        free(content);
    }

    if (new_count) *new_count = added;
    return 0;
}

/* ---- 公开接口 ---- */

int parse_feed(const char *xml, size_t xml_len, int feed_id, int *new_count)
{
    xmlDoc *doc = NULL;
    xmlNode *root = NULL;
    int result = -1;

    if (!xml || xml_len == 0) {
        fprintf(stderr, "[parser] empty XML content\n");
        return -1;
    }

    /* 尝试解析 XML */
    doc = xmlReadMemory(xml, (int)xml_len, NULL, NULL,
                        XML_PARSE_RECOVER | XML_PARSE_NOERROR | XML_PARSE_NOWARNING);
    if (!doc) {
        fprintf(stderr, "[parser] xmlReadMemory failed\n");
        return -1;
    }

    root = xmlDocGetRootElement(doc);
    if (!root) {
        fprintf(stderr, "[parser] no root element\n");
        xmlFreeDoc(doc);
        return -1;
    }

    /* 判断 RSS 还是 Atom */
    if (xmlStrcmp(root->name, (const xmlChar *)"rss") == 0) {
        result = parse_rss(root, feed_id, new_count);
    } else if (xmlStrcmp(root->name, (const xmlChar *)"feed") == 0) {
        result = parse_atom(root, feed_id, new_count);
    } else {
        fprintf(stderr, "[parser] unknown root element: %s\n", root->name);
    }

    xmlFreeDoc(doc);
    return result;
}