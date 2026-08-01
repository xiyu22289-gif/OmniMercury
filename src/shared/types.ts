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
  is_starred?: boolean
}

export interface ArticleContent {
  id: number
  content: string
  /** 清洗后的 HTML（Readability 输出），用于阅读器渲染，保留表格/换行/代码块等格式 */
  contentHtml?: string
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
    /** Token 用量统计 */
    stats?: TokenStats[]
  }
}

// ============================================================
// M5 标签系统
// ============================================================

export interface Tag {
  id: number
  name: string
  color: string | null
  createdAt: string | null
}

// ============================================================
// LLM 相关类型
// ============================================================

/** LLM 功能类型 */
export type LlmFunctionType = 'fullTranslate' | 'selectiveTranslate' | 'fullSummary' | 'selectiveSummary' | 'qa'

/** 自定义模型配置（用户自行填写的模型） */
export interface CustomModelConfig {
  /** 用户给该模型取的名称 */
  label: string
  baseUrl: string
  apiKey: string
  model: string
}

/** 单个 LLM 功能的完整配置 */
export interface LlmFunctionConfig {
  /** 当前选中的模型名称 */
  model: string
  /** 每个模型对应的 API Key 映射（便捷预设模型使用） */
  apiKeys: Record<string, string>
  /** 用户自定义模型列表 */
  customModels: CustomModelConfig[]
}

/** LLM 全局配置（各功能独立） */
export interface LlmGlobalConfig {
  fullTranslate: LlmFunctionConfig
  selectiveTranslate: LlmFunctionConfig
  fullSummary: LlmFunctionConfig
  selectiveSummary: LlmFunctionConfig
  qa: LlmFunctionConfig
}

/** LLM 服务商配置（旧版兼容，存于 electron-store） */
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

/** LLM 模型列表项 */
export interface LlmModelItem {
  id: string
  /** 模型显示名称（可能等于 id） */
  name: string
}

/** 模型列表查询结果 */
export interface ListModelsResult {
  success: boolean
  models: LlmModelItem[]
  /** 推荐的三款最快最稳模型 ID */
  recommended: string[]
  error: string
}

/** Token 用量统计 */
export interface TokenStats {
  model: string
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  callCount: number
  byOperation: { operation: string; prompt: number; completion: number }[]
}

/** 摘要请求参数 */
export interface SummarizeRequest {
  articleId: number
  content: string
  title: string
  /** 摘要目标语言（如 Chinese / English / Japanese 等） */
  targetLang: string
  /** 摘要详细程度 */
  detailLevel?: 'compact' | 'medium' | 'detailed'
}

/** 翻译请求参数 */
export interface TranslateRequest {
  articleId: number
  content: string
  title: string
  /** 翻译目标语言（如 Chinese / English / Japanese 等） */
  targetLang: string
}

/** 选择文本翻译请求参数 */
export interface SelectiveTranslateRequest {
  articleId: number
  /** 用户选中的原始文本 */
  selectedText: string
  /** 翻译目标语言 */
  targetLang: string
}

/** 选择段落摘要请求参数 */
export interface SelectiveSummarizeRequest {
  articleId: number
  /** 文章标题 */
  title: string
  /** 用户选中的段落数组 */
  selectedParagraphs: string[]
  /** 摘要目标语言 */
  targetLang: string
  /** 摘要详细程度 */
  detailLevel: 'compact' | 'medium' | 'detailed'
}

/** 流式数据块（主进程 → 渲染进程单向推送） */
export interface LlmStreamChunk {
  /** 操作类型 */
  type: 'summarize' | 'translate' | 'translateParagraph' | 'translateComplete' | 'selectiveTranslate' | 'selectiveSummarize' | 'qa'
  /** 文章 ID */
  articleId: number
  /** 段落索引（仅 translateParagraph 使用） */
  paragraphIndex?: number
  /** 当前增量文本片段 */
  delta: string
}

/** 流式结束通知 */
export interface LlmStreamDone {
  type: 'summarize' | 'translate' | 'translateParagraph' | 'translateComplete' | 'selectiveTranslate' | 'selectiveSummarize' | 'qa'
  articleId: number
  /** 段落索引（仅 translateParagraph 使用） */
  paragraphIndex?: number
  /** 完整结果文本 */
  fullText: string
}

// ============================================================
// 结构化错误类型（AI 调用容错增强）
// ============================================================

export type LlmErrorType = 'network' | 'timeout' | 'auth' | 'rate_limit' | 'parse' | 'api' | 'config' | 'unknown'

export interface LlmErrorDetail {
  errorType: LlmErrorType
  message: string
  url?: string           // 卡死/错误的 URL 或 API 端点
  statusCode?: number    // HTTP 状态码
  position?: number      // 卡死位置（段落索引）
  context?: string       // 上下文（出错的段落前几个字）
  timestamp: string      // 错误发生时间
}

/** 流式错误通知 */
export interface LlmStreamError {
  type: 'summarize' | 'translate' | 'translateParagraph' | 'translateComplete' | 'selectiveTranslate' | 'selectiveSummarize' | 'qa'
  articleId: number
  /** 段落索引（仅 translateParagraph 使用） */
  paragraphIndex?: number
  message: string
  /** 结构化错误详情（增强容错） */
  detail?: LlmErrorDetail
}

// ============================================================
// 笔记相关类型
// ============================================================

/** 文章笔记（DB → renderer） */
export interface ArticleNote {
  id: number
  articleId: number
  content: string
  createdAt: string
  updatedAt: string
}

/** OPML 导出笔记时附加的数据结构 */
export interface NoteExportItem {
  articleId: number
  articleTitle: string
  articleUrl: string
  feedTitle: string
  noteHtml: string
  updatedAt: string
}
