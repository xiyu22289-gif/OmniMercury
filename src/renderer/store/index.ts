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
  searchSuggestions: Article[]

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
  translateMode: 'original' | 'translation'
  /** 段落翻译：每段的译文数组，索引对应段落索引 */
  paragraphTranslations: string[]
  /** 展示模式 */
  displayMode: 'replace' | 'sideBySide' | 'topBottom' | 'newTab'
  /** 翻译目标语言 */
  translateTargetLang: string

  // ---- 操作 ----
  setFeeds: (feeds: Feed[]) => void
  setArticles: (articles: Article[]) => void
  selectFeed: (feedId: number) => void
  selectArticle: (articleId: number, feedId?: number) => void
  /** 从搜索结果直接跳转到文章，无需额外 API 请求 */
  jumpToArticle: (article: Article) => Promise<void>
  setArticleContent: (content: string) => void
  setSearchQuery: (query: string) => void
  setSearchResults: (articles: Article[]) => void
  setSearchSuggestions: (articles: Article[]) => void
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
  setTranslateMode: (mode: 'original' | 'translation') => void
  toggleTranslateMode: () => void
  appendParagraphTranslation: (paraIndex: number, delta: string) => void
  resetParagraphTranslations: () => void
  setDisplayMode: (mode: 'replace' | 'sideBySide' | 'topBottom' | 'newTab') => void
  setTranslateTargetLang: (lang: string) => void
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
  searchSuggestions: [],

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
  paragraphTranslations: [],
  displayMode: 'topBottom',
  translateTargetLang: 'Chinese',

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
  selectArticle: async (articleId, feedId) => {
    const state = get()

    // 如果提供了 feedId 且与当前选中的 feed 不同，需要先切换 feed
    // 关键：selectedArticleId 必须和 articles 同时更新，避免 React 渲染时
    //       ReaderView 的 articles.find() 找不到 selectedArticle 而显示空白。
    if (feedId !== undefined && feedId !== state.selectedFeedId) {
      set({
        selectedFeedId: feedId,
        isLoading: true,
        articleContent: null,
        summaryStream: '',
        translateStream: '',
        translateMode: 'original'
      })

      // 先加载新 feed 的文章列表
      try {
        const feedResponse = await window.api.getArticles(feedId)
        if (feedResponse.payload.error === 0) {
          const newArticles = feedResponse.payload.articles || []
          // 同时设置 articles 和 selectedArticleId，保证 ReaderView 能找到元数据
          set({
            articles: newArticles,
            selectedArticleId: articleId
          })
        } else {
          // 加载失败也设上 selectedArticleId（ReaderView 会显示无文章但不会卡空白）
          set({ selectedArticleId: articleId })
        }
      } catch {
        set({ selectedArticleId: articleId })
      }
    } else {
      // 同 feed 内点击：直接设 articleId 即可，articles 已有数据
      set({
        selectedArticleId: articleId,
        isLoading: true,
        articleContent: null,
        summaryStream: '',
        translateStream: '',
        translateMode: 'original'
      })
    }

    // 加载文章正文
    try {
      const response = await window.api.getArticleContent(articleId)
      if (response.payload.error === 0) {
        set({
          articleContent: response.payload.content?.content || '',
          isLoading: false
        })
        return
      }
    } catch {
      // 网络异常，尝试离线缓存
    }

    // 离线回退：从本地 DB 获取已缓存内容
    try {
      const cachedResponse = await window.api.getCachedArticleContent(articleId)
      if (cachedResponse.payload.error === 0 && cachedResponse.payload.content?.content) {
        set({
          articleContent: '[离线模式] ' + cachedResponse.payload.content.content,
          isLoading: false
        })
        return
      }
    } catch {
      // 离线缓存也失败，保持 articleContent 为 null
    }

    set({ isLoading: false })
  },
  /** 从搜索结果直接跳转到文章 — 无额外 API 请求，零竞态 */

  jumpToArticle: async (article) => {
    const state = get()

    // 1) 将目标文章放入 articles 数组（如已有则替换，避免重复）
    const existing = state.articles.find((a) => a.id === article.id)
    const mergedArticles = existing
      ? state.articles.map((a) => (a.id === article.id ? article : a))
      : [article, ...state.articles]

    set({
      selectedFeedId: article.feed_id,
      selectedArticleId: article.id,
      articles: mergedArticles,
      isLoading: true,
      articleContent: null,
      summaryStream: '',
      translateStream: '',
      translateMode: 'original'
    })

    // 2) 加载正文
    try {
      const response = await window.api.getArticleContent(article.id)
      if (response.payload.error === 0) {
        set({
          articleContent: response.payload.content?.content || '',
          isLoading: false
        })
        return
      }
    } catch {
      // 网络异常，尝试离线缓存
    }

    // 3) 离线回退
    try {
      const cachedResponse = await window.api.getCachedArticleContent(article.id)
      if (cachedResponse.payload.error === 0 && cachedResponse.payload.content?.content) {
        set({
          articleContent: '[离线模式] ' + cachedResponse.payload.content.content,
          isLoading: false
        })
        return
      }
    } catch {
      // 离线缓存也失败
    }

    set({ isLoading: false })
  },
  setArticleContent: (content) => set({ articleContent: content }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (articles) => set({ searchResults: articles }),
  setSearchSuggestions: (articles) => set({ searchSuggestions: articles }),
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
  toggleTranslateMode: () =>
    set((state) => ({
      translateMode: state.translateMode === 'original' ? 'translation' : 'original'
    })),
  appendParagraphTranslation: (paraIndex, delta) =>
    set((state) => {
      const arr = [...state.paragraphTranslations]
      arr[paraIndex] = (arr[paraIndex] || '') + delta
      return { paragraphTranslations: arr }
    }),
  resetParagraphTranslations: () => set({ paragraphTranslations: [] }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setTranslateTargetLang: (lang) => set({ translateTargetLang: lang }),
  loadLlmConfig: async () => {
    try {
      const config = await window.api.getLlmConfig()
      set({ llmConfig: config })
    } catch {
      // 非 Electron 环境（浏览器 mock），忽略
    }
  }
}))