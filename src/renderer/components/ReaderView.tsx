import { useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store'
import {
  Globe, ExternalLink, Sparkles, Languages, Loader, Settings,
  BookOpen, Sun, Moon, Coffee
} from 'lucide-react'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError } from '../../shared/types'

/** 阅读主题对应的 CSS 类名和背景色 */
const READER_THEME_STYLES: Record<
  'light' | 'dark' | 'sepia',
  { container: string; prose: string }
> = {
  light: {
    container: 'bg-white',
    prose: 'prose-gray'
  },
  dark: {
    container: 'bg-gray-900',
    prose: 'prose-invert'
  },
  sepia: {
    container: 'bg-amber-50',
    prose: 'prose-amber'
  }
}

export default function ReaderView() {
  const {
    selectedArticleId,
    articleContent,
    articles,
    isLoading,
    // 阅读模式
    readerMode,
    readerTheme,
    setReaderMode,
    setReaderTheme,
    // LLM 状态
    summaryStream,
    summaryLoading,
    translateStream,
    translateLoading,
    translateMode,
    setShowSettings,
    setSummaryLoading,
    appendSummaryDelta,
    resetSummary,
    setTranslateLoading,
    appendTranslateDelta,
    resetTranslate,
    setTranslateMode,
    setError
  } = useStore()

  const selectedArticle = articles.find((a) => a.id === selectedArticleId)

  // 注册流式数据块监听
  useEffect(() => {
    let cleanup: (() => void) | undefined

    if (typeof window.api?.onStreamChunk === 'function') {
      cleanup = window.api.onStreamChunk((chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => {
        if (chunk.type === 'summarize') {
          if ('delta' in chunk && chunk.delta) {
            appendSummaryDelta(chunk.delta)
          } else if ('fullText' in chunk && chunk.fullText !== undefined) {
            setSummaryLoading(false)
          } else if ('message' in chunk && chunk.message) {
            setError(chunk.message)
            setSummaryLoading(false)
          }
        } else if (chunk.type === 'translate') {
          if ('delta' in chunk && chunk.delta) {
            appendTranslateDelta(chunk.delta)
          } else if ('fullText' in chunk && chunk.fullText !== undefined) {
            setTranslateLoading(false)
          } else if ('message' in chunk && chunk.message) {
            setError(chunk.message)
            setTranslateLoading(false)
          }
        }
      })
    }

    return () => {
      cleanup?.()
    }
  }, [])

  // 摘要按钮
  const handleSummarize = useCallback(async () => {
    if (!selectedArticleId || !selectedArticle) return
    if (summaryLoading) return

    resetSummary()
    setSummaryLoading(true)

    try {
      const content = articleContent || selectedArticle.summary || ''
      if (!content) {
        setError('文章无内容，无法生成摘要')
        setSummaryLoading(false)
        return
      }
      await window.api.summarize(selectedArticleId, content, selectedArticle.title)
    } catch (err) {
      setError(String(err))
      setSummaryLoading(false)
    }
  }, [selectedArticleId, selectedArticle, articleContent, summaryLoading])

  // 翻译按钮
  const handleTranslate = useCallback(async () => {
    if (!selectedArticleId || !selectedArticle) return
    if (translateLoading) return

    resetTranslate()
    setTranslateLoading(true)

    try {
      const content = articleContent || selectedArticle.summary || ''
      if (!content) {
        setError('文章无内容，无法翻译')
        setTranslateLoading(false)
        return
      }
      await window.api.translate(selectedArticleId, content, selectedArticle.title)
    } catch (err) {
      setError(String(err))
      setTranslateLoading(false)
    }
  }, [selectedArticleId, selectedArticle, articleContent, translateLoading])

  // 翻译模式切换
  const cycleTranslateMode = () => {
    const modes: Array<'original' | 'translation' | 'bilingual'> = ['original', 'translation', 'bilingual']
    const currentIdx = modes.indexOf(translateMode)
    setTranslateMode(modes[(currentIdx + 1) % modes.length])
  }

  // 阅读主题循环切换
  const cycleReaderTheme = () => {
    const themes: Array<'light' | 'dark' | 'sepia'> = ['light', 'dark', 'sepia']
    const currentIdx = themes.indexOf(readerTheme)
    setReaderTheme(themes[(currentIdx + 1) % themes.length])
  }

  // 主题图标
  const ThemeIcon = readerTheme === 'light' ? Sun : readerTheme === 'dark' ? Moon : Coffee
  const themeLabel = readerTheme === 'light' ? '浅色' : readerTheme === 'dark' ? '深色' : '护眼'

  // ---- 渲染 Markdown（reader 模式） ----
  const renderMarkdownContent = () => {
    const displayContent = articleContent || selectedArticle?.summary || ''

    if (!displayContent && !isLoading) {
      return (
        <div className="text-gray-400 text-sm py-8 text-center">
          <Globe size={48} className="mx-auto mb-3 opacity-30" />
          Content not available. The article may need to be fetched from the source.
        </div>
      )
    }

    return (
      <div className={`prose prose-sm ${READER_THEME_STYLES[readerTheme].prose} max-w-none leading-relaxed`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // 自定义链接在新窗口打开
            a: ({ href, children, ...props }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-blue-500 hover:text-blue-600 underline"
                {...props}
              >
                {children}
              </a>
            ),
            // 图片使用懒加载
            img: ({ src, alt, ...props }) => (
              <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                className="rounded-lg max-w-full"
                {...props}
              />
            ),
            // 代码块样式
            code: ({ children, className, ...props }) => {
              const isInline = !className
              if (isInline) {
                return (
                  <code
                    className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                )
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            },
            pre: ({ children, ...props }) => (
              <pre
                className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto text-sm"
                {...props}
              >
                {children}
              </pre>
            ),
          }}
        >
          {displayContent}
        </ReactMarkdown>
      </div>
    )
  }

  // ---- 渲染原始网页（original 模式） ----
  const renderOriginalContent = () => {
    // 原始网页模式：打开外部链接
    if (selectedArticle?.url) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Globe size={48} className="mb-3 opacity-30" />
          <p className="text-sm mb-4">原始网页需在外部浏览器中查看</p>
          <a
            href={selectedArticle.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            <ExternalLink size={14} />
            在浏览器中打开原文
          </a>
        </div>
      )
    }

    return (
      <div className="text-gray-400 text-sm py-8 text-center">
        No original URL available
      </div>
    )
  }

  // 根据翻译模式决定显示的内容
  const renderContent = () => {
    if (translateMode === 'translation' && translateStream) {
      // 仅译文
      return (
        <div className={`rounded-lg p-6 ${READER_THEME_STYLES[readerTheme].container}`}>
          <div className={`prose prose-sm ${READER_THEME_STYLES[readerTheme].prose} max-w-none leading-relaxed`}>
            <div className="whitespace-pre-wrap">{translateStream}</div>
            {translateLoading && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />}
          </div>
        </div>
      )
    }

    if (translateMode === 'bilingual') {
      // 双语对照
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-lg p-6 ${READER_THEME_STYLES[readerTheme].container} border-r border-gray-200 dark:border-gray-700`}>
            <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">原文</div>
            {readerMode === 'reader' ? renderMarkdownContent() : renderOriginalContent()}
          </div>
          <div className={`rounded-lg p-6 ${READER_THEME_STYLES[readerTheme].container}`}>
            <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">译文</div>
            <div className={`prose prose-sm ${READER_THEME_STYLES[readerTheme].prose} max-w-none leading-relaxed`}>
              <div className="whitespace-pre-wrap">{translateStream}</div>
              {translateLoading && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />}
            </div>
          </div>
        </div>
      )
    }

    // 默认：原文（reader 或 original 模式）
    return (
      <>
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400">正在提取正文...</span>
            </div>
          </div>
        )}

        {!isLoading && (
          <div className={`rounded-lg p-6 ${READER_THEME_STYLES[readerTheme].container}`}>
            {readerMode === 'reader' ? renderMarkdownContent() : renderOriginalContent()}
          </div>
        )}
      </>
    )
  }

  // 空状态
  if (!selectedArticleId || !selectedArticle) {
    return (
      <div className="reader-view flex items-center justify-center text-gray-400 text-sm">
        Select an article to read
      </div>
    )
  }

  return (
    <div className="reader-view">
      <div className="max-w-3xl mx-auto">
        {/* 文章头部 */}
        <h1 className="text-2xl font-bold leading-tight mb-2">
          {selectedArticle.title || '(Untitled)'}
        </h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-2 flex-wrap">
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

        {/* ---- 工具栏：阅读模式 + 主题 + LLM 操作 ---- */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700 flex-wrap">
          {/* 阅读模式切换 */}
          <button
            onClick={() => setReaderMode(readerMode === 'reader' ? 'original' : 'reader')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
              ${readerMode === 'reader'
                ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            title={readerMode === 'reader' ? '阅读模式（点击切换原始网页）' : '原始网页（点击切换阅读模式）'}
          >
            <BookOpen size={13} />
            {readerMode === 'reader' ? '阅读模式' : '原始网页'}
          </button>

          {/* 阅读主题切换（仅在 reading mode 显示） */}
          {readerMode === 'reader' && (
            <button
              onClick={cycleReaderTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                       bg-orange-50 text-orange-600 hover:bg-orange-100
                       dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30
                       transition-colors"
              title={`当前主题：${themeLabel}（点击切换）`}
            >
              <ThemeIcon size={13} />
              {themeLabel}
            </button>
          )}

          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* 摘要按钮 */}
          <button
            onClick={handleSummarize}
            disabled={summaryLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                     bg-purple-50 text-purple-600 hover:bg-purple-100
                     dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30
                     disabled:opacity-50 transition-colors"
          >
            {summaryLoading ? (
              <Loader size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {summaryLoading ? '生成摘要...' : 'AI 摘要'}
          </button>

          {/* 翻译按钮 */}
          {translateMode !== 'original' ? (
            <button
              onClick={cycleTranslateMode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                       bg-blue-50 text-blue-600 hover:bg-blue-100
                       dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30
                       transition-colors"
            >
              <Languages size={13} />
              {translateMode === 'translation' ? '译文' : '双语对照'}
            </button>
          ) : (
            <button
              onClick={handleTranslate}
              disabled={translateLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                       bg-blue-50 text-blue-600 hover:bg-blue-100
                       dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30
                       disabled:opacity-50 transition-colors"
            >
              {translateLoading ? (
                <Loader size={13} className="animate-spin" />
              ) : (
                <Languages size={13} />
              )}
              {translateLoading ? '翻译中...' : '翻译'}
            </button>
          )}

          <div className="flex-1" />

          {/* 设置按钮 */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600
                     dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="LLM 设置"
          >
            <Settings size={13} />
          </button>
        </div>

        {/* ---- AI 摘要区域 ---- */}
        {summaryStream && (
          <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={13} className="text-purple-500" />
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                AI 摘要
              </span>
              {summaryLoading && (
                <Loader size={12} className="animate-spin text-purple-400 ml-1" />
              )}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summaryStream}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* ---- 文章正文内容 ---- */}
        {renderContent()}
      </div>
    </div>
  )
}
