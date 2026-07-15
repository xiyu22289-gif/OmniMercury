import { useStore } from '../store'
import { FileText, Clock } from 'lucide-react'

export default function ArticleList() {
  const { articles, selectedArticleId, selectArticle, selectedFeedId } = useStore()

  if (!selectedFeedId) {
    return (
      <div className="article-list flex items-center justify-center text-gray-400 text-sm">
        Select a feed to view articles
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="article-list flex items-center justify-center text-gray-400 text-sm">
        No articles found
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
        return 'Yesterday'
      } else if (days < 7) {
        return `${days}d ago`
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      }
    } catch {
      return dateStr
    }
  }

  return (
    <div className="article-list">
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
        Articles ({articles.length})
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
                  {article.title || '(Untitled)'}
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