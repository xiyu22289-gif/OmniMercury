import { create } from 'zustand'
import type { Feed, Article, LlmConfig } from '../../shared/types'

interface AppState {
  // ---- 数据 ----
  feeds: Feed[]
  articles: Article[]
  selectedFeedId: number | null
  selectedArticleId: number | null
  articleContent: string | null
  searchQuery: string
  searchResults: Article[]

  // ---- UI 状态 ----
  sidebarOpen: boolean
  darkMode: boolean
  isLoading: boolean
  error: string | null

  // ---- LLM 状态 ----
  showSettings: boolean
  llmConfig: LlmConfig | null
  summaryStream: string
  summaryLoading: boolean
  translateStream: string
  translateLoading: boolean
  translateMode: 'original' | 'translation' | 'bilingual'

  // ---- 操作 ----
  setFeeds: (feeds: Feed[]) => void
  setArticles: (articles: Article[]) => void
  selectFeed: (feedId: number) => void
  selectArticle: (articleId: number) => void
  setArticleContent: (content: string) => void
  setSearchQuery: (query: string) => void
  setSearchResults: (articles: Article[]) => void
  toggleSidebar: () => void
  toggleDarkMode: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // ---- LLM 操作 ----
  setShowSettings: (show: boolean) => void
  setLlmConfig: (config: LlmConfig) => void
  appendSummaryDelta: (delta: string) => void
  setSummaryLoading: (loading: boolean) => void
  resetSummary: () => void
  appendTranslateDelta: (delta: string) => void
  setTranslateLoading: (loading: boolean) => void
  resetTranslate: () => void
  setTranslateMode: (mode: 'original' | 'translation' | 'bilingual') => void
  loadLlmConfig: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  // ---- 数据默认值 ----
  feeds: [],
  articles: [],
  selectedFeedId: null,
  selectedArticleId: null,
  articleContent: null,
  searchQuery: '',
  searchResults: [],

  // ---- UI 默认值 ----
  sidebarOpen: true,
  darkMode: false,
  isLoading: false,
  error: null,

  // ---- LLM 默认值 ----
  showSettings: false,
  llmConfig: null,
  summaryStream: '',
  summaryLoading: false,
  translateStream: '',
  translateLoading: false,
  translateMode: 'original',

  // ---- RSS 操作 ----
  setFeeds: (feeds) => set({ feeds }),
  setArticles: (articles) => set({ articles }),
  selectFeed: async (feedId) => {
    set({ selectedFeedId: feedId, selectedArticleId: null, articleContent: null, isLoading: true })
    try {
      const response = await window.api.getArticles(feedId)
      if (response.payload.error === 0) {
        set({ articles: response.payload.articles || [] })
      } else {
        set({ error: 'Failed to load articles' })
      }
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ isLoading: false })
    }
  },
  selectArticle: async (articleId) => {
    set({
      selectedArticleId: articleId,
      isLoading: true,
      articleContent: null,
      summaryStream: '',
      translateStream: '',
      translateMode: 'original'
    })
    try {
      const response = await window.api.getArticleContent(articleId)
      if (response.payload.error === 0) {
        set({ articleContent: response.payload.content?.content || '' })
      }
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ isLoading: false })
    }
  },
  setArticleContent: (content) => set({ articleContent: content }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (articles) => set({ searchResults: articles }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // ---- LLM 操作 ----
  setShowSettings: (show) => set({ showSettings: show }),
  setLlmConfig: (config) => set({ llmConfig: config }),
  appendSummaryDelta: (delta) => set((state) => ({ summaryStream: state.summaryStream + delta })),
  setSummaryLoading: (loading) => set({ summaryLoading: loading }),
  resetSummary: () => set({ summaryStream: '' }),
  appendTranslateDelta: (delta) => set((state) => ({ translateStream: state.translateStream + delta })),
  setTranslateLoading: (loading) => set({ translateLoading: loading }),
  resetTranslate: () => set({ translateStream: '' }),
  setTranslateMode: (mode) => set({ translateMode: mode }),
  loadLlmConfig: async () => {
    try {
      const config = await window.api.getLlmConfig()
      set({ llmConfig: config })
    } catch {
      // 非 Electron 环境（浏览器 mock），忽略
    }
  }
}))