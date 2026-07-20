/** IPC 协议中使用的共享类型 */

export interface Feed {
  id: number
  title: string
  url: string
  link?: string
  description?: string
  added_at: string
}

export interface Article {
  id: number
  feed_id: number
  title: string
  url: string
  author?: string
  summary?: string
  /** JSON 序列化的翻译缓存，格式：{ "Chinese": ["段落1", "段落2"], "English": [...] } */
  translations?: string
  published_at: string
  fetched_at: string
  is_read: boolean
}

export interface ArticleContent {
  id: number
  content: string
}

export interface IpcRequest {
  type: string
  payload?: Record<string, unknown>
}

export interface IpcResponse {
  type: string
  payload: {
    error: number
    errorCode?: string
    feed?: Feed
    feeds?: Feed[]
    articles?: Article[]
    content?: ArticleContent
    feed_id?: number
    new_count?: number
    message?: string
    /** OPML 导入：成功导入的订阅源数量 */
    feed_count?: number
    /** OPML 导入：失败的订阅源数量 */
    failed_count?: number
    /** OPML 导入：OPML 文件标题 */
    opml_title?: string
  }
}

// ============================================================
// LLM 相关类型
// ============================================================

/** LLM 服务商配置（存于 electron-store） */
export interface LlmConfig {
  /** 兼容 OpenAI 协议的服务商 baseURL（如 https://api.openai.com/v1） */
  baseUrl: string
  /** 当前模型 API Key（向后兼容，优先使用 apiKeys） */
  apiKey: string
  /** 模型名称（如 gpt-4o-mini、deepseek-chat） */
  model: string
  /** 每个模型独立的 API Key 映射（如 { 'deepseek-chat': 'sk-xxx', 'ecnu-chat': 'sk-yyy' }） */
  apiKeys: Record<string, string>
}

/** 摘要请求参数 */
export interface SummarizeRequest {
  articleId: number
  content: string
  title: string
  /** 摘要目标语言（如 Chinese / English / Japanese 等） */
  targetLang: string
}

/** 翻译请求参数 */
export interface TranslateRequest {
  articleId: number
  content: string
  title: string
  /** 翻译目标语言（如 Chinese / English / Japanese 等） */
  targetLang: string
}

/** 流式数据块（主进程 → 渲染进程单向推送） */
export interface LlmStreamChunk {
  /** 操作类型 */
  type: 'summarize' | 'translate' | 'translateParagraph' | 'translateComplete'
  /** 文章 ID */
  articleId: number
  /** 段落索引（仅 translateParagraph 使用） */
  paragraphIndex?: number
  /** 当前增量文本片段 */
  delta: string
}

/** 流式结束通知 */
export interface LlmStreamDone {
  type: 'summarize' | 'translate' | 'translateParagraph' | 'translateComplete'
  articleId: number
  /** 段落索引（仅 translateParagraph 使用） */
  paragraphIndex?: number
  /** 完整结果文本 */
  fullText: string
}

/** 流式错误通知 */
export interface LlmStreamError {
  type: 'summarize' | 'translate' | 'translateParagraph' | 'translateComplete'
  articleId: number
  /** 段落索引（仅 translateParagraph 使用） */
  paragraphIndex?: number
  message: string
}
