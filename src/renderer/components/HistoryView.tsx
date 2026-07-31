import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Trash2, X, ExternalLink } from 'lucide-react'
import { useStore } from '../store'

interface HistoryEntry {
  id: number
  articleId: number
  articleTitle: string
  articleLink: string | null
  feedTitle: string | null
  author: string | null
  pubDate: string | null
  viewedAt: string
}

/** 格式化"多久之前" */
function timeAgo(dateStr: string, t: (key: string) => string): string {
  const now = Date.now()
  const then = new Date(dateStr + 'Z').getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return t('history.yesterday')
  if (diffDay < 7) return `${diffDay}d`
  return new Date(then).toLocaleDateString()
}

export default function HistoryView() {
  const { t } = useTranslation()
  const { showHistory, setShowHistory, selectArticle } = useStore()

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadHistory = async () => {
    setLoading(true)
    try {
      const res = await window.api.getBrowseHistory(200)
      if (res.success && res.data) {
        setHistory(res.data)
      }
    } catch {
      // 静默
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (showHistory) {
      loadHistory()
    }
  }, [showHistory])

  const handleClear = async () => {
    if (!window.confirm(t('history.clearConfirm'))) return
    try {
      await window.api.clearBrowseHistory()
      setHistory([])
    } catch {
      // 静默
    }
  }

  const handleClickArticle = (entry: HistoryEntry) => {
    // 关闭历史面板并跳转到文章
    setShowHistory(false)
    selectArticle(entry.articleId)
  }

  if (!showHistory) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setShowHistory(false)}
      />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {t('history.title')}
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {history.length > 0 ? `${history.length} 条` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {history.length > 0 && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title={t('history.clear')}
              >
                <Trash2 size={13} />
                {t('history.clear')}
              </button>
            )}
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              加载中...
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Clock size={40} className="mb-3 opacity-30" />
              <span className="text-sm">{t('history.empty')}</span>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleClickArticle(entry)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {entry.articleTitle || '(无标题)'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {entry.feedTitle && (
                          <span className="truncate max-w-[200px]">{entry.feedTitle}</span>
                        )}
                        {entry.author && <span>{entry.author}</span>}
                        {entry.articleLink && (
                          <a
                            href={entry.articleLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-0.5 text-blue-400 hover:text-blue-500 flex-shrink-0"
                            title="打开原文链接"
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {timeAgo(entry.viewedAt, t)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}