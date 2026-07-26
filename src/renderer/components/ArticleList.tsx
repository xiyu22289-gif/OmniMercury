import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { FileText, Clock, Tag, X, Star, Search } from 'lucide-react'

export default function ArticleList() {
  const { t } = useTranslation()
  const {
    articles, selectedArticleId, selectArticle, selectedFeedId,
    currentFilterTagId, setFilterTag, tags, toggleStar, loadStarredArticles,
    searchResults, setSearchResults, jumpToArticle
  } = useStore()

  // 如果有搜索结果，显示搜索结果而非普通文章列表
  const displayArticles = searchResults.length > 0 ? searchResults : articles
  const isSearchMode = searchResults.length > 0

  // 当前筛选标签对象
  const filterTag = currentFilterTagId ? tags.find(t => t.id === currentFilterTagId) : null

  if (!selectedFeedId && !isSearchMode) {
    return (
      <div className="article-list flex items-center justify-center text-gray-400 text-sm">
        {t('articleList.selectFeed')}
      </div>
    )
  }

  if (displayArticles.length === 0) {
    return (
      <div className="article-list flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
        {isSearchMode ? (
          <>
            <Search size={24} className="opacity-30" />
            <span>未找到匹配的文章</span>
            <button onClick={() => setSearchResults([])} className="text-blue-500 hover:text-blue-600 text-xs">清除搜索</button>
          </>
        ) : (
          <span>{t('articleList.noArticles')}</span>
        )}
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

  const handleStarClick = (e: React.MouseEvent, articleId: number) => {
    e.stopPropagation()
    toggleStar(articleId)
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

      {/* 搜索结果显示 */}
      {isSearchMode && (
        <div className="px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
          <span className="text-blue-600 dark:text-blue-400">
            🔍 搜索结果 ({displayArticles.length} 篇)
          </span>
          <button onClick={() => setSearchResults([])} className="text-blue-400 hover:text-blue-600 text-[10px]">
            清除 ✕
          </button>
        </div>
      )}

      <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
        {t('articleList.articles')} ({displayArticles.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {displayArticles.map((article) => {
          const isSelected = selectedArticleId === article.id
          const isRead = article.is_read
          const isStarred = article.is_starred

          return (
          <div
            key={article.id}
            onClick={() => isSearchMode ? jumpToArticle(article) : selectArticle(article.id)}
            className={`article-item ${isSelected ? 'selected' : ''} ${isRead ? 'read' : ''}`}
          >
            <div className="flex items-start gap-2">
              {/* 已读/未读指示点 */}
              <div className="flex-shrink-0 mt-1.5">
                <span
                  className={`block w-2 h-2 rounded-full transition-colors ${
                    isRead
                      ? 'bg-transparent border border-gray-300 dark:border-gray-600'
                      : 'bg-blue-500 dark:bg-blue-400 shadow-sm shadow-blue-500/30'
                  }`}
                />
              </div>
              <FileText size={14} className={`flex-shrink-0 mt-0.5 ${isRead ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm leading-snug line-clamp-2 ${
                  isRead
                    ? 'font-normal text-gray-400 dark:text-gray-500'
                    : 'font-semibold text-gray-800 dark:text-gray-200'
                }`}>
                  {article.title || t('articleList.untitled')}
                </h3>
                {article.summary && (
                  <p className={`text-xs mt-1 line-clamp-2 ${
                    isRead
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
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

              {/* 星标按钮 */}
              <button
                onClick={(e) => handleStarClick(e, article.id)}
                className={`flex-shrink-0 p-1 rounded transition-all ${
                  isStarred
                    ? 'text-yellow-500 hover:text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
                    : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                }`}
                title={isStarred ? '取消星标' : '添加星标'}
              >
                <Star size={14} fill={isStarred ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
