import type {
  IpcResponse,
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  LlmConfig,
  Tag,
  TokenStats,
  ArticleNote,
} from '../shared/types'

/** OPML 导入进度事件（类型定义同 preload/index.ts） */
interface OpmlImportProgress {
  current: number
  total: number
  feed: {
    title: string
    xmlUrl: string
    success: boolean
    feedId?: number
    error?: string
  }
}

export {}

declare global {
  interface Window {
    api: {
      // ---- RSS 业务 ----
      addFeed: (url: string) => Promise<IpcResponse>
      listFeeds: () => Promise<IpcResponse>
      refreshFeeds: () => Promise<IpcResponse>
      getArticles: (feedId: number, offset?: number, limit?: number) => Promise<IpcResponse>
      getArticleContent: (articleId: number) => Promise<IpcResponse>
      removeFeed: (feedId: number) => Promise<IpcResponse>
      searchArticles: (query: string, feedId?: number, offset?: number, limit?: number) => Promise<IpcResponse>
      getCachedArticleContent: (articleId: number) => Promise<IpcResponse>
      getArticlesByIds: (ids: number[]) => Promise<IpcResponse>

      // ---- LLM 配置 ----
      getLlmConfig: () => Promise<LlmConfig>
      setLlmConfig: (updates: Record<string, string>) => Promise<{ success: boolean }>
      resetLlmConfig: () => Promise<{ success: boolean }>

      // ---- LLM 流式操作 ----
      summarize: (articleId: number, content: string, title: string, targetLang: string, detailLevel?: string) => Promise<{ success: boolean }>
      translate: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>
      translateParagraphs: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>

      /** 监听流式数据块，返回取消监听的函数 */
      onStreamChunk: (
        callback: (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void
      ) => () => void

      /** 测试 LLM API 连接 */
      testConnection: (config?: { baseUrl: string; apiKey: string; model: string }) => Promise<{ success: boolean; latencyMs: number; message: string }>

      /** Token 用量统计 */
      getTokenStats: () => Promise<{ error: number; stats?: TokenStats[]; message?: string }>

      // ---- M5 标签系统 ----
      getTags: () => Promise<{ success: boolean; data?: Tag[]; error?: string }>
      getTagById: (id: number) => Promise<{ success: boolean; data?: Tag; error?: string }>
      createTag: (name: string, color?: string) => Promise<{ success: boolean; data?: Tag; error?: string }>
      updateTag: (id: number, name: string, color?: string) => Promise<{ success: boolean; data?: Tag; error?: string }>
      deleteTag: (id: number) => Promise<{ success: boolean; error?: string }>
      getTagsForArticle: (articleId: number) => Promise<{ success: boolean; data?: Tag[]; error?: string }>
      toggleArticleTag: (articleId: number, tagId: number) => Promise<{ success: boolean; data?: { added: boolean }; error?: string }>
      getArticlesByTag: (tagId: number) => Promise<{ success: boolean; data?: number[]; error?: string }>
      batchAddTagsToArticle: (articleId: number, tagIds: number[]) => Promise<{ success: boolean; error?: string }>
      suggestTagsFromAI: (title: string, content: string, existingTagNames: string[]) => Promise<{ success: boolean; data?: string[]; error?: string }>
      getTagArticleCounts: () => Promise<{ success: boolean; data?: Record<number, number>; error?: string }>

      // ---- 笔记系统 ----
      getNote: (articleId: number) => Promise<ArticleNote | null>
      saveNote: (articleId: number, content: string) => Promise<ArticleNote>
      deleteNote: (articleId: number) => Promise<void>
      exportNotesOpml: () => Promise<{ success: boolean; filePath?: string; error?: string }>

      // ---- 导出 ----
      exportSummaryMd: (articleTitle: string, summaryText: string) => Promise<{ success: boolean; filePath?: string; error?: string }>

      // ---- OPML 导入 ----
      selectOpmlFile: () => Promise<{ canceled: boolean; filePath?: string; error?: string }>
      previewOpml: (filePath: string) => Promise<IpcResponse>
      importOpml: (filePath: string) => Promise<IpcResponse>
      exportOpml: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      onOpmlProgress: (callback: (progress: OpmlImportProgress) => void) => () => void
    }
  }
}
