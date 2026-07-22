import { create } from 'zustand'
import type { Feed, Article, LlmConfig, TokenStats } from '../../shared/types'
import { splitIntoParagraphs } from '../../shared/paragraphSplitter'

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
  themeMode: 'light' | 'dark' | 'system' | 'eyeCare'
  systemPrefersDark: boolean
  isLoading: boolean
  error: string | null

  // ---- M3 阅读模式 ----
  readerMode: 'reader' | 'original'

  // ---- 字体设置 ----
  readerFontFamily: string
  readerFontSize: number

  // ---- LLM 状态 ----
  showSettings: boolean
  llmConfig: LlmConfig | null
  summaryStream: string
  summaryLoading: boolean
  summarizingArticleId: number | null
  translateStream: string
  translateLoading: boolean
  translateMode: 'original' | 'translation'
  paragraphTranslations: string[]
  displayMode: 'replace' | 'sideBySide' | 'topBottom' | 'newTab'
  translateTargetLang: string

  // ---- 笔记 ----
  noteContent: string
  noteLoading: boolean
  notePanelOpen: boolean
  noteLastSaved: string | null

  // ---- Token 用量统计 ----
  tokenStats: TokenStats[] | null
  tokenStatsLoading: boolean

  // ---- OPML 导入状态 ----
  opmlImporting: boolean
  opmlProgress: { current: number; total: number; feedTitle: string; feedUrl: string; success: boolean } | null
  opmlDialogOpen: boolean

  // ---- 添加订阅源错误提示 ----
  addFeedError: string | null

  // ---- 操作 ----
  setFeeds: (feeds: Feed[]) => void
  setArticles: (articles: Article[]) => void
  selectFeed: (feedId: number) => void
  selectArticle: (articleId: number, feedId?: number) => void
  jumpToArticle: (article: Article) => Promise<void>
  setArticleContent: (content: string) => void
  setSearchQuery: (query: string) => void
  setSearchResults: (articles: Article[]) => void
  setSearchSuggestions: (articles: Article[]) => void
  toggleSidebar: () => void
  setThemeMode: (mode: 'light' | 'dark' | 'system' | 'eyeCare') => void
  setSystemPrefersDark: (isDark: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setOpmlImporting: (importing: boolean) => void
  setOpmlProgress: (p: { current: number; total: number; feedTitle: string; feedUrl: string; success: boolean } | null) => void
  setOpmlDialogOpen: (open: boolean) => void
  setAddFeedError: (error: string | null) => void
  clearAddFeedError: () => void
  setReaderMode: (mode: 'reader' | 'original') => void
  setReaderFontFamily: (font: string) => void
  setReaderFontSize: (size: number) => void

  setShowSettings: (show: boolean) => void
  setLlmConfig: (config: LlmConfig) => void
  appendSummaryDelta: (delta: string) => void
  setSummaryLoading: (loading: boolean) => void
  resetSummary: () => void
  setSummarizingArticleId: (id: number | null) => void
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
  loadTokenStats: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => {
  const restoreAiCache = (articles: Article[], articleId: number) => {
    const a = articles.find(x => x.id === articleId)
    if (!a) return
    if (a.translations) {
      try {
        const m: Record<string, unknown> = JSON.parse(a.translations)
        const summaryCache = m._summary as { text: string; lang: string } | undefined
        if (summaryCache && summaryCache.text) { set({ summaryStream: summaryCache.text, summarizingArticleId: articleId }) }
        if (m._v === 2) {
          const lang = get().translateTargetLang
          const cached = m[lang]
          if (cached && Array.isArray(cached) && cached.length > 0) {
            const currentContent = get().articleContent || ''
            if (!currentContent) return
            const paras = splitIntoParagraphs(currentContent)
            if (cached.length === paras.length) { set({ paragraphTranslations: cached }) }
          }
        }
      } catch {}
    }
  }

  return {
  feeds: [], articles: [], selectedFeedId: null, selectedArticleId: null, articleContent: null,
  searchQuery: '', searchResults: [], searchSuggestions: [],
  opmlImporting: false, opmlProgress: null, opmlDialogOpen: false, addFeedError: null,
  sidebarOpen: true, themeMode: 'light', systemPrefersDark: false, isLoading: false, error: null,
  readerMode: 'reader',
  readerFontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif', readerFontSize: 16,
  showSettings: false, llmConfig: null, summaryStream: '', summaryLoading: false, summarizingArticleId: null,
  translateStream: '', translateLoading: false, translateMode: 'original', paragraphTranslations: [], displayMode: 'topBottom', translateTargetLang: 'Chinese',
  noteContent: '', noteLoading: false, notePanelOpen: false, noteLastSaved: null,
  tokenStats: null, tokenStatsLoading: false,

  setFeeds: (feeds) => set({ feeds }),
  setArticles: (articles) => set({ articles }),
  selectFeed: async (feedId) => {
    set({ selectedFeedId: feedId, selectedArticleId: null, articleContent: null, isLoading: true })
    try { const response = await window.api.getArticles(feedId); if (response.payload.error === 0) { set({ articles: response.payload.articles || [] }) } else { set({ error: 'Failed to load articles' }) } } catch (err) { set({ error: String(err) }) } finally { set({ isLoading: false }) }
  },
  selectArticle: async (articleId, feedId) => {
    const state = get()
    if (feedId !== undefined && feedId !== state.selectedFeedId) {
      set({ selectedFeedId: feedId, isLoading: true, articleContent: null, summaryStream: '', summaryLoading: false, summarizingArticleId: null, translateStream: '', translateMode: 'original', paragraphTranslations: [] })
      try { const fr = await window.api.getArticles(feedId); if (fr.payload.error === 0) { const na = fr.payload.articles || []; set({ articles: na, selectedArticleId: articleId }); restoreAiCache(na, articleId) } else { set({ selectedArticleId: articleId }) } } catch { set({ selectedArticleId: articleId }) }
    } else {
      set({ selectedArticleId: articleId, isLoading: true, articleContent: null, summaryStream: '', summaryLoading: false, summarizingArticleId: null, translateStream: '', translateMode: 'original', paragraphTranslations: [] })
      restoreAiCache(state.articles, articleId)
    }
    try { const r = await window.api.getArticleContent(articleId); if (r.payload.error === 0) { set({ articleContent: r.payload.content?.content || '', isLoading: false }); const p = get(); restoreAiCache(p.articles, articleId); return } } catch {}
    try { const cr = await window.api.getCachedArticleContent(articleId); if (cr.payload.error === 0 && cr.payload.content?.content) { set({ articleContent: '[离线模式] ' + cr.payload.content.content, isLoading: false }); const p = get(); restoreAiCache(p.articles, articleId); return } } catch {}
    set({ isLoading: false })
  },
  jumpToArticle: async (article) => {
    const state = get()
    const existing = state.articles.find((a) => a.id === article.id)
    const merged = existing ? state.articles.map((a) => (a.id === article.id ? article : a)) : [article, ...state.articles]
    set({ selectedFeedId: article.feed_id, selectedArticleId: article.id, articles: merged, isLoading: true, articleContent: null, summaryStream: '', summaryLoading: false, summarizingArticleId: null, translateStream: '', translateMode: 'original', paragraphTranslations: [] })
    restoreAiCache([article], article.id)
    try { const r = await window.api.getArticleContent(article.id); if (r.payload.error === 0) { set({ articleContent: r.payload.content?.content || '', isLoading: false }); const p = get(); restoreAiCache(p.articles, article.id); return } } catch {}
    try { const cr = await window.api.getCachedArticleContent(article.id); if (cr.payload.error === 0 && cr.payload.content?.content) { set({ articleContent: '[离线模式] ' + cr.payload.content.content, isLoading: false }); const p = get(); restoreAiCache(p.articles, article.id); return } } catch {}
    set({ isLoading: false })
  },
  setArticleContent: (content) => set({ articleContent: content }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (articles) => set({ searchResults: articles }),
  setSearchSuggestions: (articles) => set({ searchSuggestions: articles }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setSystemPrefersDark: (isDark) => set({ systemPrefersDark: isDark }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setReaderMode: (mode) => set({ readerMode: mode }),
  setReaderFontFamily: (font) => set({ readerFontFamily: font }),
  setReaderFontSize: (size) => set({ readerFontSize: size }),
  setOpmlImporting: (importing) => set({ opmlImporting: importing }),
  setOpmlProgress: (progress) => set({ opmlProgress: progress }),
  setOpmlDialogOpen: (open) => set({ opmlDialogOpen: open }),
  setAddFeedError: (error) => set({ addFeedError: error }),
  clearAddFeedError: () => set({ addFeedError: null }),
  setShowSettings: (show) => set({ showSettings: show }),
  setLlmConfig: (config) => set({ llmConfig: config }),
  appendSummaryDelta: (delta) => set((state) => ({ summaryStream: state.summaryStream + delta })),
  setSummaryLoading: (loading) => set({ summaryLoading: loading }),
  resetSummary: () => set({ summaryStream: '', summarizingArticleId: null }),
  setSummarizingArticleId: (id) => set({ summarizingArticleId: id }),
  appendTranslateDelta: (delta) => set((state) => ({ translateStream: state.translateStream + delta })),
  setTranslateLoading: (loading) => set({ translateLoading: loading }),
  resetTranslate: () => set({ translateStream: '' }),
  setTranslateMode: (mode) => set({ translateMode: mode }),
  toggleTranslateMode: () => set((state) => ({ translateMode: state.translateMode === 'original' ? 'translation' : 'original' })),
  appendParagraphTranslation: (paraIndex, delta) => set((state) => { const arr = [...state.paragraphTranslations]; arr[paraIndex] = (arr[paraIndex] || '') + delta; return { paragraphTranslations: arr } }),
  resetParagraphTranslations: () => set({ paragraphTranslations: [] }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setTranslateTargetLang: (lang) => set({ translateTargetLang: lang }),
  loadLlmConfig: async () => { try { const config = await window.api.getLlmConfig(); set({ llmConfig: config }) } catch {} },
  loadTokenStats: async () => {
    set({ tokenStatsLoading: true })
    try {
      const result = await window.api.getTokenStats()
      if (result.error === 0) { set({ tokenStats: result.stats || [] }) }
    } catch {} finally { set({ tokenStatsLoading: false }) }
  }
  }
})