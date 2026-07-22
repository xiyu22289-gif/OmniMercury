import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { FileText, Clock, Tag, X } from 'lucide-react'

export default function ArticleList() {
  const { t } = useTranslation()
  const {
    articles, selectedArticleId, selectArticle, selectedFeedId,
    currentFilterTagId, setFilterTag, tags
  } = useStore()

  // 当前筛选标签对象
  const filterTag = currentFilterTagId ? tags.find(t => t.id === currentFilterTagId) : null

  if (!selectedFeedId) {
    return (
      <div className="article-list flex items-center justify-center text-gray-400 text-sm">
        {t('articleList.selectFeed')}
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="article-list flex items-center justify-center text-gray-400 text-sm">
        {t('articleList.noArticles')}
      </div>
    )
  }

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))

      if (days === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } else if (days === 1) {
        return t('articleList.yesterday')
      } else if (days < 7) {
        return t('articleList.daysAgo', { n: days })
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      }
    } catch {
      return dateStr
    }
  }

  return (
    <div className="article-list">
      {/* ===== M5 标签筛选提示条 ===== */}
      {filterTag && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-gray-200 dark:border-gray-700"
          style={{
            backgroundColor: (filterTag.color || '#3b82f6') + '10',
          }}
        >
          <Tag size={11} style={{ color: filterTag.color || '#3b82f6' }} />
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {t('articleList.filteredBy')}
          </span>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium"
            style={{
              backgroundColor: (filterTag.color || '#3b82f6') + '20',
              color: filterTag.color || '#3b82f6',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filterTag.color || '#3b82f6' }} />
            {filterTag.name}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setFilterTag(null)}
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={t('articleList.clearFilter')}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
        {t('articleList.articles')} ({articles.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {articles.map((article) => (
          <div
            key={article.id}
            onClick={() => selectArticle(article.id)}
            className={`article-item ${selectedArticleId === article.id ? 'selected' : ''} ${article.is_read ? 'read' : ''}`}
          >
            <div className="flex items-start gap-2">
              <FileText size={14} className="flex-shrink-0 mt-0.5 text-gray-400" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium leading-snug line-clamp-2">
                  {article.title || t('articleList.untitled')}
                </h3>
                {article.summary && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {article.summary}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <Clock size={10} className="text-gray-400" />
                  <span className="text-xs text-gray-400">
                    {formatDate(article.published_at)}
                  </span>
                  {article.author && (
                    <span className="text-xs text-gray-400 truncate">
                      · {article.author}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}