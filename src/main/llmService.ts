/**
 * LLM 通用接入服务 — 兼容 OpenAI 协议的流式调用。
 */

import OpenAI from 'openai'
import { getLlmConfig, getApiKeyForModel, type LlmConfig } from './configService'
import { getDb, articles as articlesTable } from './db'
import { eq } from 'drizzle-orm'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError, SummarizeRequest, TranslateRequest } from '../shared/types'
import { splitIntoParagraphs } from '../shared/paragraphSplitter'

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

/** 将内容按段落分割（兼容 HTML 和 Markdown），用于分段翻译。
 *
 * - HTML 内容：按 </p> / </h1-6> / </li> / </blockquote> / </div> 分割
 * - Markdown 内容：按连续双换行（段落间空行）分割，标题独立成段
 */
const splitContentIntoParagraphs = splitIntoParagraphs

/** 判断内容是否为 HTML */
function isHtmlContent(content: string): boolean {
  return /<\/?(p|h[1-6]|li|blockquote|div|span|a|img|table|ul|ol|pre|code|br)[>\s]/.test(content)
}

function buildParagraphTranslatePrompt(paragraph: string, targetLang: string): string {
  // 只替换 HTML <img> 标签（可能含 base64），保留 Markdown ![alt](url) 语法
  const cleaned = paragraph.replace(/<img[^>]*\/?>/gi, '[Image]')

  // 只剥离 HTML 标签来检查纯文本，不碰 Markdown 语法
  const plainText = cleaned.replace(/<[^>]+>/g, '').trim()
  // 去掉 title/alt 文本后，真正空段落才跳过
  if (!plainText) return ''

  const isHtml = isHtmlContent(cleaned)
  const langName = targetLang === 'Chinese' ? '简体中文' : targetLang

  if (isHtml) {
    return `Translate the following HTML fragment to ${langName}. Preserve ALL HTML tags and attributes exactly. Only translate visible text content. Keep the same HTML structure. Keep [Image] placeholders as-is. Do NOT include the original text. Output ONLY the translated HTML. No explanations:\n\n${cleaned}`
  }

  return `Translate the following Markdown fragment to ${langName}. Preserve ALL Markdown formatting (headings, bold, italic, links, images, code blocks, etc.) exactly. Only translate visible text content. Keep the same Markdown structure. Keep image syntax (![...](...)) unchanged. Do NOT include the original text. Output ONLY the translated Markdown. No explanations:\n\n${cleaned}`
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
  // 但仍使用 translateParagraph 类型事件，将全文翻译结果放到 index 0
  if (config.model.startsWith('kimi-')) {
    const prompt = buildTranslatePrompt(content, targetLang)
    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = createClient(config, activeKey)
        const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: temp, stream: true })
        await consumeStream(stream,
          (delta) => callback({ type: 'translateParagraph', articleId, paragraphIndex: 0, delta }),
          (fullText) => {
            const trimmed = fullText.trim()
            if (trimmed) {
              try {
                const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
                const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
                existingMap._v = 3
                existingMap[targetLang] = [trimmed]
                getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
              } catch {}
            }
            callback({ type: 'translateParagraph', articleId, paragraphIndex: 0, fullText: trimmed })
            // Kimi 翻译完成信号
            callback({ type: 'translateComplete', articleId, fullText: '' })
          },
          (errorMsg) => {
            callback({ type: 'translateParagraph', articleId, paragraphIndex: 0, message: errorMsg })
            callback({ type: 'translateComplete', articleId, fullText: '' })
          }
        )
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('429') && attempt < maxRetries - 1) {
          console.log(`[Kimi] 429 重试 ${attempt + 1}/${maxRetries}，等待 3 秒...`)
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

  const paragraphs = splitContentIntoParagraphs(content)
  console.log(`[translateParagraphs] 段落总数=${paragraphs.length}, 各段长度=${JSON.stringify(paragraphs.map((p: string) => p.length))}`)
  const allTranslations: string[] = new Array(paragraphs.length).fill('')
  for (let i = 0; i < paragraphs.length; i++) {
    const prompt = buildParagraphTranslatePrompt(paragraphs[i], targetLang)
    if (!prompt) { allTranslations[i] = ''; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: '' }); continue }
    try {
      const client = createClient(config, activeKey)
      const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: temp, stream: true })
      await consumeStream(stream,
        (delta) => callback({ type: 'translateParagraph', articleId, paragraphIndex: i, delta }),
        (fullText) => { allTranslations[i] = fullText; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText }) },
        (errorMsg) => { allTranslations[i] = `[错误] ${errorMsg}`; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errorMsg }) }
      )
      if (i < paragraphs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (err) {
      const errMsg = `[翻译失败] ${err instanceof Error ? err.message : String(err)}`
      allTranslations[i] = errMsg
      callback({ type: 'translateParagraph', articleId, paragraphIndex: i, message: errMsg })
    }
  }

  // 全部段落翻译完成后，合并写入 DB 并发送完成事件
  // ★ 添加 _v 版本号，防止旧版单段缓存污染
  try {
    const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
    const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
    existingMap._v = 3
    existingMap[targetLang] = allTranslations
    getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
  } catch { /* DB 写入失败不阻塞 */ }

  // 通知前端翻译全部完成
  callback({ type: 'translateComplete', articleId, fullText: '' })
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
        const trimmed = fullText.trim()
        if (trimmed) {
          try { getDb().update(articlesTable).set({ summary: trimmed }).where(eq(articlesTable.id, articleId)).run() } catch {}
        }
        callback({ type, articleId, fullText: trimmed })
      },
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}

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
    const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'system', content: 'You are a professional translator.' }, { role: 'user', content: prompt }], temperature: getTemperature(config.model), stream: true })
    await consumeStream(stream,
      (delta) => callback({ type, articleId, delta }),
      (fullText) => {
        const trimmed = fullText.trim()
        if (trimmed) {
          try {
            const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
            const existingMap: Record<string, string[]> = row?.translations ? JSON.parse(row.translations) : {}
            existingMap[targetLang] = [trimmed]
            getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
          } catch {}
        }
        callback({ type, articleId, fullText: trimmed })
      },
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}