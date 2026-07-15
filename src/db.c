/*
 * db.c - SQLite 数据库管理
 * 对应文档: INIT1.0.md M1 - 项目脚手架与 UI 骨架
 * 功能: 数据库初始化、核心表结构创建、CRUD 操作
 */

#include "rss_reader.h"
#include <stdio.h>
#include <string.h>

sqlite3* db_init(const char *db_path)
{
    sqlite3 *db = NULL;
    char *err_msg = NULL;
    int rc;

    rc = sqlite3_open(db_path, &db);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "  [DB] 打开失败: %s\n", sqlite3_errmsg(db));
        return NULL;
    }

    sqlite3_exec(db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL);
    sqlite3_exec(db, "PRAGMA foreign_keys=ON;", NULL, NULL, NULL);

    const char *sql_feeds =
        "CREATE TABLE IF NOT EXISTS feeds ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  title TEXT NOT NULL DEFAULT '',"
        "  url TEXT NOT NULL UNIQUE,"
        "  type INTEGER NOT NULL DEFAULT 0,"
        "  description TEXT NOT NULL DEFAULT '',"
        "  site_url TEXT NOT NULL DEFAULT '',"
        "  icon_url TEXT NOT NULL DEFAULT '',"
        "  last_fetch INTEGER NOT NULL DEFAULT 0,"
        "  article_count INTEGER NOT NULL DEFAULT 0,"
        "  unread_count INTEGER NOT NULL DEFAULT 0,"
        "  is_active INTEGER NOT NULL DEFAULT 1"
        ");";

    rc = sqlite3_exec(db, sql_feeds, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "  [DB] 创建 feeds 表失败: %s\n", err_msg);
        sqlite3_free(err_msg);
        sqlite3_close(db);
        return NULL;
    }

    const char *sql_articles =
        "CREATE TABLE IF NOT EXISTS articles ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  feed_id INTEGER NOT NULL,"
        "  guid TEXT NOT NULL DEFAULT '',"
        "  title TEXT NOT NULL DEFAULT '',"
        "  author TEXT NOT NULL DEFAULT '',"
        "  link TEXT NOT NULL DEFAULT '',"
        "  description TEXT NOT NULL DEFAULT '',"
        "  content_raw TEXT NOT NULL DEFAULT '',"
        "  content_md TEXT NOT NULL DEFAULT '',"
        "  content_pure TEXT NOT NULL DEFAULT '',"
        "  summary TEXT NOT NULL DEFAULT '',"
        "  translation TEXT NOT NULL DEFAULT '',"
        "  status INTEGER NOT NULL DEFAULT 0,"
        "  pub_date INTEGER NOT NULL DEFAULT 0,"
        "  fetch_date INTEGER NOT NULL DEFAULT 0,"
        "  has_ai_summary INTEGER NOT NULL DEFAULT 0,"
        "  has_ai_translation INTEGER NOT NULL DEFAULT 0,"
        "  FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE"
        ");";

    rc = sqlite3_exec(db, sql_articles, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "  [DB] 创建 articles 表失败: %s\n", err_msg);
        sqlite3_free(err_msg);
        sqlite3_close(db);
        return NULL;
    }

    sqlite3_exec(db,
        "CREATE INDEX IF NOT EXISTS idx_articles_feed_status "
        "ON articles(feed_id, status);", NULL, NULL, NULL);

    sqlite3_exec(db,
        "CREATE TABLE IF NOT EXISTS tags ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  name TEXT NOT NULL UNIQUE,"
        "  color TEXT NOT NULL DEFAULT '#3B82F6'"
        ");", NULL, NULL, NULL);

    sqlite3_exec(db,
        "CREATE TABLE IF NOT EXISTS article_tags ("
        "  article_id INTEGER NOT NULL,"
        "  tag_id INTEGER NOT NULL,"
        "  PRIMARY KEY (article_id, tag_id),"
        "  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,"
        "  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE"
        ");", NULL, NULL, NULL);

    sqlite3_exec(db,
        "CREATE TABLE IF NOT EXISTS config ("
        "  key TEXT PRIMARY KEY,"
        "  value TEXT NOT NULL"
        ");", NULL, NULL, NULL);

    printf("  [DB] 初始化完成\n");
    return db;
}

void db_close(sqlite3 *db)
{
    if (db) {
        sqlite3_close(db);
        printf("  [DB] 连接已关闭\n");
    }
}

int feed_add(sqlite3 *db, const char *url, FeedType type)
{
    if (!db || !url) return -1;
    const char *sql = "INSERT INTO feeds (url, type) VALUES (?, ?);";
    sqlite3_stmt *stmt = NULL;

    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return -1;

    sqlite3_bind_text(stmt, 1, url, -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 2, (int)type);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        return -1;
    }
    int feed_id = (int)sqlite3_last_insert_rowid(db);
    sqlite3_finalize(stmt);
    return feed_id;
}

bool feed_delete(sqlite3 *db, int feed_id)
{
    if (!db) return false;
    const char *sql = "DELETE FROM feeds WHERE id = ?;";
    sqlite3_stmt *stmt = NULL;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;
    sqlite3_bind_int(stmt, 1, feed_id);
    bool result = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return result;
}

bool feed_get_all(sqlite3 *db, Feed **feeds, int *count)
{
    if (!db || !feeds || !count) return false;

    const char *sql = "SELECT id, title, url, type, description, site_url, "
                      "icon_url, last_fetch, article_count, unread_count, is_active "
                      "FROM feeds ORDER BY id;";
    sqlite3_stmt *stmt = NULL;

    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;

    int capacity = 16;
    *feeds = (Feed*)malloc(sizeof(Feed) * capacity);
    *count = 0;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (*count >= capacity) {
            capacity *= 2;
            Feed *new_f = (Feed*)realloc(*feeds, sizeof(Feed) * capacity);
            if (!new_f) { free(*feeds); sqlite3_finalize(stmt); return false; }
            *feeds = new_f;
        }
        Feed *f = &(*feeds)[*count];
        f->id = sqlite3_column_int(stmt, 0);
        {
            const char *t1 = (const char*)sqlite3_column_text(stmt, 1);
            safe_strcpy(f->title, t1 ? t1 : "", sizeof(f->title));
        }
        {
            const char *t2 = (const char*)sqlite3_column_text(stmt, 2);
            safe_strcpy(f->url, t2 ? t2 : "", sizeof(f->url));
        }
        f->type = (FeedType)sqlite3_column_int(stmt, 3);
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 4);
            safe_strcpy(f->description, t ? t : "", sizeof(f->description));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 5);
            safe_strcpy(f->site_url, t ? t : "", sizeof(f->site_url));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 6);
            safe_strcpy(f->icon_url, t ? t : "", sizeof(f->icon_url));
        }
        f->last_fetch_time = (time_t)sqlite3_column_int64(stmt, 7);
        f->article_count = sqlite3_column_int(stmt, 8);
        f->unread_count = sqlite3_column_int(stmt, 9);
        f->is_active = sqlite3_column_int(stmt, 10) != 0;
        (*count)++;
    }
    sqlite3_finalize(stmt);
    return true;
}

bool feed_refresh(sqlite3 *db, int feed_id)
{
    (void)db; (void)feed_id;
    printf("  [Feed] 刷新功能将在 M2 阶段实现\n");
    return true;
}

bool feed_refresh_all(sqlite3 *db)
{
    (void)db;
    printf("  [Feed] 批量刷新功能将在 M2 阶段实现\n");
    return true;
}

bool article_get_by_feed(sqlite3 *db, int feed_id,
                          Article **articles, int *count,
                          ArticleStatus status_filter)
{
    if (!db || !articles || !count) return false;

    const char *sql;
    sqlite3_stmt *stmt = NULL;

    if (status_filter == ARTICLE_UNREAD) {
        sql = "SELECT id, feed_id, guid, title, author, link, description, "
              "content_raw, content_md, content_pure, summary, translation, "
              "status, pub_date, fetch_date, has_ai_summary, has_ai_translation "
              "FROM articles WHERE feed_id = ? "
              "ORDER BY pub_date DESC LIMIT 200;";
    } else {
        sql = "SELECT id, feed_id, guid, title, author, link, description, "
              "content_raw, content_md, content_pure, summary, translation, "
              "status, pub_date, fetch_date, has_ai_summary, has_ai_translation "
              "FROM articles WHERE feed_id = ? AND status = ? "
              "ORDER BY pub_date DESC LIMIT 200;";
    }

    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;

    sqlite3_bind_int(stmt, 1, feed_id);
    if (status_filter != ARTICLE_UNREAD)
        sqlite3_bind_int(stmt, 2, (int)status_filter);

    int capacity = 32;
    *articles = (Article*)malloc(sizeof(Article) * capacity);
    *count = 0;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (*count >= capacity) {
            capacity *= 2;
            Article *new_a = (Article*)realloc(*articles, sizeof(Article) * capacity);
            if (!new_a) { free(*articles); sqlite3_finalize(stmt); return false; }
            *articles = new_a;
        }
        Article *a = &(*articles)[*count];
        memset(a, 0, sizeof(Article));
        a->id = sqlite3_column_int(stmt, 0);
        a->feed_id = sqlite3_column_int(stmt, 1);
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 2);
            safe_strcpy(a->guid, t ? t : "", sizeof(a->guid));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 3);
            safe_strcpy(a->title, t ? t : "", sizeof(a->title));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 4);
            safe_strcpy(a->author, t ? t : "", sizeof(a->author));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 5);
            safe_strcpy(a->link, t ? t : "", sizeof(a->link));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 6);
            safe_strcpy(a->description, t ? t : "", sizeof(a->description));
        }
        a->status = (ArticleStatus)sqlite3_column_int(stmt, 12);
        a->pub_date = (time_t)sqlite3_column_int64(stmt, 13);
        (*count)++;
    }
    sqlite3_finalize(stmt);
    return true;
}

bool article_get_by_id(sqlite3 *db, int article_id, Article *article)
{
    if (!db || !article) return false;
    const char *sql = "SELECT id, feed_id, guid, title, author, link, description, "
                      "content_raw, content_md, content_pure, summary, translation, "
                      "status, pub_date, fetch_date, has_ai_summary, has_ai_translation "
                      "FROM articles WHERE id = ?;";
    sqlite3_stmt *stmt = NULL;

    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;
    sqlite3_bind_int(stmt, 1, article_id);

    bool found = false;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        memset(article, 0, sizeof(Article));
        article->id = sqlite3_column_int(stmt, 0);
        article->feed_id = sqlite3_column_int(stmt, 1);
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 2);
            safe_strcpy(article->guid, t ? t : "", sizeof(article->guid));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 3);
            safe_strcpy(article->title, t ? t : "", sizeof(article->title));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 4);
            safe_strcpy(article->author, t ? t : "", sizeof(article->author));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 5);
            safe_strcpy(article->link, t ? t : "", sizeof(article->link));
        }
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 6);
            safe_strcpy(article->description, t ? t : "", sizeof(article->description));
        }
        article->status = (ArticleStatus)sqlite3_column_int(stmt, 12);
        article->pub_date = (time_t)sqlite3_column_int64(stmt, 13);
        found = true;
    }
    sqlite3_finalize(stmt);
    return found;
}

bool article_update_status(sqlite3 *db, int article_id, ArticleStatus status)
{
    if (!db) return false;
    const char *sql = "UPDATE articles SET status = ? WHERE id = ?;";
    sqlite3_stmt *stmt = NULL;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;
    sqlite3_bind_int(stmt, 1, (int)status);
    sqlite3_bind_int(stmt, 2, article_id);
    bool result = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return result;
}

bool article_save_summary(sqlite3 *db, int article_id, const char *summary)
{
    if (!db || !summary) return false;
    const char *sql = "UPDATE articles SET summary = ?, has_ai_summary = 1 WHERE id = ?;";
    sqlite3_stmt *stmt = NULL;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;
    sqlite3_bind_text(stmt, 1, summary, -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 2, article_id);
    bool result = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return result;
}

bool article_save_translation(sqlite3 *db, int article_id, const char *translation)
{
    if (!db || !translation) return false;
    const char *sql = "UPDATE articles SET translation = ?, has_ai_translation = 1 WHERE id = ?;";
    sqlite3_stmt *stmt = NULL;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;
    sqlite3_bind_text(stmt, 1, translation, -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(stmt, 2, article_id);
    bool result = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return result;
}

bool article_search(sqlite3 *db, const char *keyword, Article **articles, int *count)
{
    if (!db || !keyword || !articles || !count) return false;
    const char *sql = "SELECT id, feed_id, guid, title, author, link, description, "
                      "content_raw, content_md, content_pure, summary, translation, "
                      "status, pub_date, fetch_date, has_ai_summary, has_ai_translation "
                      "FROM articles WHERE title LIKE ? OR description LIKE ? "
                      "ORDER BY pub_date DESC LIMIT 50;";
    sqlite3_stmt *stmt = NULL;

    if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;

    char pattern[256];
    snprintf(pattern, sizeof(pattern), "%%%s%%", keyword);
    sqlite3_bind_text(stmt, 1, pattern, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, pattern, -1, SQLITE_TRANSIENT);

    int capacity = 16;
    *articles = (Article*)malloc(sizeof(Article) * capacity);
    *count = 0;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        if (*count >= capacity) {
            capacity *= 2;
            Article *new_a = (Article*)realloc(*articles, sizeof(Article) * capacity);
            if (!new_a) { free(*articles); sqlite3_finalize(stmt); return false; }
            *articles = new_a;
        }
        Article *a = &(*articles)[*count];
        memset(a, 0, sizeof(Article));
        a->id = sqlite3_column_int(stmt, 0);
        a->feed_id = sqlite3_column_int(stmt, 1);
        {
            const char *t = (const char*)sqlite3_column_text(stmt, 3);
            safe_strcpy(a->title, t ? t : "", sizeof(a->title));
        }
        a->status = (ArticleStatus)sqlite3_column_int(stmt, 12);
        (*count)++;
    }
    sqlite3_finalize(stmt);
    return true;
}
