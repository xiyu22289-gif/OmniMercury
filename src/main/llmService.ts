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

/** 占位符替换表：翻译前替换图片/链接，翻译后还原 */
const placeholderMap = new Map<string, string>()
let placeholderCounter = 0

/** 将图片和链接替换为不可翻译的占位符，防止 LLM 修改 */
function protectMedia(text: string): string {
  placeholderMap.clear()
  placeholderCounter = 0
  // 保护 Markdown 图片 ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
    const key = `__IMG_${placeholderCounter++}__`
    placeholderMap.set(key, match)
    return key
  })
  // 保护 Markdown 链接 [text](url)
  text = text.replace(/(?<!!)\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
    const key = `__LINK_${placeholderCounter++}__`
    placeholderMap.set(key, match)
    return key
  })
  // 保护 HTML img 标签
  text = text.replace(/<img[^>]*\/?>/gi, (match) => {
    const key = `__IMG_${placeholderCounter++}__`
    placeholderMap.set(key, match)
    return key
  })
  return text
}

/** 将翻译结果中的占位符还原为原始图片/链接 */
function restoreMedia(translated: string): string {
  let result = translated
  for (const [key, original] of placeholderMap) {
    result = result.replace(key, original)
  }
  return result
}

function buildParagraphTranslatePrompt(paragraph: string, targetLang: string): string {
  // 保护图片和链接，防止 LLM 修改
  const protectedText = protectMedia(paragraph)

  // 只剥离 HTML 标签来检查纯文本，不碰 Markdown 语法
  const plainText = protectedText.replace(/<[^>]+>/g, '').replace(/__IMG_\d+__/g, '').replace(/__LINK_\d+__/g, '').trim()
  // 去掉 title/alt 文本后，真正空段落才跳过
  if (!plainText) return ''

  const isHtml = isHtmlContent(paragraph)
  const langName = targetLang === 'Chinese' ? '简体中文' : targetLang
  console.log(`[llmService] buildParagraphTranslatePrompt — targetLang=${targetLang}, langName=${langName}`)

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
                existingMap._v = 2
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
        (fullText) => { const restored = restoreMedia(fullText); allTranslations[i] = restored; callback({ type: 'translateParagraph', articleId, paragraphIndex: i, fullText: restored }) },
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
    existingMap._v = 2
    existingMap[targetLang] = allTranslations
    getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
  } catch { /* DB 写入失败不阻塞 */ }

  // 通知前端翻译全部完成
  callback({ type: 'translateComplete', articleId, fullText: '' })
}

function buildSummarizePrompt(title: string, content: string, targetLang: string, detailLevel: 'compact' | 'medium' | 'detailed' = 'medium'): string {
  const maxContentLen = detailLevel === 'detailed' ? 12000 : detailLevel === 'compact' ? 4000 : 8000
  const truncated = content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n\n[内容过长已截断...]' : content
  const langName = targetLang === 'Chinese' ? '简体中文' : targetLang

  const lengthGuide = detailLevel === 'compact'
    ? 'a very concise summary (about 50-80 words)'
    : detailLevel === 'detailed'
      ? 'a detailed summary (about 300-400 words) covering key points, supporting arguments, and conclusions'
      : 'a concise summary (about 150 words)'

  console.log(`[llmService] buildSummarizePrompt — targetLang=${targetLang}, langName=${langName}, detailLevel=${detailLevel}`)
  return `Please generate ${lengthGuide} for the following article in ${langName}. Output ONLY the summary text, no explanations:\n\nTitle: ${title}\n\nContent:\n${truncated}\n\nSummary:`
}

export async function summarizeArticle(request: SummarizeRequest, callback: StreamCallback): Promise<void> {
  const { articleId, content, title, targetLang, detailLevel } = request
  console.log(`[llmService] summarizeArticle — articleId=${articleId}, targetLang=${targetLang}, detailLevel=${detailLevel}`)
  const type = 'summarize' as const
  if (!content?.trim()) { callback({ type, articleId, message: '文章内容为空' }); return }

  let config: LlmConfig
  try { config = getLlmConfig() } catch (err) { callback({ type, articleId, message: `配置失败：${err}` }); return }
  const activeKey = getApiKeyForModel(config.model)
  if (!activeKey) { callback({ type, articleId, message: '未配置 API Key' }); return }

  let client: OpenAI
  try { client = createClient(config, activeKey) } catch (err) { callback({ type, articleId, message: String(err) }); return }

  const prompt = buildSummarizePrompt(title, content, targetLang, detailLevel)
  try {
    const maxTokens = detailLevel === 'compact' ? 300 : detailLevel === 'detailed' ? 1500 : 800
    const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'system', content: '你是一个专业的文章摘要助手。' }, { role: 'user', content: prompt }], temperature: getTemperature(config.model), max_tokens: maxTokens, stream: true })
    await consumeStream(stream,
      (delta) => callback({ type, articleId, delta }),
      (fullText) => {
        const trimmed = fullText.trim()
        if (trimmed) {
          try {
            getDb().update(articlesTable).set({ summary: trimmed }).where(eq(articlesTable.id, articleId)).run()
            // 同时写入 translations JSON，缓存摘要 + 语言，供前端缓存命中检查
            const row = getDb().select({ translations: articlesTable.translations }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
            const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
            existingMap._summary = { text: trimmed, lang: targetLang }
            getDb().update(articlesTable).set({ translations: JSON.stringify(existingMap) }).where(eq(articlesTable.id, articleId)).run()
          } catch {}
        }
        callback({ type, articleId, fullText: trimmed })
      },
      (errorMsg) => callback({ type, articleId, message: errorMsg })
    )
  } catch (err) { callback({ type, articleId, message: `LLM 调用失败：${err}` }) }
}

/** 测试 LLM API 连通性：调用 /v1/models 端点测量延迟 */
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
            const existingMap: Record<string, unknown> = row?.translations ? JSON.parse(row.translations) : {}
            existingMap._v = 2
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

/**
 * AI 标签推荐：基于文章标题和内容，调用 LLM 建议 3-5 个标签名。
 * 返回标签名数组（纯文本，不含颜色）。
 */
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
      temperature: 0.3,
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