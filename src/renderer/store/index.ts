import { create } from 'zustand'
import type { Feed, Article, IpcResponse } from '../../shared/types'

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
}

export const useStore = create<AppState>((set, get) => ({
  feeds: [],
  articles: [],
  selectedFeedId: null,
  selectedArticleId: null,
  articleContent: null,
  searchQuery: '',
  searchResults: [],
  sidebarOpen: true,
  darkMode: false,
  isLoading: false,
  error: null,

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
    set({ selectedArticleId: articleId, isLoading: true, articleContent: null })
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
  setError: (error) => set({ error })
}))