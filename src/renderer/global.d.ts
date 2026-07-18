import type {
  IpcResponse,
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  LlmConfig
} from '../shared/types'

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

      // ---- LLM 配置 ----
      getLlmConfig: () => Promise<LlmConfig>
      setLlmConfig: (updates: Record<string, string>) => Promise<{ success: boolean }>
      resetLlmConfig: () => Promise<{ success: boolean }>

      // ---- LLM 流式操作 ----
      summarize: (articleId: number, content: string, title: string) => Promise<{ success: boolean }>
      translate: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>
      translateParagraphs: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>

      /** 监听流式数据块，返回取消监听的函数 */
      onStreamChunk: (
        callback: (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void
      ) => () => void
    }
  }
}