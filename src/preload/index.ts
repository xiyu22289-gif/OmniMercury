import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload 脚本 — 暴露安全的 API 给渲染进程。
 * 渲染进程通过 `window.api` 调用主进程方法。
 */

const api = {
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
    ipcRenderer.invoke('backend:searchArticles', query, feedId, offset, limit)
}

contextBridge.exposeInMainWorld('api', api)

export type AppApi = typeof api