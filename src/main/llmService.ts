/**
 * LLM 通用接入服务 — 兼容 OpenAI 协议的流式调用。
 * 包含 Token 用量统计：本地估算兜底。
 */

import OpenAI from 'openai'
import { getLlmConfig, getApiKeyForModel, type LlmConfig } from './configService'
import { getDb, articles as articlesTable, insertTokenUsage } from './db'
import { eq } from 'drizzle-orm'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError, SummarizeRequest, TranslateRequest, SelectiveTranslateRequest, SelectiveSummarizeRequest } from '../shared/types'
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
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/g) || []).length
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

function createClient(config: LlmConfig, activeKey: string): OpenAI {
  if (!activeKey) throw new Error('API Key 未配置。请在设置中填写 LLM API Key。')
  return new OpenAI({ apiKey: activeKey, baseURL: config.baseUrl, timeout: 120_000 })
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

/** 流式消费 + 实时回调 */
async function consumeStreamWithCallback(
  stream: ChatStream,
  onDelta: (delta: string) => void,
  onError: (message: string) => void,
): Promise<{ fullText: string; error: string | null }> {
  let fullText = ''
  let error: string | null = null
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        fullText += delta
        onDelta(delta)
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    onError(error)
  }
  return { fullText, error }
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
// 工具
// ============================================================

function isHtmlContent(content: string): boolean {
  return /<\/?(p|h[1-6]|li|blockquote|div|span|a|img|table|ul|ol|pre|code|br)[>\s]/.test(content)
}

function buildTranslatePrompt(content: string, targetLang: string): string {
  const maxContentLen = 4000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n[Content truncated...]' : content
  const isHtml = isHtmlContent(truncated)
  const formatHint = isHtml
    ? 'Keep HTML tags, only translate text.'
    : 'Keep Markdown format, only translate text.'
  return `Translate to ${targetLang}. ${formatHint} Output only translation:\n\n${truncated}`
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

// ============================================================
// 段落翻译
// ============================================================

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

  // 逐段翻译（所有模型统一走此路径）
  const paragraphs = splitIntoParagraphs(content)
  const allTranslations: string[] = new Array(paragraphs.length).fill('')

  for (let i = 0; i < paragraphs.length; i++) {
    const prompt = buildParagraphTranslatePrompt(paragraphs[i], targetLang)
    if (!prompt) { allTranslations[i] = ''; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: '' }); continue }

    try {
      const client = createClient(config, activeKey)
      const stream = await client.chat.completions.create({
        model: config.model, messages: [{ role: 'user', content: prompt }],
        temperature: temp,
        stream: true,
      })

      const { fullText } = await consumeStreamWithCallback(stream,
        (delta) => callback({ type: 'translateParagraph', articleId, paragraphIndex: i, delta }),
        (errorMsg) => { allTranslations[i] = `[错误] ${errorMsg}`; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errorMsg }) }
      )

      if (fullText) {
        const restored = restoreMedia(fullText)
        allTranslations[i] = restored
        callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: restored })
        await recordTokens({ model: config.model, operation: 'translateParagraphs', prompt, completion: restored })
      }
    } catch (err) {
      const errMsg = `[翻译失败] ${err instanceof Error ? err.message : String(err)}`
      allTranslations[i] = errMsg
      callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errMsg })
    }

    if (i < paragraphs.length - 1) {
      await new Promise(r => setTimeout(r, 500))
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
  const totalPrompt = systemPrompt + prompt

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      temperature: getTemperature(config.model),
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
        try {
          getDb().update(articlesTable).set({ summary: trimmed }).where(eq(articlesTable.id, articleId)).run()
          const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
          const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
          existingMap._summary = { text: trimmed, lang: targetLang, detailLevel }
          getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
        } catch {}
      }
      callback({ type, articleId, fullText: trimmed })
      await recordTokens({ model: config.model, operation: 'summarize', prompt: totalPrompt, completion: trimmed })
    }
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}

// ============================================================
// 选择段落摘要
// ============================================================

export async function summarizeSelection(request: SelectiveSummarizeRequest, callback: StreamCallback): Promise<void> {
  const { articleId, title, selectedParagraphs, targetLang, detailLevel } = request
  const type = 'selectiveSummarize' as const
  const content = selectedParagraphs?.join('\n\n')?.trim()
  if (!content) { callback({ type, articleId, message: '未选中任何段落' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { callback({ type, articleId, message: `配置失败：${err}` }); return }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type, articleId, message: '未配置 API Key' }); return }

  const prompt = buildSummarizePrompt(title, content, targetLang, detailLevel)
  const maxTokens = detailLevel === 'compact' ? 300 : detailLevel === 'detailed' ? 1500 : 800

  try {
    const client = createClient(config, activeKey)
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'system', content: '你是一个专业的文章摘要助手。' }, { role: 'user', content: prompt }],
      temperature: getTemperature(config.model),
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
        await recordTokens({ model: config.model, operation: 'selectiveSummarize', prompt, completion: trimmed })
      }
    }
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
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
      await recordTokens({ model: config.model, operation: 'translate', prompt: totalPrompt, completion: trimmed })
    }
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}

// ============================================================
// 测试连接
// ============================================================

export async function testConnection(configParams?: { baseUrl: string; apiKey: string; model: string }): Promise<{ success: boolean; latencyMs: number; message: string }> {
  const cfg = configParams || getLlmConfig()
  const apiKey = configParams?.apiKey || getApiKeyForModel(cfg.model)
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

// ============================================================
// AI 标签推荐
// ============================================================

export async function suggestTagsForArticle(title: string, content: string, existingTags: string[]): Promise<string[]> {
  console.log(`[llmService] suggestTagsForArticle — title="${title}", existingTags=${JSON.stringify(existingTags)}, contentLen=${content.length}`)
  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { console.error('[llmService] suggestTagsForArticle 读配置失败:', err); return [] }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { console.warn('[llmService] suggestTagsForArticle — 无 API Key'); return [] }

  const client = new OpenAI({ apiKey: activeKey, baseURL: config.baseUrl, timeout: 30_000 })
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
// 选择文本翻译
// ============================================================

function buildSelectiveTranslatePrompt(selectedText: string, targetLang: string): string {
  const langName = targetLang === 'Chinese' ? '简体中文' : targetLang
  const protectedText = protectMedia(selectedText)
  if (!protectedText.trim()) return ''
  return `Translate the following text to ${langName}. Preserve any Markdown formatting (bold, italic, code, etc.) exactly. Keep placeholders like __IMG_N__ and __LINK_N__ exactly as-is. Output ONLY the translated text. No explanations:\n\n${protectedText}`
}

export async function translateSelection(request: SelectiveTranslateRequest, callback: StreamCallback): Promise<void> {
  const { articleId, selectedText, targetLang } = request
  const type = 'selectiveTranslate' as const
  const trimmed = selectedText?.trim()
  if (!trimmed) { callback({ type, articleId, message: '选中文本为空' }); return }
  if (trimmed.length > 8000) { callback({ type, articleId, message: '选中文本过长（最多 8000 字符）' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { callback({ type, articleId, message: `配置失败：${err}` }); return }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type, articleId, message: '未配置 API Key' }); return }

  let client: OpenAI
  try { client = createClient(config, activeKey) } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildSelectiveTranslatePrompt(trimmed, targetLang)
  if (!prompt) { callback({ type, articleId, message: '无法构建翻译 Prompt' }); return }

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: getTemperature(config.model),
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
      await recordTokens({ model: config.model, operation: 'selectiveTranslate', prompt, completion: restored })
    }
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}
