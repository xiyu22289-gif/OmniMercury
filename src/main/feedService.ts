import axios from 'axios';
import Parser from 'rss-parser';
import {
  getFeedByUrl,
  insertFeed,
  insertArticles,
  getArticlesByFeedId,
  getAllFeeds,
  searchArticlesByTitle,
  getArticleContentById,
  type Feed,
  type Article,
  type NewArticle,
} from './db';

// ============================================================
// 类型定义
// ============================================================

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
  summary: string | null;
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
  // 1. 校验 URL 格式
  let normalizedUrl: string;
  try {
    normalizedUrl = new URL(url).href;
  } catch {
    return { success: false, error: 'URL 格式无效，请输入完整的 RSS 链接（如 https://example.com/feed.xml）。' };
  }

  // 2. 去重检查
  const existing = getFeedByUrl(normalizedUrl);
  if (existing) {
    return {
      success: false,
      error: `订阅源已存在：「${existing.title}」，无需重复添加。`,
    };
  }

  // 3. 拉取 RSS XML
  let xml: string;
  try {
    const response = await axios.get(normalizedUrl, {
      timeout: 15_000,
      headers: {
        'User-Agent': 'RSS-Reader/1.0 (Desktop)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      responseType: 'text',
      // 仅接受 XML 类型响应；部分服务器返回错误 Content-Type 也放行
      validateStatus: (status) => status >= 200 && status < 400,
    });
    xml = response.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `网络请求失败：${message}。请检查链接是否可访问。`,
    };
  }

  // 4. 解析 RSS/Atom
  let parsed: ParsedFeed;
  try {
    parsed = (await rssParser.parseString(xml)) as ParsedFeed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `RSS 解析失败：${message}。该链接可能不是有效的 RSS/Atom 源。`,
    };
  }

  const title = parsed.title?.trim() || '未命名订阅源';
  const items = parsed.items ?? [];

  // 5. 入库：订阅源
  let feed: Feed;
  try {
    feed = insertFeed({
      title,
      url: normalizedUrl,
      description: parsed.description ?? null,
      link: parsed.link ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `订阅源入库失败：${message}。`,
    };
  }

  // 6. 入库：批量文章
  if (items.length > 0) {
    const articleRows: Array<Omit<NewArticle, 'id' | 'createdAt'>> = items.map(
      (item) => ({
        feedId: feed.id,
        title: item.title?.trim() || '(无标题)',
        link: item.link ?? null,
        content: item.content ?? item.contentSnippet ?? null,
        contentMd: null,    // Phase 3 正文清洗后再填充
        summary: safeSummary(item.contentSnippet ?? item.summary ?? item.content),
        isRead: 0,
        isStarred: 0,
        author: item.author ?? null,
        pubDate: item.pubDate ?? item.isoDate ?? null,
      }),
    );

    try {
      insertArticles(articleRows);
    } catch (err) {
      // 文章入库失败不阻塞：订阅源已成功添加，仅记录
      console.error(`[feedService] 文章入库部分失败（feedId=${feed.id}）：`, err);
    }
  }

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
  return getArticlesByFeedId(feedId).map((a) => ({
    id: a.id,
    title: a.title,
    isRead: a.isRead,
    summary: a.summary,
    link: a.link,
    author: a.author,
    pubDate: a.pubDate,
    createdAt: a.createdAt,
  }));
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
    summary: a.summary,
    link: a.link,
    author: a.author,
    pubDate: a.pubDate,
    createdAt: a.createdAt,
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
