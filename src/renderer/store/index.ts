import { create } from 'zustand'
import type { Feed, Article, LlmConfig, Tag, TokenStats } from '../../shared/types'
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
  /** 主题模式：light=日间, dark=夜间, system=跟随系统, eyeCare=护眼 */
  themeMode: 'light' | 'dark' | 'system' | 'eyeCare'
  /** 系统当前是否为暗色模式（仅在 themeMode === 'system' 时生效） */
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
  /** 正在生成摘要的文章 ID，用于隔离不同文章的摘要状态 */
  summarizingArticleId: number | null
  translateStream: string
  translateLoading: boolean
  translateMode: 'original' | 'translation'
  /** 段落翻译：每段的译文数组，索引对应段落索引 */
  paragraphTranslations: string[]
  /** 展示模式 */
  displayMode: 'replace' | 'sideBySide' | 'topBottom' | 'newTab'
  /** 翻译目标语言 */
  translateTargetLang: string

  // ---- 选择文本翻译 ----
  selectionOriginal: string
  selectionTranslation: string
  selectionTranslateLoading: boolean
  selectionTargetLang: string

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

  // ---- M5 标签系统 ----
  tags: Tag[]
  articleTagsMap: Record<number, Tag[]>
  currentFilterTagId: number | null
  tagArticleCounts: Record<number, number>

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
  setThemeMode: (mode: 'light' | 'dark' | 'system' | 'eyeCare') => void
  setSystemPrefersDark: (isDark: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setOpmlImporting: (importing: boolean) => void
  setOpmlProgress: (progress: { current: number; total: number; feedTitle: string; feedUrl: string; success: boolean } | null) => void
  setOpmlDialogOpen: (open: boolean) => void
  setAddFeedError: (error: string | null) => void
  clearAddFeedError: () => void

  // ---- M3 阅读模式操作 ----
  setReaderMode: (mode: 'reader' | 'original') => void

  // ---- 字体设置操作 ----
  setReaderFontFamily: (font: string) => void
  setReaderFontSize: (size: number) => void

  // ---- LLM 操作 ----
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

  // ---- 选择文本翻译操作 ----
  appendSelectionDelta: (delta: string) => void
  resetSelectionTranslation: () => void
  setSelectionTranslateLoading: (loading: boolean) => void
  setSelectionTargetLang: (lang: string) => void
  setSelectionOriginal: (text: string) => void

  // ---- 选择段落摘要 ----
  selectedParagraphIndices: Set<number>
  selectionSummary: string
  selectionSummaryLoading: boolean
  toggleSelectedParagraph: (index: number) => void
  clearSelectedParagraphs: () => void
  setSelectionSummary: (text: string) => void
  setSelectionSummaryLoading: (loading: boolean) => void

  // ---- M5 标签操作 ----
  fetchTags: () => Promise<void>
  fetchArticleTags: (articleId: number) => Promise<void>
  toggleArticleTag: (articleId: number, tagId: number) => Promise<void>
  batchAddTagsToArticle: (articleId: number, tagIds: number[]) => Promise<void>
  setFilterTag: (tagId: number | null) => void
  loadArticlesByTag: (tagId: number) => Promise<void>
  createTag: (name: string, color?: string) => Promise<void>
  updateTag: (id: number, name: string, color?: string) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  clearArticleTagsCache: () => void
  fetchTagArticleCounts: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => {
  /** 从文章元数据中恢复 AI 缓存（翻译 + 摘要），避免重复调用 LLM。 */
  const restoreAiCache = (articles: Article[], articleId: number) => {
    const a = articles.find(x => x.id === articleId)
    if (!a) return
    if (a.translations) {
      try {
        const m: Record<string, unknown> = JSON.parse(a.translations)

        // 恢复 AI 摘要缓存（_summary 键独立于翻译版本号）
        const summaryCache = m._summary as { text: string; lang: string } | undefined
        if (summaryCache && summaryCache.text) {
          set({ summaryStream: summaryCache.text, summarizingArticleId: articleId })
        }

        // 恢复段落翻译缓存（需要版本号匹配）
        if (m._v === 2) {
          const lang = get().translateTargetLang
          const cached = m[lang]
          if (cached && Array.isArray(cached) && cached.length > 0) {
            const currentContent = get().articleContent || ''
            if (!currentContent) return
            const paras = splitIntoParagraphs(currentContent)
            if (cached.length === paras.length) {
              set({ paragraphTranslations: cached })
            }
          }
        }
      } catch { /* JSON 解析失败则忽略，不阻塞正常阅读 */ }
    }
  }

  return {
    // ---- 数据默认值 ----
    feeds: [],
    articles: [],
    selectedFeedId: null,
    selectedArticleId: null,
    articleContent: null,
    searchQuery: '',
    searchResults: [],
    searchSuggestions: [],

    // ---- OPML 导入默认值 ----
    opmlImporting: false,
    opmlProgress: null,
    opmlDialogOpen: false,

    // ---- 添加订阅源错误提示 ----
    addFeedError: null,

    // ---- M5 标签系统默认值 ----
    tags: [],
    articleTagsMap: {},
    currentFilterTagId: null,
    tagArticleCounts: {},

    // ---- UI 默认值 ----
    sidebarOpen: true,
    themeMode: 'light',
    systemPrefersDark: false,
    isLoading: false,
    error: null,

    // ---- M3 阅读模式默认值 ----
    readerMode: 'reader',

    // ---- 字体设置默认值 ----
    readerFontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    readerFontSize: 16,

    // ---- 笔记默认值 ----
    noteContent: '',
    noteLoading: false,
    notePanelOpen: false,
    noteLastSaved: null,

    // ---- Token 用量统计默认值 ----
    tokenStats: null,
    tokenStatsLoading: false,

    // ---- LLM 默认值 ----
    showSettings: false,
    llmConfig: null,
    summaryStream: '',
    summaryLoading: false,
    summarizingArticleId: null,
    translateStream: '',
    translateLoading: false,
    translateMode: 'original',
    paragraphTranslations: [],
    displayMode: 'topBottom',
    translateTargetLang: 'Chinese',

    // ---- 选择文本翻译默认值 ----
    selectionOriginal: '',
    selectionTranslation: '',
    selectionTranslateLoading: false,
    selectionTargetLang: 'Chinese',

    // ---- RSS 操作 ----
    setFeeds: (feeds) => set({ feeds }),
    setArticles: (articles) => set({ articles }),
    selectFeed: async (feedId) => {
      set({ selectedFeedId: feedId, selectedArticleId: null, articleContent: null, isLoading: true, currentFilterTagId: null })
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
      get().fetchTagArticleCounts()
    },
    selectArticle: async (articleId, feedId) => {
      const state = get()

      if (feedId !== undefined && feedId !== state.selectedFeedId) {
        set({
          selectedFeedId: feedId,
          isLoading: true,
          articleContent: null,
          summaryStream: '',
          summaryLoading: false,
          summarizingArticleId: null,
          translateStream: '',
          translateMode: 'original',
          paragraphTranslations: [],
          selectionTranslation: '',
          selectionTranslateLoading: false,
        })

        try {
          const feedResponse = await window.api.getArticles(feedId)
          if (feedResponse.payload.error === 0) {
            const newArticles = feedResponse.payload.articles || []
            set({
              articles: newArticles,
              selectedArticleId: articleId
            })
            restoreAiCache(newArticles, articleId)
          } else {
            set({ selectedArticleId: articleId })
          }
        } catch {
          set({ selectedArticleId: articleId })
        }
      } else {
        set({
          selectedArticleId: articleId,
          isLoading: true,
          articleContent: null,
          summaryStream: '',
          summaryLoading: false,
          summarizingArticleId: null,
          translateStream: '',
          translateMode: 'original',
          paragraphTranslations: [],
          selectionTranslation: '',
          selectionTranslateLoading: false,
        })
        restoreAiCache(state.articles, articleId)
      }

      try {
        const response = await window.api.getArticleContent(articleId)
        if (response.payload.error === 0) {
          set({
            articleContent: response.payload.content?.content || '',
            isLoading: false
          })
          const prev = get()
          restoreAiCache(prev.articles, articleId)
          return
        }
      } catch { /* 离线回退 */ }

      try {
        const cachedResponse = await window.api.getCachedArticleContent(articleId)
        if (cachedResponse.payload.error === 0 && cachedResponse.payload.content?.content) {
          set({
            articleContent: '[离线模式] ' + cachedResponse.payload.content.content,
            isLoading: false
          })
          const prev = get()
          restoreAiCache(prev.articles, articleId)
          return
        }
      } catch { /* 离线缓存也失败 */ }

      set({ isLoading: false })
    },
    jumpToArticle: async (article) => {
      const state = get()

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
        summaryLoading: false,
        summarizingArticleId: null,
        translateStream: '',
        translateMode: 'original',
        paragraphTranslations: [],
        selectionTranslation: '',
        selectionTranslateLoading: false,
      })
      restoreAiCache([article], article.id)

      try {
        const response = await window.api.getArticleContent(article.id)
        if (response.payload.error === 0) {
          set({
            articleContent: response.payload.content?.content || '',
            isLoading: false
          })
          const prev = get()
          restoreAiCache(prev.articles, article.id)
          return
        }
      } catch { /* 离线回退 */ }

      try {
        const cachedResponse = await window.api.getCachedArticleContent(article.id)
        if (cachedResponse.payload.error === 0 && cachedResponse.payload.content?.content) {
          set({
            articleContent: '[离线模式] ' + cachedResponse.payload.content.content,
            isLoading: false
          })
          const prev = get()
          restoreAiCache(prev.articles, article.id)
          return
        }
      } catch { /* 离线缓存也失败 */ }

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

    // ---- M3 阅读模式操作 ----
    setReaderMode: (mode) => set({ readerMode: mode }),

    // ---- 字体设置操作 ----
    setReaderFontFamily: (font) => set({ readerFontFamily: font }),
    setReaderFontSize: (size) => set({ readerFontSize: size }),

    // ---- OPML 操作 ----
    setOpmlImporting: (importing) => set({ opmlImporting: importing }),
    setOpmlProgress: (progress) => set({ opmlProgress: progress }),
    setOpmlDialogOpen: (open) => set({ opmlDialogOpen: open }),

    // ---- 添加订阅源错误 ----
    setAddFeedError: (error) => set({ addFeedError: error }),
    clearAddFeedError: () => set({ addFeedError: null }),

    // ---- LLM 操作 ----
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
      } catch { /* 非 Electron 环境 */ }
    },
    loadTokenStats: async () => {
      set({ tokenStatsLoading: true })
      try {
        const result = await window.api.getTokenStats()
        if (result.error === 0) { set({ tokenStats: result.stats || [] }) }
      } catch { /* 忽略加载失败 */ }
      finally {
        set({ tokenStatsLoading: false })
      }
    },

    // ---- 选择文本翻译操作 ----
    appendSelectionDelta: (delta) => set((state) => ({ selectionTranslation: state.selectionTranslation + delta })),
    resetSelectionTranslation: () => set({ selectionTranslation: '', selectionOriginal: '' }),
    setSelectionTranslateLoading: (loading) => set({ selectionTranslateLoading: loading }),
    setSelectionTargetLang: (lang) => set({ selectionTargetLang: lang }),
    setSelectionOriginal: (text) => set({ selectionOriginal: text }),

    // ---- 选择段落摘要 ----
    selectedParagraphIndices: new Set<number>(),
    selectionSummary: '',
    selectionSummaryLoading: false,
    toggleSelectedParagraph: (index) =>
      set(state => {
        const next = new Set(state.selectedParagraphIndices)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return { selectedParagraphIndices: next }
      }),
    clearSelectedParagraphs: () => set({ selectedParagraphIndices: new Set() }),
    setSelectionSummary: (summary) => set({ selectionSummary: summary }),
    setSelectionSummaryLoading: (loading) => set({ selectionSummaryLoading: loading }),

    // ---- M5 标签操作 ----
    fetchTags: async () => {
      try {
        const res = await window.api.getTags()
        if (res.success && res.data) {
          set({ tags: res.data })
        } else {
          console.error('[store] fetchTags 失败：', res.error)
        }
      } catch (err) {
        console.error('[store] fetchTags 异常：', err)
      }
      get().fetchTagArticleCounts()
    },

    fetchArticleTags: async (articleId) => {
      try {
        const res = await window.api.getTagsForArticle(articleId)
        if (res.success && res.data) {
          set(state => ({
            articleTagsMap: { ...state.articleTagsMap, [articleId]: res.data! }
          }))
        } else {
          console.error('[store] fetchArticleTags 失败：', res.error)
        }
      } catch (err) {
        console.error('[store] fetchArticleTags 异常：', err)
      }
    },

    toggleArticleTag: async (articleId, tagId) => {
      try {
        const res = await window.api.toggleArticleTag(articleId, tagId)
        if (res.success && res.data) {
          const { added } = res.data
          set(state => {
            const current = state.articleTagsMap[articleId] || []
            const allTags = state.tags
            const tag = allTags.find(t => t.id === tagId)
            let updated: Tag[]
            if (added) {
              if (tag && !current.some(t => t.id === tagId)) {
                updated = [...current, tag]
              } else {
                updated = current
              }
            } else {
              updated = current.filter(t => t.id !== tagId)
            }
            return { articleTagsMap: { ...state.articleTagsMap, [articleId]: updated } }
          })
          get().fetchTags()
        } else {
          console.error('[store] toggleArticleTag 失败：', res.error)
        }
      } catch (err) {
        console.error('[store] toggleArticleTag 异常：', err)
      }
    },

    batchAddTagsToArticle: async (articleId, tagIds) => {
      try {
        const res = await window.api.batchAddTagsToArticle(articleId, tagIds)
        if (res.success) {
          await get().fetchArticleTags(articleId)
          await get().fetchTags()
        } else {
          console.error('[store] batchAddTagsToArticle 失败：', res.error)
        }
      } catch (err) {
        console.error('[store] batchAddTagsToArticle 异常：', err)
      }
    },

    setFilterTag: async (tagId) => {
      const prev = get().currentFilterTagId
      if (tagId !== null && tagId === prev) {
        set({ currentFilterTagId: null })
        const feedId = get().selectedFeedId
        if (feedId !== null) {
          await get().selectFeed(feedId)
        }
        return
      }
      set({ currentFilterTagId: tagId })
      if (tagId !== null) {
        await get().loadArticlesByTag(tagId)
      } else if (get().selectedFeedId !== null) {
        await get().selectFeed(get().selectedFeedId!)
      }
    },

    loadArticlesByTag: async (tagId) => {
      set({ isLoading: true })
      try {
        const idRes = await window.api.getArticlesByTag(tagId)
        if (!idRes.success || !idRes.data || idRes.data.length === 0) {
          set({ articles: [], isLoading: false })
          return
        }
        const artRes = await window.api.getArticlesByIds(idRes.data)
        if (artRes.payload.error === 0) {
          set({ articles: artRes.payload.articles || [], isLoading: false })
        } else {
          set({ articles: [], isLoading: false })
        }
      } catch (err) {
        console.error('[store] loadArticlesByTag 异常：', err)
        set({ articles: [], isLoading: false })
      }
    },

    createTag: async (name, color) => {
      try {
        const res = await window.api.createTag(name, color)
        if (res.success) {
          await get().fetchTags()
        } else {
          console.error('[store] createTag 失败：', res.error)
        }
      } catch (err) {
        console.error('[store] createTag 异常：', err)
      }
    },

    updateTag: async (id, name, color) => {
      try {
        const res = await window.api.updateTag(id, name, color)
        if (res.success) {
          await get().fetchTags()
          set(state => {
            const newMap: Record<number, Tag[]> = {}
            for (const [articleId, tagList] of Object.entries(state.articleTagsMap)) {
              newMap[Number(articleId)] = tagList.map(t =>
                t.id === id ? { ...t, name, color: color ?? t.color } : t
              )
            }
            return { articleTagsMap: newMap }
          })
        } else {
          console.error('[store] updateTag 失败：', res.error)
        }
      } catch (err) {
        console.error('[store] updateTag 异常：', err)
      }
    },

    deleteTag: async (id) => {
      try {
        const res = await window.api.deleteTag(id)
        if (res.success) {
          await get().fetchTags()
          set(state => {
            const newMap: Record<number, Tag[]> = {}
            for (const [articleId, tagList] of Object.entries(state.articleTagsMap)) {
              const filtered = tagList.filter(t => t.id !== id)
              if (filtered.length > 0) {
                newMap[Number(articleId)] = filtered
              }
            }
            return { articleTagsMap: newMap }
          })
        } else {
          console.error('[store] deleteTag 失败：', res.error)
        }
      } catch (err) {
        console.error('[store] deleteTag 异常：', err)
      }
    },

    clearArticleTagsCache: () => set({ articleTagsMap: {} }),

    fetchTagArticleCounts: async () => {
      try {
        const res = await window.api.getTagArticleCounts()
        if (res.success && res.data) {
          set({ tagArticleCounts: res.data })
        }
      } catch (err) {
        console.error('[store] fetchTagArticleCounts 异常：', err)
      }
    }
  }
})