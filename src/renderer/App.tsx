import { useEffect, useState, useCallback } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import ReaderView from './components/ReaderView'
import SearchBar from './components/SearchBar'
import LLMSettings from './components/LLMSettings'
import ResizeHandle from './components/ResizeHandle'
import { Menu as MenuIcon, Sun, Moon, X, CheckCircle, XCircle, Loader2 } from 'lucide-react'

/** 默认宽度常量 */
const DEFAULT_SIDEBAR_WIDTH = 260
const DEFAULT_LIST_WIDTH = 360
const MIN_SIDEBAR_WIDTH = 160
const MIN_LIST_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 500
const MAX_LIST_WIDTH = 600

export default function App() {
  const {
    sidebarOpen, toggleSidebar, darkMode, toggleDarkMode,
    setFeeds, selectFeed, setError, isLoading,
    opmlImporting, opmlProgress, opmlDialogOpen, setOpmlDialogOpen
  } = useStore()

  // ---- 可拖拽宽度状态 ----
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)

  // 侧边栏收起/展开
  const handleToggleSidebar = useCallback(() => {
    if (sidebarOpen) {
      // 收起前记住当前宽度
      setSidebarWidth((prev) => {
        // 仅当不是已收起状态时才存记忆值
        return prev
      })
      toggleSidebar()
    } else {
      toggleSidebar()
      // 恢复默认宽度（如果上次宽度 < 最小值则用默认）
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
          // 自动选中第一个订阅源
          if (response.payload.feeds.length > 0) {
            selectFeed(response.payload.feeds[0].id)
          }
        }
      } catch (err) {
        setError(String(err))
      }
    }
    loadFeeds()
  }, [])

  // 暗色模式切换
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <div className="app-layout">
      {/* 顶栏 */}
      <div className="fixed top-0 left-0 right-0 h-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-3 gap-2 z-10">
        <button
          onClick={handleToggleSidebar}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Toggle sidebar"
        >
          <MenuIcon size={18} />
        </button>
        <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200 select-none">
          Summer RSS
        </h1>
        <div className="flex-1" />
        <SearchBar />
        <button
          onClick={toggleDarkMode}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Toggle dark mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* 主内容区 — 三栏 + 拖拽分隔条 */}
      <div className="flex flex-1 min-h-0">
        {/* 侧边栏 */}
        <div
          className={sidebarOpen ? '' : 'sidebar collapsed'}
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
          Loading...
        </div>
      )}

      {/* LLM 设置对话框 */}
      <LLMSettings />

      {/* OPML 导入进度对话框 */}
      {opmlDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                OPML 导入进度
              </h2>
              <button
                onClick={() => setOpmlDialogOpen(false)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                disabled={opmlImporting}
              >
                <X size={16} />
              </button>
            </div>

            {/* 进度内容 */}
            <div className="flex-1 overflow-y-auto p-4">
              {opmlProgress ? (
                <div className="space-y-3">
                  {/* 进度条 */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>进度</span>
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

                  {/* 当前处理 */}
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
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">正在准备...</span>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  导入已完成，订阅源列表已更新。
                </p>
              )}
            </div>

            {/* 底部按钮 */}
            {!opmlImporting && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => setOpmlDialogOpen(false)}
                  className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
