/**
 * LLM 通用接入服务 — 兼容 OpenAI 协议的流式调用。
 *
 * 遵循 AGENTS.md §3.2：
 * - 统一使用 openai SDK，通过 baseURL + apiKey 适配全品类模型
 * - 流式输出固定使用 eventsource-parser 解析 SSE
 * - 严禁抛未捕获异常：所有错误统一返回 { success: false, error }
 */

import OpenAI from 'openai'
import { createParser, type ParsedEvent, type ReconnectInterval } from 'eventsource-parser'
import { getLlmConfig, type LlmConfig } from './configService'
import { getDb, articles as articlesTable } from './db'
import { eq } from 'drizzle-orm'
import type {
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  SummarizeRequest,
  TranslateRequest
} from '../shared/types'

// ============================================================
// 类型定义
// ============================================================

export interface LlmResultSuccess {
  success: true
  text: string
}

export interface LlmResultFailure {
  success: false
  error: string
}

export type LlmResult = LlmResultSuccess | LlmResultFailure

/** 流式回调类型 */
type StreamCallback = (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void

// ============================================================
// OpenAI 客户端工厂（每次调用按最新配置重建，保证配置热更新）
// ============================================================

function createClient(config: LlmConfig): OpenAI {
  if (!config.apiKey) {
    throw new Error('API Key 未配置。请在设置中填写 LLM API Key。')
  }
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: 120_000 // 2 分钟超时（翻译可能较慢）
  })
}

// ============================================================
// 流式 SSE 解析辅助
// ============================================================

/**
 * 将 OpenAI 兼容的 ReadableStream 转为逐块回调。
 *
 * @param stream    fetch 返回的 ReadableStream
 * @param onDelta  每收到一个增量文本片段调用
 * @param onDone   流结束调用（传入完整累积文本）
 * @param onError  流内出错调用
 */
async function parseStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
  onDone: (fullText: string) => void,
  onError: (message: string) => void
): Promise<void> {
  let fullText = ''
  const decoder = new TextDecoder()

  const parser = createParser(
    (event: ParsedEvent | ReconnectInterval) => {
      if (event.type !== 'event') return

      const data = event.data
      if (data === '[DONE]') {
        onDone(fullText)
        return
      }

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onDelta(delta)
        }
      } catch {
        // 某些 SSE chunk 非 JSON（如注释），安全忽略
      }
    }
  )

  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // 流自然结束但未收到 [DONE] 标记
        onDone(fullText)
        break
      }
      const chunk = decoder.decode(value, { stream: true })
      parser.feed(chunk)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onError(message)
  }
}

// ============================================================
// AI 摘要 Prompt
// ============================================================

function buildSummarizePrompt(title: string, content: string): string {
  // 截断过长内容（模型上下文窗口限制）
  const maxContentLen = 8000
  const truncated =
    content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n\n[内容过长已截断...]' : content

  return `请为以下文章生成一段简洁的中文摘要（约200字），涵盖文章的核心观点和关键信息：

标题：${title}

正文：
${truncated}

摘要：`
}

// ============================================================
// AI 翻译 Prompt
// ============================================================

function buildTranslatePrompt(content: string, targetLang: string): string {
  const maxContentLen = 8000
  const truncated =
    content.length > maxContentLen ? content.slice(0, maxContentLen) + '\n\n[内容过长已截断...]' : content

  return `请将以下内容翻译为${targetLang}。保持原文的 Markdown 格式、段落结构和链接。只输出译文，不要包含任何解释或前言：

${truncated}`
}

// ============================================================
// 公开 API — 流式摘要
// ============================================================

/**
 * 调用 LLM 生成文章摘要（流式）。
 *
 * 每一步都会通过 callback 发送进度块给渲染进程。
 * 完成后自动将摘要写入数据库 articles.summary 字段。
 */
export async function summarizeArticle(
  request: SummarizeRequest,
  callback: StreamCallback
): Promise<void> {
  const { articleId, content, title } = request
  const type = 'summarize' as const

  // 参数校验
  if (!content?.trim()) {
    callback({ type, articleId, message: '文章内容为空，无法生成摘要。' })
    return
  }

  let config: LlmConfig
  try {
    config = getLlmConfig()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    callback({ type, articleId, message: `读取 LLM 配置失败：${message}` })
    return
  }

  if (!config.apiKey) {
    callback({ type, articleId, message: '未配置 API Key，请在设置中填写。' })
    return
  }

  let client: OpenAI
  try {
    client = createClient(config)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    callback({ type, articleId, message })
    return
  }

  const prompt = buildSummarizePrompt(title, content)

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: '你是一个专业的文章摘要助手，擅长提取核心观点并生成简洁、信息密集的中文摘要。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
      stream: true,
      stream_options: { include_usage: true }
    })

    // ReadableStream → SSE 解析 → 逐块回调
    await parseStream(
      stream.toReadableStream(),
      // onDelta
      (delta) => {
        callback({ type, articleId, delta })
      },
      // onDone → 持久化摘要
      (fullText) => {
        if (fullText.trim()) {
          try {
            getDb()
              .update(articlesTable)
              .set({ summary: fullText.trim() })
              .where(eq(articlesTable.id, articleId))
              .run()
          } catch (dbErr) {
            console.error('[llmService] 摘要入库失败：', dbErr)
          }
        }
        callback({ type, articleId, fullText: fullText.trim() })
      },
      // onError
      (errorMsg) => {
        callback({ type, articleId, message: errorMsg })
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    callback({ type, articleId, message: `LLM 调用失败：${message}` })
  }
}

// ============================================================
// 公开 API — 流式翻译
// ============================================================

/**
 * 调用 LLM 翻译文章内容（流式）。
 *
 * 完成后自动将译文存入数据库 articles.content_md 字段。
 * 注意：原文保留在 articles.content 中不覆盖。
 */
export async function translateArticle(
  request: TranslateRequest,
  callback: StreamCallback
): Promise<void> {
  const { articleId, content, title } = request
  const type = 'translate' as const

  if (!content?.trim()) {
    callback({ type, articleId, message: '文章内容为空，无法翻译。' })
    return
  }

  let config: LlmConfig
  try {
    config = getLlmConfig()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    callback({ type, articleId, message: `读取 LLM 配置失败：${message}` })
    return
  }

  if (!config.apiKey) {
    callback({ type, articleId, message: '未配置 API Key，请在设置中填写。' })
    return
  }

  let client: OpenAI
  try {
    client = createClient(config)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    callback({ type, articleId, message })
    return
  }

  const prompt = buildTranslatePrompt(content, config.translateTarget)

  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: `你是一个专业的翻译助手。请将用户提供的文章精准翻译为${config.translateTarget}。` },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      stream: true,
      stream_options: { include_usage: true }
    })

    await parseStream(
      stream.toReadableStream(),
      (delta) => {
        callback({ type, articleId, delta })
      },
      (fullText) => {
        if (fullText.trim()) {
          try {
            getDb()
              .update(articlesTable)
              .set({ contentMd: fullText.trim() })
              .where(eq(articlesTable.id, articleId))
              .run()
          } catch (dbErr) {
            console.error('[llmService] 译文入库失败：', dbErr)
          }
        }
        callback({ type, articleId, fullText: fullText.trim() })
      },
      (errorMsg) => {
        callback({ type, articleId, message: errorMsg })
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    callback({ type, articleId, message: `LLM 翻译调用失败：${message}` })
  }
}