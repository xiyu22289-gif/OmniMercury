import axios from 'axios';
import Parser from 'rss-parser';
import {
  getFeedByUrl,
  insertFeed,
  insertArticles,
  insertArticle,
  getArticlesByFeedId,
  getAllFeeds,
  searchArticlesByTitle,
  searchArticlesFts,
  getArticleContentById,
  getArticleByLink,
  getArticlesByIds,
  type Feed,
  type Article,
  type NewArticle,
  type FtsSearchResult,
} from './db';

// ============================================================
// 类型定义
// ============================================================

/** addFeed 错误码 — 前端据此展示不同颜色的错误提示 */
export type AddFeedErrorCode =
  | 'INVALID_URL'
  | 'NETWORK_ERROR'
  | 'NOT_RSS_FEED'
  | 'PARSE_ERROR'
  | 'DUPLICATE'
  | 'DB_ERROR'
  | 'UNKNOWN'

/** addFeed 成功返回值 */
interface AddFeedSuccess {
  success: true;
  feedId: number;
  title: string;
}

/** addFeed 失败返回值 */
interface AddFeedFailure {
  success: false;
  error: string;
  errorCode: AddFeedErrorCode;
}

export type AddFeedResult = AddFeedSuccess | AddFeedFailure;

/** listFeeds 返回的订阅源摘要 */
export interface FeedSummary {
  id: number;
  title: string;
  url: string;
  link: string | null;
  description: string | null;
  createdAt: string | null;
}

/** getArticles 返回的文章摘要 */
export interface ArticleSummary {
  id: number;
  title: string;
  isRead: number | null;
  isStarred?: number | null;
  summary: string | null;
  translations: string | null;
  link: string | null;
  author: string | null;
  pubDate: string | null;
  createdAt: string | null;
}

/** searchArticles 返回的文章摘要（含 feedId） */
export interface SearchArticleSummary extends ArticleSummary {
  feedId: number;
}

// ============================================================
// rss-parser 实例（复用，避免反复 new）
// ============================================================

const rssParser = new Parser({
  timeout: 10_000, // rss-parser 自身超时
  headers: {
    'User-Agent': 'RSS-Reader/1.0 (Desktop)',
  },
});

// ============================================================
// RSS 解析辅助类型（rss-parser 输出结构）
// ============================================================

interface ParsedItem {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  author?: string; // rss-parser 3.x 中 author 可能是 string
  pubDate?: string;
  isoDate?: string;
}

interface ParsedFeed {
  title?: string;
  description?: string;
  link?: string;
  items?: ParsedItem[];
}

// ============================================================
// 核心业务函数
// ============================================================

/**
 * 将 RSS article link 解析为绝对 URL。
 * 处理相对路径 (/article/123)、协议相对 (//cdn.example.com)、
 * 以及已经绝对化的 URL。
 */
function resolveArticleLink(rawLink: string | undefined, feedUrl: string): string | null {
  if (!rawLink) return null
  try {
    const absolute = new URL(rawLink, feedUrl).href
    return absolute
  } catch {
    // 无法解析时返回原始值
    return rawLink
  }
}

/**
 * 将 RSS 文章日期统一转换为 ISO 8601 格式。
 * RSS feed 常见的日期格式：
 *   - RFC 2822: "Mon, 21 Jul 2026 14:30:00 GMT"
 *   - ISO 8601:  "2026-07-21T14:30:00Z"
 *   - 纯日期:    "2026-07-21"
 *
 * SQLite TEXT 列按字母序排序，RFC 2822 的字母序与时间序不一致
 * （如 "Wed" < "Tue"），因此必须在入库前统一为 ISO 8601。
 */
function normalizeDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw // 无法解析，保留原始值
    return d.toISOString()
  } catch {
    return raw
  }
}

/** 规范化为单行纯文本（去除 HTML 标签和换行），空值兜底空字符串。 */
function safeSummary(raw: string | undefined, maxLen = 200): string {
  if (!raw) return '';
  const stripped = raw
    .replace(/<[^>]+>/g, '') // 去 HTML 标签
    .replace(/\s+/g, ' ')    // 合并空白
    .trim();
  return stripped.length <= maxLen ? stripped : stripped.slice(0, maxLen) + '…';
}

/**
 * 添加 RSS 订阅源。
 *
 * 流程：axios 拉取 XML → rss-parser 解析 → 去重检查 → insertFeed → insertArticles。
 * 任意环节失败均返回 `{ success: false, error }`，绝不抛未捕获异常。
 */
export async function addFeed(url: string): Promise<AddFeedResult> {
  console.log('[feedService] addFeed 开始，URL:', url)

  // 1. 校验 URL 格式
  let normalizedUrl: string;
  try {
    normalizedUrl = new URL(url).href;
    console.log('[feedService] ✓ 规范化 URL:', normalizedUrl)
  } catch {
    console.warn('[feedService] ✗ URL 格式无效:', url)
    return { success: false, errorCode: 'INVALID_URL', error: 'URL 格式无效，请输入完整的 RSS 链接（如 https://example.com/feed.xml）。' };
  }

  // 2. 去重检查
  const existing = getFeedByUrl(normalizedUrl);
  if (existing) {
    console.log('[feedService] ✗ 订阅源已存在:', existing.title)
    return {
      success: false,
      errorCode: 'DUPLICATE',
      error: `订阅源已存在：「${existing.title}」，无需重复添加。`,
    };
  }

  // 3. 拉取 RSS XML
  let xml: string;
  try {
    console.log('[feedService] → 拉取 RSS XML...')
    const response = await axios.get(normalizedUrl, {
      timeout: 15_000,
      proxy: false,
      headers: {
        'User-Agent': 'RSS-Reader/1.0 (Desktop)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 400,
    });
    xml = response.data;
    console.log('[feedService] ✓ 拉取成功，HTTP', response.status, 'XML 长度:', xml.length)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[feedService] ✗ 网络请求失败:', message)
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      error: `网络请求失败：${message}。请检查链接是否可访问。`,
    };
  }

  // 4. 解析 RSS/Atom
  let parsed: ParsedFeed;
  try {
    console.log('[feedService] → 解析 RSS/Atom...')
    parsed = (await rssParser.parseString(xml)) as ParsedFeed;
    const itemCount = parsed.items?.length ?? 0
    console.log('[feedService] ✓ 解析成功 — feedTitle:', parsed.title, 'items:', itemCount)
    if (itemCount > 0) {
      const first = parsed.items![0]
      console.log('[feedService]   第一条 item:', JSON.stringify({
        title: first.title?.slice(0, 60),
        link: first.link,
        pubDate: first.pubDate,
        isoDate: first.isoDate,
        hasContent: !!first.content,
        hasContentSnippet: !!first.contentSnippet,
        contentLen: first.content?.length ?? 0,
      }, null, 2))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[feedService] ✗ RSS 解析失败:', message)
    return {
      success: false,
      errorCode: 'NOT_RSS_FEED',
      error: `RSS 解析失败：${message}。该链接可能不是有效的 RSS/Atom 源。`,
    };
  }

  const title = parsed.title?.trim() || '未命名订阅源';
  const items = parsed.items ?? [];

  // 5. 入库：订阅源
  let feed: Feed;
  try {
    console.log('[feedService] → 入库订阅源:', title)
    feed = insertFeed({
      title,
      url: normalizedUrl,
      description: parsed.description ?? null,
      link: parsed.link ?? null,
    });
    console.log('[feedService] ✓ 订阅源入库成功，feedId:', feed.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[feedService] ✗ 订阅源入库失败:', message)
    return {
      success: false,
      errorCode: 'DB_ERROR',
      error: `订阅源入库失败：${message}。`,
    };
  }

  // 6. 入库：批量文章
  if (items.length > 0) {
    console.log('[feedService] → 准备入库文章，数量:', items.length)
    let articleRows: Array<Omit<NewArticle, 'id' | 'createdAt'>> = []
    try {
      articleRows = items.map(
        (item) => ({
          feedId: feed.id,
          title: item.title?.trim() || '(无标题)',
          link: resolveArticleLink(item.link, normalizedUrl),
          content: item.content ?? item.contentSnippet ?? null,
          contentMd: null,
          summary: safeSummary(item.contentSnippet ?? item.summary ?? item.content),
          isRead: 0,
          isStarred: 0,
          author: item.author ?? null,
          pubDate: normalizeDate(item.pubDate ?? item.isoDate),
        }),
      );
    } catch (err) {
      console.error('[feedService] 构建 articleRows 失败：', err)
      articleRows = []
    }
    console.log('[feedService]   第一篇文章:', JSON.stringify({
      title: articleRows[0]?.title,
      link: articleRows[0]?.link,
      pubDate: articleRows[0]?.pubDate,
      author: articleRows[0]?.author,
    }))

    try {
      console.log('[feedService] → 调用 insertArticles...')
      const insertedResult = insertArticles(articleRows);
      console.log('[feedService] ✓ 文章入库成功，实际插入:', insertedResult.length)
    } catch (err) {
      console.error(`[feedService] ✗ 文章入库失败（feedId=${feed.id}）：`, err)
    }
  } else {
    console.warn('[feedService] ⚠ RSS items 为空，无文章入库')
  }

  console.log('[feedService] ✓ addFeed 完成:', JSON.stringify({ success: true, feedId: feed.id, title: feed.title }))
  return { success: true, feedId: feed.id, title: feed.title };
}

/**
 * 获取全部订阅源列表。
 * 无异常场景（空表直接返回 []），因此不包装 { success / error }。
 */
export function listFeeds(): FeedSummary[] {
  return getAllFeeds().map((f) => ({
    id: f.id,
    title: f.title,
    url: f.url,
    link: f.link,
    description: f.description,
    createdAt: f.createdAt,
  }));
}

/**
 * 获取指定订阅源的文章列表。
 * feedId 不存在时返回空数组，不抛错。
 */
export function getArticles(feedId: number): ArticleSummary[] {
  const rows = getArticlesByFeedId(feedId)
  // 诊断日志：输出前 3 条文章的时间戳
  if (rows.length > 0) {
    console.log(`[feedService] getArticles feedId=${feedId} 共 ${rows.length} 条，前3条时间:`,
      rows.slice(0, 3).map(a => ({ id: a.id, pubDate: a.pubDate, createdAt: a.createdAt })))
  }
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    isRead: a.isRead,
    isStarred: a.isStarred,
    summary: a.summary,
    translations: a.translations,
    link: a.link,
    author: a.author,
    pubDate: a.pubDate,
    createdAt: a.createdAt,
  }));
}

/**
 * 刷新全部订阅源：重新拉取 RSS XML，仅插入新文章（按 link 去重）。
 * 返回新增文章总数。
 */
export async function refreshAllFeeds(): Promise<{ newCount: number }> {
  const allFeeds = getAllFeeds();
  let newCount = 0;

  for (const feed of allFeeds) {
    try {
      const response = await axios.get(feed.url, {
        timeout: 15_000,
        proxy: false,
        headers: {
          'User-Agent': 'RSS-Reader/1.0 (Desktop)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const parsed = (await rssParser.parseString(response.data)) as ParsedFeed;
      const items = parsed.items ?? [];

      for (const item of items) {
        const link = item.link;
        if (!link) continue;

        const existing = getArticleByLink(feed.id, link);
        if (existing) continue;

        try {
          insertArticle({
            feedId: feed.id,
            title: item.title?.trim() || '(无标题)',
            link: resolveArticleLink(link, feed.url),
            content: item.content ?? item.contentSnippet ?? null,
            contentMd: null,
            summary: safeSummary(item.contentSnippet ?? item.summary ?? item.content),
            isRead: 0,
            isStarred: 0,
            author: item.author ?? null,
            pubDate: normalizeDate(item.pubDate ?? item.isoDate),
          });
          newCount++;
        } catch {
          // 单篇插入失败不影响其他文章
        }
      }
    } catch (err) {
      console.error(`[feedService] 刷新订阅源失败 (${feed.title}):`, err instanceof Error ? err.message : String(err));
    }
  }

  return { newCount };
}

/**
 * 按标题模糊搜索文章（供 SearchBar suggestions 使用）。
 * 使用 LIKE 实现输入即搜索，结果按首字母大小写不敏感排序。
 */
export function searchArticles(query: string, limit = 20): SearchArticleSummary[] {
  return searchArticlesByTitle(query, limit).map((a) => ({
    id: a.id,
    feedId: a.feedId,
    title: a.title,
    isRead: a.isRead,
    isStarred: a.isStarred,
    summary: a.summary,
    translations: a.translations,
    link: a.link,
    author: a.author,
    pubDate: a.pubDate,
    createdAt: a.createdAt,
  }));
}

/**
 * 全文搜索 — 使用 FTS5 同时匹配标题 + 正文，按 BM25 相关性排序。
 */
export interface FullTextSearchResult extends SearchArticleSummary {
  snippet: string | null
}

export function fullTextSearch(query: string, limit = 20): FullTextSearchResult[] {
  return searchArticlesFts(query, limit).map((a: FtsSearchResult) => ({
    id: a.id,
    feedId: a.feedId,
    title: a.title,
    isRead: a.isRead,
    isStarred: a.isStarred,
    summary: a.summary,
    translations: a.translations,
    link: a.link,
    author: a.author,
    pubDate: a.pubDate,
    createdAt: a.createdAt,
    snippet: a.snippet,
  }));
}

/**
 * 从本地 DB 获取文章离线内容（不依赖网络）。
 * 返回 contentMd（清洗后 Markdown）或 content（原始文本），都没有则返回 undefined。
 */
export function getCachedArticleContent(articleId: number): { id: number; body: string } | undefined {
  const row = getArticleContentById(articleId);
  if (!row) return undefined;
  const body = row.contentMd ?? row.content ?? '';
  if (!body) return undefined;
  return { id: row.id, body };
}

/**
 * 按 ID 数组批量获取文章摘要（跨订阅源），用于标签筛选。
 */
export function getArticlesByIdList(ids: number[]): ArticleSummary[] {
  return getArticlesByIds(ids).map((a) => ({
    id: a.id,
    title: a.title,
    isRead: a.isRead,
    isStarred: a.isStarred,
    summary: a.summary,
    translations: a.translations,
    link: a.link,
    author: a.author,
    pubDate: a.pubDate,
    createdAt: a.createdAt,
  }));
}