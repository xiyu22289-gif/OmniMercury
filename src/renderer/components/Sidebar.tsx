import { useState } from 'react'
import { useStore } from '../store'
import { Rss, Plus, RefreshCw, Trash2, FolderOpen } from 'lucide-react'

export default function Sidebar() {
  const {
    feeds, selectedFeedId, sidebarOpen,
    selectFeed, setFeeds, setError, setLoading
  } = useStore()

  const [addUrl, setAddUrl] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const handleAddFeed = async () => {
    const url = addUrl.trim()
    if (!url) return

    setLoading(true)
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
      } else {
        setError('Failed to add feed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await window.api.refreshFeeds()
      // 重新加载数据
      const listResp = await window.api.listFeeds()
      if (listResp.payload.error === 0 && listResp.payload.feeds) {
        setFeeds(listResp.payload.feeds)
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
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  if (!sidebarOpen) return null

  return (
    <div className="sidebar">
      {/* 头部操作按钮 */}
      <div className="flex items-center gap-1 p-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          <Plus size={14} />
          Add
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
            onChange={(e) => setAddUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddFeed()}
            placeholder="Enter RSS/Atom URL..."
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
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