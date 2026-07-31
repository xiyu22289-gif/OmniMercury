import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { useState, useEffect } from 'react'
import { FileText, Clock, Tag, X, Star, Search, Trash2, Filter, Eye, EyeOff } from 'lucide-react'

export default function ArticleList() {
  const { t } = useTranslation()
  const {
    articles, selectedArticleId, selectArticle, selectedFeedId,
    currentFilterTagId, setFilterTag, tags, toggleStar, toggleArticleRead, deleteArticle, loadStarredArticles,
    searchResults, setSearchResults, jumpToArticle,
    articleTagsMap, fetchArticleTags
  } = useStore()

  // 未读筛选（仅全部文章模式生效）
  const [unreadOnly, setUnreadOnly] = useState(false)
  const isAllArticlesMode = selectedFeedId === -1

  // 如果有搜索结果，显示搜索结果而非普通文章列表
  const displayArticles = (() => {
    const src = searchResults.length > 0 ? searchResults : articles
    if (unreadOnly && isAllArticlesMode && searchResults.length === 0) {
      return src.filter(a => !a.is_read)
    }
    return src
  })()
  const isSearchMode = searchResults.length > 0

  // 批量拉取列表中所有文章的标签（仅拉取无缓存的）
  useEffect(() => {
    const idsWithoutCache = displayArticles
      .map(a => a.id)
      .filter(id => !articleTagsMap[id])
    if (idsWithoutCache.length === 0) return
    // 逐篇拉取（每次间隔 5ms 避免并发过多）
    idsWithoutCache.forEach((id, i) => {
      setTimeout(() => fetchArticleTags(id), i * 5)
    })
  }, [displayArticles.map(a => a.id).join(','), fetchArticleTags])

  // 当前筛选标签对象
  const filterTag = currentFilterTagId ? tags.find(t => t.id === currentFilterTagId) : null

  if (selectedFeedId === null && !isSearchMode) {
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

  const handleDeleteClick = (e: React.MouseEvent, articleId: number) => {
    e.stopPropagation()
    const title = displayArticles.find(a => a.id === articleId)?.title || '这篇文章'
    if (window.confirm(`确定要删除「${title}」吗？此操作不可撤销。`)) {
      deleteArticle(articleId)
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

      {/* 全部文章模式：未读筛选切换 */}
      {isAllArticlesMode && !isSearchMode && (
        <div className="px-3 py-1.5 text-xs border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <Filter size={12} className={unreadOnly ? 'text-blue-500' : 'text-gray-400'} />
          <button
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              unreadOnly
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }`}
          >
            {unreadOnly ? '✓ 仅未读' : '仅未读'}
          </button>
          {unreadOnly && (
            <span className="text-gray-400 dark:text-gray-500">
              筛选出 {displayArticles.length} 篇未读
            </span>
          )}
          <div className="flex-1" />
          {unreadOnly && (
            <button
              onClick={() => setUnreadOnly(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={12} />
            </button>
          )}
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
            className={`article-item group ${isSelected ? 'selected' : ''} ${isRead ? 'read' : ''}`}
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
              <FileText size={14} className={`flex-shrink-0 mt-0.5 ${isRead ? 'text-gray-400 dark:text-gray-500' : 'text-gray-400 dark:text-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm leading-snug line-clamp-2 ${
                  isRead
                    ? 'font-normal text-gray-500 dark:text-gray-400'
                    : 'font-semibold text-gray-800 dark:text-gray-200'
                }`}>
                  {article.title || t('articleList.untitled')}
                </h3>
                {article.summary && (
                  <p className={`text-xs mt-1 line-clamp-2 ${
                    isRead
                      ? 'text-gray-500 dark:text-gray-400'
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

                {/* 文章标签显示 */}
                {articleTagsMap[article.id] && articleTagsMap[article.id].length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {articleTagsMap[article.id].map(tag => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: (tag.color || '#3b82f6') + '18',
                          color: tag.color || '#3b82f6',
                          border: '1px solid ' + (tag.color || '#3b82f6') + '30',
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setFilterTag(currentFilterTagId === tag.id ? null : tag.id)
                        }}
                        title={`筛选标签「${tag.name}」`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 已读/未读切换 */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleArticleRead(article.id) }}
                className={`flex-shrink-0 p-1 rounded transition-all opacity-0 group-hover:opacity-100 ${
                  isRead
                    ? 'text-green-500 hover:text-green-600'
                    : 'text-gray-300 dark:text-gray-600 hover:text-green-400'
                }`}
                title={isRead ? '标记未读' : '标记已读'}
              >
                {isRead ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>

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

              {/* 删除按钮 */}
              <button
                onClick={(e) => handleDeleteClick(e, article.id)}
                className="flex-shrink-0 p-1 rounded transition-all text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100"
                title="删除文章"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}