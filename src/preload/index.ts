import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  LlmConfig,
  IpcResponse,
  Tag,
  TokenStats,
  ArticleNote,
} from '../shared/types'

/** OPML 导入进度事件 */
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

  // ============================================================
  // M5: 标签筛选（跨订阅源批量获取文章）
  // ============================================================
  getArticlesByIds: (ids: number[]): Promise<IpcResponse> =>
    ipcRenderer.invoke('backend:getArticlesByIds', ids),

  // ---- LLM 配置 ----
  getLlmConfig: (): Promise<LlmConfig> =>
    ipcRenderer.invoke('llm:getConfig'),
  setLlmConfig: (updates: Record<string, string>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('llm:setConfig', updates),
  resetLlmConfig: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('llm:resetConfig'),
  testConnection: (config?: { baseUrl: string; apiKey: string; model: string }): Promise<{ success: boolean; latencyMs: number; message: string }> =>
    ipcRenderer.invoke('llm:testConnection', config),

  // ============================================================
  // M7: Token 用量统计
  // ============================================================
  getTokenStats: (): Promise<{ error: number; stats?: TokenStats[]; message?: string }> =>
    ipcRenderer.invoke('llm:getTokenStats'),

  // ---- LLM 流式操作（invoke 触发，on 接收进度） ----
  summarize: (articleId: number, content: string, title: string, targetLang: string, detailLevel?: string) =>
    ipcRenderer.invoke('llm:summarize', { articleId, content, title, targetLang, detailLevel }),
  translate: (articleId: number, content: string, title: string, targetLang: string) =>
    ipcRenderer.invoke('llm:translate', { articleId, content, title, targetLang }),
  translateParagraphs: (articleId: number, content: string, title: string, targetLang: string) =>
    ipcRenderer.invoke('llm:translateParagraphs', { articleId, content, title, targetLang }),

  /** 选择文本翻译（流式） */
  translateSelection: (articleId: number, selectedText: string, targetLang: string) =>
    ipcRenderer.invoke('llm:translateSelection', { articleId, selectedText, targetLang }),

  /** 选择段落摘要（流式） */
  summarizeSelection: (articleId: number, title: string, selectedParagraphs: string[], targetLang: string, detailLevel: 'compact' | 'medium' | 'detailed') =>
    ipcRenderer.invoke('llm:summarizeSelection', { articleId, title, selectedParagraphs, targetLang, detailLevel }),

  /** 监听流式数据块 */
  onStreamChunk: (
    callback: (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void
  ) => {
    const handler = (_event: IpcRendererEvent, chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => {
      callback(chunk)
    }
    ipcRenderer.on('llm:stream-chunk', handler)
    return () => {
      ipcRenderer.removeListener('llm:stream-chunk', handler)
    }
  },

  // ============================================================
  // M5 标签系统
  // ============================================================
  getTags: (): Promise<{ success: boolean; data?: Tag[]; error?: string }> =>
    ipcRenderer.invoke('tag:getAll'),
  getTagById: (id: number): Promise<{ success: boolean; data?: Tag; error?: string }> =>
    ipcRenderer.invoke('tag:getById', id),
  createTag: (name: string, color?: string): Promise<{ success: boolean; data?: Tag; error?: string }> =>
    ipcRenderer.invoke('tag:create', name, color),
  updateTag: (id: number, name: string, color?: string): Promise<{ success: boolean; data?: Tag; error?: string }> =>
    ipcRenderer.invoke('tag:update', id, name, color),
  deleteTag: (id: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tag:delete', id),
  getTagsForArticle: (articleId: number): Promise<{ success: boolean; data?: Tag[]; error?: string }> =>
    ipcRenderer.invoke('tag:getForArticle', articleId),
  toggleArticleTag: (articleId: number, tagId: number): Promise<{ success: boolean; data?: { added: boolean }; error?: string }> =>
    ipcRenderer.invoke('tag:toggleArticle', articleId, tagId),
  getArticlesByTag: (tagId: number): Promise<{ success: boolean; data?: number[]; error?: string }> =>
    ipcRenderer.invoke('tag:getArticlesByTag', tagId),
  batchAddTagsToArticle: (articleId: number, tagIds: number[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tag:batchAddToArticle', articleId, tagIds),
  suggestTagsFromAI: (title: string, content: string, existingTagNames: string[]): Promise<{ success: boolean; data?: string[]; error?: string }> =>
    ipcRenderer.invoke('tag:suggestFromAI', title, content, existingTagNames),
  getTagArticleCounts: (): Promise<{ success: boolean; data?: Record<number, number>; error?: string }> =>
    ipcRenderer.invoke('tag:getArticleCounts'),

  // ============================================================
  // M6: 笔记系统
  // ============================================================
  getNote: (articleId: number): Promise<ArticleNote | null> =>
    ipcRenderer.invoke('note:get', articleId),
  saveNote: (articleId: number, content: string): Promise<ArticleNote> =>
    ipcRenderer.invoke('note:save', articleId, content),
  deleteNote: (articleId: number): Promise<void> =>
    ipcRenderer.invoke('note:delete', articleId),
  exportNotesOpml: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('note:exportOpml'),

  // ============================================================
  // M6: 摘要导出
  // ============================================================
  exportSummaryMd: (articleTitle: string, summaryText: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('summary:exportMd', articleTitle, summaryText),

  // ---- OPML 导入 ----
  /** 打开文件选择对话框选择 OPML 文件 */
  selectOpmlFile: (): Promise<{ canceled: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('opml:selectFile'),

  /** 预览 OPML 文件内容 */
  previewOpml: (filePath: string): Promise<IpcResponse> =>
    ipcRenderer.invoke('opml:preview', filePath),

  /** 执行 OPML 批量导入 */
  importOpml: (filePath: string): Promise<IpcResponse> =>
    ipcRenderer.invoke('opml:import', filePath),

  /** 导出 OPML 文件 */
  exportOpml: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('opml:export'),

  /** 监听 OPML 导入进度 */
  onOpmlProgress: (callback: (progress: OpmlImportProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: OpmlImportProgress) => {
      callback(progress)
    }
    ipcRenderer.on('opml:import-progress', handler)
    return () => {
      ipcRenderer.removeListener('opml:import-progress', handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type AppApi = typeof api