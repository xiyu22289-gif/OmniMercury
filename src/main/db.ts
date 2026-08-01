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

// ===== M13: 浏览历史 =====
export const browseHistory = sqliteTable('browse_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: integer('article_id')
    .notNull()
    .references(() => articles.id, { onDelete: 'cascade' }),
  viewedAt: text('viewed_at').default(sql`(datetime('now'))`),
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
/** 底层 better-sqlite3 原始实例（用于 FTS5 原生查询） */
let rawDb: Database.Database | null = null;

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
      created_at  TEXT    DEFAULT (datetime('now')),
      UNIQUE(feed_id, link)
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

    CREATE TABLE IF NOT EXISTS browse_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      viewed_at   TEXT    DEFAULT (datetime('now'))
    );

    -- FTS5 全文索引（标题 + 正文）
    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title,
      content,
      content_md,
      content='articles',
      content_rowid='id'
    );
  `);

  // 首次创建 FTS 表后，填充已有数据
  try {
    sqlite.exec(`INSERT INTO articles_fts(articles_fts) VALUES('rebuild')`);
  } catch {
    // rebuild 失败忽略（可能表为空）
  }

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

  // M9 兼容迁移：articles 表添加 UNIQUE(feed_id, link) 约束
  try {
    sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_feed_link ON articles(feed_id, link)');
  } catch {
    // 索引已存在或创建失败，忽略
  }

  // M10 兼容迁移：is_starred 列（存量 DB 中可能不存在）
  try {
    sqlite.exec('ALTER TABLE articles ADD COLUMN is_starred INTEGER DEFAULT 0');
  } catch {
    // 列已存在，忽略
  }

  // M11 兼容迁移：将 pub_date 中的 RFC 2822 格式日期转为 ISO 8601
  //   RSS 常见格式: "Mon, 21 Jul 2026 14:30:00 GMT"
  //   SQLite TEXT 列按字母序排序，"Wed" < "Tue" 导致时间序紊乱
  try {
    const rows = sqlite.prepare('SELECT id, pub_date FROM articles WHERE pub_date IS NOT NULL AND pub_date NOT LIKE \'20%-\'').all() as { id: number; pub_date: string }[]
    if (rows.length > 0) {
      const updateStmt = sqlite.prepare('UPDATE articles SET pub_date = ? WHERE id = ?')
      const migrate = sqlite.transaction(() => {
        let count = 0
        for (const r of rows) {
          try {
            const d = new Date(r.pub_date)
            if (!isNaN(d.getTime())) {
              updateStmt.run(d.toISOString(), r.id)
              count++
            }
          } catch { /* 跳过无法解析的日期 */ }
        }
        if (count > 0) console.log(`[db] M11 迁移: 已规范化 ${count} 条 pub_date`)
      })
      migrate()
    }
  } catch {
    // 迁移失败忽略
  }

  // M12 兼容迁移：清除 translations 中残留的 {{L:N}} 标记
  try {
    const rows = sqlite.prepare(
      "SELECT id, translations FROM articles WHERE translations LIKE '%{{L:%' OR translations LIKE '%{{/L:%' OR translations LIKE '%LINK_PH_%' OR translations LIKE '%IMG_PH_%'"
    ).all() as { id: number; translations: string }[]
    if (rows.length > 0) {
      const updateStmt = sqlite.prepare('UPDATE articles SET translations = ? WHERE id = ?')
      const migrate = sqlite.transaction(() => {
        let count = 0
        for (const r of rows) {
          let cleaned = r.translations
            .replace(/\{\{[^}]*\}\}/g, '')
            .replace(/\{\{/g, '').replace(/\}\}/g, '')
            .replace(/\b(LINK|IMG)_PH_\d+\b/gi, '')
          if (cleaned !== r.translations) {
            updateStmt.run(cleaned, r.id)
            count++
          }
        }
        if (count > 0) console.log(`[db] M12 迁移: 已清理 ${count} 条 translations 中的残留标记`)
      })
      migrate()
    }
  } catch {
    // 迁移失败忽略
  }

  // M14 兼容迁移：highlights 列（荧光笔）
  try {
    sqlite.exec('ALTER TABLE articles ADD COLUMN highlights TEXT');
  } catch { /* 列已存在 */ }

  // M13 兼容迁移：browse_history 表
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS browse_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        viewed_at   TEXT    DEFAULT (datetime('now'))
      );
    `);
  } catch {
    // 表已存在，忽略
  }

  db = drizzle(sqlite);
  rawDb = sqlite;
  return db;
}

export function getDb(): BetterSQLite3Database {
  if (!db) {
    throw new Error('[db] 数据库未初始化，请先调用 initDatabase()。');
  }
  return db;
}

/** 获取底层 better-sqlite3 原始实例（用于 FTS5 原生 SQL）。 */
export function getRawDb(): Database.Database {
  if (!rawDb) throw new Error('[db] 数据库未初始化。');
  return rawDb;
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

export function renameFeed(feedId: number, newName: string): void {
  getDb()
    .update(feeds)
    .set({ title: newName })
    .where(eq(feeds.id, feedId))
    .run();
}

// ============================================================
// Article CRUD
// ============================================================

export function getArticlesByFeedId(
  feedId: number,
): Pick<Article, 'id' | 'title' | 'isRead' | 'isStarred' | 'summary' | 'translations' | 'link' | 'author' | 'pubDate' | 'createdAt'>[] {
  // ★ 使用 raw SQL 确保 ORDER BY 正确执行
  //    1. COALESCE(pub_date, created_at) DESC — pubDate 优先，null 降级到 createdAt
  //    2. id DESC — 同时间文章按 ID 倒序（新入库的文章 ID 更大）
  const sqlite = getRawDb()
  const stmt = sqlite.prepare(
    `SELECT id, feed_id AS feedId, title, is_read AS isRead, is_starred AS isStarred,
            summary, translations, link, author, pub_date AS pubDate, created_at AS createdAt
     FROM articles
     WHERE feed_id = ?
     ORDER BY COALESCE(pub_date, created_at) DESC, id DESC`
  )
  return stmt.all(feedId) as any[]
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
  if (articlesList.length === 0) return []

  // 批量插入：单条 SQL 多 VALUES，大幅减少 DB 往返
  // 使用原始 better-sqlite3 以获得最优性能
  const sqlite = getRawDb()
  const COLUMNS = 'feed_id, title, link, content, content_md, summary, is_read, is_starred, author, pub_date'
  const COL_COUNT = 10
  const placeholders = articlesList.map(() => `(${Array(COL_COUNT).fill('?').join(', ')})`).join(', ')

  const values: any[] = []
  for (const a of articlesList) {
    values.push(
      a.feedId, a.title, a.link ?? null, a.content ?? null, a.contentMd ?? null,
      a.summary ?? null, a.isRead ?? 0, a.isStarred ?? 0,
      a.author ?? null, a.pubDate ?? null,
    )
  }

  console.log(`[db] insertArticles: 批量插入 ${articlesList.length} 篇文章，共 ${values.length} 个参数`)

  const sql = `INSERT OR IGNORE INTO articles (${COLUMNS}) VALUES ${placeholders}`

  const insertMany = sqlite.transaction(() => {
    sqlite.prepare(sql).run(...values)
  })

  insertMany()

  console.log(`[db] insertArticles: 批量插入完成`)

  // 返回最后插入的 N 条记录（Drizzle 风格兼容）
  const lastId = sqlite.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
  const lastRealId = lastId.id - (articlesList.length - 1)
  const results: Article[] = []
  for (let i = 0; i < articlesList.length; i++) {
    results.push({
      id: lastRealId + i,
      feedId: articlesList[i].feedId,
      title: articlesList[i].title,
      link: articlesList[i].link ?? null,
      content: articlesList[i].content ?? null,
      contentMd: articlesList[i].contentMd ?? null,
      summary: articlesList[i].summary ?? null,
      translations: null,
      isRead: articlesList[i].isRead ?? 0,
      isStarred: articlesList[i].isStarred ?? 0,
      author: articlesList[i].author ?? null,
      pubDate: articlesList[i].pubDate ?? null,
      createdAt: new Date().toISOString(),
    })
  }
  return results
}

export function markArticleRead(articleId: number): void {
  getDb()
    .update(articles)
    .set({ isRead: 1 })
    .where(eq(articles.id, articleId))
    .run();
}

export function toggleArticleRead(articleId: number): { id: number; isRead: number } {
  const row = getDb()
    .select({ id: articles.id, isRead: articles.isRead })
    .from(articles)
    .where(eq(articles.id, articleId))
    .get()
  if (!row) throw new Error(`文章 ${articleId} 不存在`)
  const newVal = row.isRead ? 0 : 1
  getDb()
    .update(articles)
    .set({ isRead: newVal })
    .where(eq(articles.id, articleId))
    .run()
  return { id: articleId, isRead: newVal }
}

export function getAllArticles(
): Pick<Article, 'id' | 'feedId' | 'title' | 'isRead' | 'isStarred' | 'summary' | 'translations' | 'link' | 'author' | 'pubDate' | 'createdAt'>[] {
  return getDb()
    .select({
      id: articles.id,
      feedId: articles.feedId,
      title: articles.title,
      isRead: articles.isRead,
      isStarred: articles.isStarred,
      summary: articles.summary,
      translations: articles.translations,
      link: articles.link,
      author: articles.author,
      pubDate: articles.pubDate,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .orderBy(sql`COALESCE(${articles.pubDate}, ${articles.createdAt}) DESC`)
    .all()
}

export function deleteArticle(articleId: number): void {
  getDb().delete(articles).where(eq(articles.id, articleId)).run();
}

export function toggleStarArticle(articleId: number): { id: number; isStarred: number } {
  const row = getDb()
    .select({ id: articles.id, isStarred: articles.isStarred })
    .from(articles)
    .where(eq(articles.id, articleId))
    .get()

  if (!row) throw new Error(`文章 ${articleId} 不存在`)

  const newVal = row.isStarred ? 0 : 1
  getDb()
    .update(articles)
    .set({ isStarred: newVal })
    .where(eq(articles.id, articleId))
    .run()

  return { id: articleId, isStarred: newVal }
}

export function getStarredArticles(
): Pick<Article, 'id' | 'feedId' | 'title' | 'isRead' | 'isStarred' | 'summary' | 'translations' | 'link' | 'author' | 'pubDate' | 'createdAt'>[] {
  return getDb()
    .select({
      id: articles.id,
      feedId: articles.feedId,
      title: articles.title,
      isRead: articles.isRead,
      isStarred: articles.isStarred,
      summary: articles.summary,
      translations: articles.translations,
      link: articles.link,
      author: articles.author,
      pubDate: articles.pubDate,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(sql`${articles.isStarred} = 1`)
    .orderBy(sql`COALESCE(${articles.pubDate}, ${articles.createdAt}) DESC`)
    .all()
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
): Pick<Article, 'id' | 'feedId' | 'title' | 'link' | 'summary' | 'translations' | 'author' | 'pubDate' | 'createdAt' | 'isRead' | 'isStarred'>[] {
  const sqlite = getRawDb()
  const likePattern = `%${query.trim()}%`
  console.log(`[db] searchArticlesByTitle query="${query.trim()}" pattern="${likePattern}" limit=${limit}`)
  try {
    const rows = sqlite.prepare(
      `SELECT id, feed_id AS feedId, title, link, summary, translations,
              author, pub_date AS pubDate, created_at AS createdAt,
              is_read AS isRead, is_starred AS isStarred
       FROM articles
       WHERE title LIKE ?
       ORDER BY LOWER(title) ASC
       LIMIT ?`
    ).all(likePattern, limit) as any[]
    console.log(`[db] searchArticlesByTitle 结果: ${rows.length} 条`)
    return rows
  } catch (err) {
    console.error(`[db] searchArticlesByTitle 失败:`, err)
    return []
  }
}

/** FTS5 全文搜索 — 同时匹配标题 + 正文，按 BM25 相关性排序 */
export interface FtsSearchResult {
  id: number
  feedId: number
  title: string
  link: string | null
  summary: string | null
  translations: string | null
  author: string | null
  pubDate: string | null
  createdAt: string | null
  isRead: number | null
  isStarred: number | null
  /** 匹配片段（高亮 snippet，含 <b> 标记） */
  snippet: string | null
}

/** LIKE 全文搜索 — 同时匹配标题 + 正文（对中文友好），按 pub_date 排序 */
export function searchArticlesFullText(query: string, limit = 50): FtsSearchResult[] {
  const sqlite = getRawDb()
  const safeQuery = query.trim()
  if (!safeQuery) return []

  const likePattern = `%${safeQuery}%`

  const stmt = sqlite.prepare(
    `SELECT
       a.id,
       a.feed_id   AS feedId,
       a.title,
       a.link,
       a.summary,
       a.translations,
       a.author,
       a.pub_date   AS pubDate,
       a.created_at AS createdAt,
       a.is_read    AS isRead,
       a.is_starred AS isStarred,
       NULL         AS snippet
     FROM articles a
     WHERE a.title LIKE ?1
        OR a.content_md LIKE ?1
        OR a.content LIKE ?1
        OR a.summary LIKE ?1
     ORDER BY COALESCE(a.pub_date, a.created_at) DESC
     LIMIT ?2`,
  )

  try {
    return stmt.all(likePattern, limit) as FtsSearchResult[]
  } catch (err) {
    console.error(`[db] searchArticlesFullText 失败 — query="${safeQuery}" limit=${limit}:`, err)
    return []
  }
}

/** @deprecated 保留旧版 FTS5 搜索（对中文不友好，仅作参考） */
export function searchArticlesFts(query: string, limit = 20): FtsSearchResult[] {
  return searchArticlesFullText(query, limit)
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
): Pick<Article, 'id' | 'feedId' | 'title' | 'isRead' | 'isStarred' | 'summary' | 'translations' | 'link' | 'author' | 'pubDate' | 'createdAt'>[] {
  if (ids.length === 0) return []
  return getDb()
    .select({
      id: articles.id,
      feedId: articles.feedId,
      title: articles.title,
      isRead: articles.isRead,
      isStarred: articles.isStarred,
      summary: articles.summary,
      translations: articles.translations,
      link: articles.link,
      author: articles.author,
      pubDate: articles.pubDate,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(inArray(articles.id, ids))
    .orderBy(sql`COALESCE(${articles.pubDate}, ${articles.createdAt}) DESC`)
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

export type BrowseHistory = typeof browseHistory.$inferSelect;
export type NewBrowseHistory = typeof browseHistory.$inferInsert;

export interface BrowseHistoryWithArticle {
  id: number
  articleId: number
  articleTitle: string
  articleLink: string | null
  feedTitle: string | null
  author: string | null
  pubDate: string | null
  viewedAt: string
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

// ============================================================
// M13: 浏览历史 CRUD
// ============================================================

/** 记录一次浏览（同一文章多次浏览记录多条，按时间排序即为浏览历史） */
export function logBrowseHistory(articleId: number): BrowseHistory {
  return getDb()
    .insert(browseHistory)
    .values({ articleId })
    .returning()
    .get();
}

/** 获取浏览历史列表（按浏览时间倒序，限制条数） */
export function getBrowseHistory(limit = 200): BrowseHistoryWithArticle[] {
  const sqlite = getRawDb();
  return sqlite.prepare(`
    SELECT
      bh.id,
      bh.article_id AS articleId,
      a.title AS articleTitle,
      a.link AS articleLink,
      f.title AS feedTitle,
      a.author,
      a.pub_date AS pubDate,
      bh.viewed_at AS viewedAt
    FROM browse_history bh
    LEFT JOIN articles a ON a.id = bh.article_id
    LEFT JOIN feeds f ON f.id = a.feed_id
    ORDER BY bh.viewed_at DESC
    LIMIT ?
  `).all(limit) as BrowseHistoryWithArticle[];
}

/** 获取最近 N 天内按日期分组的浏览计数 */
export function getDailyBrowseCounts(days: number = 7): { date: string; count: number }[] {
  const sqlite = getRawDb();
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  return sqlite.prepare(`
    SELECT date(viewed_at) AS date, COUNT(*) AS count
    FROM browse_history
    WHERE viewed_at >= ?
    GROUP BY date(viewed_at)
    ORDER BY date DESC
  `).all(cutoff) as { date: string; count: number }[];
}

/** 清空浏览历史 */
export function clearBrowseHistory(): void {
  getDb().delete(browseHistory).run();
}

// ============================================================
// M14: Highlight CRUD
// ============================================================
export function getArticleHighlights(articleId: number): string | null {
  const sqlite = getRawDb()
  const row = sqlite.prepare('SELECT highlights FROM articles WHERE id = ?').get(articleId) as { highlights: string | null } | undefined
  return row?.highlights ?? null
}

export function saveArticleHighlights(articleId: number, highlights: string): void {
  const sqlite = getRawDb()
  sqlite.prepare('UPDATE articles SET highlights = ? WHERE id = ?').run(highlights, articleId)
}
