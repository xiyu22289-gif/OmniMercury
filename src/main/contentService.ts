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
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

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
// 内容清洗：修复截断、格式问题
// ============================================================

/**
 * 修复 Markdown 标题格式，确保 `## Title` 前后有空行。
 * 如果标题紧贴前文（无空行），被 splitIntoParagraphs 合并到上一段，
 * 导致 Readability 认为正文从标题开始、前面的全是噪音。
 */
function preserveMarkdownHeaders(markdown: string): string {
  // 修复 `## title` 和 `### title` 前缺少空行
  let result = markdown
  // 前有空行确保标题独立成段
  result = result.replace(/([^\n])\n(#{2,3}\s)/g, '$1\n\n$2')
  // 后有空行确保标题与正文分开
  result = result.replace(/(#{2,3}\s[^\n]+)\n([^\n#])/g, '$1\n\n$2')
  return result
}

/**
 * 推广区块正则模式 — 使用 ^ 锚点（多行模式），只匹配以关键词开头的行。
 * 模式按优先级排列，匹配到的第一个段落之后的内容全部移除。
 *
 * 不再依赖 indexOf + 手动边界检查；^ 锚点天然确保行首匹配，
 * ★ / ☆ 等分隔符开头的行不会被匹配（因为正则要求以关键词开头）。
 */
const PROMOTIONAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^Best\s+iPhone\s+accessories/ims, label: 'Best iPhone accessories' },
  { pattern: /^Best\s+Android\s+accessories/ims, label: 'Best Android accessories' },
  { pattern: /^Best\s+iPad\s+accessories/ims, label: 'Best iPad accessories' },
  { pattern: /^Best\s+Mac\s+accessories/ims, label: 'Best Mac accessories' },
  { pattern: /^FTC[：:]/ims, label: 'FTC:' },
  { pattern: /^Best\s+gadgets/ims, label: 'Best gadgets' },
  { pattern: /^You\s+can\s+find\s+a\s+full\s+list\s+of/ims, label: 'full list' },
  { pattern: /^You'?re\s+reading\s+9to5Mac/ims, label: '9to5Mac reading' },
  { pattern: /^Check\s+out\s+our/ims, label: 'Check out our' },
  { pattern: /^We\s+may\s+earn\s+a\s+commission/ims, label: 'commission' },
  { pattern: /^affiliate\s+links/ims, label: 'affiliate links' },
  { pattern: /^免责声明[：:]/ims, label: 'Disclaimer CN' },
  { pattern: /^Disclaimer[：:]/ims, label: 'Disclaimer' },
]

/**
 * 移除文章末尾的推广/推荐区块。
 *
 * ★ 防御设计：
 * - 使用 /^keyword/m 多行锚点，只匹配以关键词开头的行
 * - ★ ☆ ● 等分隔符开头的行永远不会被匹配（正则不允许 ^ 前有其他字符）
 * - 仅处理文章末尾 40% 范围内的匹配（正文中间出现不触发）
 * - 剩余内容 < 500 字符时拒绝截断
 * - 无匹配时记录日志并原样返回
 */
function removePromotionalBlocks(markdown: string): string {
  const totalLen = markdown.length
  let bestMatch: { idx: number; label: string; patternName: string } | null = null

  for (const { pattern, label } of PROMOTIONAL_PATTERNS) {
    let match: RegExpExecArray | null
    let lastMatch: RegExpExecArray | null = null

    pattern.lastIndex = 0
    while ((match = pattern.exec(markdown)) !== null) {
      lastMatch = match
    }

    if (!lastMatch) continue

    const idx = lastMatch.index
    const positionRatio = idx / totalLen

    // 仅处理末尾附近的匹配
    if (positionRatio < 0.60) continue

    // 取最靠后的匹配（截断最少内容）
    if (!bestMatch || idx > bestMatch.idx) {
      bestMatch = { idx, label, patternName: pattern.source }
    }
  }

  if (!bestMatch) {
    console.log(`[contentService] removePromotionalBlocks: 未匹配到推广区块（${totalLen} 字符），保留全部内容`)
    return markdown
  }

  const { idx, label } = bestMatch
  const truncated = markdown.slice(0, idx).trimEnd()

  // 安全阀：剩余内容太少则拒绝
  if (truncated.length < 500) {
    console.log(
      `[contentService] removePromotionalBlocks: 拒绝截断 "${label}" @${idx} — ` +
      `剩余 ${truncated.length} 字符 < 500`
    )
    return markdown
  }

  const positionRatio = (idx / totalLen * 100).toFixed(0)
  const removalRatio = ((totalLen - truncated.length) / totalLen * 100).toFixed(0)
  console.log(
    `[contentService] removePromotionalBlocks: 截断 "${label}" ` +
    `位置 ${positionRatio}% (${idx}/${totalLen})，移除 ${removalRatio}% ` +
    `(${totalLen} → ${truncated.length} 字符)`
  )
  return truncated
}

/** 需要额外处理的域名及对应的清洗规则 */
const DOMAIN_CLEANERS: Record<string, (md: string) => string> = {
  '9to5mac.com': (md) => {
    // 移除 "Add 9to5Mac to your Google News feed."
    return md.replace(/Add\s+9to5Mac\s+to\s+your\s+Google\s+News\s+feed\.?/gi, '').trim()
  },
  'www.9to5mac.com': (md) => {
    return md.replace(/Add\s+9to5Mac\s+to\s+your\s+Google\s+News\s+feed\.?/gi, '').trim()
  },
}

/**
 * 综合内容清洗：依次调用所有清洗函数。
 * 在 turndown 转换后、存入数据库前调用。
 */
function cleanArticleContent(markdown: string, url: string): string {
  const beforeLen = markdown.length
  const beforeParaCount = markdown.split(/\n\n+/).filter(p => p.trim()).length
  let result = markdown

  // 1. 修复 Markdown 标题格式
  result = preserveMarkdownHeaders(result)
  const afterHeadersLen = result.length
  const afterHeadersParaCount = result.split(/\n\n+/).filter(p => p.trim()).length

  // 2. 移除推广区块
  result = removePromotionalBlocks(result)
  const afterPromoLen = result.length
  const afterPromoParaCount = result.split(/\n\n+/).filter(p => p.trim()).length

  // 3. 域名特定清洗
  try {
    const hostname = new URL(url).hostname
    if (DOMAIN_CLEANERS[hostname]) {
      result = DOMAIN_CLEANERS[hostname](result)
    }
  } catch { /* URL 解析失败，跳过域名清洗 */ }

  const afterLen = result.length
  const afterParaCount = result.split(/\n\n+/).filter(p => p.trim()).length

  // 诊断日志：逐步追踪
  if (beforeLen !== afterLen || beforeParaCount !== afterParaCount) {
    console.log(
      `[contentService] cleanArticleContent (${url}): ` +
      `总 ${beforeLen}→${afterLen} 字符, ` +
      `段落 ${beforeParaCount}→afterHeaders=${afterHeadersParaCount}→afterPromo=${afterPromoParaCount}→final=${afterParaCount}`
    )
  } else {
    console.log(
      `[contentService] cleanArticleContent (${url}): 无需清洗 ` +
      `(${beforeLen} 字符, ${beforeParaCount} 段)`
    )
  }

  return result
}

// ============================================================
// 验证页面检测：避免将 Cloudflare/JS 验证页当作正文存储
// ============================================================

/** 验证页面关键词 — HTML 正文中出现任一组合即判定为验证页 */
const VERIFICATION_PATTERNS: Array<{ patterns: RegExp[]; label: string }> = [
  {
    patterns: [
      /javascript\s+is\s+disabled/i,
      /javascript\s+not\s+enabled/i,
      /请启用\s*Javascript/i,
      /请启用\s*JavaScript/i,
      /Please\s+enable\s+JavaScript/i,
    ],
    label: 'JavaScript disabled'
  },
  {
    patterns: [
      /verify\s+you\s+are\s+(a\s+)?(not\s+a\s+)?(human|robot)/i,
      /人机验证/,
      /are\s+you\s+a\s+human/i,
      /prove\s+you\s+are\s+human/i,
    ],
    label: 'CAPTCHA / human verification'
  },
  {
    patterns: [
      /Cloudflare[\s-]*(?:(?:bot|challenge|verification|security|ray\s*id|attention\s*required))/i,
      /Attention\s+Required!?\s*\|\s*Cloudflare/i,
      /DDoS\s+protection\s+by\s+Cloudflare/i,
      /cf-browser-verification/i,
      /_cf_chl_opt/i,
    ],
    label: 'Cloudflare challenge'
  },
  {
    patterns: [
      /checking\s+your\s+browser/i,
      /browser\s+check/i,
      /enable\s+cookies/i,
      /您的浏览器/,
      /your\s+browser\s+does\s+not\s+support/i,
    ],
    label: 'Browser check'
  },
  {
    patterns: [
      /enable\s+Javascript[^<>]{0,30}to\s+continue/i,
      /Javascript[^<>]{0,30}请.*启用/i,
      /<noscript>.*<\/noscript>/i,
    ],
    label: 'noscript / JS required'
  },
]

/** 验证页面判定阈值 — HTML 极短 + 命中模式 = 验证页 */
const VERIFICATION_MAX_HTML_LENGTH = 2000

/**
 * 检测 HTML 是否为验证/防护页面。
 * 验证页面通常极短、包含特定警告文本、不含正文。
 */
function isVerificationPage(html: string, url: string): { isVerification: boolean; reason: string } {
  const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const htmlLen = html.length

  // 极短 HTML — 几乎肯定是验证页/错误页
  if (htmlLen < 300) {
    return { isVerification: true, reason: `HTML 过短 (${htmlLen} 字符)，疑似验证/错误页` }
  }

  // 中等长度 — 需要关键词确认
  if (htmlLen < VERIFICATION_MAX_HTML_LENGTH) {
    const hits: string[] = []
    for (const { patterns, label } of VERIFICATION_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(bodyText)) {
          hits.push(label)
          break
        }
      }
    }

    if (hits.length > 0) {
      return {
        isVerification: true,
        reason: `疑似验证页面: [${hits.join(', ')}] (HTML ${htmlLen} 字符)`
      }
    }
  }

  // 长 HTML — 检查是否在 <title> 中有验证关键词
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    const title = titleMatch[1].trim()
    if (/attention\s+required|just\s+a\s+moment|checking\s+your\s+browser|DDOS\s+protection|security\s+check/i.test(title)) {
      return {
        isVerification: true,
        reason: `<title> 包含验证关键词: "${title}"`
      }
    }
  }

  return { isVerification: false, reason: '' }
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
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Google Chrome";v="120", "Chromium";v="120", "Not?A_Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
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

  // ★ 验证页面检测
  const verification = isVerificationPage(rawHtml, url)
  if (verification.isVerification) {
    console.warn(`[contentService] 检测到验证/防护页面 (${url}): ${verification.reason}`)
    const friendlyMsg =
      `该网站需要启用 JavaScript 或通过人机验证才能访问内容，请尝试在浏览器中打开原文。\n\n` +
      `> 检测原因：${verification.reason}`
    return {
      contentHtml: `<p>【访问受限】该网站需要启用 JavaScript 或通过人机验证才能访问内容。<br><br>📝 请尝试：<br>1. 在浏览器中打开 <a href="${url}">原文链接</a><br>2. 完成人机验证后再试</p>`,
      contentMd: `【访问受限】\n\n该网站需要启用 JavaScript 或通过人机验证才能访问内容。\n\n> 原文链接：${url}\n> 原因：${verification.reason}`,
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

  // ---- Step 4.5: 内容清洗（标题格式修复 + 推广区块移除 + 域名特定处理）----
  const beforeCleanLen = contentMd.length
  try {
    contentMd = cleanArticleContent(contentMd, url)
    console.log(`[contentService] Step 4.5 cleanArticleContent 完成 — ${beforeCleanLen} → ${contentMd.length} 字符`)
  } catch (err) {
    console.error(`[contentService] cleanArticleContent 抛出异常 (${url}):`, err)
    // 清洗失败，保留原始 contentMd
  }
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
// 带缓存的获取（供 IPC Handler 使用）
// ============================================================

/**
 * 获取文章正文内容，优先从本地缓存读取，缓存未命中则走清洗流水线。
 *
 * 简单逻辑：
 * 1. 如果 content（HTML）存在且 > 500 字符 → 直接返回缓存（完整内容）
 * 2. 如果有 link → 抓取完整内容 → 更新 DB → 返回
 * 3. 没有 link → 返回已有的 content 或 contentMd
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
  // 1. 查询数据库
  const row = getDb()
    .select({
      id: articlesTable.id,
      content: articlesTable.content,
      contentMd: articlesTable.contentMd,
      link: articlesTable.link,
    })
    .from(articlesTable)
    .where(eq(articlesTable.id, articleId))
    .get()

  // 2. 非强制刷新时，如果 contentHtml(即 content 列) 存在且 > 500 字符，直接返回
  if (!forceRefresh && row?.content) {
    const htmlLen = row.content.length
    // ★ 检测旧版错误缓存（【正文提取失败】/【访问受限】），自动清除并重新抓取
    const isCachedError = row.content.includes('【正文提取失败】') || row.content.includes('【访问受限】') || row.content.includes('【Markdown 转换失败】') || row.content.includes('【正文抓取失败】')
    if (isCachedError) {
      console.log(`[contentService] 检测到缓存的旧版错误内容，清除并重新抓取 articleId=${articleId}`)
      getDb().update(articlesTable).set({ content: null, contentMd: null }).where(eq(articlesTable.id, articleId)).run()
    } else if (htmlLen > 500) {
      console.log(`[contentService] 缓存命中 articleId=${articleId}, contentHtml=${htmlLen} 字符`)
      const fixedHtml = resolveImageUrls(row.content, articleUrl)
      return {
        content: row.contentMd || '',
        contentHtml: fixedHtml,
        isCached: true,
      }
    } else {
      console.log(`[contentService] contentHtml 过短 (${htmlLen} 字符)，触发完整抓取 articleId=${articleId}`)
    }
  }

  // 3. 有 link → 抓取完整内容
  const link = articleUrl || row?.link
  if (link) {
    let result: ContentResult
    try {
      console.log(`[contentService] 开始抓取 articleId=${articleId} url=${link}`)
      result = await fetchAndCleanArticle(link)
      console.log(`[contentService] 抓取完成 — contentMd=${result.contentMd.length} 字符, contentHtml=${('contentHtml' in result ? result.contentHtml : '').length} 字符`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[contentService] 抓取失败 articleId=${articleId}:`, msg)
      // 降级：返回已有内容
      return {
        content: row?.contentMd || row?.content || `【正文抓取失败】${msg}`,
        contentHtml: row?.content || undefined,
        isCached: false,
        degraded: true,
        reason: `抓取失败：${msg}`,
      }
    }

    // 4. 写入数据库（验证页面除外）
    const isVerification = 'degraded' in result && result.degraded && result.reason.includes('验证')
    if (!isVerification) {
      try {
        const htmlToStore = 'contentHtml' in result ? result.contentHtml : undefined
        getDb()
          .update(articlesTable)
          .set({ content: htmlToStore, contentMd: result.contentMd })
          .where(eq(articlesTable.id, articleId))
          .run()
        console.log(`[contentService] DB 写入成功 articleId=${articleId}`)
      } catch (err) {
        console.error(`[contentService] DB 写入失败 articleId=${articleId}:`, err)
      }
    } else {
      console.log(`[contentService] 跳过 DB 写入 — 降级/验证内容不缓存`)
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

  // 5. 没有 link — 返回已有内容
  const fallbackContent = row?.contentMd || row?.content || '(暂无内容)'
  console.log(`[contentService] 无 link，返回已有内容 articleId=${articleId}, length=${fallbackContent.length}`)
  return {
    content: fallbackContent,
    contentHtml: row?.content || undefined,
    isCached: true,
    degraded: true,
    reason: '无原文链接，使用已有内容',
  }
}
