import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { eq, like, sql, inArray } from 'drizzle-orm';
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
  translations: text('translations'),
  isRead: integer('is_read').default(0),
  isStarred: integer('is_starred').default(0),
  author: text('author'),
  pubDate: text('pub_date'),
  createdAt: text('created_at'),
});

// ===== M5: 标签系统 =====
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: text('created_at'),
});

export const articleTags = sqliteTable('article_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: integer('article_id')
    .notNull()
    .references(() => articles.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  uniqueArticleTag: sql`UNIQUE(${table.articleId}, ${table.tagId})`,
}));

// ===== M6: 笔记系统 =====
export const articleNotes = sqliteTable('article_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: integer('article_id')
    .notNull()
    .unique()
    .references(() => articles.id, { onDelete: 'cascade' }),
  content: text('content').default(''),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ===== M7: Token 用量统计 =====
export const tokenUsage = sqliteTable('token_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  model: text('model').notNull(),
  operation: text('operation').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  source: text('source').notNull().default('api'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 类型导出
// ============================================================

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type ArticleTag = typeof articleTags.$inferSelect;
export type NewArticleTag = typeof articleTags.$inferInsert;
export type ArticleNote = typeof articleNotes.$inferSelect;
export type NewArticleNote = typeof articleNotes.$inferInsert;
export type TokenUsage = typeof tokenUsage.$inferSelect;
export type NewTokenUsage = typeof tokenUsage.$inferInsert;

// ============================================================
// 数据库初始化
// ============================================================

let db: BetterSQLite3Database | null = null;

export function initDatabase(dbPath: string): BetterSQLite3Database {
  const sqlite = new Database(dbPath);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

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
      translations TEXT,
      is_read     INTEGER DEFAULT 0,
      is_starred  INTEGER DEFAULT 0,
      author      TEXT,
      pub_date    TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      color       TEXT,
      created_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(article_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS article_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id  INTEGER NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
      content     TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      model           TEXT    NOT NULL,
      operation       TEXT    NOT NULL,
      prompt_tokens   INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      source          TEXT    NOT NULL DEFAULT 'api',
      created_at      TEXT    DEFAULT (datetime('now'))
    );
  `);

  // M4 兼容迁移：translations 列
  try {
    sqlite.exec('ALTER TABLE articles ADD COLUMN translations TEXT');
  } catch {
    // 列已存在，忽略
  }

  // M5 兼容迁移：tags / article_tags 表
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        color       TEXT,
        created_at  TEXT    DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS article_tags (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(article_id, tag_id)
      );
    `);
  } catch {
    // 表已存在，忽略
  }

  db = drizzle(sqlite);
  return db;
}

export function getDb(): BetterSQLite3Database {
  if (!db) {
    throw new Error('[db] 数据库未初始化，请先调用 initDatabase()。');
  }
  return db;
}

// ============================================================
// Feed CRUD
// ============================================================

export function getFeedByUrl(url: string): Feed | undefined {
  return getDb().select().from(feeds).where(eq(feeds.url, url)).get();
}

export function getFeedById(id: number): Feed | undefined {
  return getDb().select().from(feeds).where(eq(feeds.id, id)).get();
}

export function getAllFeeds(): Feed[] {
  return getDb().select().from(feeds).all();
}

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

export function getArticlesByFeedId(
  feedId: number,
): Pick<Article, 'id' | 'title' | 'isRead' | 'summary' | 'translations' | 'link' | 'author' | 'pubDate' | 'createdAt'>[] {
  return getDb()
    .select({
      id: articles.id,
      title: articles.title,
      isRead: articles.isRead,
      summary: articles.summary,
      translations: articles.translations,
      link: articles.link,
      author: articles.author,
      pubDate: articles.pubDate,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(eq(articles.feedId, feedId))
    .orderBy(sql`${articles.pubDate} DESC`)
    .all();
}

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

export function insertArticles(
  articlesList: Array<Omit<NewArticle, 'id' | 'createdAt'>>,
): Article[] {
  return articlesList.map((a) => insertArticle(a));
}

export function markArticleRead(articleId: number): void {
  getDb()
    .update(articles)
    .set({ isRead: 1 })
    .where(eq(articles.id, articleId))
    .run();
}

export function clearAllData(): void {
  const sqlite = getDb();
  sqlite.delete(articles).run();
  sqlite.delete(feeds).run();
}

// ============================================================
// 搜索 & 离线缓存
// ============================================================

export function searchArticlesByTitle(
  query: string,
  limit = 20,
): Pick<Article, 'id' | 'feedId' | 'title' | 'link' | 'summary' | 'translations' | 'author' | 'pubDate' | 'createdAt' | 'isRead'>[] {
  return getDb()
    .select({
      id: articles.id,
      feedId: articles.feedId,
      title: articles.title,
      link: articles.link,
      summary: articles.summary,
      translations: articles.translations,
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

export function getArticleContentById(articleId: number): Pick<Article, 'id' | 'content' | 'contentMd' | 'translations'> | undefined {
  return getDb()
    .select({
      id: articles.id,
      content: articles.content,
      contentMd: articles.contentMd,
      translations: articles.translations,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .get();
}

export function getArticleByLink(feedId: number, link: string): Article | undefined {
  return getDb()
    .select()
    .from(articles)
    .where(
      sql`${articles.feedId} = ${feedId} AND ${articles.link} = ${link}`
    )
    .get();
}

// ===== M5: 标签筛选 =====
export function getArticlesByIds(
  ids: number[],
): Pick<Article, 'id' | 'feedId' | 'title' | 'isRead' | 'summary' | 'translations' | 'link' | 'author' | 'pubDate' | 'createdAt'>[] {
  if (ids.length === 0) return []
  return getDb()
    .select({
      id: articles.id,
      feedId: articles.feedId,
      title: articles.title,
      isRead: articles.isRead,
      summary: articles.summary,
      translations: articles.translations,
      link: articles.link,
      author: articles.author,
      pubDate: articles.pubDate,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(inArray(articles.id, ids))
    .orderBy(sql`${articles.pubDate} DESC`)
    .all();
}

// ============================================================
// M6: Article Notes CRUD
// ============================================================

export function getNoteByArticleId(articleId: number): ArticleNote | undefined {
  return getDb()
    .select()
    .from(articleNotes)
    .where(eq(articleNotes.articleId, articleId))
    .get();
}

export function upsertNote(articleId: number, content: string): ArticleNote {
  const existing = getNoteByArticleId(articleId);
  if (existing) {
    return getDb()
      .update(articleNotes)
      .set({ content, updatedAt: new Date().toISOString() })
      .where(eq(articleNotes.articleId, articleId))
      .returning()
      .get() as ArticleNote;
  }
  return getDb()
    .insert(articleNotes)
    .values({ articleId, content })
    .returning()
    .get() as ArticleNote;
}

export function deleteNoteByArticleId(articleId: number): void {
  getDb()
    .delete(articleNotes)
    .where(eq(articleNotes.articleId, articleId))
    .run();
}

export function getAllNoteArticleIds(): { articleId: number }[] {
  return getDb()
    .select({ articleId: articleNotes.articleId })
    .from(articleNotes)
    .all();
}

// ============================================================
// M7: Token 用量统计
// ============================================================

export function insertTokenUsage(record: { model: string; operation: string; promptTokens: number; completionTokens: number; source: string }): TokenUsage {
  return getDb()
    .insert(tokenUsage)
    .values({
      model: record.model,
      operation: record.operation,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      source: record.source,
    })
    .returning()
    .get();
}

export interface TokenStats {
  model: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  callCount: number;
  byOperation: { operation: string; prompt: number; completion: number }[];
}

export function getTokenStats(days: number = 30): TokenStats[] {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = getDb()
    .select()
    .from(tokenUsage)
    .where(sql`${tokenUsage.createdAt} >= ${cutoff}`)
    .orderBy(sql`${tokenUsage.model} ASC, ${tokenUsage.createdAt} DESC`)
    .all();

  const map = new Map<string, {
    totalPrompt: number;
    totalCompletion: number;
    count: number;
    ops: Map<string, { prompt: number; completion: number }>;
  }>();

  for (const r of rows) {
    let entry = map.get(r.model);
    if (!entry) {
      entry = { totalPrompt: 0, totalCompletion: 0, count: 0, ops: new Map() };
      map.set(r.model, entry);
    }
    entry.totalPrompt += r.promptTokens;
    entry.totalCompletion += r.completionTokens;
    entry.count++;

    let opEntry = entry.ops.get(r.operation);
    if (!opEntry) {
      opEntry = { prompt: 0, completion: 0 };
      entry.ops.set(r.operation, opEntry);
    }
    opEntry.prompt += r.promptTokens;
    opEntry.completion += r.completionTokens;
  }

  return Array.from(map.entries()).map(([model, v]) => ({
    model,
    totalPromptTokens: v.totalPrompt,
    totalCompletionTokens: v.totalCompletion,
    totalTokens: v.totalPrompt + v.totalCompletion,
    callCount: v.count,
    byOperation: Array.from(v.ops.entries()).map(([op, o]) => ({
      operation: op,
      prompt: o.prompt,
      completion: o.completion,
    })),
  }));
}