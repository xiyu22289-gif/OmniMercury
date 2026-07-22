import type {
  IpcResponse,
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  LlmConfig,
  TokenStats,
  ArticleNote,
} from '../shared/types'

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
      addFeed: (url: string) => Promise<IpcResponse>
      listFeeds: () => Promise<IpcResponse>
      refreshFeeds: () => Promise<IpcResponse>
      getArticles: (feedId: number, offset?: number, limit?: number) => Promise<IpcResponse>
      getArticleContent: (articleId: number) => Promise<IpcResponse>
      removeFeed: (feedId: number) => Promise<IpcResponse>
      searchArticles: (query: string, feedId?: number, offset?: number, limit?: number) => Promise<IpcResponse>
      getCachedArticleContent: (articleId: number) => Promise<IpcResponse>

      getLlmConfig: () => Promise<LlmConfig>
      setLlmConfig: (updates: Record<string, string>) => Promise<{ success: boolean }>
      resetLlmConfig: () => Promise<{ success: boolean }>
      testConnection: (config?: { baseUrl: string; apiKey: string; model: string }) => Promise<{ success: boolean; latencyMs: number; message: string }>
      getTokenStats: () => Promise<{ error: number; stats?: TokenStats[]; message?: string }>

      summarize: (articleId: number, content: string, title: string, targetLang: string, detailLevel?: string) => Promise<{ success: boolean }>
      translate: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>
      translateParagraphs: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>

      onStreamChunk: (callback: (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void) => () => void

      selectOpmlFile: () => Promise<{ canceled: boolean; filePath?: string; error?: string }>
      previewOpml: (filePath: string) => Promise<IpcResponse>
      importOpml: (filePath: string) => Promise<IpcResponse>
      exportOpml: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      onOpmlProgress: (callback: (progress: OpmlImportProgress) => void) => () => void

      getNote: (articleId: number) => Promise<ArticleNote | null>
      saveNote: (articleId: number, content: string) => Promise<ArticleNote>
      deleteNote: (articleId: number) => Promise<void>
      exportNotesOpml: () => Promise<{ success: boolean; filePath?: string; error?: string }>

      exportSummaryMd: (articleTitle: string, summaryText: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    }
  }
}