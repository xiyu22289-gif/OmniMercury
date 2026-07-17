import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { eq, like, sql } from 'drizzle-orm';
import path from 'path';

// ============================================================
// Schema 定义（Drizzle ORM — 仅用于类型推导，不用 migrate）
// ============================================================

export const feeds = sqliteTable('feeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull().unique(),
  description: text('description'),
  link: text('link'),
  createdAt: text('created_at'),
});

export const articles = sqliteTable('articles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feedId: integer('feed_id')
    .notNull()
    .references(() => feeds.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  link: text('link'),
  content: text('content'),
  contentMd: text('content_md'),
  summary: text('summary'),
  isRead: integer('is_read').default(0),
  isStarred: integer('is_starred').default(0),
  author: text('author'),
  pubDate: text('pub_date'),
  createdAt: text('created_at'),
});

// ============================================================
// 类型导出（供 feedService / ipcHandlers 使用）
// ============================================================

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

// ============================================================
// 数据库初始化
// ============================================================

let db: BetterSQLite3Database | null = null;

/** 初始化数据库连接 + 建表。dbPath 由主进程入口传入（通常为 app.getPath('userData') 下的路径）。 */
export function initDatabase(dbPath: string): BetterSQLite3Database {
  const sqlite = new Database(dbPath);

  // 性能与安全 pragma
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // 手写原生 SQL 建表 — 符合 AGENTS.md "优先手写原生SQL" 原则
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      url         TEXT    NOT NULL UNIQUE,
      description TEXT,
      link        TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id     INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL,
      link        TEXT,
      content     TEXT,
      content_md  TEXT,
      summary     TEXT,
      is_read     INTEGER DEFAULT 0,
      is_starred  INTEGER DEFAULT 0,
      author      TEXT,
      pub_date    TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
  `);

  db = drizzle(sqlite);
  return db;
}

/** 获取已初始化的数据库实例。未初始化时抛出明确错误。 */
export function getDb(): BetterSQLite3Database {
  if (!db) {
    throw new Error('[db] 数据库未初始化，请先调用 initDatabase()。');
  }
  return db;
}

// ============================================================
// Feed CRUD
// ============================================================

/** 按 URL 查找订阅源（用于去重）。未找到返回 undefined。 */
export function getFeedByUrl(url: string): Feed | undefined {
  return getDb().select().from(feeds).where(eq(feeds.url, url)).get();
}

/** 按 ID 查找订阅源。 */
export function getFeedById(id: number): Feed | undefined {
  return getDb().select().from(feeds).where(eq(feeds.id, id)).get();
}

/** 获取全部订阅源列表（对应 listFeeds IPC）。 */
export function getAllFeeds(): Feed[] {
  return getDb().select().from(feeds).all();
}

/** 插入新订阅源，返回完整记录。 */
export function insertFeed(feed: Omit<NewFeed, 'id' | 'createdAt'>): Feed {
  return getDb()
    .insert(feeds)
    .values({
      title: feed.title,
      url: feed.url,
      description: feed.description ?? null,
      link: feed.link ?? null,
    })
    .returning()
    .get();
}

// ============================================================
// Article CRUD
// ============================================================

/** 按 feedId 查询文章列表（对应 getArticles IPC）。 */
export function getArticlesByFeedId(
  feedId: number,
): Pick<Article, 'id' | 'title' | 'isRead' | 'summary' | 'link' | 'author' | 'pubDate' | 'createdAt'>[] {
  return getDb()
    .select({
      id: articles.id,
      title: articles.title,
      isRead: articles.isRead,
      summary: articles.summary,
      link: articles.link,
      author: articles.author,
      pubDate: articles.pubDate,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(eq(articles.feedId, feedId))
    .all();
}

/** 插入单篇文章，返回完整记录。 */
export function insertArticle(
  article: Omit<NewArticle, 'id' | 'createdAt'>,
): Article {
  return getDb()
    .insert(articles)
    .values({
      feedId: article.feedId,
      title: article.title,
      link: article.link ?? null,
      content: article.content ?? null,
      contentMd: article.contentMd ?? null,
      summary: article.summary ?? null,
      isRead: article.isRead ?? 0,
      isStarred: article.isStarred ?? 0,
      author: article.author ?? null,
      pubDate: article.pubDate ?? null,
    })
    .returning()
    .get();
}

/** 批量插入文章（订阅源首次解析时使用）。 */
export function insertArticles(
  articlesList: Array<Omit<NewArticle, 'id' | 'createdAt'>>,
): Article[] {
  return articlesList.map((a) => insertArticle(a));
}

/** 将文章标记为已读。 */
export function markArticleRead(articleId: number): void {
  getDb()
    .update(articles)
    .set({ isRead: 1 })
    .where(eq(articles.id, articleId))
    .run();
}

/** 清空 feeds 和 articles 表的所有数据，保留表结构和自增计数器（AUTOINCREMENT 从 1 重新开始）。 */
export function clearAllData(): void {
  const sqlite = getDb();
  sqlite.delete(articles).run();
  sqlite.delete(feeds).run();
}

// ============================================================
// 搜索 & 离线缓存
// ============================================================

/**
 * 按标题模糊搜索文章。
 *
 * 使用 LIKE '%query%' 实现输入即搜索（如 "you are" 可匹配 "You Are Great"）。
 * 返回结果按 title 首字母大小写排序：使用 SQLite COLLATE NOCASE 实现 case-insensitive
 * 排序（例如 "excellent" 的 e 早于 "great" 的 g，所以 excellent 先出现）。
 *
 * @param query - 搜索关键词
 * @param limit - 最大返回条数（默认 20，用于 suggestions 下拉）
 */
export function searchArticlesByTitle(
  query: string,
  limit = 20,
): Pick<Article, 'id' | 'feedId' | 'title' | 'link' | 'summary' | 'author' | 'pubDate' | 'createdAt' | 'isRead'>[] {
  return getDb()
    .select({
      id: articles.id,
      feedId: articles.feedId,
      title: articles.title,
      link: articles.link,
      summary: articles.summary,
      author: articles.author,
      pubDate: articles.pubDate,
      createdAt: articles.createdAt,
      isRead: articles.isRead,
    })
    .from(articles)
    .where(like(articles.title, `%${query}%`))
    .orderBy(sql`LOWER(${articles.title}) ASC`)
    .limit(limit)
    .all();
}

/**
 * 按 ID 获取文章完整内容（含 content 和 contentMd）。
 * 用于离线回退：网络不可用时，渲染进程可通过 IPC 直接从本地 DB 获取已缓存内容。
 */
export function getArticleContentById(articleId: number): Pick<Article, 'id' | 'content' | 'contentMd'> | undefined {
  return getDb()
    .select({
      id: articles.id,
      content: articles.content,
      contentMd: articles.contentMd,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .get();
}
