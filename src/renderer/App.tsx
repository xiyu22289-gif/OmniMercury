import { useEffect, useState, useCallback, useMemo, Component } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import ReaderView from './components/ReaderView'
import SearchBar from './components/SearchBar'
import SystemSettings from './components/SystemSettings'
import ResizeHandle from './components/ResizeHandle'
import { Menu as MenuIcon, Settings, X, CheckCircle, XCircle, Loader2 } from 'lucide-react'

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-red-50 dark:bg-red-950 z-50 p-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 max-w-lg w-full">
            <h2 className="text-lg font-bold text-red-600 mb-2">应用错误</h2>
            <pre className="text-xs text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">{this.state.error?.stack}</pre>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }) }}
              className="mt-3 px-4 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >重试</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** 默认宽度常量 */
const DEFAULT_SIDEBAR_WIDTH = 260
const DEFAULT_LIST_WIDTH = 360
const MIN_SIDEBAR_WIDTH = 160
const MIN_LIST_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 500
const MAX_LIST_WIDTH = 600

export default function App() {
  const { t } = useTranslation()
  const {
    sidebarOpen, toggleSidebar,
    themeMode, systemPrefersDark, setSystemPrefersDark,
    setFeeds, selectFeed, setError, isLoading, loadLlmConfig,
    opmlImporting, opmlProgress, opmlDialogOpen, setOpmlDialogOpen,
    showSettings, setShowSettings,
    selectArticle, toggleStar
  } = useStore()

  /** 推导实际暗色状态 */
  const darkMode = useMemo(() => {
    if (themeMode === 'dark') return true
    if (themeMode === 'eyeCare') return false
    if (themeMode === 'light') return false
    // system: 跟随操作系统
    return systemPrefersDark
  }, [themeMode, systemPrefersDark])

  // ---- 可拖拽宽度状态 ----
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)

  // 侧边栏收起/展开
  const handleToggleSidebar = useCallback(() => {
    if (sidebarOpen) {
      setSidebarWidth((prev) => { return prev })
      toggleSidebar()
    } else {
      toggleSidebar()
      setSidebarWidth((prev) => (prev < MIN_SIDEBAR_WIDTH ? DEFAULT_SIDEBAR_WIDTH : prev))
    }
  }, [sidebarOpen, toggleSidebar])

  // ---- 初始化：加载订阅源列表 ----
  useEffect(() => {
    async function loadFeeds() {
      try {
        const response = await window.api.listFeeds()
        if (response.payload.error === 0 && response.payload.feeds) {
          setFeeds(response.payload.feeds)
          if (response.payload.feeds.length > 0) {
            selectFeed(response.payload.feeds[0].id)
          }
        }
      } catch (err) {
        setError(String(err))
      }
    }
    loadFeeds()
    loadLlmConfig()
  }, [])

  // 暗色模式跟随
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // 护眼模式 class（与 dark 互斥）
  useEffect(() => {
    if (themeMode === 'eyeCare') {
      document.body.classList.add('eye-care')
    } else {
      document.body.classList.remove('eye-care')
    }
  }, [themeMode])

  // 监听系统主题变化
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemPrefersDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ================================================================
  // 全局快捷键
  // ================================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable
      if (isEditing) return

      const mod = e.ctrlKey || e.metaKey

      // Ctrl/Cmd + K — 打开/聚焦全局搜索
      if (mod && e.key === 'k') {
        e.preventDefault()
        const btn = document.getElementById('global-search-btn') as HTMLButtonElement | null
        if (btn) {
          btn.click()
          setTimeout(() => {
            const input = document.querySelector('.app-layout input[placeholder*="搜索"]') as HTMLInputElement | null
            input?.focus()
          }, 150)
        }
        return
      }

      // Ctrl/Cmd + R — 刷新订阅源
      if (mod && e.key === 'r') {
        e.preventDefault()
        window.api.refreshFeeds().then(() => {
          const state = useStore.getState()
          if (state.selectedFeedId !== null) {
            if (state.selectedFeedId >= 0) selectFeed(state.selectedFeedId)
            else state.loadAllArticles()
          }
        }).catch(() => {})
        return
      }

      // Ctrl/Cmd + , — 系统设置
      if (mod && e.key === ',') {
        e.preventDefault()
        setShowSettings(!showSettings)
        return
      }

      // j / ArrowDown — 下一个文章
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const state = useStore.getState()
        const arts = state.articles
        if (arts.length === 0) return
        const idx = arts.findIndex(a => a.id === state.selectedArticleId)
        const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, arts.length - 1)
        selectArticle(arts[nextIdx].id)
        return
      }

      // k / ArrowUp — 上一个文章
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const state = useStore.getState()
        const arts = state.articles
        if (arts.length === 0) return
        const idx = arts.findIndex(a => a.id === state.selectedArticleId)
        const prevIdx = idx < 0 ? arts.length - 1 : Math.max(idx - 1, 0)
        selectArticle(arts[prevIdx].id)
        return
      }

      // s — 星标/取消星标当前文章
      if (mod) return
      if (e.key === 's') {
        e.preventDefault()
        const state = useStore.getState()
        if (state.selectedArticleId !== null) {
          toggleStar(state.selectedArticleId)
        }
        return
      }

      // Ctrl/Cmd + B — 切换侧边栏
      if (mod && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ErrorBoundary>
    <div className="app-layout">
      {/* 顶栏 */}
      <div className="fixed top-0 left-0 right-0 h-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-3 gap-2 z-10">
        <button
          onClick={handleToggleSidebar}
          className="p-1 rounded bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Toggle sidebar"
        >
          <MenuIcon size={18} />
        </button>
        <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200 select-none">
          {t('app.title')}
        </h1>
        <div className="flex-1" />
        <SearchBar />

        {/* 系统设置按钮 */}
        <button
          onClick={() => setShowSettings(true)}
          className="p-1 rounded bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title={t('systemSettings.title')}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* 主内容区 — 三栏 + 拖拽分隔条 */}
      <div className="flex flex-1 min-h-0">
        {/* 侧边栏 */}
        <div
          className={`overflow-hidden ${sidebarOpen ? '' : 'collapsed'}`}
          style={{
            width: sidebarOpen ? sidebarWidth : 0,
            minWidth: sidebarOpen ? MIN_SIDEBAR_WIDTH : 0
          }}
        >
          <Sidebar />
        </div>

        {/* 分隔条 1：侧边栏 ↔ 文章列表 */}
        {sidebarOpen && (
          <ResizeHandle
            direction="horizontal"
            onResize={(delta) => {
              setSidebarWidth((prev) =>
                Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, prev + delta))
              )
            }}
          />
        )}

        {/* 文章列表 */}
        <div
          className="article-list"
          style={{
            width: listWidth,
            minWidth: MIN_LIST_WIDTH
          }}
        >
          <ArticleList />
        </div>

        {/* 分隔条 2：文章列表 ↔ 阅读区 */}
        <ResizeHandle
          direction="horizontal"
          onResize={(delta) => {
            setListWidth((prev) =>
              Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, prev + delta))
            )
          }}
        />

        {/* 阅读区 */}
        <ReaderView />
      </div>

      {/* 加载指示器 */}
      {isLoading && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg text-sm">
          {t('app.loading')}
        </div>
      )}

      {/* 系统设置对话框（统一入口） */}
      <SystemSettings />

      {/* OPML 导入进度对话框 */}
      {opmlDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                {t('opml.importProgress')}
              </h2>
              <button
                onClick={() => setOpmlDialogOpen(false)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                disabled={opmlImporting}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {opmlProgress ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>{t('opml.progress')}</span>
                      <span>{opmlProgress.current} / {opmlProgress.total}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${opmlProgress.total > 0 ? Math.round((opmlProgress.current / opmlProgress.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-sm">
                    {opmlProgress.success ? (
                      <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-gray-800 dark:text-gray-200 truncate font-medium">
                        {opmlProgress.feedTitle || opmlProgress.feedUrl}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {opmlProgress.feedUrl}
                      </p>
                    </div>
                  </div>
                </div>
              ) : opmlImporting ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{t('opml.preparing')}</span>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  {t('opml.completed')}
                </p>
              )}
            </div>

            {!opmlImporting && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => setOpmlDialogOpen(false)}
                  className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  {t('tagManager.close')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}