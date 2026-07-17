import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  LlmConfig
} from '../shared/types'

/**
 * Preload 脚本 — 暴露安全的 API 给渲染进程。
 * 渲染进程通过 `window.api` 调用主进程方法。
 */

const api = {
  // ---- RSS 业务 ----
  addFeed: (url: string) => ipcRenderer.invoke('backend:addFeed', url),
  listFeeds: () => ipcRenderer.invoke('backend:listFeeds'),
  refreshFeeds: () => ipcRenderer.invoke('backend:refreshFeeds'),
  getArticles: (feedId: number, offset?: number, limit?: number) =>
    ipcRenderer.invoke('backend:getArticles', feedId, offset, limit),
  getArticleContent: (articleId: number) =>
    ipcRenderer.invoke('backend:getArticleContent', articleId),
  removeFeed: (feedId: number) =>
    ipcRenderer.invoke('backend:removeFeed', feedId),
  searchArticles: (query: string, feedId?: number, offset?: number, limit?: number) =>
    ipcRenderer.invoke('backend:searchArticles', query, feedId, offset, limit),
  getCachedArticleContent: (articleId: number) =>
    ipcRenderer.invoke('backend:getCachedArticleContent', articleId),

  // ---- LLM 配置 ----
  getLlmConfig: (): Promise<LlmConfig> =>
    ipcRenderer.invoke('llm:getConfig'),
  setLlmConfig: (updates: Record<string, string>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('llm:setConfig', updates),
  resetLlmConfig: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('llm:resetConfig'),

  // ---- LLM 流式操作（invoke 触发，on 接收进度） ----
  summarize: (articleId: number, content: string, title: string) =>
    ipcRenderer.invoke('llm:summarize', { articleId, content, title }),
  translate: (articleId: number, content: string, title: string) =>
    ipcRenderer.invoke('llm:translate', { articleId, content, title }),

  /** 监听流式数据块 */
  onStreamChunk: (
    callback: (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void
  ) => {
    const handler = (_event: IpcRendererEvent, chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => {
      callback(chunk)
    }
    ipcRenderer.on('llm:stream-chunk', handler)
    // 返回取消监听的函数
    return () => {
      ipcRenderer.removeListener('llm:stream-chunk', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type AppApi = typeof api
