/**
 * LLM 通用接入服务 — 兼容 OpenAI 协议的流式调用。
 */

import OpenAI from 'openai'
import { getLlmConfig, getApiKeyForModel, type LlmConfig } from './configService'
import { getDb, articles as articlesTable } from './db'
import { eq } from 'drizzle-orm'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError, SummarizeRequest, TranslateRequest } from '../shared/types'

type StreamCallback = (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void

function createClient(config: LlmConfig, activeKey: string): OpenAI {
  if (!activeKey) throw new Error('API Key 未配置。请在设置中填写 LLM API Key。')
  return new OpenAI({ apiKey: activeKey, baseURL: config.baseUrl, timeout: 120_000 })
}

type ChatStream = AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>

async function consumeStream(
  stream: ChatStream,
  onDelta: (delta: string) => void,
  onDone: (fullText: string) => void,
  onError: (message: string) => void
): Promise<void> {
  let fullText = ''
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) { fullText += delta; onDelta(delta) }
    }
    onDone(fullText)
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err))
  }
}

/** Kimi 只接受 temperature=1，其他模型保持 0.1 */
function getTemperature(model: string): number {
  if (model.startsWith('kimi-')) return 1
  return 0.1
}

function splitHtmlIntoParagraphs(html: string): string[] {
  const parts = html.split(/(<\/p>|<\/h[1-6]>|<\/li>|<\/blockquote>|<\/div>)/i)
  const paragraphs: string[] = []
  let current = ''
  for (const part of parts) {
    current += part
    if (/\/(p|h[1-6]|li|blockquote|div)>$/i.test(part.trim())) {
      if (current.trim()) paragraphs.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) paragraphs.push(current.trim())
  return paragraphs.length > 0 ? paragraphs : [html]
}

function buildParagraphTranslatePrompt(paragraph: string, targetLang: string): string {
  const cleaned = paragraph.replace(/<img[^>]*\/?>/gi, '[Image]')
  if (!cleaned.trim() || /^[\s\W_]+$/.test(cleaned.replace(/<[^>]+>/g, '').trim())) return ''
  return `Translate this HTML fragment to ${targetLang}. Preserve all HTML tags exactly. Only translate visible text. No explanations:\n\n${cleaned}`
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

  // Kimi 不逐段翻译，全文一次请求避免 429 并发限制
  if (config.model.startsWith('kimi-')) {
    const prompt = buildTranslatePrompt(content, targetLang)
    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = createClient(config, activeKey)
        const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: temp, stream: true })
        await consumeStream(stream,
          (delta) => callback({ type: 'translate', articleId, delta }),
          (fullText) => {
            if (fullText.trim()) {
              try { getDb().update(articlesTable).set({ contentMd: fullText.trim() }).where(eq(articlesTable.id, articleId)).run() } catch {}
            }
            callback({ type: 'translate', articleId, fullText: fullText.trim() })
          },
          (errorMsg) => callback({ type: 'translate', articleId, message: errorMsg })
        )
        return // 成功，退出重试循环
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('429') && attempt < maxRetries - 1) {
          console.log(`[Kimi] 429 重试 ${attempt + 1}/${maxRetries}，等待 3 秒...`)
          await new Promise(resolve => setTimeout(resolve, 3000))
          continue
        }
        callback({ type: 'translate', articleId, message: `[翻译失败] ${msg}` })
        return
      }
    }
    return
  }

  const paragraphs = splitHtmlIntoParagraphs(content)
  for (let i = 0; i < paragraphs.length; i++) {
    const prompt = buildParagraphTranslatePrompt(paragraphs[i], targetLang)
    if (!prompt) { callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: '' }); continue }
    try {
      const client = createClient(config, activeKey)
      const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: temp, stream: true })
      await consumeStream(stream,
        (delta) => callback({ type: 'translateParagraph', articleId, paragraphIndex: i, delta }),
        (fullText) => callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText }),
        (errorMsg) => callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errorMsg })
      )
      if (i < paragraphs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (err) {
      callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: `[翻译失败] ${err instanceof Error ? err.message : String(err)}` })
    }
  }
}

function buildSummarizePrompt(title: string, content: string, targetLang: string): string {
  const maxContentLen = 8000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n\n[内容过长已截断...]' : content
  return `Please generate a concise summary (about 150 words) for the following article in ${targetLang}. Output ONLY the summary text, no explanations:\n\nTitle: ${title}\n\nContent:\n${truncated}\n\nSummary:`
}

export async function summarizeArticle(request: SummarizeRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, title, targetLang } = request
  const type = 'summarize' as const
  if (!content?.trim()) { callback({ type, articleId, message: '文章内容为空' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { callback({ type, articleId, message: `配置失败：${err}` }); return }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type, articleId, message: '未配置 API Key' }); return }

  let client: OpenAI
  try { client = createClient(config, activeKey) } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildSummarizePrompt(title, content, targetLang)
  try {
    const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'system', content: '你是一个专业的文章摘要助手。' }, { role: 'user', content: prompt }], temperature: getTemperature(config.model), max_tokens: 800, stream: true })
    await consumeStream(stream,
      (delta) => callback({ type, articleId, delta }),
      (fullText) => {
        callback({ type, articleId, fullText: fullText.trim() })
      },
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}

function buildTranslatePrompt(content: string, targetLang: string): string {
  const maxContentLen = 6000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n[Content truncated...]' : content
  return `You are a professional translator. Translate the following HTML content to ${targetLang}. Preserve ALL HTML tags. Only translate visible text. Output ONLY the translated HTML:\n\n${truncated}`
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
    const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'system', content: 'You are a professional translator.' }, { role: 'user', content: prompt }], temperature: getTemperature(config.model), stream: true })
    await consumeStream(stream,
      (delta) => callback({ type, articleId, delta }),
      (fullText) => {
        if (fullText.trim()) { try { getDb().update(articlesTable).set({ contentMd: fullText.trim() }).where(eq(articlesTable.id, articleId)).run() } catch {} }
        callback({ type, articleId, fullText: fullText.trim() })
      },
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}