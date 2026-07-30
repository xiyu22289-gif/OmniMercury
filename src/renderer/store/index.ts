import { create } from 'zustand'
import type { Feed, Article, LlmConfig, LlmGlobalConfig, LlmFunctionConfig, Tag, TokenStats } from '../../shared/types'
import { splitIntoParagraphs } from '../../shared/paragraphSplitter'

interface AppState {
  // ---- 数据 ----
  feeds: Feed[]
  articles: Article[]
  selectedFeedId: number | null
  selectedArticleId: number | null
  articleContent: string | null
  /** 清洗后的 HTML（Readability 输出），优先用于阅读器渲染，保留表格/换行/代码块 */
  articleContentHtml: string | null
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
  /** 函数级 LLM 全局配置 */
  llmGlobalConfig: LlmGlobalConfig | null
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

  // ---- 星标文章 ----
  starredArticles: Article[]
  loadStarredArticles: () => Promise<void>
  loadAllArticles: () => Promise<void>

  // ---- 操作 ----
  setFeeds: (feeds: Feed[]) => void
  setArticles: (articles: Article[]) => void
  selectFeed: (feedId: number) => void
  selectArticle: (articleId: number, feedId?: number) => void
  /** 从搜索结果直接跳转到文章，无需额外 API 请求 */
  jumpToArticle: (article: Article) => Promise<void>
  setArticleContent: (content: string) => void
  /** 设置文章正文 HTML（优先用于阅读器渲染） */
  setArticleContentHtml: (html: string | null) => void
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
  toggleStar: (articleId: number) => Promise<void>
  deleteArticle: (articleId: number) => Promise<void>
  markArticleRead: (articleId: number) => Promise<void>

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
  loadLlmGlobalConfig: () => Promise<void>
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

// ============================================================
// UI 持久化：侧边栏、主题、字体、展示模式
// ============================================================

const PERSIST_KEY = 'omnimercury_ui_prefs'

interface UiPrefs {
  sidebarOpen: boolean
  themeMode: 'light' | 'dark' | 'system' | 'eyeCare'
  readerFontFamily: string
  readerFontSize: number
  displayMode: 'replace' | 'sideBySide' | 'topBottom' | 'newTab'
  translateTargetLang: string
  readerMode: 'reader' | 'original'
}

function loadUiPrefs(): Partial<UiPrefs> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

function saveUiPrefs(state: AppState): void {
  try {
    const prefs: UiPrefs = {
      sidebarOpen: state.sidebarOpen,
      themeMode: state.themeMode,
      readerFontFamily: state.readerFontFamily,
      readerFontSize: state.readerFontSize,
      displayMode: state.displayMode,
      translateTargetLang: state.translateTargetLang,
      readerMode: state.readerMode,
    }
    localStorage.setItem(PERSIST_KEY, JSON.stringify(prefs))
  } catch {}
}

export const useStore = create<AppState>((set, get) => {
  const saved = loadUiPrefs()

  return {
    // ---- 数据默认值 ----
    feeds: [],
    articles: [],
    selectedFeedId: null,
    selectedArticleId: null,
    articleContent: null,
    articleContentHtml: null,
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

    // ---- 星标文章 ----
    starredArticles: [],

    // ---- UI 默认值（优先从 localStorage 恢复）----
    sidebarOpen: saved.sidebarOpen ?? true,
    themeMode: saved.themeMode ?? 'light',
    systemPrefersDark: false,
    isLoading: false,
    error: null,

    // ---- M3 阅读模式默认值 ----
    readerMode: saved.readerMode ?? 'reader',

    // ---- 字体设置默认值 ----
    readerFontFamily: saved.readerFontFamily ?? 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    readerFontSize: saved.readerFontSize ?? 16,

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
    llmGlobalConfig: null,
    summaryStream: '',
    summaryLoading: false,
    summarizingArticleId: null,
    translateStream: '',
    translateLoading: false,
    translateMode: 'original',
    paragraphTranslations: [],
    displayMode: saved.displayMode ?? 'topBottom',
    translateTargetLang: saved.translateTargetLang ?? 'Chinese',

    // ---- 选择文本翻译默认值 ----
    selectionOriginal: '',
    selectionTranslation: '',
    selectionTranslateLoading: false,
    selectionTargetLang: 'Chinese',

    // ---- RSS 操作 ----
    setFeeds: (feeds) => set({ feeds }),
    setArticles: (articles) => set({ articles }),
    selectFeed: async (feedId) => {
      set({ selectedFeedId: feedId, selectedArticleId: null, articleContent: null, articleContentHtml: null, isLoading: true, currentFilterTagId: null })
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
          articleContentHtml: null,
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
          articleContentHtml: null,
          summaryStream: '',
          summaryLoading: false,
          summarizingArticleId: null,
          translateStream: '',
          translateMode: 'original',
          paragraphTranslations: [],
          selectionTranslation: '',
          selectionTranslateLoading: false,
        })
      }

      // 自动标记已读：4 秒后标记
      const state2 = get()
      if (!state2.articles.find(a => a.id === articleId)?.is_read) {
        setTimeout(() => {
          get().markArticleRead(articleId)
        }, 4000)
      }

      try {
        const response = await window.api.getArticleContent(articleId)
        if (response.payload.error === 0) {
          // ★ 诊断日志 Stage 5: Store 接收 IPC 响应
          const receivedContent = response.payload.content?.content || ''
          const receivedContentHtml = response.payload.content?.contentHtml || null
          console.log(`[DIAG] Stage5: Store接收 — articleContent 长度: ${receivedContent.length}`)
          console.log(`[DIAG] Stage5: Store接收 — articleContentHtml 存在: ${!!receivedContentHtml}, 长度: ${receivedContentHtml?.length ?? 0}`)
          if (receivedContentHtml) {
            console.log(`[DIAG] Stage5: articleContentHtml 含 <table: ${receivedContentHtml.includes('<table')}, 含 \\n: ${receivedContentHtml.includes('\n')}`)
            console.log(`[DIAG] Stage5: articleContentHtml 前200字符:`, receivedContentHtml.slice(0, 200))
          }
          // 检查 payload.content 所有字段
          console.log(`[DIAG] Stage5: payload.content 所有keys:`, Object.keys(response.payload.content || {}))
          set({
            articleContent: receivedContent,
            articleContentHtml: receivedContentHtml,
            isLoading: false
          })
          return
        }
      } catch { /* 离线回退 */ }

      try {
        const cachedResponse = await window.api.getCachedArticleContent(articleId)
        if (cachedResponse.payload.error === 0 && cachedResponse.payload.content?.content) {
          set({
            articleContent: '[离线模式] ' + cachedResponse.payload.content.content,
            articleContentHtml: null,
            isLoading: false
          })
          return
        }
      } catch { /* 离线缓存也失败 */ }

      set({ isLoading: false })
    },
    jumpToArticle: async (article) => {
      const state = get()
      const isSearch = state.searchResults.length > 0
      const feedId = article.feed_id
      set({
        selectedFeedId: feedId,
        selectedArticleId: article.id,
        isLoading: true,
        articleContent: null,
        articleContentHtml: null,
        summaryStream: '',
        summaryLoading: false,
        summarizingArticleId: null,
        translateStream: '',
        translateMode: 'original',
        paragraphTranslations: [],
        selectionTranslation: '',
        selectionTranslateLoading: false,
      })

      // 非搜索模式：重新加载文章列表；搜索模式：保留搜索结果
      if (!isSearch) {
        try {
          const feedResponse = await window.api.getArticles(feedId)
          if (feedResponse.payload.error === 0) {
            set({ articles: feedResponse.payload.articles || [] })
          }
        } catch { /* 静默 */ }
      }

      try {
        const response = await window.api.getArticleContent(article.id)
        if (response.payload.error === 0) {
          // ★ 诊断日志 Stage 5b: jumpToArticle Store 接收 IPC 响应
          const jReceivedContent = response.payload.content?.content || ''
          const jReceivedContentHtml = response.payload.content?.contentHtml || null
          console.log(`[DIAG] Stage5b(jumpToArticle): Store接收 — articleContent 长度: ${jReceivedContent.length}`)
          console.log(`[DIAG] Stage5b(jumpToArticle): articleContentHtml 存在: ${!!jReceivedContentHtml}, 长度: ${jReceivedContentHtml?.length ?? 0}`)
          if (jReceivedContentHtml) {
            console.log(`[DIAG] Stage5b: articleContentHtml 含 <table: ${jReceivedContentHtml.includes('<table')}`)
          }
          set({
            articleContent: jReceivedContent,
            articleContentHtml: jReceivedContentHtml,
            isLoading: false
          })
          return
        }
      } catch { /* 离线回退 */ }

      try {
        const cachedResponse = await window.api.getCachedArticleContent(article.id)
        if (cachedResponse.payload.error === 0 && cachedResponse.payload.content?.content) {
          set({
            articleContent: '[离线模式] ' + cachedResponse.payload.content.content,
            articleContentHtml: null,
            isLoading: false
          })
          return
        }
      } catch { /* 离线缓存也失败 */ }

      set({ isLoading: false })
    },
    setArticleContent: (content) => set({ articleContent: content }),
    setArticleContentHtml: (html) => set({ articleContentHtml: html }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearchResults: (articles) => set({ searchResults: articles }),
    setSearchSuggestions: (articles) => set({ searchSuggestions: articles }),
    toggleSidebar: () => set((state) => {
      const next = { sidebarOpen: !state.sidebarOpen }
      saveUiPrefs({ ...state, ...next })
      return next
    }),
    setThemeMode: (mode) => {
      set({ themeMode: mode })
      saveUiPrefs(get())
    },
    setSystemPrefersDark: (isDark) => set({ systemPrefersDark: isDark }),
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),

    // ---- M3 阅读模式操作 ----
    setReaderMode: (mode) => {
      set({ readerMode: mode })
      saveUiPrefs(get())
    },

    // ---- 字体设置操作 ----
    setReaderFontFamily: (font) => {
      set({ readerFontFamily: font })
      saveUiPrefs(get())
    },
    setReaderFontSize: (size) => {
      set({ readerFontSize: size })
      saveUiPrefs(get())
    },

    // ---- OPML 操作 ----
    setOpmlImporting: (importing) => set({ opmlImporting: importing }),
    setOpmlProgress: (progress) => set({ opmlProgress: progress }),
    setOpmlDialogOpen: (open) => set({ opmlDialogOpen: open }),

    // ---- 添加订阅源错误 ----
    setAddFeedError: (error) => set({ addFeedError: error }),
    clearAddFeedError: () => set({ addFeedError: null }),

    toggleStar: async (articleId) => {
      try {
        const res = await window.api.toggleStar(articleId)
        if (res.success && res.data) {
          const { isStarred } = res.data
          set(state => ({
            articles: state.articles.map(a =>
              a.id === articleId ? { ...a, is_starred: isStarred === 1 } : a
            ),
          }))
        }
      } catch (err) {
        console.error('[store] toggleStar 异常：', err)
      }
    },

    deleteArticle: async (articleId) => {
      try {
        const res = await window.api.deleteArticle(articleId);
        if (res.success) {
          const state = get();
          // 如果删除的是当前选中的文章，清除选中状态
          if (state.selectedArticleId === articleId) {
            set({ selectedArticleId: null, articleContent: null, articleContentHtml: null });
          }
          // 从文章列表和搜索结果中移除
          set({
            articles: state.articles.filter(a => a.id !== articleId),
            searchResults: state.searchResults.filter(a => a.id !== articleId),
          });
        } else {
          set({ error: res.error || '删除失败' });
        }
      } catch (err) {
        console.error('[store] deleteArticle 异常：', err);
        set({ error: String(err) });
      }
    },

    markArticleRead: async (articleId) => {
      try {
        await window.api.markRead(articleId)
        set(state => ({
          articles: state.articles.map(a =>
            a.id === articleId ? { ...a, is_read: true } : a
          ),
        }))
      } catch (err) {
        console.error('[store] markArticleRead 异常：', err)
      }
    },

    loadStarredArticles: async () => {
      try {
        const res = await window.api.getStarredArticles()
        if (res.payload.error === 0) {
          set({ articles: res.payload.articles || [] })
        }
      } catch (err) {
        console.error('[store] loadStarredArticles 异常：', err)
      }
    },

    loadAllArticles: async () => {
      set({ selectedFeedId: -1, currentFilterTagId: null, selectedArticleId: null, articleContent: null, articleContentHtml: null, isLoading: true })
      try {
        const res = await window.api.getAllArticles()
        if (res.payload.error === 0) {
          set({ articles: res.payload.articles || [], isLoading: false })
        } else {
          set({ isLoading: false })
        }
      } catch (err) {
        console.error('[store] loadAllArticles 异常：', err)
        set({ isLoading: false })
      }
    },

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
    setDisplayMode: (mode) => {
      set({ displayMode: mode })
      saveUiPrefs(get())
    },
    setTranslateTargetLang: (lang) => {
      set({ translateTargetLang: lang })
      saveUiPrefs(get())
    },
    loadLlmConfig: async () => {
      try {
        const config = await window.api.getLlmConfig()
        set({ llmConfig: config })
      } catch { /* 非 Electron 环境 */ }
    },
    loadLlmGlobalConfig: async () => {
      try {
        const config = await window.api.getLlmGlobalConfig()
        set({ llmGlobalConfig: config })
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
        if (feedId !== null && feedId >= 0) {
          await get().selectFeed(feedId)
        } else if (feedId === -1) {
          await get().loadAllArticles()
        }
        return
      }
      set({ currentFilterTagId: tagId })
      if (tagId !== null) {
        await get().loadArticlesByTag(tagId)
      } else if (get().selectedFeedId !== null && get().selectedFeedId >= 0) {
        await get().selectFeed(get().selectedFeedId!)
      } else if (get().selectedFeedId === -1) {
        await get().loadAllArticles()
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
// 暴露 store 到 window 方便调试
if (typeof window !== 'undefined') {
  window.__STORE__ = useStore
}