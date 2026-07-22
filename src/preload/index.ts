import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  LlmConfig,
  IpcResponse,
  TokenStats,
  ArticleNote,
} from '../shared/types'

export interface OpmlImportProgress {
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

const api = {
  addFeed: (url: string) => ipcRenderer.invoke('backend:addFeed', url),
  listFeeds: () => ipcRenderer.invoke('backend:listFeeds'),
  refreshFeeds: () => ipcRenderer.invoke('backend:refreshFeeds'),
  getArticles: (feedId: number, offset?: number, limit?: number) => ipcRenderer.invoke('backend:getArticles', feedId, offset, limit),
  getArticleContent: (articleId: number) => ipcRenderer.invoke('backend:getArticleContent', articleId),
  removeFeed: (feedId: number) => ipcRenderer.invoke('backend:removeFeed', feedId),
  searchArticles: (query: string, feedId?: number, offset?: number, limit?: number) => ipcRenderer.invoke('backend:searchArticles', query, feedId, offset, limit),
  getCachedArticleContent: (articleId: number) => ipcRenderer.invoke('backend:getCachedArticleContent', articleId),

  getLlmConfig: (): Promise<LlmConfig> => ipcRenderer.invoke('llm:getConfig'),
  setLlmConfig: (updates: Record<string, string>): Promise<{ success: boolean }> => ipcRenderer.invoke('llm:setConfig', updates),
  resetLlmConfig: (): Promise<{ success: boolean }> => ipcRenderer.invoke('llm:resetConfig'),
  testConnection: (config?: { baseUrl: string; apiKey: string; model: string }): Promise<{ success: boolean; latencyMs: number; message: string }> => ipcRenderer.invoke('llm:testConnection', config),
  getTokenStats: (): Promise<{ error: number; stats?: TokenStats[]; message?: string }> => ipcRenderer.invoke('llm:getTokenStats'),

  summarize: (articleId: number, content: string, title: string, targetLang: string, detailLevel?: string) => ipcRenderer.invoke('llm:summarize', { articleId, content, title, targetLang, detailLevel }),
  translate: (articleId: number, content: string, title: string, targetLang: string) => ipcRenderer.invoke('llm:translate', { articleId, content, title, targetLang }),
  translateParagraphs: (articleId: number, content: string, title: string, targetLang: string) => ipcRenderer.invoke('llm:translateParagraphs', { articleId, content, title, targetLang }),

  onStreamChunk: (callback: (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void) => {
    const handler = (_event: IpcRendererEvent, chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => { callback(chunk) }
    ipcRenderer.on('llm:stream-chunk', handler)
    return () => { ipcRenderer.removeListener('llm:stream-chunk', handler) }
  },

  selectOpmlFile: (): Promise<{ canceled: boolean; filePath?: string; error?: string }> => ipcRenderer.invoke('opml:selectFile'),
  previewOpml: (filePath: string): Promise<IpcResponse> => ipcRenderer.invoke('opml:preview', filePath),
  importOpml: (filePath: string): Promise<IpcResponse> => ipcRenderer.invoke('opml:import', filePath),
  exportOpml: (): Promise<{ success: boolean; filePath?: string; error?: string }> => ipcRenderer.invoke('opml:export'),
  onOpmlProgress: (callback: (progress: OpmlImportProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: OpmlImportProgress) => { callback(progress) }
    ipcRenderer.on('opml:import-progress', handler)
    return () => { ipcRenderer.removeListener('opml:import-progress', handler) }
  },

  // Notes
  getNote: (articleId: number): Promise<ArticleNote | null> => ipcRenderer.invoke('note:get', articleId),
  saveNote: (articleId: number, content: string): Promise<ArticleNote> => ipcRenderer.invoke('note:save', articleId, content),
  deleteNote: (articleId: number): Promise<void> => ipcRenderer.invoke('note:delete', articleId),
  exportNotesOpml: (): Promise<{ success: boolean; filePath?: string; error?: string }> => ipcRenderer.invoke('note:exportOpml'),

  exportSummaryMd: (articleTitle: string, summaryText: string): Promise<{ success: boolean; filePath?: string; error?: string }> => ipcRenderer.invoke('summary:exportMd', articleTitle, summaryText),
}

contextBridge.exposeInMainWorld('api', api)
export type AppApi = typeof api