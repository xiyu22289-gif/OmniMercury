/**
 * 内容清洗流水线 — M3 核心模块。
 *
 * 遵循 AGENTS.md §3.1：
 * - 标准流程：axios 拉取原文 HTML → jsdom 模拟 DOM → readability 提纯正文
 *   → turndown 转 Markdown → 入库 / 返回
 * - 强制降级约束：任一步骤报错必须捕获，返回降级内容或友好文案
 * - 严禁抛出未捕获异常
 *
 * 遵循 AGENTS.md §6.3：
 * - 主进程无浏览器 DOM 环境，必须通过 jsdom 手动构造 window 再传入 Readability
 */

import axios from 'axios'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { getDb, articles as articlesTable } from './db'
import { eq } from 'drizzle-orm'

// ============================================================
// 类型定义
// ============================================================

/** 清洗流水线成功返回值 */
export interface CleanResult {
  /** 清洗后纯净 HTML（Readability 输出） */
  contentHtml: string
  /** Turndown 转换后的 Markdown */
  contentMd: string
  /** 文章标题（Readability 提取，可能与 RSS 标题不同） */
  title: string | null
  /** 正文纯文本（用于摘要等场景） */
  textContent: string | null
}

/** 降级返回值 — 流水线部分失败时返回 */
export interface DegradedResult {
  /** 降级内容（原始 HTML 片段或错误描述） */
  contentHtml: string
  /** 降级 Markdown */
  contentMd: string
  /** 降级原因 */
  degraded: true
  /** 具体降级原因描述 */
  reason: string
}

export type ContentResult = CleanResult | DegradedResult

// ============================================================
// 配置常量
// ============================================================

/** HTTP 请求超时（毫秒） */
const FETCH_TIMEOUT = 20_000

/** 标准 User-Agent（部分网站会拒绝无 UA 的请求） */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ============================================================
// Turndown 实例（复用，避免反复初始化）
// ============================================================

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
  // 保留链接和图片
  linkStyle: 'inlined',
})

/** 移除 Readability 输出中可能残留的无关元素 */
function sanitizeHtml(html: string): string {
  // 基本清理：移除内联样式、脚本标签（Readability 已做大部分清理）
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .trim()
}

/** 移除文章末尾的截断标记（如 "Continue reading" 等） */
function removeTruncationMarkers(markdown: string): string {
  return markdown
    // 移除 "Continue reading" 及其变体（可能带链接、省略号、箭头等）
    .replace(/\s*Continue\s+reading[^>\n]*(?:>\s*)?$/gim, '')
    // 移除 "Read more" 及其变体
    .replace(/\s*Read\s+more[^>\n]*(?:>\s*)?$/gim, '')
    // 移除中文 "阅读全文" 等
    .replace(/\s*阅读全文[^\n]*$/gim, '')
    // 移除 "[阅读更多]" 等
    .replace(/\s*\[阅读更多\][^\n]*$/gim, '')
    // 移除末尾空行
    .replace(/\n{3,}$/g, '\n\n')
    .trim()
}

// ============================================================
// 核心流水线
// ============================================================

/**
 * 从文章原始 URL 拉取全文并执行清洗流水线。
 *
 * 流程：
 * 1. axios 拉取原文 HTML
 * 2. jsdom 构造浏览器 DOM 环境
 * 3. Readability 提纯正文
 * 4. turndown 转 Markdown
 *
 * 每一步失败都会生成降级结果而非抛异常。
 *
 * @param url - 文章原始链接
 * @returns 清洗结果或降级结果
 */
export async function fetchAndCleanArticle(url: string): Promise<ContentResult> {
  // ---- Step 1: 拉取原文 HTML ----
  let rawHtml: string
  try {
    const response = await axios.get<string>(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      responseType: 'text',
      // 接受 2xx/3xx，拒绝 4xx/5xx
      validateStatus: (status) => status >= 200 && status < 400,
      // 部分网站有反爬，允许重定向
      maxRedirects: 5,
    })
    rawHtml = response.data
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[contentService] 拉取原文失败 (${url})：${message}`)
    return {
      contentHtml: `<p>【正文提取失败】无法访问原文链接。<br>错误：${message}</p>`,
      contentMd: `【正文提取失败】无法访问原文链接。\n错误：${message}\n\n> 请尝试打开原文链接：${url}`,
      degraded: true,
      reason: `网络请求失败：${message}`,
    }
  }

  // 空内容检查
  if (!rawHtml || rawHtml.trim().length < 100) {
    console.warn(`[contentService] 原文内容过短 (${url})，长度=${rawHtml?.length ?? 0}`)
    return {
      contentHtml: rawHtml || '<p>（原文内容为空）</p>',
      contentMd: rawHtml || '（原文内容为空）',
      degraded: true,
      reason: '原文内容为空或过短',
    }
  }

  // ---- Step 2: jsdom 构造 DOM 环境 ----
  let dom: JSDOM
  try {
    dom = new JSDOM(rawHtml, {
      url, // 用于解析相对路径
      referrer: url,
      contentType: 'text/html',
      // 部分页面大量脚本影响性能，关闭脚本执行
      runScripts: 'outside-only',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[contentService] jsdom 构造 DOM 失败 (${url})：${message}`)
    return {
      contentHtml: sanitizeHtml(rawHtml),
      contentMd: turndownService.turndown(rawHtml),
      degraded: true,
      reason: `DOM 解析失败：${message}`,
    }
  }

  // ---- Step 3: Readability 提纯正文 ----
  let cleanHtml: string
  let extractedTitle: string | null = null
  let textContent: string | null = null

  try {
    const reader = new Readability(dom.window.document)
    const result = reader.parse()

    if (!result || !result.content) {
      console.warn(`[contentService] Readability 未能提取正文 (${url})，降级使用原始 HTML`)
      return {
        contentHtml: sanitizeHtml(rawHtml),
        contentMd: turndownService.turndown(rawHtml),
        degraded: true,
        reason: 'Readability 未能提取正文，已返回原始 HTML',
      }
    }

    cleanHtml = sanitizeHtml(result.content)
    // 在 HTML 层面也移除截断标记（有些站点在 Readability 输出中保留）
    cleanHtml = cleanHtml
      .replace(/<p[^>]*>\s*Continue\s+reading[^<]*<\/p>/gi, '')
      .replace(/<p[^>]*>\s*Read\s+more[^<]*<\/p>/gi, '')
      .replace(/<a[^>]*>\s*Continue\s+reading[^<]*<\/a>/gi, '')
      .replace(/<a[^>]*>\s*Read\s+more[^<]*<\/a>/gi, '')
    extractedTitle = result.title?.trim() || null
    textContent = result.textContent?.trim() || null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[contentService] Readability 提取正文失败 (${url})：${message}`)
    return {
      contentHtml: sanitizeHtml(rawHtml),
      contentMd: turndownService.turndown(rawHtml),
      degraded: true,
      reason: `正文提取失败：${message}`,
    }
  }

  // ---- Step 4: turndown 转 Markdown ----
  let contentMd: string
  try {
    contentMd = turndownService.turndown(cleanHtml)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[contentService] turndown 转换失败 (${url})：${message}`)
    // 降级：返回清洗后的 HTML，不转 MD
    return {
      contentHtml: cleanHtml,
      contentMd: `【Markdown 转换失败】\n错误：${message}\n\n> 请尝试打开原文链接：${url}`,
      degraded: true,
      reason: `Markdown 转换失败：${message}`,
    }
  }

  // ---- Step 4.5: 移除截断标记 ----
  contentMd = removeTruncationMarkers(contentMd)

  // 空内容检查
  if (!contentMd.trim()) {
    console.warn(`[contentService] 转换后 Markdown 为空 (${url})`)
    return {
      contentHtml: cleanHtml,
      contentMd: `【正文提取失败】该页面结构复杂，请尝试打开原文链接。\n\n> ${url}`,
      degraded: true,
      reason: '转换后 Markdown 为空',
    }
  }

  // ---- 成功返回 ----
  return {
    contentHtml: cleanHtml,
    contentMd,
    title: extractedTitle,
    textContent,
  }
}

// ============================================================
// 带缓存的获取（供 IPC Handler 使用）
// ============================================================

/**
 * 获取文章正文内容，优先从本地缓存读取，缓存未命中则走清洗流水线。
 *
 * 调用方（ipcHandlers）应使用本函数，它已包含完整的缓存策略和降级逻辑。
 *
 * @param articleId - 文章 ID
 * @param articleUrl - 文章原始链接（清洗流水线需要）
 * @param forceRefresh - 是否强制重新抓取（忽略本地缓存）
 * @returns 正文内容（Markdown 格式，或降级/错误信息）
 */
export async function getOrFetchArticleContent(
  articleId: number,
  articleUrl: string,
  forceRefresh = false,
): Promise<{ content: string; isCached: boolean; degraded?: boolean; reason?: string }> {
  // 1. 先查本地缓存
  if (!forceRefresh) {
    try {
      const row = getDb()
        .select({
          id: articlesTable.id,
          contentMd: articlesTable.contentMd,
          content: articlesTable.content,
        })
        .from(articlesTable)
        .where(eq(articlesTable.id, articleId))
        .get()

      if (row && row.contentMd) {
        return { content: row.contentMd, isCached: true }
      }
      // 有原始 content 但无 contentMd（RSS 原始摘要等）
      if (row && row.content && !row.contentMd) {
        // 尝试直接使用原始内容（可能是 RSS 全文或 HTML 片段）
        try {
          const md = turndownService.turndown(row.content)
          if (md.trim()) {
            return { content: md, isCached: true, degraded: true, reason: '使用 RSS 原始内容（未经清洗）' }
          }
        } catch {
          // turndown 失败，继续走流水线
        }
        return { content: row.content, isCached: true, degraded: true, reason: '使用 RSS 原始内容' }
      }
    } catch (err) {
      console.error(`[contentService] 查询本地缓存失败 (articleId=${articleId})：`, err)
      // 继续尝试流水线
    }
  }

  // 2. 走清洗流水线
  const result = await fetchAndCleanArticle(articleUrl)

  // 3. 将结果写入数据库缓存
  try {
    getDb()
      .update(articlesTable)
      .set({
        content: 'contentHtml' in result ? result.contentHtml : undefined,
        contentMd: result.contentMd,
      })
      .where(eq(articlesTable.id, articleId))
      .run()
  } catch (err) {
    console.error(`[contentService] 更新文章缓存失败 (articleId=${articleId})：`, err)
    // 缓存失败不影响返回
  }

  if ('degraded' in result && result.degraded) {
    return {
      content: result.contentMd,
      isCached: false,
      degraded: true,
      reason: result.reason,
    }
  }

  return { content: result.contentMd, isCached: false }
}
