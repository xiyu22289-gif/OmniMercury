#ifndef RSS_READER_H
#define RSS_READER_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <time.h>
#include <sqlite3.h>
#include <curl/curl.h>
#include <cjson/cJSON.h>

#define PROJECT_NAME    "Summer RSS Reader"
#define PROJECT_VERSION "1.0.0"

#define MAX_URL_LEN         2048
#define MAX_TITLE_LEN       512
#define MAX_DESC_LEN        8192
#define MAX_CONTENT_LEN     1048576
#define MAX_PATH_LEN        1024
#define MAX_FEED_COUNT      1024
#define MAX_ARTICLE_COUNT   65536

typedef enum {
    FEED_TYPE_RSS  = 0,
    FEED_TYPE_ATOM = 1,
    FEED_TYPE_JSON = 2
} FeedType;

typedef enum {
    ARTICLE_UNREAD    = 0,
    ARTICLE_READ      = 1,
    ARTICLE_STARRED   = 2,
    ARTICLE_ARCHIVED  = 3
} ArticleStatus;

typedef struct {
    int id;
    char title[MAX_TITLE_LEN];
    char url[MAX_URL_LEN];
    FeedType type;
    char description[MAX_DESC_LEN];
    char site_url[MAX_URL_LEN];
    char icon_url[MAX_URL_LEN];
    time_t last_fetch_time;
    int article_count;
    int unread_count;
    bool is_active;
} Feed;

typedef struct {
    int id;
    int feed_id;
    char guid[MAX_URL_LEN];
    char title[MAX_TITLE_LEN];
    char author[128];
    char link[MAX_URL_LEN];
    char description[MAX_DESC_LEN];
    char content_raw[MAX_CONTENT_LEN];
    char content_md[MAX_CONTENT_LEN];
    char content_pure[MAX_CONTENT_LEN];
    char summary[MAX_CONTENT_LEN];
    char translation[MAX_CONTENT_LEN];
    ArticleStatus status;
    time_t pub_date;
    time_t fetch_date;
    bool has_ai_summary;
    bool has_ai_translation;
} Article;

typedef struct {
    int id;
    char name[64];
    char color[8];
} Tag;

/* 数据库 */
sqlite3* db_init(const char *db_path);
void db_close(sqlite3 *db);

/* 订阅源 */
int feed_add(sqlite3 *db, const char *url, FeedType type);
bool feed_delete(sqlite3 *db, int feed_id);
bool feed_get_all(sqlite3 *db, Feed **feeds, int *count);
bool feed_refresh(sqlite3 *db, int feed_id);
bool feed_refresh_all(sqlite3 *db);

/* 文章 */
bool article_get_by_feed(sqlite3 *db, int feed_id,
                          Article **articles, int *count,
                          ArticleStatus status_filter);
bool article_get_by_id(sqlite3 *db, int article_id, Article *article);
bool article_update_status(sqlite3 *db, int article_id, ArticleStatus status);
bool article_save_summary(sqlite3 *db, int article_id, const char *summary);
bool article_save_translation(sqlite3 *db, int article_id, const char *translation);
bool article_search(sqlite3 *db, const char *keyword,
                    Article **articles, int *count);

/* 工具 */
size_t safe_strcpy(char *dst, const char *src, size_t dst_size);
char* str_trim(char *str);
void current_time_str(char *buf, size_t buf_size);
void timestamp_to_str(time_t ts, char *buf, size_t buf_size);
char* url_encode(const char *str);
int html_entity_decode(char *str);
bool ensure_dir(const char *path);

#endif /* RSS_READER_H */
