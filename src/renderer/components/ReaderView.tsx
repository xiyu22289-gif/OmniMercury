import { useEffect, useCallback, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store'
import {
  Globe, ExternalLink, Sparkles, Languages, Loader, Settings,
  Check, Columns, AlignJustify, Replace, X,
  BookOpen, Sun, Moon, Coffee
} from 'lucide-react'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError } from '../../shared/types'

// ============ 常量 ============

const LANG_OPTIONS = [
  { value: 'Chinese', label: '中文' },
  { value: 'English', label: 'English' },
  { value: 'Japanese', label: '日本語' },
  { value: 'Korean', label: '한국어' },
  { value: 'French', label: 'Français' },
  { value: 'German', label: 'Deutsch' },
]

const DISPLAY_MODES = [
  { value: 'replace' as const, icon: Replace, label: '覆盖' },
  { value: 'sideBySide' as const, icon: Columns, label: '左右' },
  { value: 'topBottom' as const, icon: AlignJustify, label: '上下' },
] as const

/** 阅读主题对应的 CSS 类名 */
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

const LANG_LABEL_MAP: Record<string, string> = {
  Chinese: '中文',
  English: 'English',
  Japanese: '日本語',
  Korean: '한국어',
  French: 'Français',
  German: 'Deutsch',
}

// ============ 工具函数 ============

/** 将 HTML 按段落分割，用于分段翻译 */
function splitHtml(html: string): string[] {
  const parts = html.split(/(<\/p>|<\/h[1-6]>|<\/li>|<\/blockquote>|<\/div>)/i)
  const paras: string[] = []
  let cur = ''
  for (const p of parts) {
    cur += p
    if (/\/(p|h[1-6]|li|blockquote|div)>$/i.test(p.trim())) {
      if (cur.trim()) paras.push(cur.trim())
      cur = ''
    }
  }
  if (cur.trim()) paras.push(cur.trim())
  return paras.length > 0 ? paras : [html]
}

// ============ 主组件 ============

export default function ReaderView() {
  const {
    // 文章状态
    selectedArticleId,
    articleContent,
    articles,
    isLoading,
    error,
    // 阅读模式（来自 HEAD）
    readerMode,
    readerTheme,
    setReaderMode,
    setReaderTheme,
    // LLM 摘要（来自 HEAD）
    summaryStream,
    summaryLoading,
    // LLM 翻译增强（来自远程）
    translateLoading,
    paragraphTranslations,
    displayMode,
    setDisplayMode,
    // Store actions
    setShowSettings,
    setSummaryLoading,
    appendSummaryDelta,
    resetSummary,
    setSummarizingArticleId,
    summarizingArticleId,
    setTranslateLoading,
    resetTranslate,
    setTranslateMode,
    appendParagraphTranslation,
    resetParagraphTranslations,
    appendTranslateDelta,
    setError
  } = useStore()

  // ============ 本地状态 ============

  const [showSummaryLangPicker, setShowSummaryLangPicker] = useState(false)
  const [showTranslateLangPicker, setShowTranslateLangPicker] = useState(false)
  const [selectedSummaryLang, setSelectedSummaryLang] = useState('Chinese')
  const [selectedTargetLang, setSelectedTargetLang] = useState('Chinese')

  // 摘要面板宽度
  const [summaryPanelWidth, setSummaryPanelWidth] = useState(35)
  const [summaryLangLabel, setSummaryLangLabel] = useState('')
  const isSummaryDragging = useRef(false)

  // 翻译分界线
  const [dividerPos, setDividerPos] = useState(50)
  const isDragging = useRef(false)

  // ============ 计算属性 ============

  const selectedArticle = articles.find(a => a.id === selectedArticleId)
  const originalParagraphs = articleContent ? splitHtml(articleContent) : []

  // 主题图标
  const ThemeIcon = readerTheme === 'light' ? Sun : readerTheme === 'dark' ? Moon : Coffee
  const themeLabel = readerTheme === 'light' ? '浅色' : readerTheme === 'dark' ? '深色' : '护眼'

  // 主题循环切换
  const cycleReaderTheme = () => {
    const themes: Array<'light' | 'dark' | 'sepia'> = ['light', 'dark', 'sepia']
    const currentIdx = themes.indexOf(readerTheme)
    setReaderTheme(themes[(currentIdx + 1) % themes.length])
  }

  // ============ 副作用 ============

  const translatingRef = useRef(false)
  const selectedArticleIdRef = useRef(selectedArticleId)
  const translateTargetLangRef = useRef('Chinese')

  useEffect(() => {
    selectedArticleIdRef.current = selectedArticleId
  }, [selectedArticleId])

  // 流式监听
  useEffect(() => {
    let cleanup: (() => void) | undefined

    if (typeof window.api?.onStreamChunk === 'function') {
      cleanup = window.api.onStreamChunk((chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => {
        if (chunk.type === 'summarize') {
          if (chunk.articleId !== selectedArticleIdRef.current) return
          if ('delta' in chunk) appendSummaryDelta(chunk.delta)
          else if ('fullText' in chunk) {
            setSummaryLoading(false)
            // 同步更新 articles 数组，确保同 session 内重新点开该文章时缓存命中
            useStore.setState(state => ({
              articles: state.articles.map(a =>
                a.id === chunk.articleId ? { ...a, summary: chunk.fullText } : a
              )
            }))
          }
          else if ('message' in chunk) { setError(chunk.message); setSummaryLoading(false) }
        } else if (chunk.type === 'translateParagraph') {
          if (!translatingRef.current) return
          const idx = chunk.paragraphIndex ?? 0
          if ('delta' in chunk) appendParagraphTranslation(idx, chunk.delta)
          else if ('fullText' in chunk) {
            // 段落翻译完成：合并写入 articles 数组的 translations 字段，确保同 session 缓存命中
            const state = useStore.getState()
            const targetArticle = state.articles.find(a => a.id === chunk.articleId)
            if (targetArticle) {
              const lang = translateTargetLangRef.current
              const existing: Record<string, string[]> = targetArticle.translations
                ? JSON.parse(targetArticle.translations)
                : {}
              const paras = [...(existing[lang] || [])]
              paras[idx] = chunk.fullText
              existing[lang] = paras
              useStore.setState({
                articles: state.articles.map(a =>
                  a.id === chunk.articleId ? { ...a, translations: JSON.stringify(existing) } : a
                )
              })
            }
          }
          else if ('message' in chunk) appendParagraphTranslation(idx, `[错误] ${chunk.message}`)
        } else if (chunk.type === 'translate') {
          if (!translatingRef.current) return
          if ('delta' in chunk) appendTranslateDelta(chunk.delta)
          else if ('fullText' in chunk) { setTranslateLoading(false); setTranslateMode('translation') }
          else if ('message' in chunk) { setError(chunk.message); setTranslateLoading(false) }
        }
      })
    }

    return () => { cleanup?.() }
  }, [])

  // 切换文章时重置翻译状态
  useEffect(() => {
    translatingRef.current = false
    resetTranslate()
    resetParagraphTranslations()
    setTranslateMode('original')
  }, [selectedArticleId])

  // ============ 拖拽事件 ============

  const handleDividerMouseDown = useCallback(() => { isDragging.current = true }, [])
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      setDividerPos(Math.max(20, Math.min(80, (e.clientX / window.innerWidth) * 100)))
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleSummaryDividerDown = useCallback(() => { isSummaryDragging.current = true }, [])
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isSummaryDragging.current) return
      setSummaryPanelWidth(Math.max(20, Math.min(60, (e.clientX / window.innerWidth) * 100)))
    }
    const onUp = () => { isSummaryDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ============ 事件处理 ============

  const handleSummarize = useCallback(async (targetLang: string) => {
    if (!selectedArticleId || !selectedArticle) return
    if (summaryLoading) return

    // 缓存命中：该文章已有摘要，直接展示，不调用 API
    if (selectedArticle.summary) {
      useStore.setState({
        summaryStream: selectedArticle.summary,
        summarizingArticleId: selectedArticleId,
        summaryLoading: false
      })
      setSummaryLangLabel(LANG_LABEL_MAP[targetLang] || targetLang)
      return
    }

    resetSummary()
    setSummarizingArticleId(selectedArticleId)
    setSummaryLoading(true)
    setSummaryLangLabel(LANG_LABEL_MAP[targetLang] || targetLang)
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c) { setError('文章无内容'); setSummaryLoading(false); return }
      await window.api.summarize(selectedArticleId, c, selectedArticle.title, targetLang)
    } catch (err) {
      setError(String(err))
      setSummaryLoading(false)
    }
  }, [selectedArticleId, selectedArticle, articleContent, summaryLoading])

  const confirmSummary = useCallback((lang: string) => {
    setShowSummaryLangPicker(false)
    setSelectedSummaryLang(lang)
    handleSummarize(lang)
  }, [handleSummarize])

  const handleBackToOriginal = useCallback(() => {
    translatingRef.current = false
    resetParagraphTranslations()
    setTranslateLoading(false)
  }, [resetParagraphTranslations, setTranslateLoading])

  const handleStartTranslate = useCallback(async (targetLang: string) => {
    if (!selectedArticleId || !selectedArticle) return
    if (translateLoading) return
    setShowTranslateLangPicker(false)

    // 缓存命中：该文章已有该语言翻译，直接展示，不调用 API
    if (selectedArticle.translations) {
      try {
        const transMap: Record<string, string[]> = JSON.parse(selectedArticle.translations)
        if (transMap[targetLang] && transMap[targetLang].length > 0) {
          useStore.setState({ paragraphTranslations: transMap[targetLang] })
          return
        }
      } catch { /* JSON 解析失败，走 API 翻译 */ }
    }

    translatingRef.current = true
    translateTargetLangRef.current = targetLang
    setTranslateLoading(true)
    resetParagraphTranslations()
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c.trim()) { setError('文章无内容'); setTranslateLoading(false); return }
      await window.api.translateParagraphs(selectedArticleId, c, selectedArticle.title, targetLang)
    } catch (err) {
      setError(String(err))
    }
    setTranslateLoading(false)
  }, [selectedArticleId, selectedArticle, articleContent, translateLoading])

  // ============ 渲染函数 ============

  /** 渲染 Markdown（reader 模式） */
  const renderMarkdownContent = () => {
    const displayContent = articleContent || selectedArticle?.summary || ''

    if (!displayContent && !isLoading) {
      return (
        <div className="text-gray-400 text-sm py-8 text-center">
          <Globe size={48} className="mx-auto mb-3 opacity-30" />
          暂无内容
        </div>
      )
    }

    return (
      <div className={`prose prose-sm ${READER_THEME_STYLES[readerTheme].prose} max-w-none leading-relaxed`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children, ...props }) => (
              <a href={href} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600 underline" {...props}>
                {children}
              </a>
            ),
            img: ({ src, alt, ...props }) => (
              <img src={src} alt={alt || ''} loading="lazy" className="rounded-lg max-w-full" {...props} />
            ),
            code: ({ children, className, ...props }) => {
              const isInline = !className
              if (isInline) {
                return <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono" {...props}>{children}</code>
              }
              return <code className={className} {...props}>{children}</code>
            },
            pre: ({ children, ...props }) => (
              <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto text-sm" {...props}>
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

  /** 渲染原始网页（original 模式） */
  const renderOriginalContent = () => {
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
    return <div className="text-gray-400 text-sm py-8 text-center">暂无原始链接</div>
  }

  // ============ 空状态 ============

  if (!selectedArticleId || !selectedArticle) {
    return (
      <div className="reader-view flex items-center justify-center text-gray-400 text-sm">
        选择一篇文章开始阅读
      </div>
    )
  }

  // ============ 渲染主内容 ============

  const hasTranslation = paragraphTranslations.some(t => t && t.trim())
  const hasSummary = summarizingArticleId === selectedArticleId && summaryStream.trim()

  // 获取当前主题样式
  const themeStyle = READER_THEME_STYLES[readerTheme]

  return (
    <div className="reader-view flex" style={{ height: '100%', overflow: 'hidden' }}>
      {/* 左侧主区域 */}
      <div
        style={{
          width: hasSummary ? `${100 - summaryPanelWidth}%` : '100%',
          overflowY: 'auto',
          paddingRight: hasSummary ? 12 : 0,
          background: themeStyle.container,
        }}
      >
        <div className="max-w-3xl mx-auto">
          {/* 标题 */}
          <h1 className="text-2xl font-bold leading-tight mb-2 dark:text-white">
            {selectedArticle.title || '(Untitled)'}
          </h1>

          {/* 元信息 */}
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-2 flex-wrap">
            {selectedArticle.author && <span>{selectedArticle.author}</span>}
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
              打开原文
            </a>
          </div>

          {/* ===== 工具栏 ===== */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700 flex-wrap">
            {/* 阅读模式切换（来自 HEAD） */}
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

            {/* 主题切换（来自 HEAD） */}
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

            {/* 摘要按钮（来自远程，增强语言选择） */}
            <div className="relative">
              <button
                onClick={() => setShowSummaryLangPicker(!showSummaryLangPicker)}
                disabled={summaryLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                         bg-purple-50 text-purple-600 hover:bg-purple-100
                         dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30
                         disabled:opacity-50 transition-colors"
              >
                {summaryLoading ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {summaryLoading ? '生成摘要...' : 'AI 摘要'}
              </button>
              {showSummaryLangPicker && (
                <div
                  className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-44 overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">摘要语言</span>
                  </div>
                  <div className="py-1">
                    {LANG_OPTIONS.map(l => (
                      <button
                        key={l.value}
                        onClick={() => confirmSummary(l.value)}
                        className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors
                          ${selectedSummaryLang === l.value
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'
                          }`}
                      >
                        <span>{l.label}</span>
                        {selectedSummaryLang === l.value && <Check size={13} className="text-purple-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 翻译按钮（来自远程） */}
            {hasTranslation ? (
              <>
                {DISPLAY_MODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setDisplayMode(m.value)}
                    className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition-colors
                      ${displayMode === m.value
                        ? 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                        : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                  >
                    <m.icon size={12} />
                    {m.label}
                  </button>
                ))}
                <button
                  onClick={handleBackToOriginal}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                  返回原文
                </button>
              </>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowTranslateLangPicker(!showTranslateLangPicker)}
                  disabled={translateLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                           bg-blue-50 text-blue-600 hover:bg-blue-100
                           dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30
                           disabled:opacity-50 transition-colors"
                >
                  {translateLoading ? <Loader size={13} className="animate-spin" /> : <Languages size={13} />}
                  {translateLoading ? '翻译中...' : '翻译'}
                </button>
                {showTranslateLangPicker && (
                  <div
                    className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-44 overflow-hidden"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">翻译语言</span>
                    </div>
                    <div className="py-1">
                      {LANG_OPTIONS.map(l => (
                        <button
                          key={l.value}
                          onClick={() => {
                            setSelectedTargetLang(l.value)
                            setShowTranslateLangPicker(false)
                            handleStartTranslate(l.value)
                          }}
                          className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors
                            ${selectedTargetLang === l.value
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'
                            }`}
                        >
                          <span>{l.label}</span>
                          {selectedTargetLang === l.value && <Check size={13} className="text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1" />

            {/* 设置按钮 */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="LLM 设置"
            >
              <Settings size={13} />
            </button>
          </div>

          {/* 关闭语言选择器的遮罩 */}
          {(showSummaryLangPicker || showTranslateLangPicker) && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => { setShowSummaryLangPicker(false); setShowTranslateLangPicker(false) }}
            />
          )}

          {/* 错误信息 */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          )}

          {/* 加载状态 */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ===== 内容主体 ===== */}
          {!isLoading && (
            <>
              {/* 覆盖模式 */}
              {displayMode === 'replace' && hasTranslation && (
                <div className="space-y-4">
                  {paragraphTranslations.map((html, idx) => (
                    <div
                      key={idx}
                      className={`prose prose-sm ${themeStyle.prose} max-w-none leading-relaxed`}
                      dangerouslySetInnerHTML={{ __html: html || '' }}
                    />
                  ))}
                </div>
              )}

              {/* 左右对照模式 */}
              {displayMode === 'sideBySide' && hasTranslation && (
                <div className="space-y-6">
                  {originalParagraphs.map((para, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                      <div style={{ width: `${dividerPos}%`, paddingRight: 12 }}>
                        <div className={`prose prose-sm ${themeStyle.prose} max-w-none leading-relaxed`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {para}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <div
                        onMouseDown={handleDividerMouseDown}
                        style={{ width: 6, cursor: 'col-resize', background: '#e5e7eb', flexShrink: 0, borderRadius: 3, alignSelf: 'stretch' }}
                        className="hover:bg-blue-400 transition-colors"
                      />
                      <div style={{ width: `${100 - dividerPos}%`, paddingLeft: 12 }}>
                        {paragraphTranslations[idx] ? (
                          <div className={`prose prose-sm ${themeStyle.prose} max-w-none leading-relaxed`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {paragraphTranslations[idx]}
                            </ReactMarkdown>
                          </div>
                        ) : translateLoading ? (
                          <div className="text-xs text-gray-400">翻译中...</div>
                        ) : <div className="text-xs text-gray-300">-</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 上下对照模式 */}
              {displayMode === 'topBottom' && hasTranslation && (
                <div className="space-y-6">
                  {originalParagraphs.map((para, idx) => (
                    <div key={idx}>
                      <div className={`prose prose-sm ${themeStyle.prose} max-w-none leading-relaxed`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {para}
                        </ReactMarkdown>
                      </div>
                      <div className="h-3" />
                      {paragraphTranslations[idx] ? (
                        <div className="pl-3 border-l-4 border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 rounded-r py-2 pr-3">
                          <div className="text-[10px] text-blue-500 dark:text-blue-400 mb-1 flex items-center gap-1">
                            🌐 译文 {translateLoading && <Loader size={10} className="animate-spin text-blue-400" />}
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {paragraphTranslations[idx]}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ) : translateLoading ? (
                        <div className="pl-3 border-l-4 border-blue-200 bg-blue-50/30 dark:bg-blue-900/5 rounded-r py-2 pr-3 text-xs text-gray-400">
                          翻译中...
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {/* 无翻译时显示原文（reader 或 original 模式） */}
              {!hasTranslation && (
                <div className={`rounded-lg p-6 ${themeStyle.container}`}>
                  {readerMode === 'reader' ? renderMarkdownContent() : renderOriginalContent()}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== 右侧摘要面板 ===== */}
      {hasSummary && (
        <>
          <div
            onMouseDown={handleSummaryDividerDown}
            style={{ width: 6, cursor: 'col-resize', background: '#d1d5db', flexShrink: 0, borderRadius: 3, alignSelf: 'stretch' }}
            className="hover:bg-purple-400 transition-colors"
          />
          <div style={{ width: `${summaryPanelWidth}%`, overflowY: 'auto', paddingLeft: 12, background: themeStyle.container }}>
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm pb-2 mb-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-purple-500" />
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                  AI 摘要{summaryLangLabel ? ` (${summaryLangLabel})` : ''}
                </span>
                {summaryLoading && <Loader size={12} className="animate-spin text-purple-400 ml-1" />}
              </div>
            </div>
            <div className={`text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap`}>
              {summaryStream}
            </div>
          </div>
        </>
      )}
    </div>
  )
}