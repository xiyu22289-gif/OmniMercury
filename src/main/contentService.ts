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
import { CONTENT_FETCH_TIMEOUT } from './configService'

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

/** HTTP 请求超时（毫秒）— 使用统一配置 */
const FETCH_TIMEOUT = CONTENT_FETCH_TIMEOUT

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
  linkStyle: 'inlined',
  // ★ 修复代码块换行丢失：设为 false 禁用内置 fence 规则
  //    内置规则用 textContent（无 <br> 无换行），由自定义规则接管。
  preformattedCode: false as const,
})

/**
 * 解码 HTML 实体。
 * 使用 RegExp 构造器（拼接字符串）避免格式化器破坏字面量。
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(new RegExp('&' + 'amp;', 'gi'), '&')
    .replace(new RegExp('&' + 'lt;', 'gi'), '<')
    .replace(new RegExp('&' + 'gt;', 'gi'), '>')
    .replace(new RegExp('&' + 'quot;', 'gi'), '"')
    .replace(new RegExp('&' + '#0*39;', 'gi'), "'")
    .replace(new RegExp('&' + '#x0*27;', 'gi'), "'")
}

/**
 * ★ 自定义 turndown rule：显式接管所有 <pre><code> 转换。
 *
 * 关闭内置 preformattedCode 后，Turndown 不会对 <pre> 做任何特殊处理。
 * 本规则用 outerHTML 提取原始 HTML → 多阶段正则恢复行结构 → 输出 Markdown 围栏代码块。
 *
 * 处理场景：
 *   - highlight.js 输出：<span class="line">…</span> 按行分隔
 *   - Prism 输出：<span class="token …">…</span> + 原生 \n
 *   - 原始 HTML：用 <br> 换行、<p>/<div> 分隔代码行
 */
turndownService.addRule('preCodeBlock', {
  filter: (node) => {
    return node.nodeName === 'PRE' && !!node.querySelector('code')
  },
  replacement: (_content, node) => {
    const codeEl = node.querySelector('code')
    const lang = codeEl?.className
      ?.replace('language-', '')
      ?.replace('lang-', '')
      ?.trim() || ''

    // 1. 用 outerHTML 取原始 HTML 字符串
    const targetEl = (codeEl ?? node) as HTMLElement
    const outer = targetEl.outerHTML ?? ''
    // 剥掉外层 <code …> 和 </code>
    let html = outer.replace(/^<[^>]*>/i, '').replace(/<\/[^>]*>(?:\s*\n?)*$/i, '')

    // 2. 恢复换行结构（优先级从高到低）
    // 2a. <span[class*="line"]>…</span> → 行分隔符（highlight.js）
    html = html.replace(/<\/span>\s*<span[^>]*class="[^"]*line[^"]*"[^>]*>/gi, '\n')
    html = html.replace(/<\/span>\s*<span[^>]*class='[^']*line[^']*'[^>]*>/gi, '\n')
    // 2b. <br> <br/> <br /> → 换行
    html = html.replace(/<br\s*\/?>/gi, '\n')
    // 2c. </p><p…> 或 </div><div…> → 换行
    html = html.replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    html = html.replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    // 2d. </li><li…> → 换行（列表形代码）
    html = html.replace(/<\/li>\s*<li[^>]*>/gi, '\n')

    // 3. 剥离其余所有 HTML 标签
    let text = html.replace(/<[^>]*>/g, '')

    // 4. 解码 HTML 实体（< → <, > → >, …）
    text = decodeHtmlEntities(text)

    // 5. 清理：连续 3+ 个换行 → 最多 2 个，首尾空行去掉
    text = text.replace(/\n{3,}/g, '\n\n')
    const trimmed = text.replace(/^\n+|\n+$/g, '')
    return `\n\n\`\`\`${lang}\n${trimmed}\n\`\`\`\n\n`
  },
})

/** 移除 Readability 输出中可能残留的无关元素 */
function sanitizeHtml(html: string): string {
  // 基本清理：移除脚本、样式标签，剥离隐藏属性的内联样式
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // ★ 剥离内联 visibility:hidden（原页面隐藏元素被 Readability 保留）
    .replace(/style="[^"]*visibility\s*:\s*hidden[^"]*"/gi, '')
    .replace(/style='[^']*visibility\s*:\s*hidden[^']*'/gi, '')
    // ★ 剥离内联 display:none
    .replace(/style="[^"]*display\s*:\s*none[^"]*"/gi, '')
    .replace(/style='[^']*display\s*:\s*none[^']*'/gi, '')
    .trim()
}

// ============================================================
// 表格保护：Readability 会过滤 <table>，用占位符保护后再恢复
// ============================================================

const tablePlaceholderMap = new Map<string, string>()
let tableCounter = 0

/** Readability 提取前：将 <table> 替换为占位符，防止被过滤 */
function protectTables(html: string): { protected: string; count: number } {
  tablePlaceholderMap.clear()
  tableCounter = 0
  let count = 0
  const result = html.replace(/<table[\s>][\s\S]*?<\/table>/gi, (match) => {
    const key = `__TABLE_PLACEHOLDER_${tableCounter++}__`
    tablePlaceholderMap.set(key, match)
    count++
    return `<p>${key}</p>`
  })
  return { protected: result, count }
}

/** Readability 提取后：将占位符恢复为原始 <table> */
function restoreTables(html: string): string {
  if (tablePlaceholderMap.size === 0) return html
  let result = html
  for (const [key, tableHtml] of tablePlaceholderMap) {
    result = result.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), tableHtml)
    // 也处理被 sanitizeHtml 或 Readability 包裹在 <p> 中的情况
    result = result.replace(new RegExp(`<p[^>]*>\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\/p>`, 'gi'), tableHtml)
  }
  tablePlaceholderMap.clear()
  return result
}

/** 清理属性值中的换行符、首尾空白、尾部无效字符 */
function normalizeSrc(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, '')       // 移除换行符
    .replace(/\s+/g, ' ')          // 多余空白合并为单个空格（不删，URL 中空格合法但罕见）
    .trim()                         // 首尾空白
    .replace(/[-]+$/, '')          // 尾部连字符（行尾断词残留）
    .replace(/[.,;:!?]+$/, '')     // 尾部标点（非 URL 组成部分）
    .trim()
}

/** 清理 HTML 中所有属性值的换行符和多余空白 */
function sanitizeHtmlAttributes(html: string): string {
  // 匹配属性值中带换行符的模式：attr="...\n..." 或 attr='...\n...'
  // 对 src/href/alt 等高危属性进行全局清理
  return html
    .replace(/src="([^"]*)"/gi, (_m, val: string) => `src="${normalizeSrc(val)}"`)
    .replace(/src='([^']*)'/gi, (_m, val: string) => `src='${normalizeSrc(val)}'`)
    .replace(/href="([^"]*)"/gi, (_m, val: string) => `href="${normalizeSrc(val)}"`)
    .replace(/href='([^']*)'/gi, (_m, val: string) => `href='${normalizeSrc(val)}'`)
}

/** 将 HTML 中所有 img 标签的 src 补全为绝对 URL */
function resolveImageUrls(html: string, baseUrl: string): string {
  console.log(`[DIAG] resolveImageUrls 开始 — baseUrl="${baseUrl}"`)
  console.log(`[DIAG] resolveImageUrls — 输入 HTML 长度: ${html.length}`)
  // 快速检查是否有 img 标签
  const imgTagCount = (html.match(/<img[\s>]/gi) || []).length
  console.log(`[DIAG] resolveImageUrls — 粗略 img 标签数: ${imgTagCount}`)

  if (imgTagCount === 0) {
    console.log(`[DIAG] resolveImageUrls — 无 img 标签，跳过`)
    return html
  }

  try {
    const dom = new JSDOM(html)
    const imgs = dom.window.document.querySelectorAll('img')
    console.log(`[DIAG] resolveImageUrls — querySelectorAll 找到 ${imgs.length} 个 img`)

    let count = 0
    for (const img of imgs) {
      const raw = img.getAttribute('src')
      if (!raw) {
        console.log(`[DIAG] resolveImageUrls — img 无 src 属性，跳过`)
        continue
      }
      // ★ 先标准化 src（移除换行符、尾部断词连字符等）
      const cleaned = normalizeSrc(raw)
      if (cleaned !== raw) {
        console.log(`[DIAG] resolveImageUrls — src 清理: "${raw.replace(/\n/g, '\\n')}" → "${cleaned}"`)
        img.setAttribute('src', cleaned)
      }
      try {
        // new URL(cleaned, baseUrl) 自动处理三种情况:
        //   /foo/bar.jpg  → 根相对 → origin + path
        //   bar.jpg       → 路径相对 → baseUrl目录 + path
        //   https://...   → 已是绝对 → 保持不变
        const absolute = new URL(cleaned, baseUrl).href
        console.log(`[DIAG] resolveImageUrls — src: "${cleaned}" → "${absolute}"`)
        if (absolute !== cleaned) {
          img.setAttribute('src', absolute)
          count++
        }
      } catch {
        console.log(`[DIAG] resolveImageUrls — 无法解析 src: "${cleaned}"，保持原样`)
      }
    }

    if (count > 0) {
      console.log(`[DIAG] resolveImageUrls: 补全了 ${count}/${imgs.length} 个图片 URL`)
    } else {
      console.log(`[DIAG] resolveImageUrls: 所有 ${imgs.length} 个图片已是绝对 URL，无需补全`)
    }

    // ★ 关键修复：用 body.innerHTML 取回 HTML 片段
    //    dom.serialize() 会包裹 <html><head></head><body>...</body></html>
    const result = dom.window.document.body.innerHTML
    console.log(`[DIAG] resolveImageUrls — 输出 HTML 长度: ${result.length}`)
    return result
  } catch (err) {
    console.warn(`[contentService] resolveImageUrls 失败:`, err)
    return html // 降级返回原始 HTML
  }
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
    const statusCode = (err as any)?.response?.status || (err as any)?.status
    const isTimeout = message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('ECONNABORTED')
    const codeStr = statusCode ? ` (HTTP ${statusCode})` : ''
    const friendlyMsg = isTimeout
      ? `正文抓取 - ${url} 连接超时（${FETCH_TIMEOUT / 1000}s） - 请尝试打开原文链接`
      : `正文抓取 - ${url} 请求失败${codeStr} - ${message}`
    console.error(`[contentService] 拉取原文失败 (${url})${codeStr}：${message}`)
    return {
      contentHtml: `<p>【正文提取失败】${friendlyMsg}<br>链接：<a href="${url}">${url}</a></p>`,
      contentMd: `【正文提取失败】${friendlyMsg}\n\n> 请尝试打开原文链接：${url}`,
      degraded: true,
      reason: friendlyMsg,
    }
  }

  // 空内容检查
  if (!rawHtml || rawHtml.trim().length < 100) {
    console.warn(`[contentService] 原文内容过短 (${url})，长度=${rawHtml?.length ?? 0}`)
    return {
      contentHtml: rawHtml || '<p>（原文内容为空）</p>',
      contentMd: rawHtml || `（原文内容为空）\n\n> 原文链接：${url}`,
      degraded: true,
      reason: `原文内容为空或过短（链接：${url}）`,
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
      reason: `DOM 解析失败：${message}（链接：${url}）`,
    }
  }

  // ★ Step 2.5: 提取表格占位符保护（Readability 会过滤 <table>）
  let bodyHtml = dom.window.document.body.innerHTML
  const { protected: protectedHtml, count: tableCount } = protectTables(bodyHtml)
  if (tableCount > 0) {
    console.log(`[contentService] protectTables: 保护了 ${tableCount} 个 <table> (${url})`)
    // 重新构造 jsdom，将保护后的 HTML 写回
    dom = new JSDOM(protectedHtml, { url, referrer: url, contentType: 'text/html', runScripts: 'outside-only' })
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
        reason: `Readability 未能提取正文，已返回原始 HTML（链接：${url}）`,
      }
    }

    cleanHtml = sanitizeHtml(result.content)
    // ★ 恢复被保护的 <table> 标签
    if (tableCount > 0) {
      cleanHtml = restoreTables(cleanHtml)
      console.log(`[contentService] restoreTables: 恢复了 ${tableCount} 个 <table> (${url})`)
    }
    // 在 HTML 层面也移除截断标记（有些站点在 Readability 输出中保留）
    cleanHtml = cleanHtml
      .replace(/<p[^>]*>\s*Continue\s+reading[^<]*<\/p>/gi, '')
      .replace(/<p[^>]*>\s*Read\s+more[^<]*<\/p>/gi, '')
      .replace(/<a[^>]*>\s*Continue\s+reading[^<]*<\/a>/gi, '')
      .replace(/<a[^>]*>\s*Read\s+more[^<]*<\/a>/gi, '')
    // ★ 清理属性值中的换行符/尾部断词连字符，防止 URL 截断
    cleanHtml = sanitizeHtmlAttributes(cleanHtml)
    // ★ 补全图片相对路径为绝对 URL
    cleanHtml = resolveImageUrls(cleanHtml, url)
    extractedTitle = result.title?.trim() || null
    textContent = result.textContent?.trim() || null

    // ★ 诊断日志 1: Readability 提取后首次检查
    console.log(`[DIAG] Readability 提取完成 — cleanHtml.length=${cleanHtml.length}`)
    console.log(`[DIAG] cleanHtml 前300字符:`, cleanHtml.slice(0, 300))
    console.log(`[DIAG] 含 <table:`, cleanHtml.includes('<table'))
    console.log(`[DIAG] 含 \\n:`, cleanHtml.includes('\n'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[contentService] Readability 提取正文失败 (${url})：${message}`)
    return {
      contentHtml: sanitizeHtml(rawHtml),
      contentMd: turndownService.turndown(rawHtml),
      degraded: true,
      reason: `正文提取失败：${message}（链接：${url}）`,
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
      reason: `Markdown 转换失败：${message}（链接：${url}）`,
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
      reason: `转换后 Markdown 为空（链接：${url}）`,
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
// 截断检测
// ============================================================

/** 截断检测结果 */
interface TruncationCheck {
  truncated: boolean
  reason: string
}

/** 强制抓取的域名白名单 */
const FORCE_FETCH_DOMAINS = new Set([
  'soulhacker.me',
  'www.soulhacker.me',
])

/**
 * 检测内容是否被截断（RSS 摘要等），需要触发完整抓取。
 *
 * 不再使用长度阈值（避免误判短文章），改用精确信号：
 * 0. 域名白名单 — 对特定来源强制抓取
 * 1. RSS 完整内容保护 — content 已有完整 HTML 结构时放行（不重复抓取）
 * 2. 截断标记词 — "Continue reading"、"Read more"、末尾 "..."、"[...]" 等
 * 3. HTML 结构检测 — 无 HTML 标签 + 包含省略号 → 疑似摘要
 */
function isContentTruncated(
  contentMd: string | null,
  contentHtml: string | null,
  articleUrl: string | null,
  articleId: number,
): TruncationCheck {
  const md = contentMd ?? ''
  const html = contentHtml ?? ''
  const combinedText = `${md} ${html}`

  // ---- 规则0: 域名白名单强制抓取 ----
  if (articleUrl) {
    try {
      const hostname = new URL(articleUrl).hostname
      if (FORCE_FETCH_DOMAINS.has(hostname)) {
        const reason = `[TRUNC_DETECT] articleId=${articleId} 域名白名单强制抓取: ${hostname}`
        console.log(reason)
        return { truncated: true, reason }
      }
    } catch { /* URL 解析失败，跳过域名检测 */ }
  }

  // ---- 规则1: RSS 完整内容保护 ----
  // 如果 content（原始 HTML）包含结构性标签且长度充足，说明已经是完整抓取结果。
  // 即使 contentMd 较短（如只有标题的短文章），也不触发重复抓取。
  if (html.length > 0) {
    const hasHtmlStructure = /<(p|div|article|section|h[1-6]|table|ul|ol|blockquote|pre|figure|img)\b/i.test(html)
    if (hasHtmlStructure && html.length > 800) {
      console.log(
        `[TRUNC_DETECT] articleId=${articleId} content 已有完整 HTML 结构 ` +
        `(标签匹配=${hasHtmlStructure}, html.length=${html.length})，跳过截断检测`
      )
      return { truncated: false, reason: '' }
    }
  }

  // ---- 规则2: 截断标记词 ----
  const truncationMarkers: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /Continue\s+reading/i, label: 'Continue reading' },
    { pattern: /Read\s+more/i, label: 'Read more' },
    { pattern: /阅读全文/, label: '阅读全文' },
    { pattern: /阅读更多/, label: '阅读更多' },
    { pattern: /\.\.\.\s*$/, label: '末尾 "..."' },
    { pattern: /…\s*$/, label: '末尾 "…"' },
    { pattern: /\[\.\.\.\]\s*$/, label: '末尾 "[...]"' },
    { pattern: /\[…\]\s*$/, label: '末尾 "[…]"' },
  ]
  for (const { pattern, label } of truncationMarkers) {
    if (pattern.test(combinedText)) {
      const reason = `[TRUNC_DETECT] articleId=${articleId} 内容包含截断标记: "${label}"`
      console.log(reason)
      return { truncated: true, reason }
    }
  }

  // ---- 规则3: HTML 结构检测 ----
  // 纯文本（无 HTML 标签）且包含省略号 → 很可能是 RSS 摘要片段
  if (html.trim().length > 0) {
    const hasHtmlTags = /<[a-zA-Z][^>]*>/i.test(html)
    if (!hasHtmlTags) {
      const hasEllipsis = /\.\.\.|…/.test(html)
      if (hasEllipsis) {
        const reason = `[TRUNC_DETECT] articleId=${articleId} 纯文本无 HTML 标签且包含省略号，疑似 RSS 摘要 (html.length=${html.length})`
        console.log(reason)
        return { truncated: true, reason }
      }
    }
  }

  console.log(
    `[TRUNC_DETECT] articleId=${articleId} 未检测到截断信号 ` +
    `(md.length=${md.length}, html.length=${html.length}, hasUrl=${!!articleUrl})`
  )
  return { truncated: false, reason: '' }
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
): Promise<{ content: string; contentHtml?: string; isCached: boolean; degraded?: boolean; reason?: string }> {
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
        // ★ 多维截断检测：检查内容长度、截断标记、纯文本/无标签等
        const { truncated, reason } = isContentTruncated(row.contentMd, row.content, articleUrl || null, articleId)
        if (truncated) {
          console.log(`[contentService] ${reason}，自动触发完整抓取`)
          // 跳过缓存，直接走流水线
        } else {
          const htmlLen = row.content?.length ?? 0
          console.log(`[DIAG] Stage3a: DB缓存命中 — row.content 存在: ${!!row.content}, 长度: ${htmlLen}`)
          if (row.content) {
            console.log(`[DIAG] Stage3a: row.content 含 <table: ${row.content.includes('<table')}, 含 \\n: ${row.content.includes('\n')}`)
            console.log(`[DIAG] Stage3a: row.content 前200字符:`, row.content.slice(0, 200))
          }
          const fixedHtml = row.content ? resolveImageUrls(row.content, articleUrl) : undefined
          return { content: row.contentMd, contentHtml: fixedHtml, isCached: true }
        }
      }
      // 有原始 content 但无 contentMd（RSS 原始摘要等）
      if (row && row.content && !row.contentMd) {
        // ★ 多维截断检测：对 RSS 原始内容也应用同样规则
        const { truncated, reason } = isContentTruncated(null, row.content, articleUrl || null, articleId)
        if (truncated) {
          console.log(`[contentService] ${reason}，自动触发完整抓取`)
          // 跳过此路径，直接走清洗流水线
        } else {
          const fixedHtml = resolveImageUrls(row.content, articleUrl)
          try {
            const md = turndownService.turndown(row.content)
            if (md.trim()) {
              console.log(`[DIAG] Stage1: 缓存有原始content无contentMd — 返回 contentHtml=resolveImageUrls结果, 长度=${fixedHtml.length}`)
              return { content: md, contentHtml: fixedHtml, isCached: true, degraded: true, reason: '使用 RSS 原始内容（未经清洗）' }
            }
          } catch {
            // turndown 失败，继续走流水线
          }
          console.log(`[DIAG] Stage1: turndown失败或为空 — 返回 contentHtml=resolveImageUrls结果, 长度=${fixedHtml.length}`)
          return { content: row.content, contentHtml: fixedHtml, isCached: true, degraded: true, reason: '使用 RSS 原始内容' }
        }
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
    // ★ 诊断日志 2: 写入 DB 前检查 contentHtml
    const htmlToStore = 'contentHtml' in result ? result.contentHtml : undefined
    console.log(`[DIAG] 写入DB前 — contentHtml 存在: ${!!htmlToStore}, 长度: ${htmlToStore?.length ?? 0}`)
    if (htmlToStore) {
      console.log(`[DIAG] 写入DB前 — contentHtml 前300字符:`, htmlToStore.slice(0, 300))
    }

    getDb()
      .update(articlesTable)
      .set({
        content: htmlToStore,
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
      contentHtml: result.contentHtml,
      isCached: false,
      degraded: true,
      reason: result.reason,
    }
  }

  return { content: result.contentMd, contentHtml: result.contentHtml, isCached: false }
}
