import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './index.css'

// 浏览器开发模式 mock：当不在 Electron 环境中时提供空 API
if (!window.api) {
  const mockResolve = <T extends Record<string, unknown>>(data: T) =>
    Promise.resolve({ type: '', payload: { error: 0, ...data } })

  window.api = {
    addFeed: () => mockResolve({}),
    listFeeds: () => mockResolve({ feeds: [] }),
    refreshFeeds: () => mockResolve({}),
    getArticles: () => mockResolve({ articles: [] }),
    getArticleContent: () => mockResolve({ content: { id: 0, content: '' } }),
    removeFeed: () => mockResolve({}),
    searchArticles: () => mockResolve({ articles: [] }),
    getCachedArticleContent: () => mockResolve({ content: { id: 0, content: '' } }),
    getLlmConfig: () => mockResolve({}) as unknown as Promise<{ baseUrl: string; apiKey: string; model: string; translateTarget: string }>,
    setLlmConfig: () => Promise.resolve({ success: true }),
    resetLlmConfig: () => Promise.resolve({ success: true }),
    summarize: () => Promise.resolve({ success: true }),
    translate: () => Promise.resolve({ success: true }),
    onStreamChunk: () => () => {}, // no-op, returns cleanup fn
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
