/**
 * LLM 通用接入服务 — 兼容 OpenAI 协议的流式调用。
 * 包含 Token 用量统计：API 返回优先，10 秒未返回则本地估算。
 */

import OpenAI from 'openai'
import { getLlmConfig, getApiKeyForModel, type LlmConfig } from './configService'
import { getDb, articles as articlesTable, insertTokenUsage } from './db'
import { eq } from 'drizzle-orm'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError, SummarizeRequest, TranslateRequest } from '../shared/types'
import { splitIntoParagraphs } from '../shared/paragraphSplitter'

// ============================================================
// 类型
// ============================================================

type StreamCallback = (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void

// ============================================================
// Token 估算（本地兜底）
// ============================================================

/** 估算文本的 Token 数。
 *  中文：≈ 0.55 Token / 字符
 *  英文：≈ 4 字符 / Token（约 0.75 词 / Token）
 *  混合文本按 CJK 字符占比分配权重。
 */
function estimateTokenCount(text: string): number {
  if (!text) return 0
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/g) || []).length
  const totalChars = text.length
  const nonCjkCount = totalChars - cjkCount

  if (totalChars === 0) return 0

  const cjkRatio = cjkCount / totalChars
  // CJK: 1.8 char/token → 0.555 token/char
  // non-CJK (English): ~4 char/token
  const cjkTokens = cjkCount * 0.555
  const nonCjkTokens = nonCjkCount * 0.25

  return Math.max(1, Math.round(cjkTokens + nonCjkTokens))
}

// ============================================================
// 模型 → 编码（用于识别是否使用 API 返回的 usage）
// ============================================================

/** 哪些模型应使用本地估算而不等 API 返回 */
function shouldEstimateTokens(model: string): boolean {
  // ChatECNU 使用本地估算
  return model.includes('ecnu')
}

// ============================================================
// Token 记录
// ============================================================

interface TokenRecordParams {
  model: string
  operation: string
  prompt: string
  completion: string
  /** API 返回的 usage（如果有） */
  apiUsage?: { promptTokens: number; completionTokens: number }
}

async function recordTokens(params: TokenRecordParams): Promise<void> {
  const { model, operation, prompt, completion, apiUsage } = params

  if (apiUsage) {
    // API 返回了精确数据
    try {
      insertTokenUsage({
        model,
        operation,
        promptTokens: apiUsage.promptTokens,
        completionTokens: apiUsage.completionTokens,
        source: 'api',
      })
    } catch { /* 静默失败，不影响主流程 */ }
    return
  }

  // 本地估算
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

function createClient(config: LlmConfig, activeKey: string): OpenAI {
  if (!activeKey) throw new Error('API Key 未配置。请在设置中填写 LLM API Key。')
  return new OpenAI({ apiKey: activeKey, baseURL: config.baseUrl, timeout: 120_000 })
}

// ============================================================
// 流式消费（带 usage 提取）
// ============================================================

type ChatStream = AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>

interface StreamResult {
  fullText: string
  usage: { promptTokens: number; completionTokens: number } | null
  error: string | null
}

async function consumeStreamWithUsage(stream: ChatStream): Promise<StreamResult> {
  let fullText = ''
  let usage: { promptTokens: number; completionTokens: number } | null = null
  let error: string | null = null

  try {
    for await (const chunk of stream) {
      // 检查 usage 字段（OpenAI 流式模式下最后一块包含 usage）
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
        }
      }

      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        fullText += delta
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return { fullText, usage, error }
}

/** 带超时的 Token 等待：先等 API 返回 usage，10 秒未返回则用估算 */
async function waitForUsage(
  model: string,
  stream: ChatStream,
  onDelta: (delta: string) => void,
  onError: (message: string) => void,
  timeoutMs: number = 10_000
): Promise<{ fullText: string; usage: { promptTokens: number; completionTokens: number } | null; error: string | null }> {
  // 如果模型直接走估算（ChatECNU），跳过等待
  if (shouldEstimateTokens(model)) {
    const result = await consumeStreamWithUsage(stream)
    if (result.error) onError(result.error)
    return result
  }

  // 否则先等 API 返回（带超时）
  return new Promise((resolve) => {
    let fullText = ''
    let usage: { promptTokens: number; completionTokens: number } | null = null
    let error: string | null = null
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const settle = () => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      if (error) onError(error)
      resolve({ fullText, usage, error })
    }

    // 异步消费流
    ;(async () => {
      try {
        for await (const chunk of stream) {
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
            }
          }
          const delta = chunk.choices?.[0]?.delta?.content
          if (delta) {
            fullText += delta
            onDelta(delta)
          }
        }
        settle()
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        settle()
      }
    })()

    // 超时：不管 API 是否返回 usage，直接结算
    timeout = setTimeout(() => {
      if (!usage && !error) {
        usage = null // 标记为无 API usage，由调用方本地估算
      }
      settle()
    }, timeoutMs)
  })
}

// ============================================================
// Kimi 兼容
// ============================================================

function getTemperature(model: string): number {
  if (model.startsWith('kimi-')) return 1
  return 0.1
}

// ============================================================
// 占位符保护
// ============================================================

const placeholderMap = new Map<string, string>()
let placeholderCounter = 0

function protectMedia(text: string): string {
  placeholderMap.clear()
  placeholderCounter = 0
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
    const key = `__IMG_${placeholderCounter++}__`
    placeholderMap.set(key, match)
    return key
  })
  text = text.replace(/(?<!!)\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
    const key = `__LINK_${placeholderCounter++}__`
    placeholderMap.set(key, match)
    return key
  })
  text = text.replace(/<img[^>]*\/?>/gi, (match) => {
    const key = `__IMG_${placeholderCounter++}__`
    placeholderMap.set(key, match)
    return key
  })
  return text
}

function restoreMedia(translated: string): string {
  let result = translated
  for (const [key, original] of placeholderMap) {
    result = result.replace(key, original)
  }
  return result
}

// ============================================================
// 段落翻译
// ============================================================

const splitContentIntoParagraphs = splitIntoParagraphs

function isHtmlContent(content: string): boolean {
  return /<\/?(p|h[1-6]|li|blockquote|div|span|a|img|table|ul|ol|pre|code|br)[>\s]/.test(content)
}

function buildParagraphTranslatePrompt(paragraph: string, targetLang: string): string {
  const protectedText = protectMedia(paragraph)
  const plainText = protectedText.replace(/<[^>]+>/g, '').replace(/__IMG_\d+__/g, '').replace(/__LINK_\d+__/g, '').trim()
  if (!plainText) return ''

  const isHtml = isHtmlContent(paragraph)
  const langName = targetLang === 'Chinese' ? '简体中文' : targetLang

  if (isHtml) {
    return `Translate the following HTML fragment to ${langName}. Preserve ALL HTML tags and attributes exactly. Only translate visible text content. Keep placeholders like __IMG_N__ and __LINK_N__ exactly as-is. Do NOT include the original text. Output ONLY the translated HTML. No explanations:\n\n${protectedText}`
  }
  return `Translate the following Markdown fragment to ${langName}. Preserve ALL Markdown formatting (headings, bold, italic, code blocks, etc.) exactly. Keep placeholders like __IMG_N__ and __LINK_N__ exactly as-is. Do NOT include the original text. Output ONLY the translated Markdown. No explanations:\n\n${protectedText}`
}

export async function translateParagraphs(request: TranslateRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, targetLang } = request
  if (!content?.trim()) { callback({ type: 'translate', articleId, message: '文章内容为空，无法翻译。' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) {
    callback({ type: 'translate', articleId, message: `读取 LLM 配置失败：${err instanceof Error ? err.message : String(err)}` }); return
  }

  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type: 'translate', articleId, message: '未配置 API Key' }); return }

  const temp = getTemperature(config.model)

  // Kimi 全文翻译
  if (config.model.startsWith('kimi-')) {
    const prompt = buildTranslatePrompt(content, targetLang)
    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = createClient(config, activeKey)
        const stream = await client.chat.completions.create({
          model: config.model, messages: [{ role: 'user', content: prompt }],
          temperature: temp, stream: true,
          stream_options: { include_usage: true },
        })

        const { fullText, usage } = await waitForUsage(config.model, stream,
          (delta) => callback({ type: 'translateParagraph', articleId, paragraphIndex: 0, delta }),
          (errorMsg) => { callback({ type: 'translateParagraph', articleId, paragraphIndex: 0, message: errorMsg }); callback({ type: 'translateComplete', articleId, fullText: '' }) },
          10_000
        )

        if (fullText) {
          const trimmed = fullText.trim()
          if (trimmed) {
            try {
              const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
              const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
              existingMap._v = 2
              existingMap[targetLang] = [trimmed]
              getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
            } catch {}
          }
          callback({ type: 'translateParagraph', articleId, paragraphIndex: 0, fullText: trimmed })

          // 记录 Token
          await recordTokens({ model: config.model, operation: 'translateParagraphs', prompt, completion: trimmed, apiUsage: usage ?? undefined })
        }
        callback({ type: 'translateComplete', articleId, fullText: '' })
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('429') && attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          continue
        }
        callback({ type: 'translateParagraph', articleId, paragraphIndex: 0, message: `[翻译失败] ${msg}` })
        callback({ type: 'translateComplete', articleId, fullText: '' })
        return
      }
    }
    callback({ type: 'translateComplete', articleId, fullText: '' })
    return
  }

  // 逐段翻译
  const paragraphs = splitContentIntoParagraphs(content)
  const allTranslations: string[] = new Array(paragraphs.length).fill('')
  let totalPromptChars = 0

  for (let i = 0; i < paragraphs.length; i++) {
    const prompt = buildParagraphTranslatePrompt(paragraphs[i], targetLang)
    if (!prompt) { allTranslations[i] = ''; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: '' }); continue }

    totalPromptChars += prompt.length

    try {
      const client = createClient(config, activeKey)
      const stream = await client.chat.completions.create({
        model: config.model, messages: [{ role: 'user', content: prompt }],
        temperature: temp, stream: true,
        stream_options: { include_usage: true },
      })

      const { fullText, usage } = await waitForUsage(config.model, stream,
        (delta) => callback({ type: 'translateParagraph', articleId, paragraphIndex: i, delta }),
        (errorMsg) => { allTranslations[i] = `[错误] ${errorMsg}`; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errorMsg }) },
        10_000
      )

      if (fullText) {
        const restored = restoreMedia(fullText)
        allTranslations[i] = restored
        callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: restored })

        // 记录 Token
        await recordTokens({ model: config.model, operation: 'translateParagraphs', prompt, completion: restored, apiUsage: usage ?? undefined })
      }
    } catch (err) {
      const errMsg = `[翻译失败] ${err instanceof Error ? err.message : String(err)}`
      allTranslations[i] = errMsg
      callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errMsg })
    }

    if (i < paragraphs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // 写入 DB
  try {
    const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
    const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
    existingMap._v = 2
    existingMap[targetLang] = allTranslations
    getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
  } catch {}

  callback({ type: 'translateComplete', articleId, fullText: '' })
}

// ============================================================
// 摘要
// ============================================================

function buildSummarizePrompt(title: string, content: string, targetLang: string, detailLevel: 'compact' | 'medium' | 'detailed' = 'medium'): string {
  const maxContentLen = detailLevel === 'detailed' ? 12000 : detailLevel === 'compact' ? 4000 : 8000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n\n[内容过长已截断...]' : content
  const langName = targetLang === 'Chinese' ? '简体中文' : targetLang

  const lengthGuide = detailLevel === 'compact'
    ? 'a very concise summary (about 50-80 words)'
    : detailLevel === 'detailed'
      ? 'a detailed summary (about 300-400 words) covering key points, supporting arguments, and conclusions'
      : 'a concise summary (about 150 words)'

  return `Please generate ${lengthGuide} for the following article in ${langName}. Output ONLY the summary text, no explanations:\n\nTitle: ${title}\n\nContent:\n${truncated}\n\nSummary:`
}

export async function summarizeArticle(request: SummarizeRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, title, targetLang, detailLevel } = request
  const type = 'summarize' as const
  if (!content?.trim()) { callback({ type, articleId, message: '文章内容为空' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { callback({ type, articleId, message: `配置失败：${err}` }); return }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type, articleId, message: '未配置 API Key' }); return }

  let client: OpenAI
  try { client = createClient(config, activeKey) } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildSummarizePrompt(title, content, targetLang, detailLevel)
  const maxTokens = detailLevel === 'compact' ? 300 : detailLevel === 'detailed' ? 1500 : 800
  const systemPrompt = '你是一个专业的文章摘要助手。'

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      temperature: getTemperature(config.model),
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    })

    const totalPrompt = systemPrompt + prompt

    const { fullText, usage } = await waitForUsage(config.model, stream,
      (delta) => callback({ type, articleId, delta }),
      (errorMsg) => callback({ type, articleId, message: errorMsg }),
      10_000
    )

    if (fullText) {
      const trimmed = fullText.trim()
      if (trimmed) {
        try {
          getDb().update(articlesTable).set({ summary: trimmed }).where(eq(articlesTable.id, articleId)).run()
          const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
          const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
          existingMap._summary = { text: trimmed, lang: targetLang }
          getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
        } catch {}
      }

      callback({ type, articleId, fullText: trimmed })

      // 记录 Token
      await recordTokens({ model: config.model, operation: 'summarize', prompt: totalPrompt, completion: trimmed, apiUsage: usage ?? undefined })
    }
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}

// ============================================================
// 全文翻译（旧版兼容）
// ============================================================

function buildTranslatePrompt(content: string, targetLang: string): string {
  const maxContentLen = 6000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n[Content truncated...]' : content
  const isHtml = isHtmlContent(truncated)
  const formatHint = isHtml
    ? 'Preserve ALL HTML tags and structure exactly. Only translate visible text.'
    : 'Preserve ALL Markdown formatting (headings, bold, italic, links, code blocks, etc.) exactly. Only translate visible text.'
  return `You are a professional translator. Translate the following ${isHtml ? 'HTML' : 'Markdown'} content to ${targetLang}. ${formatHint} Output ONLY the translated content with identical structure. No explanations:\n\n${truncated}`
}

export async function translateArticle(request: TranslateRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, title, targetLang } = request
  const type = 'translate' as const
  if (!content?.trim()) { callback({ type, articleId, message: '文章内容为空' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { callback({ type, articleId, message: `配置失败：${err}` }); return }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type, articleId, message: '未配置 API Key' }); return }

  let client: OpenAI
  try { client = createClient(config, activeKey) } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildTranslatePrompt(content, targetLang)
  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'system', content: 'You are a professional translator.' }, { role: 'user', content: prompt }],
      temperature: getTemperature(config.model), stream: true,
      stream_options: { include_usage: true },
    })

    const systemPrompt = 'You are a professional translator.'
    const totalPrompt = systemPrompt + prompt

    const { fullText, usage } = await waitForUsage(config.model, stream,
      (delta) => callback({ type, articleId, delta }),
      (errorMsg) => callback({ type, articleId, message: errorMsg }),
      10_000
    )

    if (fullText) {
      const trimmed = fullText.trim()
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

      // 记录 Token
      await recordTokens({ model: config.model, operation: 'translate', prompt: totalPrompt, completion: trimmed, apiUsage: usage ?? undefined })
    }
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}

// ============================================================
// 测试连接
// ============================================================

export async function testConnection(config?: { baseUrl: string; apiKey: string; model: string }): Promise<{ success: boolean; latencyMs: number; message: string }> {
  const cfg = config || getLlmConfig()
  const apiKey = config?.apiKey || getApiKeyForModel(cfg.model)
  if (!apiKey) return { success: false, latencyMs: 0, message: '未配置 API Key' }

  const client = new OpenAI({ apiKey, baseURL: cfg.baseUrl, timeout: 15_000 })
  const start = Date.now()
  try {
    const response = await client.models.list()
    const latencyMs = Date.now() - start
    const modelCount = response.data?.length ?? 0
    return { success: true, latencyMs, message: `连接成功，延迟 ${latencyMs}ms，可用模型 ${modelCount} 个` }
  } catch (err) {
    const latencyMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, latencyMs, message: `连接失败 (${latencyMs}ms)：${msg}` }
  }
}