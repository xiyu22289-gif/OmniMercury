import { useState } from 'react'
import { useStore } from '../store'
import { Rss, Plus, RefreshCw, Trash2, FolderOpen, Upload, Download, AlertCircle, Info, XCircle } from 'lucide-react'

/** 错误码 → 图标 + 颜色映射 */
const ERROR_CONFIG: Record<string, { icon: typeof AlertCircle; color: string; bg: string }> = {
  INVALID_URL:     { icon: AlertCircle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' },
  NETWORK_ERROR:   { icon: XCircle,     color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  NOT_RSS_FEED:    { icon: XCircle,     color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  PARSE_ERROR:     { icon: XCircle,     color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  DUPLICATE:       { icon: Info,        color: 'text-blue-600 dark:text-blue-400',  bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  DB_ERROR:        { icon: XCircle,     color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  // 兜底
  UNKNOWN:         { icon: XCircle,     color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
}

export default function Sidebar() {
  const {
    feeds, selectedFeedId, sidebarOpen,
    selectFeed, setFeeds, setError, setLoading,
    addFeedError, setAddFeedError, clearAddFeedError,
    setOpmlImporting, setOpmlProgress, setOpmlDialogOpen
  } = useStore()

  const [addUrl, setAddUrl] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  /** OPML 文件导入流程 */
  const handleOpmlImport = async () => {
    // 1) 打开文件选择对话框
    const selectResult = await window.api.selectOpmlFile()
    if (selectResult.canceled || !selectResult.filePath) return

    // 2) 开始导入
    setOpmlImporting(true)
    setOpmlDialogOpen(true)

    // 3) 监听进度
    const unsub = window.api.onOpmlProgress((progress) => {
      setOpmlProgress({
        current: progress.current,
        total: progress.total,
        feedTitle: progress.feed.title,
        feedUrl: progress.feed.xmlUrl,
        success: progress.feed.success,
      })
    })

    try {
      await window.api.importOpml(selectResult.filePath)

      // 4) 重新加载订阅源列表
      const listResp = await window.api.listFeeds()
      if (listResp.payload.error === 0 && listResp.payload.feeds) {
        setFeeds(listResp.payload.feeds)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      unsub()
      setOpmlImporting(false)
      setOpmlProgress(null)
      setOpmlDialogOpen(false)
    }
  }

  /** OPML 导出 */
  const handleOpmlExport = async () => {
    try {
      const result = await window.api.exportOpml()
      if (!result.success && result.error !== '用户取消') {
        setError(result.error || '导出失败')
      }
    } catch (err) {
      setError(String(err))
    }
  }

  const handleAddFeed = async () => {
    const url = addUrl.trim()
    if (!url) {
      setAddFeedError('请输入有效的 RSS/Atom 订阅源 URL')
      return
    }

    setLoading(true)
    clearAddFeedError()
    try {
      const response = await window.api.addFeed(url)
      if (response.payload.error === 0) {
        // 重新加载订阅源列表
        const listResp = await window.api.listFeeds()
        if (listResp.payload.error === 0 && listResp.payload.feeds) {
          setFeeds(listResp.payload.feeds)
        }
        setAddUrl('')
        setShowAdd(false)
        clearAddFeedError()
      } else {
        // 从 feedService 获取详细错误信息，映射到用户友好提示
        const code = response.payload.errorCode || 'UNKNOWN'
        const message = response.payload.message || '添加失败，请稍后重试'
        setAddFeedError(message)
      }
    } catch (err) {
      setAddFeedError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await window.api.refreshFeeds()
      // 重新加载订阅源列表
      const listResp = await window.api.listFeeds()
      if (listResp.payload.error === 0 && listResp.payload.feeds) {
        setFeeds(listResp.payload.feeds)
      }
      // 如果当前有选中的订阅源，刷新其文章列表
      if (selectedFeedId !== null) {
        selectFeed(selectedFeedId)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveFeed = async (feedId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setLoading(true)
    try {
      await window.api.removeFeed(feedId)
      const listResp = await window.api.listFeeds()
      if (listResp.payload.error === 0 && listResp.payload.feeds) {
        setFeeds(listResp.payload.feeds)
        // 如果删除的是当前选中的订阅源，自动选择第一个剩余订阅源
        if (feedId === selectedFeedId) {
          if (listResp.payload.feeds.length > 0) {
            selectFeed(listResp.payload.feeds[0].id)
          } else {
            // 无剩余订阅源：清空文章列表
            useStore.setState({ articles: [], selectedFeedId: null, selectedArticleId: null, articleContent: null })
          }
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  if (!sidebarOpen) return null

  /** 获取当前错误的样式配置 */
  const errorCode = addFeedError ? (addFeedError.includes('有效') ? 'INVALID_URL' : 'UNKNOWN') : null
  const errStyle = errorCode ? ERROR_CONFIG[errorCode] : null
  const ErrIcon = errStyle?.icon

  return (
    <div className="sidebar">
      {/* 头部操作按钮 */}
      <div className="flex items-center gap-1 p-3 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => {
            setShowAdd(!showAdd)
            clearAddFeedError()
          }}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          <Plus size={14} />
          Add
        </button>
        <button
          onClick={handleOpmlImport}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Import OPML file"
        >
          <Upload size={14} />
        </button>
        <button
          onClick={handleOpmlExport}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Export OPML file"
        >
          <Download size={14} />
        </button>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Refresh all feeds"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* 添加订阅源输入 */}
      {showAdd && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <input
            type="url"
            value={addUrl}
            onChange={(e) => {
              setAddUrl(e.target.value)
              // 用户重新输入时清除错误
              if (addFeedError) clearAddFeedError()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddFeed()
              }
            }}
            placeholder="Enter RSS/Atom URL..."
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />

          {/* 错误提示 */}
          {addFeedError && ErrIcon && (
            <div className={`mt-2 flex items-start gap-1.5 px-2 py-1.5 rounded border text-xs ${errStyle.bg} ${errStyle.color}`}>
              <ErrIcon size={14} className="flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{addFeedError}</span>
              <button
                onClick={clearAddFeedError}
                className="flex-shrink-0 ml-auto opacity-50 hover:opacity-100 transition-opacity"
                title="关闭"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {/* 订阅源列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <FolderOpen size={12} className="inline mr-1" />
          Feeds ({feeds.length})
        </div>
        {feeds.map((feed) => (
          <div
            key={feed.id}
            onClick={() => selectFeed(feed.id)}
            className={`feed-item ${selectedFeedId === feed.id ? 'selected' : ''}`}
          >
            <Rss size={14} className="flex-shrink-0 text-orange-500" />
            <span className="flex-1 text-sm truncate">{feed.title || feed.url}</span>
            <button
              onClick={(e) => handleRemoveFeed(feed.id, e)}
              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
              title="Remove feed"
            >
              <Trash2 size={12} className="text-red-400" />
            </button>
          </div>
        ))}
        {feeds.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No feeds yet. Click "Add" to subscribe to an RSS feed.
          </div>
        )}
      </div>
    </div>
  )
}
