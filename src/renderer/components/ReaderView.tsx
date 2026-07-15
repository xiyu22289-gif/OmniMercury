import { useStore } from '../store'
import { Globe, ExternalLink } from 'lucide-react'

export default function ReaderView() {
  const { selectedArticleId, articleContent, articles, isLoading } = useStore()

  const selectedArticle = articles.find((a) => a.id === selectedArticleId)

  if (!selectedArticleId || !selectedArticle) {
    return (
      <div className="reader-view flex items-center justify-center text-gray-400 text-sm">
        Select an article to read
      </div>
    )
  }

  return (
    <div className="reader-view">
      {/* 文章头部 */}
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold leading-tight mb-2">
          {selectedArticle.title || '(Untitled)'}
        </h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-6">
          {selectedArticle.author && (
            <span>{selectedArticle.author}</span>
          )}
          {selectedArticle.published_at && (
            <span>
              {new Date(selectedArticle.published_at).toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
          <a
            href={selectedArticle.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-blue-500 hover:text-blue-600 transition-colors"
          >
            <ExternalLink size={14} />
            Open original
          </a>
        </div>

        {/* 文章内容 */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && articleContent && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
            dangerouslySetInnerHTML={{ __html: articleContent }}
          />
        )}

        {!isLoading && !articleContent && (
          <div className="text-gray-400 text-sm py-8 text-center">
            <Globe size={48} className="mx-auto mb-3 opacity-30" />
            Content not available. The article may need to be fetched from the source.
          </div>
        )}
      </div>
    </div>
  )
}