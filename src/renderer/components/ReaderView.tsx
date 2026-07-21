import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store'
import {
  Globe, ExternalLink, Sparkles, Languages, Loader, Settings,
  Check, Columns, AlignJustify, Replace, X,
  BookOpen, Monitor, Type, Minus, Plus, ChevronDown
} from 'lucide-react'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError } from '../../shared/types'
import { splitIntoParagraphs } from '../../shared/paragraphSplitter'

// ============ 字体选项 ============

const FONT_FAMILIES = [
  { value: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif', label: '系统默认' },
  { value: 'Georgia, "Times New Roman", serif', label: '宋体/衬线' },
  { value: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif', label: '黑体/雅黑' },
  { value: '"KaiTi", "STKaiti", "Kai", serif', label: '楷体' },
  { value: '"LXGW WenKai", "Noto Serif SC", serif', label: '霞鹜文楷' },
  { value: 'Consolas, "SF Mono", "Fira Code", monospace', label: '等宽字体' },
]

const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 28
const FONT_SIZE_STEP = 2

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
  { value: 'newTab' as const, icon: Monitor, label: '新标签' },
] as const

const LANG_LABEL_MAP: Record<string, string> = {
  Chinese: '中文',
  English: 'English',
  Japanese: '日本語',
  Korean: '한국어',
  French: 'Français',
  German: 'Deutsch',
}

// ============ 工具函数 ============

/** 使用共享分段器，前后端一致 */
const splitContent = splitIntoParagraphs

// ============ 新标签翻译子组件 ============

interface NewTabTranslationProps {
  originalParagraphs: string[]
  translations: string[]
  translateLoading: boolean
  targetLang: string
  darkMode: boolean
  onClose: () => void
}

/** 新标签模式：左侧原文 + 右侧译文分开两栏，段落级流式展示 */
function NewTabTranslation({
  originalParagraphs,
  translations,
  translateLoading,
  targetLang,
  darkMode,
  onClose
}: NewTabTranslationProps) {
  const proseCls = darkMode ? 'prose-invert' : 'prose-gray'
  const [dividerPos, setDividerPos] = useState(50)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback(() => { isDragging.current = true }, [])

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

  const langLabel = LANG_LABEL_MAP[targetLang] || targetLang

  return (
    <div className="flex" style={{ minHeight: 400 }}>
      {/* 左侧：原文 */}
      <div className="overflow-y-auto" style={{ width: `${dividerPos}%`, paddingRight: 12, maxHeight: 'calc(100vh - 220px)' }}>
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm pb-2 mb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5">
            <BookOpen size={13} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">原文</span>
          </div>
        </div>
        <div className="space-y-4">
          {originalParagraphs.map((para, idx) => (
            <div key={idx} className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{para}</ReactMarkdown>
            </div>
          ))}
        </div>
      </div>

      {/* 拖拽分隔条 */}
      <div
        onMouseDown={handleMouseDown}
        style={{ width: 6, cursor: 'col-resize', background: '#e5e7eb', flexShrink: 0, borderRadius: 3 }}
        className="hover:bg-blue-400 transition-colors self-stretch"
      />

      {/* 右侧：译文 */}
      <div className="overflow-y-auto" style={{ width: `${100 - dividerPos}%`, paddingLeft: 12, maxHeight: 'calc(100vh - 220px)' }}>
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm pb-2 mb-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Languages size={13} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              {langLabel} 译文
            </span>
            {translateLoading && <Loader size={12} className="animate-spin text-blue-400 ml-1" />}
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          >
            <X size={12} />
            关闭
          </button>
        </div>
        <div className="space-y-6">
          {originalParagraphs.map((_para, idx) => (
            <div key={idx}>
              {translations[idx] ? (
                <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {translations[idx]}
                  </ReactMarkdown>
                </div>
              ) : translateLoading ? (
                <div className="text-xs text-gray-400 py-1">翻译中...</div>
              ) : (
                <div className="text-xs text-gray-300">-</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
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
    themeMode,
    systemPrefersDark,
    setReaderMode,
    // LLM 摘要（来自 HEAD）
    summaryStream,
    summaryLoading,
    // LLM 翻译增强（来自远程）
    translateLoading,
    paragraphTranslations,
    displayMode,
    setDisplayMode,
    translateTargetLang,
    setTranslateTargetLang,
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
    setError,
    // 字体设置
    readerFontFamily,
    readerFontSize,
    setReaderFontFamily,
    setReaderFontSize
  } = useStore()

  // ============ 本地状态 ============

  const [showFontPicker, setShowFontPicker] = useState(false)

  const [showSummaryLangPicker, setShowSummaryLangPicker] = useState(false)
  const [showTranslateLangPicker, setShowTranslateLangPicker] = useState(false)
  const [selectedSummaryLang, setSelectedSummaryLang] = useState('Chinese')
  const [selectedTargetLang, setSelectedTargetLang] = useState('Chinese')
  const [summaryDetailLevel, setSummaryDetailLevel] = useState<'compact' | 'medium' | 'detailed'>('medium')

  // 摘要面板宽度
  const [summaryPanelWidth, setSummaryPanelWidth] = useState(35)
  const [summaryLangLabel, setSummaryLangLabel] = useState('')
  const isSummaryDragging = useRef(false)

  // 翻译分界线
  const [dividerPos, setDividerPos] = useState(50)
  const isDragging = useRef(false)

  // ============ 计算属性 ============

  const selectedArticle = articles.find(a => a.id === selectedArticleId)
  const originalParagraphs = articleContent ? splitContent(articleContent) : []

  /** 推导实际暗色状态（与 App.tsx 同步） */
  const darkMode = useMemo(() => {
    if (themeMode === 'dark') return true
    if (themeMode === 'light') return false
    return systemPrefersDark
  }, [themeMode, systemPrefersDark])

  // ============ 副作用 ============

  const translatingRef = useRef(false)
  const selectedArticleIdRef = useRef(selectedArticleId)
  const translateTargetLangRef = useRef('Chinese')
  const summaryTargetLangRef = useRef('Chinese')
  const summaryDetailLevelRef = useRef<'compact' | 'medium' | 'detailed'>('medium')

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
            // 同时更新 articles 数组的 summary 和 translations._summary，供缓存命中
            useStore.setState(state => {
              const targetArticle = state.articles.find(a => a.id === chunk.articleId)
              const existingTrans: Record<string, unknown> = targetArticle?.translations
                ? JSON.parse(targetArticle.translations)
                : {}
              existingTrans._summary = { text: chunk.fullText, lang: summaryTargetLangRef.current }
              return {
                articles: state.articles.map(a =>
                  a.id === chunk.articleId
                    ? { ...a, summary: chunk.fullText, translations: JSON.stringify(existingTrans) }
                    : a
                )
              }
            })
          }
          else if ('message' in chunk) { setError(chunk.message); setSummaryLoading(false) }
        } else if (chunk.type === 'translateParagraph') {
          if (chunk.articleId !== selectedArticleIdRef.current) return
          if (!translatingRef.current) return
          const idx = chunk.paragraphIndex ?? 0
          if ('delta' in chunk) {
            appendParagraphTranslation(idx, chunk.delta)
          } else if ('fullText' in chunk) {
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
          } else if ('message' in chunk) {
            appendParagraphTranslation(idx, `[错误] ${chunk.message}`)
          }
        } else if (chunk.type === 'translateComplete') {
          if (chunk.articleId !== selectedArticleIdRef.current) return
          // 段落翻译全部完成
          setTranslateLoading(false)
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

  // 切换文章时重置翻译状态（包括 loading，防止旧文章翻译污染新文章）
  useEffect(() => {
    translatingRef.current = false
    resetTranslate()
    resetParagraphTranslations()
    setTranslateMode('original')
    setTranslateLoading(false)
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

    // 缓存命中检查：translations._summary 存储了已生成的 AI 摘要 + 语言
    if (selectedArticle.translations) {
      try {
        const transMap: Record<string, unknown> = JSON.parse(selectedArticle.translations)
        const cached = transMap._summary as { text: string; lang: string } | undefined
        if (cached && cached.text && cached.lang === targetLang) {
          // 命中缓存：直接恢复摘要，不调用 API
          resetSummary()
          setSummarizingArticleId(selectedArticleId)
          setSummaryLangLabel(LANG_LABEL_MAP[targetLang] || targetLang)
          // 逐字恢复（模拟流式，也可直接 setState）
          useStore.setState({ summaryStream: cached.text })
          return
        }
      } catch { /* JSON 解析失败，走 API 生成 */ }
    }

    summaryTargetLangRef.current = targetLang
    summaryDetailLevelRef.current = summaryDetailLevel
    resetSummary()
    setSummarizingArticleId(selectedArticleId)
    setSummaryLoading(true)
    setSummaryLangLabel(LANG_LABEL_MAP[targetLang] || targetLang)
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c) { setError('文章无内容'); setSummaryLoading(false); return }
      await window.api.summarize(selectedArticleId, c, selectedArticle.title, targetLang, summaryDetailLevel)
    } catch (err) {
      setError(String(err))
      setSummaryLoading(false)
    }
  }, [selectedArticleId, selectedArticle, articleContent, summaryLoading, summaryDetailLevel])

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
    // 需要验证缓存的版本号和段落数是否匹配
    if (selectedArticle.translations) {
      try {
        const transMap: Record<string, unknown> = JSON.parse(selectedArticle.translations)
        // ★ 版本号校验：旧版缓存绝不使用
        if (transMap._v !== 2) { /* 旧缓存，忽略 */ }
        else {
          const cached = transMap[targetLang]
          if (Array.isArray(cached) && cached.length > 0) {
            const currentParagraphs = splitContent(articleContent || selectedArticle.summary || '')
            if (cached.length === currentParagraphs.length) {
              useStore.setState({ paragraphTranslations: cached })
              return
            }
          }
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
      // 注意：IPC 立即返回 {success:true}，实际翻译通过流式回调进行
      // translateLoading 由流式回调中的 translateComplete 事件关闭
      await window.api.translateParagraphs(selectedArticleId, c, selectedArticle.title, targetLang)
    } catch (err) {
      setError(String(err))
      setTranslateLoading(false)
    }
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
      <div className={`prose prose-sm ${darkMode ? 'prose-invert' : 'prose-gray'} max-w-none leading-relaxed`}>
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

  /** 是否有译文内容（翻译完成后） */
  const hasTranslation = paragraphTranslations.some(t => t && t.trim())
  /** 是否处于翻译状态中（用户点击翻译 → 翻译全部完成） */
  const isTranslating = translateLoading || hasTranslation
  const hasSummary = summarizingArticleId === selectedArticleId && summaryStream.trim()

  // 翻译/阅读区样式（跟随全局 darkMode）
  const proseCls = darkMode ? 'prose-invert' : 'prose-gray'
  const containerBg = darkMode ? 'bg-gray-900' : 'bg-white'

  return (
    <div className="reader-view flex" style={{ height: '100%', overflow: 'hidden' }}>
      {/* 左侧主区域 */}
      <div
        className={containerBg}
        style={{
          width: hasSummary ? `${100 - summaryPanelWidth}%` : '100%',
          overflowY: 'auto',
          paddingRight: hasSummary ? 12 : 0,
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
                  className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-52 overflow-hidden"
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
                  {/* 摘要详细程度 */}
                  <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">详细程度</span>
                    <div className="flex gap-1 mt-1.5">
                      {(['compact', 'medium', 'detailed'] as const).map(level => (
                        <button
                          key={level}
                          onClick={(e) => { e.stopPropagation(); setSummaryDetailLevel(level) }}
                          className={`flex-1 py-1 text-[11px] rounded transition-colors
                            ${summaryDetailLevel === level
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium'
                              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                            }`}
                        >
                          {level === 'compact' ? '精简' : level === 'medium' ? '标准' : '详细'}
                        </button>
                      ))}
                    </div>
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
            ) : translateLoading ? (
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
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-blue-500 dark:text-blue-400">
                  <Loader size={12} className="animate-spin" />
                  翻译中...
                </div>
                <button
                  onClick={handleBackToOriginal}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                  停止
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
                            setTranslateTargetLang(l.value)
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

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* ===== 字体控制 ===== */}
            {/* 字号缩小 */}
            <button
              onClick={() => setReaderFontSize(Math.max(FONT_SIZE_MIN, readerFontSize - FONT_SIZE_STEP))}
              disabled={readerFontSize <= FONT_SIZE_MIN}
              className="flex items-center justify-center w-7 h-7 rounded text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="缩小字号"
            >
              <Minus size={12} />
            </button>

            {/* 当前字号显示 */}
            <span
              className="text-xs font-medium text-gray-600 dark:text-gray-300 min-w-[28px] text-center select-none cursor-default"
              title="阅读字号"
            >
              {readerFontSize}
            </span>

            {/* 字号放大 */}
            <button
              onClick={() => setReaderFontSize(Math.min(FONT_SIZE_MAX, readerFontSize + FONT_SIZE_STEP))}
              disabled={readerFontSize >= FONT_SIZE_MAX}
              className="flex items-center justify-center w-7 h-7 rounded text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="放大字号"
            >
              <Plus size={12} />
            </button>

            {/* 字体选择 */}
            <div className="relative">
              <button
                onClick={() => setShowFontPicker(!showFontPicker)}
                className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                title="选择字体"
              >
                <Type size={13} />
                {FONT_FAMILIES.find(f => f.value === readerFontFamily)?.label || '字体'}
                <ChevronDown size={10} />
              </button>
              {showFontPicker && (
                <div
                  className="absolute bottom-full right-0 mb-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-40 overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">选择字体</span>
                  </div>
                  <div className="py-1">
                    {FONT_FAMILIES.map(f => (
                      <button
                        key={f.value}
                        onClick={() => { setReaderFontFamily(f.value); setShowFontPicker(false) }}
                        className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors
                          ${readerFontFamily === f.value
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'
                          }`}
                        style={{ fontFamily: f.value }}
                      >
                        <span>{f.label}</span>
                        {readerFontFamily === f.value && <Check size={12} className="text-amber-500 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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

          {/* 关闭弹出选择器的遮罩 */}
          {(showSummaryLangPicker || showTranslateLangPicker || showFontPicker) && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => { setShowSummaryLangPicker(false); setShowTranslateLangPicker(false); setShowFontPicker(false) }}
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

          {/* ===== 翻译中 Banner — 整个翻译过程持续显示 ===== */}
          {translateLoading && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div className="flex items-center gap-3">
                <Loader size={20} className="animate-spin text-blue-500" />
                <div>
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    🌐 AI 翻译进行中...
                  </div>
                  <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
                    正在逐段翻译 {originalParagraphs.length} 个段落，请稍候
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== 内容主体 ===== */}
          {!isLoading && (
            <div
              style={{
                fontFamily: readerFontFamily,
                fontSize: `${readerFontSize}px`,
              }}
            >
              {/* 覆盖模式 */}
              {displayMode === 'replace' && isTranslating && (
                <div className="space-y-4">
                  {paragraphTranslations.map((html, idx) => (
                    <div
                      key={idx}
                      className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}
                      dangerouslySetInnerHTML={{ __html: html || '' }}
                    />
                  ))}
                </div>
              )}

              {/* 左右对照模式 */}
              {displayMode === 'sideBySide' && isTranslating && (
                <div className="space-y-6">
                  {originalParagraphs.map((para: string, idx: number) => (
                    <div key={idx} style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                      <div style={{ width: `${dividerPos}%`, paddingRight: 12 }}>
                        <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
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
                          <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
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

              {/* 上下对照模式 — 带边框盒子样式 */}
              {displayMode === 'topBottom' && isTranslating && (
                <div className="space-y-6">
                  {originalParagraphs.map((para: string, idx: number) => (
                    <div key={idx}>
                      <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {para}
                        </ReactMarkdown>
                      </div>
                      {paragraphTranslations[idx] ? (
                        <div className="mt-3 border-2 border-blue-300 dark:border-blue-600 rounded-lg overflow-hidden">
                          <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 flex items-center gap-1.5 border-b border-blue-200 dark:border-blue-700">
                            <span className="text-xs">🌐</span>
                            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                              {LANG_LABEL_MAP[translateTargetLangRef.current] || '译文'}
                            </span>
                          </div>
                          <div className="bg-blue-50/30 dark:bg-blue-900/5 px-4 py-3">
                            <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed text-sm`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {paragraphTranslations[idx]}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      ) : translateLoading ? (
                        <div className="mt-3 border-2 border-blue-200 dark:border-blue-700 rounded-lg overflow-hidden">
                          <div className="bg-blue-50 dark:bg-blue-900/10 px-3 py-1.5 flex items-center gap-1.5 border-b border-blue-100 dark:border-blue-800">
                            <span className="text-xs">🌐</span>
                            <span className="text-[11px] font-medium text-blue-400">
                              {LANG_LABEL_MAP[translateTargetLangRef.current] || '译文'}
                            </span>
                            <Loader size={10} className="animate-spin text-blue-400 ml-1" />
                          </div>
                          <div className="bg-blue-50/20 dark:bg-blue-900/5 px-4 py-3 text-xs text-gray-400">
                            翻译中...
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {/* 新标签模式 — 右侧新开一栏展示译文 */}
              {displayMode === 'newTab' && isTranslating && (
                <NewTabTranslation
                  originalParagraphs={originalParagraphs}
                  translations={paragraphTranslations}
                  translateLoading={translateLoading}
                  targetLang={translateTargetLangRef.current}
                  darkMode={darkMode}
                  onClose={handleBackToOriginal}
                />
              )}

              {/* 无翻译且不在翻译中时显示原文（reader 或 original 模式） */}
              {!isTranslating && (
                <div className={`rounded-lg p-6 ${containerBg}`}>
                  {readerMode === 'reader' ? renderMarkdownContent() : renderOriginalContent()}
                </div>
              )}
            </div>
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
          <div className={containerBg} style={{ width: `${summaryPanelWidth}%`, overflowY: 'auto', paddingLeft: 12 }}>
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm pb-2 mb-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-purple-500" />
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                    AI 摘要{summaryLangLabel ? ` (${summaryLangLabel}${summaryDetailLevelRef.current === 'compact' ? '·精简' : summaryDetailLevelRef.current === 'detailed' ? '·详细' : ''})` : ''}
                  </span>
                  {summaryLoading && <Loader size={12} className="animate-spin text-purple-400 ml-1" />}
                </div>
                <button
                  onClick={resetSummary}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="关闭摘要面板"
                >
                  <X size={12} />
                </button>
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