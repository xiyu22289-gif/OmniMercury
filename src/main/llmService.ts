/**
 * LLM 通用接入服务 — 兼容 OpenAI 协议的流式调用。
 * 包含 Token 用量统计：本地估算兜底。
 */

import OpenAI from 'openai'
import { getLlmConfig, getApiKeyForModel, getEffectiveConfig, getFunctionConfig, AI_API_TIMEOUT, AI_FIRST_TOKEN_TIMEOUT, type LlmConfig } from './configService'
import { getDb, articles as articlesTable, insertTokenUsage } from './db'
import { eq } from 'drizzle-orm'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError, LlmErrorDetail, LlmErrorType, SummarizeRequest, TranslateRequest, SelectiveTranslateRequest, SelectiveSummarizeRequest, LlmFunctionType, LlmModelItem } from '../shared/types'
import { splitIntoParagraphs } from '../shared/paragraphSplitter'

// ============================================================
// 类型
// ============================================================

type StreamCallback = (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void

// ============================================================
// Token 估算（本地兜底）
// ============================================================

/** 估算文本的 Token 数。 */
function estimateTokenCount(text: string): number {
  if (!text) return 0
  const cjkCount = (text.match(/[一-鿿㐀-䶿　-〿＀-￯]/g) || []).length
  const totalChars = text.length
  const nonCjkCount = totalChars - cjkCount
  if (totalChars === 0) return 0
  const cjkTokens = cjkCount * 0.555
  const nonCjkTokens = nonCjkCount * 0.25
  return Math.max(1, Math.round(cjkTokens + nonCjkTokens))
}

// ============================================================
// Token 记录
// ============================================================

interface TokenRecordParams {
  model: string
  operation: string
  prompt: string
  completion: string
}

async function recordTokens(params: TokenRecordParams): Promise<void> {
  const { model, operation, prompt, completion } = params
  const promptTokens = estimateTokenCount(prompt)
  const completionTokens = estimateTokenCount(completion)
  try {
    insertTokenUsage({
      model,
      operation,
      promptTokens,
      completionTokens,
      source: 'estimate',
    })
  } catch { /* 静默失败 */ }
}

// ============================================================
// Client 创建
// ============================================================

function createClientFromEffectiveConfig(funcType: LlmFunctionType): OpenAI {
  const effective = getEffectiveConfig(funcType)
  if (!effective.apiKey) throw new Error('API Key 未配置。请在设置中填写 LLM API Key。')
  const baseUrl = effective.baseUrl || PRESET_BASE_URLS[effective.model] || 'https://api.deepseek.com/v1'
  return new OpenAI({
    apiKey: effective.apiKey,
    baseURL: baseUrl,
    timeout: 120_000,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Origin': new URL(baseUrl).origin,
    },
  })
}

function createClient(config: LlmConfig, activeKey: string): OpenAI {
  if (!activeKey) throw new Error('API Key 未配置。请在设置中填写 LLM API Key。')
  return new OpenAI({
    apiKey: activeKey,
    baseURL: config.baseUrl,
    timeout: AI_API_TIMEOUT,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Origin': new URL(config.baseUrl).origin,
    },
  })
}

// ============================================================
// 流式消费
// ============================================================

type ChatStream = AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>

interface StreamResult {
  fullText: string
  error: string | null
}

async function consumeStream(stream: ChatStream): Promise<StreamResult> {
  let fullText = ''
  let error: string | null = null
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) fullText += delta
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  return { fullText, error }
}

/** 流式消费 + 实时回调（含首 Token 超时保护） */
async function consumeStreamWithCallback(
  stream: ChatStream,
  onDelta: (delta: string) => void,
  onError: (message: string) => void,
): Promise<{ fullText: string; error: string | null }> {
  let fullText = ''
  let error: string | null = null
  let firstTokenReceived = false
  let firstTokenTimer: ReturnType<typeof setTimeout> | null = null

  // 从异步迭代器中读取下一个值，同时检测首 token 超时
  const iterator = stream[Symbol.asyncIterator]()

  try {
    while (true) {
      // 读取下一个 chunk（对首个 token 附加超时）
      let nextResult: IteratorResult<OpenAI.Chat.Completions.ChatCompletionChunk>

      if (!firstTokenReceived) {
        // 未收到首 token：启动竞速
        const timeoutPromise = new Promise<never>((_, reject) => {
          firstTokenTimer = setTimeout(() => {
            reject(new Error('AI_FIRST_TOKEN_TIMEOUT'))
          }, AI_FIRST_TOKEN_TIMEOUT)
        })

        try {
          nextResult = await Promise.race([iterator.next(), timeoutPromise])
        } finally {
          if (firstTokenTimer) clearTimeout(firstTokenTimer)
          firstTokenTimer = null
        }
      } else {
        // 已收到首 token：正常读取（无超时竞速）
        nextResult = await iterator.next()
      }

      if (nextResult.done) break

      const chunk = nextResult.value
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        if (!firstTokenReceived) firstTokenReceived = true
        fullText += delta
        onDelta(delta)
      }
    }

    // 如果整个流结束都没收到任何 token
    if (!firstTokenReceived) {
      error = 'AI 服务返回空响应，请检查 API 配置或模型名称是否正确'
      onError(error)
    }
  } catch (err) {
    // 清理计时器
    if (firstTokenTimer) clearTimeout(firstTokenTimer)

    const msg = err instanceof Error ? err.message : String(err)
    const isFirstTokenTimeout = msg.includes('AI_FIRST_TOKEN_TIMEOUT') || msg.includes('首 token')
    const isNetworkTimeout = msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNABORTED')

    if (isFirstTokenTimeout) {
      error = `AI 调用 - 首 Token 超时（${AI_FIRST_TOKEN_TIMEOUT / 1000}s） - AI 服务无响应，请检查网络连接或 API 配置是否正确`
    } else if (isNetworkTimeout) {
      error = `AI 调用 - 网络超时 - 请检查网络连接或尝试缩短文章长度`
    } else {
      error = msg
    }
    onError(error)
  }
  return { fullText, error }
}

// ============================================================
// 流式降级：stream: true 失败时自动回退 stream: false
// ============================================================

type StreamCallFn = () => Promise<ChatStream>
type NonStreamCallFn = () => Promise<OpenAI.Chat.Completions.ChatCompletion>

/**
 * 优先尝试流式调用，失败时自动回退到非流式。
 *
 * 触发降级的条件（任一命中）：
 * - 错误信息包含 "stream" 相关关键词
 * - HTTP 400（参数错误，常见于模型不支持流式）
 */
async function tryStreamWithFallback(
  createStreamCall: StreamCallFn,
  createNonStreamCall: NonStreamCallFn,
  onDelta: (delta: string) => void,
  onError: (message: string) => void,
): Promise<{ fullText: string; error: string | null }> {
  // 1. 先尝试流式
  try {
    const stream = await createStreamCall()
    return await consumeStreamWithCallback(stream, onDelta, onError)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = err?.status ?? err?.response?.status ?? err?.statusCode
    const isStreamIssue =
      msg.includes('stream') ||
      msg.includes('does not support') ||
      msg.includes('not supported') ||
      msg.includes('streaming') ||
      msg.includes('SSE') ||
      code === 400
    if (!isStreamIssue) throw err // 非流式问题，继续向上抛给 withRetry
  }

  // 2. 流式失败，回退到非流式
  console.warn('[llmService] 流式调用失败，回退到非流式')
  try {
    const response = await createNonStreamCall()
    const text = response.choices?.[0]?.message?.content || ''
    if (text) {
      // 模拟流式：一次性输出全部内容
      onDelta(text)
      return { fullText: text, error: null }
    }
    const detail = classifyError(new Error('AI 服务（非流式）返回空响应'))
    const errMsg = formatErrorDetail(detail)
    onError(errMsg)
    return { fullText: '', error: errMsg }
  } catch (nonStreamErr) {
    const detail = classifyError(nonStreamErr)
    const errMsg = formatErrorDetail(detail)
    onError(errMsg)
    return { fullText: '', error: errMsg }
  }
}

// ============================================================
// Kimi 兼容
// ============================================================

function getTemperature(model: string): number {
  if (model.startsWith('kimi-')) return 1
  return 0.1
}

// ============================================================
// 块级占位符保护 — 翻译时保护表格/代码块/图片，避免结构损坏
// ============================================================

const blockPlaceholderMap = new Map<string, string>()
let blockCounters = { table: 0, code: 0, img: 0 }

/**
 * 保护不可翻译的块级元素，替换为占位符：
 * - <table>...</table> → __BLOCK_T_N__（保留结构，不翻译）
 * - <pre>...</pre> 或 Markdown ``` ``` → __BLOCK_C_N__（代码不翻译）
 * - <img ...> 或 Markdown ![...](...) → __BLOCK_I_N__（图片不翻译）
 * - 链接 [text](url) 不保护 — LLM 保留 URL 并翻译显示文本
 *
 * 返回保护后的文本。调用 restoreBlocks 还原。
 */
function protectBlocks(text: string): string {
  blockPlaceholderMap.clear()
  blockCounters = { table: 0, code: 0, img: 0 }
  let result = text

  // 1. 表格：<table>...</table>
  result = result.replace(/<table[\s>][\s\S]*?<\/table>/gi, (match) => {
    const key = `__BLOCK_T_${blockCounters.table++}__`
    blockPlaceholderMap.set(key, match)
    return `\n${key}\n`
  })

  // 2. 代码块：<pre>...<code>...</code>...</pre>
  result = result.replace(/<pre[\s>][\s\S]*?<\/pre>/gi, (match) => {
    const key = `__BLOCK_C_${blockCounters.code++}__`
    blockPlaceholderMap.set(key, match)
    return `\n${key}\n`
  })
  // Markdown 围栏代码块
  result = result.replace(/```[^\n]*[\s\S]*?```/g, (match) => {
    const key = `__BLOCK_C_${blockCounters.code++}__`
    blockPlaceholderMap.set(key, match)
    return `\n${key}\n`
  })

  // 3. 图片：HTML <img>
  result = result.replace(/<img[^>]*\/?>/gi, (match) => {
    const key = `__BLOCK_I_${blockCounters.img++}__`
    blockPlaceholderMap.set(key, match)
    return key
  })
  // Markdown 图片 ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
    const key = `__BLOCK_I_${blockCounters.img++}__`
    blockPlaceholderMap.set(key, match)
    return key
  })

  const total = blockCounters.table + blockCounters.code + blockCounters.img
  if (total > 0) {
    const parts: string[] = []
    if (blockCounters.table > 0) parts.push(`table ${blockCounters.table}`)
    if (blockCounters.code > 0) parts.push(`code ${blockCounters.code}`)
    if (blockCounters.img > 0) parts.push(`img ${blockCounters.img}`)
    console.log(`[llmService] protectBlocks: 保护了 ${total} 个块 (${parts.join(', ')})`)
  }

  return result
}

/** 还原所有被保护的块级元素 */
function restoreBlocks(translated: string): string {
  let result = translated
  for (const [key, original] of blockPlaceholderMap) {
    // 占位符可能被 LLM 添加空格或换行，用宽松匹配
    result = result.split(key).join(original)
    // 也匹配被空白包裹的情况
    result = result.replace(new RegExp(`\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'), original)
  }
  return result.trim()
}

/** 兼容旧接口：protectMedia = protectBlocks, restoreMedia = restoreBlocks */
const protectMedia = protectBlocks
const restoreMedia = restoreBlocks

// ============================================================
// 错误分类（增强容错：将原始异常归类为结构化错误类型）
// ============================================================

/**
 * 将 LLM API 调用中的原始错误分类为结构化错误类型。
 * 从 OpenAI SDK 错误对象中提取 HTTP 状态码和详细信息。
 */
function classifyError(err: any, url?: string, position?: number, context?: string): LlmErrorDetail {
  // ★ 提取 OpenAI SDK 原始错误体
  const apiError = err?.error ?? err?.response?.data ?? err?.response?.body ?? err?.body
  let rawApiDetail = ''
  if (apiError && typeof apiError === 'object') {
    rawApiDetail = JSON.stringify(apiError)
  } else if (typeof apiError === 'string') {
    rawApiDetail = apiError
  }
  const msg: string = err instanceof Error ? err.message : String(err)
  const lowerMsg = msg.toLowerCase()
  // 拼上原始 API 错误详情
  const fullMsg = rawApiDetail ? `${msg} [API: ${rawApiDetail}]` : msg
  const code: number | undefined = err?.status ?? err?.response?.status ?? err?.statusCode ?? apiError?.status ?? apiError?.status_code
  const timestamp = new Date().toISOString()

  // 超时（中英文 + axios/OpenAI SDK 超时标记）
  if (
    lowerMsg.includes('timeout') || lowerMsg.includes('timed out') ||
    lowerMsg.includes('etimedout') || lowerMsg.includes('econnaborted') ||
    lowerMsg.includes('aborted') ||
    msg.includes('超时') || msg.includes('首 Token')
  ) {
    return { errorType: 'timeout', message: fullMsg, url, statusCode: code, position, context, timestamp }
  }

  // 鉴权失败
  if (code === 401 || code === 403 ||
    lowerMsg.includes('unauthorized') || lowerMsg.includes('forbidden') ||
    msg.includes('API Key') || msg.includes('Incorrect API key') ||
    lowerMsg.includes('authentication') || lowerMsg.includes('invalid api key') ||
    msg.includes('鉴权') || msg.includes('密钥')
  ) {
    return { errorType: 'auth', message: fullMsg, url, statusCode: code, position, context, timestamp }
  }

  // 限流
  if (code === 429 || lowerMsg.includes('rate') || lowerMsg.includes('too many requests') || msg.includes('限流')) {
    return { errorType: 'rate_limit', message: fullMsg, url, statusCode: code, position, context, timestamp }
  }

  // 网络错误（中英文 DNS / 连接 / 无法访问）
  if (
    lowerMsg.includes('enotfound') || lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('econnreset') || lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('network') || lowerMsg.includes('networkerror') ||
    lowerMsg.includes('connect') || lowerMsg.includes('getaddrinfo') ||
    msg.includes('网络') || msg.includes('无法连接') || msg.includes('无法访问') ||
    msg.includes('连接失败') || msg.includes('请检查网络')
  ) {
    return { errorType: 'network', message: fullMsg, url, statusCode: code, position, context, timestamp }
  }

  // 空响应（AI 服务无返回）
  if (
    lowerMsg.includes('空响应') || lowerMsg.includes('empty response') ||
    lowerMsg.includes('no response') || lowerMsg.includes('返回空') ||
    msg.includes('无响应')
  ) {
    return { errorType: 'api', message: fullMsg, url, statusCode: code, position, context, timestamp }
  }

  // 解析错误
  if (
    lowerMsg.includes('json') || lowerMsg.includes('parse') || lowerMsg.includes('syntaxerror') ||
    lowerMsg.includes('unexpected token') || lowerMsg.includes('invalid json') ||
    msg.includes('解析')
  ) {
    return { errorType: 'parse', message: fullMsg, url, statusCode: code, position, context, timestamp }
  }

  // 服务端错误
  if (code && code >= 500) {
    return { errorType: 'api', message: fullMsg, url, statusCode: code, position, context, timestamp }
  }

  // 默认 — 保留原始错误信息，不做过度包装
  return { errorType: 'unknown', message: fullMsg, url, statusCode: code, position, context, timestamp }
}

/** 将 LlmErrorDetail 格式化为用户友好的错误摘要 */
function formatErrorDetail(detail: LlmErrorDetail): string {
  const labels: Record<LlmErrorType, string> = {
    timeout: '⏱ 超时',
    network: '🌐 网络错误',
    auth: '🔑 鉴权失败',
    rate_limit: '🚦 请求限流',
    parse: '📝 解析错误',
    api: '⚙️ API 错误',
    config: '🔧 配置错误',
    unknown: '❓ 未知错误',
  }
  let result = `${labels[detail.errorType]}：${detail.message}`
  if (detail.statusCode) result += ` (HTTP ${detail.statusCode})`
  if (detail.url) result += `\n地址：${detail.url}`
  if (detail.position !== undefined) result += `\n位置：第 ${detail.position + 1} 段`
  return result
}

// ============================================================
// 工具
// ============================================================

function isHtmlContent(content: string): boolean {
  return /<\/?(p|h[1-6]|li|blockquote|div|span|a|img|table|ul|ol|pre|code|br)[>\s]/.test(content)
}

function buildTranslatePrompt(content: string, targetLang: string): string {
  const maxContentLen = 4000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n[Content truncated...]' : content
  const isHtml = isHtmlContent(truncated)
  const protectedContent = protectMedia(truncated)
  const langName = targetLang === 'Chinese' ? '简体中文' : targetLang
  if (isHtml) {
    return `Translate the following HTML to ${langName}. Preserve HTML tags, links and image placeholders. Output only translation:\n\n${protectedContent}`
  }
  return `Translate the following Markdown to ${langName}. Preserve Markdown formatting, links and image placeholders. Output only translation:\n\n${protectedContent}`
}

/**
 * 去掉 LLM 多翻的内容。
 * LLM 有时会"好心"把后面几段也译出来，这里只保留第一段对应的译文。
 */
function stripExtraParagraphs(text: string): string {
  // HTML：截到 </p>、</h>、</div> 等第一个块级结束标签
  if (isHtmlContent(text)) {
    const m = text.match(/^([\s\S]*?<\/(?:p|h[1-6]|div|li|blockquote)>)/i)
    return m ? m[1].trim() : text.trim()
  }
  // Markdown：截到第一个双换行（段落分隔符）
  const idx = text.indexOf('\n\n')
  if (idx > 0) return text.slice(0, idx).trim()
  return text.trim()
}

function buildParagraphTranslatePrompt(paragraph: string, targetLang: string): string {
  const protectedText = protectMedia(paragraph)
  const plainText = protectedText.replace(/<[^>]+>/g, '').replace(/__BLOCK_[TCI]_\d+__/g, '').trim()
  if (!plainText) return ''
  const isHtml = isHtmlContent(paragraph)

  // 语言专属翻译模板
  const localeTemplates: Record<string, string> = {
    Chinese: `将以下段落翻译为简体中文。只输出译文，不要任何解释：\n\n${protectedText}`,
    Japanese: `以下の段落を日本語に翻訳してください。訳文のみを出力し、説明は不要：\n\n${protectedText}`,
    Korean: `다음 단락을 한국어로 번역하세요. 번역문만 출력하고 설명은 하지 마세요：\n\n${protectedText}`,
    French: `Traduisez le paragraphe suivant en français. Sortie uniquement la traduction, sans explications：\n\n${protectedText}`,
    German: `Übersetzen Sie den folgenden Absatz ins Deutsche. Nur die Übersetzung ausgeben, keine Erklärungen：\n\n${protectedText}`,
    English: `Translate the following paragraph to English. Output ONLY the translation, no explanations:\n\n${protectedText}`,
  }

  if (localeTemplates[targetLang]) {
    return localeTemplates[targetLang]
  }

  // fallback
  return `Translate to ${targetLang}. Output ONLY the translation:\n\n${protectedText}`
}

// ============================================================
// 预设模型 Base URL 映射
// ============================================================

const PRESET_BASE_URLS: Record<string, string> = {
  'deepseek-v4-flash': 'https://api.deepseek.com/v1',
  'ecnu-max': 'https://chat.ecnu.edu.cn/open/api/v1',
  'kimi-k2.7-code': 'https://api.moonshot.cn/v1',
  'gpt-5.6-luna': 'https://codeapi.icu/v1',
}

/** 获取函数级有效配置 */
function getFuncConfig(funcType: LlmFunctionType): { baseUrl: string; apiKey: string; model: string } {
  const effective = getEffectiveConfig(funcType)
  if (!effective.baseUrl) {
    effective.baseUrl = PRESET_BASE_URLS[effective.model] || 'https://api.deepseek.com/v1'
  }
  return effective
}

// ============================================================
// 重试机制
// ============================================================

/** 可重试的错误类型 */
const RETRYABLE_ERRORS = new Set<LlmErrorType>(['timeout', 'network', 'rate_limit', 'api', 'unknown'])

/** 判断错误是否可重试 */
function isRetryable(detail: LlmErrorDetail): boolean {
  return RETRYABLE_ERRORS.has(detail.errorType)
}

interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  operation: string
  articleId: number
}

/**
 * 带重试和首 token 超时保护的流式 LLM 调用包装。
 *
 * 重试策略：
 * - 最多 retry maxRetries 次（默认 2）
 * - 延迟递增：1s, 2s
 * - 仅重试可恢复的错误（超时/网络/限流/API/未知）
 * - 鉴权/配置/解析错误直接失败
 * - 每次重试前记录日志
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  onError: (message: string, detail?: LlmErrorDetail) => void,
  classify: (err: any) => LlmErrorDetail,
  opts: RetryOptions,
): Promise<{ result: T | null; error: string | null }> {
  const maxRetries = opts.maxRetries ?? 2
  const baseDelay = opts.baseDelayMs ?? 1000
  let lastError: string | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn()
      return { result, error: null }
    } catch (err) {
      const detail = classify(err)
      lastError = formatErrorDetail(detail)

      // 不可重试的错误直接返回
      if (!isRetryable(detail)) {
        console.error(`[llmService] ${opts.operation} articleId=${opts.articleId} 不可重试错误: ${detail.errorType}`)
        onError(lastError, detail)
        return { result: null, error: lastError }
      }

      // 最后一次尝试也失败了
      if (attempt === maxRetries) {
        console.error(`[llmService] ${opts.operation} articleId=${opts.articleId} 重试 ${maxRetries} 次后仍失败: ${lastError}`)
        onError(`[重试 ${maxRetries} 次后仍失败] ${lastError}`, detail)
        return { result: null, error: lastError }
      }

      // 中间重试
      const delay = baseDelay * (attempt + 1)
      console.warn(
        `[llmService] ${opts.operation} articleId=${opts.articleId} ` +
        `第 ${attempt + 1}/${maxRetries} 次失败 (${detail.errorType})，${delay}ms 后重试: ${detail.message.slice(0, 80)}`
      )
      await new Promise(r => setTimeout(r, delay))
    }
  }

  return { result: null, error: lastError ?? '未知错误' }
}

// ============================================================
// 段落翻译（全文翻译 → fullTranslate 配置）
// ============================================================

export async function translateParagraphs(request: TranslateRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, targetLang } = request
  if (!content?.trim()) { callback({ type: 'translate', articleId, message: '文章内容为空，无法翻译。' }); return }

  const effective = getFuncConfig('fullTranslate')
  if (!effective.apiKey) {
    const detail: LlmErrorDetail = { errorType: 'auth', message: '未配置 API Key', url: effective.baseUrl, timestamp: new Date().toISOString() }
    callback({ type: 'translate', articleId, message: formatErrorDetail(detail), detail }); return
  }
  const model = effective.model
  const temp = getTemperature(model)

  let client: OpenAI
  try { client = createClientFromEffectiveConfig('fullTranslate') } catch (err) {
    const detail = classifyError(err, effective.baseUrl)
    detail.errorType = 'config'
    callback({ type: 'translate', articleId, message: formatErrorDetail(detail), detail }); return
  }

  const paragraphs = splitIntoParagraphs(content)
  const allTranslations: string[] = new Array(paragraphs.length).fill('')

  // ★ 诊断日志：打印请求参数
  console.log(`[llmService] translateParagraphs 请求参数:`, JSON.stringify({
    articleId,
    model,
    baseUrl: effective.baseUrl,
    targetLang,
    paragraphCount: paragraphs.length,
    totalContentLen: content.length,
  }))

  for (let i = 0; i < paragraphs.length; i++) {
    const prompt = buildParagraphTranslatePrompt(paragraphs[i], targetLang)
    if (!prompt) {
      allTranslations[i] = paragraphs[i]
      callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: paragraphs[i] })
      continue
    }
    // ★ 带重试 + 流式降级的段落翻译
    const paraLen = prompt.length
    const { result: translatedText, error: transError } = await withRetry(
      async () => {
        const { fullText: text, error } = await tryStreamWithFallback(
          // 流式调用
          () => client.chat.completions.create({
            model, messages: [{ role: 'user', content: prompt }], temperature: temp,
            max_tokens: 2048, stream: true,
          }),
          // 非流式降级调用
          () => client.chat.completions.create({
            model, messages: [{ role: 'user', content: prompt }], temperature: temp,
            max_tokens: 2048, stream: false,
          }),
          (delta) => callback({ type: 'translateParagraph', articleId, paragraphIndex: i, delta }),
          (_errorMsg) => { /* 流内错误由 withRetry 统一处理 */ }
        )
        if (error) throw new Error(error)
        if (!text) throw new Error('AI 服务返回空响应')
        return text
      },
      (errorMsg, detail) => {
        allTranslations[i] = `[翻译失败] ${errorMsg}`
        callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errorMsg, detail })
      },
      (err) => classifyError(err, effective.baseUrl, i, paragraphs[i]?.slice(0, 50)),
      { operation: `translateParagraphs[${i}]`, articleId },
    )

    if (transError) continue

    if (translatedText) {
      const single = restoreMedia(translatedText).trim()
      allTranslations[i] = single
      callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: single })
      await recordTokens({ model, operation: 'translateParagraphs', prompt, completion: single })
    }
    if (i < paragraphs.length - 1) await new Promise(r => setTimeout(r, 50))
  }

  try {
    const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
    const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
    existingMap._v = 2
    existingMap[targetLang] = allTranslations
    existingMap[targetLang + '_complete'] = true
    getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
  } catch {}

  callback({ type: 'translateComplete', articleId, fullText: '' })
}

// ============================================================
// 摘要
// ============================================================

function buildSummarizePrompt(title: string, content: string, targetLang: string, detailLevel: 'compact' | 'medium' | 'detailed' = 'medium'): string {
  const maxContentLen = detailLevel === 'detailed' ? 12000 : detailLevel === 'compact' ? 4000 : 8000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n\n[Content too long, truncated...]' : content

  // 语言专属模板——整个 prompt 用目标语言书写，强制模型输出目标语言
  const templates: Record<string, (t: string, c: string, detail: string) => string> = {
    Chinese: (t, c, d) => `请为以下文章生成${d}的摘要，用简体中文输出。只输出摘要文字，不要任何解释：\n\n标题：${t}\n\n内容：\n${c}\n\n摘要：`,
    Japanese: (t, c, d) => `以下の記事を${d}の要約を生成してください。日本語のみで出力。解説は不要、要約文のみ出力：\n\nタイトル：${t}\n\n内容：\n${c}\n\n要約：`,
    Korean: (t, c, d) => `다음 기사를 ${d}의 요약으로 생성해 주세요. 한국어로만 출력하세요. 요약문만 출력하고 설명은 하지 마세요：\n\n제목：${t}\n\n내용：\n${c}\n\n요약：`,
    French: (t, c, d) => `Générez un résumé ${d} de l'article suivant en français UNIQUEMENT. Sortie texte du résumé uniquement, sans explications：\n\nTitre：${t}\n\nContenu：\n${c}\n\nRésumé：`,
    German: (t, c, d) => `Erstellen Sie eine ${d} Zusammenfassung des folgenden Artikels NUR auf Deutsch. Nur Zusammenfassungstext ausgeben, keine Erklärungen：\n\nTitel：${t}\n\nInhalt：\n${c}\n\nZusammenfassung：`,
    English: (t, c, d) => `Generate a ${d} summary of the following article in English ONLY. Output ONLY the summary text, no explanations：\n\nTitle：${t}\n\nContent：\n${c}\n\nSummary：`,
  }

  const detailGuide: Record<string, string> = {
    compact: '一段式，100字以内，将3-5个要点连贯地组织成一段话',
    medium: '一段式，200字以内，将4-6个要点连贯地组织成一段话',
    detailed: '一段式，300字以内，将5-8个要点连贯地组织成一段话',
  }
  const detailEn: Record<string, string> = {
    compact: 'single-paragraph, within 100 words, weaving 3-5 key points into one coherent paragraph',
    medium: 'single-paragraph, within 200 words, weaving 4-6 key points into one coherent paragraph',
    detailed: 'single-paragraph, within 300 words, weaving 5-8 key points into one coherent paragraph',
  }

  const fn = templates[targetLang]
  if (fn) {
    const detail = targetLang === 'English' ? detailEn[detailLevel] : detailGuide[detailLevel] || detailEn[detailLevel]
    return fn(title, truncated, detail)
  }

  // 兜底：英文模板
  const detail = detailEn[detailLevel]
  const langName = targetLang === 'Chinese' ? 'Simplified Chinese' : targetLang
  return `CRITICAL: You MUST output in ${langName} ONLY.\n\nGenerate a ${detail} summary of the following article in ${langName}. Output ONLY the summary text, no explanations:\n\nTitle：${title}\n\nContent：${truncated}\n\nSummary：`
}

export async function summarizeArticle(request: SummarizeRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, title, targetLang, detailLevel } = request
  const type = 'summarize' as const
  if (!content?.trim()) { callback({ type, articleId, message: '文章内容为空' }); return }

  const effective = getFuncConfig('fullSummary')
  if (!effective.apiKey) { callback({ type, articleId, message: '未配置 API Key' }); return }
  const model = effective.model
  const baseUrl = effective.baseUrl

  let client: OpenAI
  try { client = createClientFromEffectiveConfig('fullSummary') } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildSummarizePrompt(title, content, targetLang, detailLevel)
  // ★ max_tokens 安全上限：避免模型限制导致调用失败
  const maxTokens = detailLevel === 'compact' ? 300 : detailLevel === 'detailed' ? 1024 : 600
  const systemPromptMap: Record<string, string> = {
    Chinese: '你是一个专业的文章摘要助手。',
    English: 'You are a professional article summarization assistant. Output ONLY in English.',
    Japanese: 'あなたはプロの記事要約アシスタントです。日本語のみで出力してください。',
    Korean: '당신은 전문적인 기사 요약 도우미입니다. 한국어로만 출력하세요.',
    French: 'Vous êtes un assistant professionnel de résumé d\'article. Sortie en français uniquement.',
    German: 'Sie sind ein professioneller Artikelzusammenfassungs-Assistent. Nur auf Deutsch ausgeben.',
  }
  const systemPrompt = systemPromptMap[targetLang] || `You are a professional article summarization assistant. Output ONLY in ${targetLang}.`
  const totalPrompt = systemPrompt + prompt

  // ★ 诊断日志：打印请求参数
  console.log(`[llmService] summarizeArticle 请求参数:`, JSON.stringify({
    articleId,
    model,
    baseUrl,
    targetLang,
    detailLevel,
    maxTokens,
    promptLen: prompt.length,
    systemPromptLen: systemPrompt.length,
    title: title.slice(0, 50),
  }))

  // ★ 带重试 + 流式降级的调用
  const { result: fullText, error: retryError } = await withRetry(
    async () => {
      const { fullText: text, error } = await tryStreamWithFallback(
        // 流式调用
        () => client.chat.completions.create({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
          temperature: getTemperature(model),
          max_tokens: maxTokens,
          stream: true,
        }),
        // 非流式降级调用
        () => client.chat.completions.create({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
          temperature: getTemperature(model),
          max_tokens: maxTokens,
          stream: false,
        }),
        (delta) => callback({ type, articleId, delta }),
        (_errorMsg) => { /* 流内错误由 withRetry 统一处理 */ }
      )
      if (error) throw new Error(error)
      if (!text) throw new Error('AI 服务返回空响应')
      return text
    },
    (errorMsg, detail) => callback({ type, articleId, message: errorMsg, detail }),
    (err) => classifyError(err, baseUrl),
    { operation: 'summarizeArticle', articleId },
  )

  if (retryError) return

  if (fullText) {
    const trimmed = fullText.trim()
    if (trimmed) {
      try {
        getDb().update(articlesTable).set({ summary: trimmed }).where(eq(articlesTable.id, articleId)).run()
        const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
        const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
        existingMap._summary = { text: trimmed, lang: targetLang, detailLevel }
        getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
      } catch {}
    }
    callback({ type, articleId, fullText: trimmed })
    await recordTokens({ model, operation: 'summarize', prompt: totalPrompt, completion: trimmed })
  }
}

// ============================================================
// M15: AI 问答（流式）
// ============================================================

/** 根据 i18n 语言代码映射到 askQuestion prompt 模板 */
const QA_PROMPT_TEMPLATES: Record<string, { system: string; user: string }> = {
  zh: {
    system: '你是一个专业的文章内容助手，用简体中文回答所有问题。',
    user: '文章标题：{title}\n\n文章内容：{content}\n\n用户问题：{question}\n\n请用简体中文简洁准确地回答：',
  },
  'zh-TW': {
    system: '你是一個專業的文章內容助手，用繁體中文回答所有問題。',
    user: '文章標題：{title}\n\n文章內容：{content}\n\n用戶問題：{question}\n\n請用繁體中文簡潔準確地回答：',
  },
  en: {
    system: 'You are a professional article content assistant. Answer all questions in English ONLY.',
    user: 'Article Title: {title}\n\nArticle Content: {content}\n\nUser Question: {question}\n\nPlease answer concisely and accurately in English:',
  },
}

function buildQaPrompt(articleTitle: string, articleContent: string, question: string, lang: string): { systemPrompt: string; userPrompt: string } {
  const content = articleContent.slice(0, 6000)
  const tpl = QA_PROMPT_TEMPLATES[lang] || QA_PROMPT_TEMPLATES['zh']!
  return {
    systemPrompt: tpl.system,
    userPrompt: tpl.user.replace('{title}', articleTitle).replace('{content}', content).replace('{question}', question),
  }
}

export async function askQuestion(
  articleId: number, articleContent: string, articleTitle: string,
  question: string, callback: StreamCallback, lang?: string,
): Promise<void> {
  const effective = getFuncConfig('qa' as LlmFunctionType)
  if (!effective.apiKey) { callback({ type: 'qa' as any, articleId, message: '未配置问答 AI 的 API Key' }); return }
  const { systemPrompt, userPrompt } = buildQaPrompt(articleTitle, articleContent, question, lang || 'zh')
  let client: OpenAI
  try { client = createClientFromEffectiveConfig('qa' as LlmFunctionType) } catch (err) { callback({ type: 'qa' as any, articleId, message: String(err) }); return }
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
    const stream = await client.chat.completions.create({ model: effective.model, messages, temperature: 0.7, stream: true })
    const { fullText } = await consumeStreamWithCallback(stream, (delta) => callback({ type: 'qa' as any, articleId, delta }), (errorMsg) => callback({ type: 'qa' as any, articleId, message: errorMsg }))
    if (fullText) { callback({ type: 'qa' as any, articleId, fullText: fullText.trim() }); await recordTokens({ model: effective.model, operation: 'qa', prompt: systemPrompt + userPrompt, completion: fullText }) }
  } catch (err) { const detail = classifyError(err, effective.baseUrl); callback({ type: 'qa' as any, articleId, message: formatErrorDetail(detail), detail }) }
}

// ============================================================
// 选择段落摘要
// ============================================================

export async function summarizeSelection(request: SelectiveSummarizeRequest, callback: StreamCallback): Promise<void> {
  const { articleId, title, selectedParagraphs, targetLang, detailLevel } = request
  const type = 'selectiveSummarize' as const
  const content = selectedParagraphs?.join('\n\n')?.trim()
  if (!content) { callback({ type, articleId, message: '未选中任何段落' }); return }

  const effective = getFuncConfig('selectiveSummary')
  if (!effective.apiKey) { callback({ type, articleId, message: '未配置 API Key' }); return }
  const model = effective.model

  let client: OpenAI
  try { client = createClientFromEffectiveConfig('selectiveSummary') } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildSummarizePrompt(title, content, targetLang, detailLevel)
  const maxTokens = detailLevel === 'compact' ? 300 : detailLevel === 'detailed' ? 1500 : 800

  try {
    const sysMap: Record<string, string> = {
      Chinese: '你是一个专业的文章摘要助手。',
      English: 'You are a professional article summarization assistant. Output ONLY in English.',
      Japanese: 'あなたはプロの記事要約アシスタントです。日本語のみで出力してください。',
      Korean: '당신은 전문적인 기사 요약 도우미입니다. 한국어로만 출력하세요.',
      French: 'Vous êtes un assistant professionnel de résumé d\'article. Sortie en français uniquement.',
      German: 'Sie sind ein professioneller Artikelzusammenfassungs-Assistent. Nur auf Deutsch ausgeben.',
    }
    const sysPrompt = sysMap[targetLang] || `You are a professional article summarization assistant. Output ONLY in ${targetLang}.`
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: prompt }],
      temperature: getTemperature(model),
      max_tokens: maxTokens,
      stream: true,
    })
    const { fullText } = await consumeStreamWithCallback(stream,
      (delta) => callback({ type, articleId, delta }),
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )
    if (fullText) {
      const trimmed = fullText.trim()
      if (trimmed) {
        callback({ type, articleId, fullText: trimmed })
        await recordTokens({ model, operation: 'selectiveSummarize', prompt, completion: trimmed })
      }
    }
  } catch (err) {
    const detail = classifyError(err, effective.baseUrl)
    callback({ type, articleId, message: formatErrorDetail(detail), detail })
  }
}

// ============================================================
// 全文翻译（旧版兼容）
// ============================================================

export async function translateArticle(request: TranslateRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, targetLang } = request
  const type = 'translate' as const
  if (!content?.trim()) { callback({ type, articleId, message: '文章内容为空' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { callback({ type, articleId, message: `配置失败：${err}` }); return }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type, articleId, message: '未配置 API Key' }); return }

  let client: OpenAI
  try { client = createClient(config, activeKey) } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildTranslatePrompt(content, targetLang)
  const systemPrompt = 'You are a professional translator.'
  const totalPrompt = systemPrompt + prompt

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      temperature: getTemperature(config.model),
      max_tokens: 4096,
      stream: true,
    })

    const { fullText } = await consumeStreamWithCallback(stream,
      (delta) => callback({ type, articleId, delta }),
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )

    if (fullText) {
      const restored = restoreMedia(fullText)
      const trimmed = restored.trim()
      if (trimmed) {
        try {
          const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
          const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
          existingMap._v = 2
          existingMap[targetLang] = [trimmed]
          getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
        } catch {}
      }
      callback({ type, articleId, fullText: trimmed })
      await recordTokens({ model: config.model, operation: 'translate', prompt: totalPrompt, completion: trimmed })
    }
  } catch (err) {
    const detail = classifyError(err, config.baseUrl)
    callback({ type, articleId, message: formatErrorDetail(detail), detail })
  }
}

// ============================================================
// 测试连接
// ============================================================

export async function testConnection(configParams?: { baseUrl: string; apiKey: string; model: string }): Promise<{ success: boolean; latencyMs: number; message: string }> {
  const cfg = configParams || getLlmConfig()
  const apiKey = configParams?.apiKey || getApiKeyForModel(cfg.model)
  if (!apiKey) return { success: false, latencyMs: 0, message: '未配置 API Key' }

  const client = new OpenAI({
    apiKey,
    baseURL: cfg.baseUrl,
    timeout: 15_000,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Origin': new URL(cfg.baseUrl).origin,
    },
  })
  const start = Date.now()

  // 1) 先用 models.list 测试（大多数标准服务商支持）
  try {
    const response = await client.models.list()
    const latencyMs = Date.now() - start
    const modelCount = response.data?.length ?? 0
    return { success: true, latencyMs, message: `连接成功，延迟 ${latencyMs}ms，可用模型 ${modelCount} 个` }
  } catch {
    // models.list 不可用（如 CodeAPI 等中转站），继续回退
  }

  // 2) 回退：发一条轻量 chat 请求验证连通性
  if (!cfg.model) return { success: false, latencyMs: Date.now() - start, message: '未配置模型名称' }

  try {
    const response = await client.chat.completions.create({
      model: cfg.model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5,
      temperature: 0,
    })
    const latencyMs = Date.now() - start
    const text = response.choices?.[0]?.message?.content ?? ''
    const hasContent = text.trim().length > 0
    return {
      success: true,
      latencyMs,
      message: `连接成功，延迟 ${latencyMs}ms${hasContent ? '' : '（无返回内容）'}`
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, latencyMs, message: `连接失败 (${latencyMs}ms)：${msg}` }
  }
}

// ============================================================
// AI 标签推荐
// ============================================================

export async function suggestTagsForArticle(title: string, content: string, existingTags: string[]): Promise<string[]> {
  console.log(`[llmService] suggestTagsForArticle — title="${title}", existingTags=${JSON.stringify(existingTags)}, contentLen=${content.length}`)
  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { console.error('[llmService] suggestTagsForArticle 读配置失败:', err); return [] }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { console.warn('[llmService] suggestTagsForArticle — 无 API Key'); return [] }

  const client = new OpenAI({
    apiKey: activeKey,
    baseURL: config.baseUrl,
    timeout: AI_API_TIMEOUT,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Origin': new URL(config.baseUrl).origin,
    },
  })
  const maxLen = 3000
  const truncated = content.length > maxLen ? content.slice(0, maxLen) + '...' : content

  const existingHint = existingTags.length > 0
    ? `\n\n已有的标签（请不要重复推荐）：${existingTags.join('、')}`
    : ''

  const prompt = `你是一个专业的内容分类助手。阅读以下文章，建议 3-5 个简洁的标签（每个标签 2-6 个字，如"技术""AI""前端开发""效率工具"等），用于分类和检索。

要求：
- 标签应该准确反映文章主题
- 标签应该是通用的分类词汇，不是文章标题的复制
- 每个标签 2-6 个汉字或英文单词
- 输出格式：每行一个标签，不要序号，不要解释${existingHint}

文章标题：${title}

文章内容：
${truncated}

请输出标签（每行一个）：`

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: getTemperature(config.model),
      max_tokens: 120,
    })

    const text = response.choices?.[0]?.message?.content || ''
    const suggestions = text
      .split('\n')
      .map(line => line.replace(/^[\d.\-•·\s]+/, '').trim())
      .filter(s => s.length >= 1 && s.length <= 20)
      .slice(0, 6)

    console.log('[llmService] AI 推荐标签：', suggestions)
    return suggestions
  } catch (err) {
    console.error('[llmService] suggestTagsForArticle 失败：', err)
    return []
  }
}

// ============================================================
// 模型列表查询
// ============================================================

/** 从模型列表中推荐3款最快最稳的模型 */
function recommendModels(models: LlmModelItem[]): string[] {
  const fastKeywords = ['turbo', 'flash', 'mini', 'nano', 'lite', 'fast', 'quick', 'efficient', 'cheap', '4o', 'haiku']
  const avoidKeywords = ['preview', 'beta', 'alpha', 'instruct', 'embedding', 'whisper', 'tts', 'dall-e', 'vision', 'audio', 'moderation', 'babbage', 'davinci', 'ada']
  const candidates = models.filter(m => {
    const name = m.id.toLowerCase()
    return !avoidKeywords.some(k => name.includes(k))
  })
  candidates.sort((a, b) => {
    const an = a.id.toLowerCase(); const bn = b.id.toLowerCase()
    const aFast = fastKeywords.findIndex(k => an.includes(k))
    const bFast = fastKeywords.findIndex(k => bn.includes(k))
    if (aFast !== -1 && bFast === -1) return -1
    if (aFast === -1 && bFast !== -1) return 1
    return an.length - bn.length
  })
  return candidates.slice(0, 3).map(m => m.id)
}

/** 拉取服务商的可用模型列表 */
export async function listModels(baseUrl: string, apiKey: string): Promise<import('../shared/types').ListModelsResult> {
  if (!baseUrl || !apiKey) return { success: false, models: [], recommended: [], error: 'Base URL 和 API Key 不能为空' }

  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: 15_000,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Origin': new URL(baseUrl).origin,
    },
  })

  try {
    const response = await client.models.list()
    const models: LlmModelItem[] = (response.data || []).map(m => ({
      id: m.id,
      name: m.id,
    }))
    const priorityOrder = ['gpt', 'claude', 'deepseek', 'kimi', 'ecnu', 'gemini', 'qwen', 'glm']
    models.sort((a, b) => {
      const ai = priorityOrder.findIndex(p => a.id.toLowerCase().includes(p))
      const bi = priorityOrder.findIndex(p => b.id.toLowerCase().includes(p))
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.id.localeCompare(b.id)
    })

    // ★ 模型列表为空时，用一条轻量 chat 请求验证连接
    if (models.length === 0) {
      try {
        await client.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          temperature: 0,
        })
        // chat 成功但无模型列表 — 可能是 Base URL 正确但不支持 models.list
      } catch (chatErr) {
        const msg = chatErr instanceof Error ? chatErr.message : String(chatErr)
        return { success: false, models: [], recommended: [], error: `连接成功但无可用模型列表（可能 Base URL 不正确）: ${msg}` }
      }
    }

    const recommended = recommendModels(models)
    return { success: true, models, recommended, error: '' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, models: [], recommended: [], error: msg }
  }
}

// ============================================================
// 选择文本翻译
// ============================================================

function buildSelectiveTranslatePrompt(selectedText: string, targetLang: string): string {
  const protectedText = protectMedia(selectedText)
  if (!protectedText.trim()) return ''

  const localeTemplates: Record<string, string> = {
    Chinese: `将以下文本翻译为简体中文。只输出译文，不要任何解释：\n\n${protectedText}`,
    Japanese: `以下のテキストを日本語に翻訳してください。訳文のみを出力し、説明は不要：\n\n${protectedText}`,
    Korean: `다음 텍스트를 한국어로 번역하세요. 번역문만 출력하고 설명은 하지 마세요：\n\n${protectedText}`,
    French: `Traduisez le texte suivant en français. Sortie uniquement la traduction, sans explications：\n\n${protectedText}`,
    German: `Übersetzen Sie den folgenden Text ins Deutsche. Nur die Übersetzung ausgeben, keine Erklärungen：\n\n${protectedText}`,
    English: `Translate the following text to English. Output ONLY the translation, no explanations:\n\n${protectedText}`,
  }

  if (localeTemplates[targetLang]) {
    return localeTemplates[targetLang]
  }

  return `Translate to ${targetLang}. Output ONLY the translation:\n\n${protectedText}`
}

export async function translateSelection(request: SelectiveTranslateRequest, callback: StreamCallback): Promise<void> {
  const { articleId, selectedText, targetLang } = request
  const type = 'selectiveTranslate' as const
  const trimmed = selectedText?.trim()
  if (!trimmed) { callback({ type, articleId, message: '选中文本为空' }); return }
  if (trimmed.length > 8000) { callback({ type, articleId, message: '选中文本过长（最多 8000 字符）' }); return }

  const effective = getFuncConfig('selectiveTranslate')
  if (!effective.apiKey) { callback({ type, articleId, message: '未配置 API Key' }); return }
  const model = effective.model

  let client: OpenAI
  try { client = createClientFromEffectiveConfig('selectiveTranslate') } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildSelectiveTranslatePrompt(trimmed, targetLang)
  if (!prompt) { callback({ type, articleId, message: '无法构建翻译 Prompt' }); return }

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: getTemperature(model),
      max_tokens: 4096,
      stream: true,
    })
    const { fullText } = await consumeStreamWithCallback(stream,
      (delta) => callback({ type, articleId, delta }),
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )
    if (fullText) {
      const restored = restoreMedia(fullText.trim())
      callback({ type, articleId, fullText: restored })
      await recordTokens({ model, operation: 'selectiveTranslate', prompt, completion: restored })
    }
  } catch (err) {
    const detail = classifyError(err, effective.baseUrl)
    callback({ type, articleId, message: formatErrorDetail(detail), detail })
  }
}
