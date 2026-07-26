import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n'
import './index.css'

// 浏览器开发模式 mock：当不在 Electron 环境中时提供空 API
if (!window.api) {
  const mockResolve = <T extends Record<string, unknown>>(data: T) =>
    Promise.resolve({ type: '', payload: { error: 0, ...data } })

  const noop = () => () => {} // returns cleanup function

  window.api = {
    // RSS
    addFeed: () => mockResolve({}),
    listFeeds: () => mockResolve({ feeds: [] }),
    refreshFeeds: () => mockResolve({}),
    getArticles: () => mockResolve({ articles: [] }),
    getArticleContent: () => mockResolve({ content: { id: 0, content: '' } }),
    removeFeed: () => mockResolve({}),
    searchArticles: () => mockResolve({ articles: [] }),
    getCachedArticleContent: () => mockResolve({ content: { id: 0, content: '' } }),
    getArticlesByIds: () => mockResolve({ articles: [] }),
    // Star / Read
    toggleStar: () => Promise.resolve({ success: true, data: { id: 0, isStarred: 1 } }),
    markRead: () => Promise.resolve({ success: true }),
    getStarredArticles: () => mockResolve({ articles: [] }),
    // LLM config
    getLlmConfig: () => mockResolve({}) as unknown as Promise<{ baseUrl: string; apiKey: string; model: string; translateTarget: string }>,
    setLlmConfig: () => Promise.resolve({ success: true }),
    resetLlmConfig: () => Promise.resolve({ success: true }),
    // LLM streaming
    summarize: () => Promise.resolve({ success: true }),
    translate: () => Promise.resolve({ success: true }),
    translateParagraphs: () => Promise.resolve({ success: true }),
    translateSelection: () => Promise.resolve({ success: true }),
    summarizeSelection: () => Promise.resolve({ success: true }),
    onStreamChunk: () => noop(),
    // Token stats
    getTokenStats: () => Promise.resolve({ error: 0, stats: [] }),
    // Tags
    getTags: () => Promise.resolve({ success: true, data: [] }),
    getTagById: () => Promise.resolve({ success: false, error: 'mock' }),
    createTag: () => Promise.resolve({ success: true, data: { id: 1, name: 'mock', color: '#3b82f6', createdAt: '' } }),
    updateTag: () => Promise.resolve({ success: true }),
    deleteTag: () => Promise.resolve({ success: true }),
    getTagsForArticle: () => Promise.resolve({ success: true, data: [] }),
    toggleArticleTag: () => Promise.resolve({ success: true, data: { added: true } }),
    getArticlesByTag: () => Promise.resolve({ success: true, data: [] }),
    batchAddTagsToArticle: () => Promise.resolve({ success: true }),
    suggestTagsFromAI: () => Promise.resolve({ success: true, data: [] }),
    getTagArticleCounts: () => Promise.resolve({ success: true, data: {} }),
    // Notes
    getNote: () => Promise.resolve(null),
    saveNote: () => Promise.resolve({ id: 1, articleId: 1, content: '', createdAt: '', updatedAt: '' }),
    deleteNote: () => Promise.resolve(),
    exportNotesOpml: () => Promise.resolve({ success: false, error: 'mock' }),
    // Summary export
    exportSummaryMd: () => Promise.resolve({ success: false, error: 'mock' }),
    // OPML
    selectOpmlFile: () => Promise.resolve({ canceled: true }),
    previewOpml: () => mockResolve({}),
    importOpml: () => mockResolve({ feed_count: 0, failed_count: 0 }),
    exportOpml: () => Promise.resolve({ success: false, error: 'mock' }),
    onOpmlProgress: () => noop(),
    // Test connection
    testConnection: () => Promise.resolve({ success: false, latencyMs: 0, message: 'mock' }),
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
