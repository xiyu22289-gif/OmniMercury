import { useEffect, useCallback } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import ReaderView from './components/ReaderView'
import SearchBar from './components/SearchBar'
import { Menu as MenuIcon, Sun, Moon } from 'lucide-react'

export default function App() {
  const {
    sidebarOpen, toggleSidebar, darkMode, toggleDarkMode,
    setFeeds, selectFeed, setError, isLoading
  } = useStore()

  // 初始化：加载订阅源列表
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
          onClick={toggleSidebar}
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

      {/* 主内容区 */}
      <div className="flex flex-1 mt-10">
        <Sidebar />
        <ArticleList />
        <ReaderView />
      </div>

      {/* 加载指示器 */}
      {isLoading && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg text-sm">
          Loading...
        </div>
      )}
    </div>
  )
}