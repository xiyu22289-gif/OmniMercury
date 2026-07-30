import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import {
  Globe, ExternalLink, Sparkles, Languages, Loader, Settings,
  Check, Columns, AlignJustify, Replace, X,
  BookOpen, Monitor, Type, Minus, Plus, ChevronDown, Tag, Zap, Square, CheckSquare, Loader2, PenLine, Download,
  Search, ArrowUp, ArrowDown, Keyboard
} from 'lucide-react'
import NotesPanel from './NotesPanel'
import ResizeHandle from './ResizeHandle'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError, LlmErrorType } from '../../shared/types'
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

// ============ 安全图片组件 ============

/**
 * 包装 <img>，提供：
 * 1. 相对路径补全为绝对 URL
 * 2. 加载失败时显示文字占位符（避免破损图标）
 * 3. 懒加载 + referrer 策略（避免跨域防盗链）
 */
function SafeImage({ src, alt, baseUrl }: { src?: string; alt?: string; baseUrl?: string | null }) {
  const [error, setError] = useState<string | false>(false)

  const resolvedSrc = useMemo(() => {
    if (!src) return src
    if (/^https?:\/\//i.test(src)) return src
    if (src.startsWith('//')) return 'https:' + src
    if (baseUrl && (src.startsWith('/') || !src.startsWith('http'))) {
      try {
        return new URL(src, baseUrl).href
      } catch { /* fall through */ }
    }
    return src
  }, [src, baseUrl])

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 my-2 text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
        <span className="truncate max-w-[200px]">{alt || src?.slice(-30) || '图片加载失败'}</span>
      </span>
    )
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt || ''}
      onError={() => setError(true)}
      className="max-w-full h-auto rounded my-2"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  )
}

// ============ 常量 ============

const rehypePlugins = [rehypeRaw, rehypeHighlight] as const

const LANG_OPTIONS = [
  { value: 'Chinese', label: '中文' },
  { value: 'English', label: 'English' },
  { value: 'Japanese', label: '日本語' },
  { value: 'Korean', label: '한국어' },
  { value: 'French', label: 'Français' },
  { value: 'German', label: 'Deutsch' },
]

const DISPLAY_MODES = [
  { value: 'replace' as const, icon: Replace },
  { value: 'sideBySide' as const, icon: Columns },
  { value: 'topBottom' as const, icon: AlignJustify },
  { value: 'newTab' as const, icon: Monitor },
] as const

/** 显示模式 label 映射（用于 i18n） */
const DISPLAY_MODE_LABEL_KEYS: Record<string, string> = {
  replace: 'reader.cover',
  sideBySide: 'reader.sideBySide',
  topBottom: 'reader.topBottom',
  newTab: 'reader.newTab',
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

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
  const { t } = useTranslation()
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
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('reader.originalText')}</span>
          </div>
        </div>
        <div className="space-y-4">
          {originalParagraphs.map((para, idx) => (
            <div key={idx} className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>{para}</ReactMarkdown>
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
              {langLabel} {t('reader.translatedFrom')}
            </span>
            {translateLoading && <Loader size={12} className="animate-spin text-blue-400 ml-1" />}
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          >
            <X size={12} />
            {t('reader.close')}
          </button>
        </div>
        <div className="space-y-6">
          {originalParagraphs.map((_para, idx) => (
            <div key={idx}>
              {translations[idx] ? (
                <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
                    {translations[idx]}
                  </ReactMarkdown>
                </div>
              ) : translateLoading ? (
                <div className="text-xs text-gray-400 py-1">{t('reader.translating')}</div>
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
  const { t } = useTranslation()
  const {
    // 文章状态
    selectedArticleId,
    articleContent,
    articles,
    isLoading,
    error,
    sidebarOpen,
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
    setReaderFontSize,
    // M5 标签系统
    tags,
    articleTagsMap,
    fetchArticleTags,
    fetchTags,
    toggleArticleTag,
    batchAddTagsToArticle,
    // 笔记
    notePanelOpen,
    // 选择文本翻译
    selectionOriginal,
    selectionTranslation,
    selectionTranslateLoading,
    appendSelectionDelta,
    resetSelectionTranslation,
    setSelectionTranslateLoading,
    setSelectionOriginal,
    // 选择段落摘要
    selectedParagraphIndices,
    selectionSummary,
    selectionSummaryLoading,
    toggleSelectedParagraph,
    clearSelectedParagraphs,
    setSelectionSummary,
    setSelectionSummaryLoading,
  } = useStore()

  // ============ 本地状态 ============

  const [showFontPicker, setShowFontPicker] = useState(false)
  const fontBtnRef = useRef<HTMLButtonElement>(null)
  const [fontPickerPos, setFontPickerPos] = useState<{ top: number; left: number } | null>(null)
  const [showTagPicker, setShowTagPicker] = useState(false)
  // 多选模式：选中的标签 ID 集合
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())
  // 颜色编辑状态：{ tagId: showColorPicker }
  const [editingTagColor, setEditingTagColor] = useState<number | null>(null)
  // 快速创建标签
  const [quickCreateName, setQuickCreateName] = useState('')
  const [quickCreateColor, setQuickCreateColor] = useState('#3b82f6')
  // AI 推荐
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [aiCheckedNames, setAiCheckedNames] = useState<Set<string>>(new Set())

  // LLM 错误详情（用于显示错误类型标签、URL、位置等上下文信息）
  const [errorDetail, setErrorDetail] = useState<{ errorType: LlmErrorType; url?: string; position?: number; context?: string; statusCode?: number } | null>(null)

  const [showSummaryLangPicker, setShowSummaryLangPicker] = useState(false)
  const [showTranslateLangPicker, setShowTranslateLangPicker] = useState(false)
  const [selectedSummaryLang, setSelectedSummaryLang] = useState('Chinese')
  const [selectedTargetLang, setSelectedTargetLang] = useState('Chinese')
  const [summaryDetailLevel, setSummaryDetailLevel] = useState<'compact' | 'medium' | 'detailed'>('medium')

  // 摘要面板宽度
  const [summaryPanelWidth, setSummaryPanelWidth] = useState(35)
  const [summaryLangLabel, setSummaryLangLabel] = useState('')
  const isSummaryDragging = useRef(false)

  // 笔记面板宽度
  const [notePanelWidth, setNotePanelWidth] = useState(30)

  // 翻译分界线
  const [dividerPos, setDividerPos] = useState(50)
  const isDragging = useRef(false)

  // ============ 文章内搜索 ============
  const [inArticleSearch, setInArticleSearch] = useState('')
  const [showInArticleSearch, setShowInArticleSearch] = useState(false)
  const [currentHitIndex, setCurrentHitIndex] = useState(0)
  const inArticleSearchRef = useRef<HTMLInputElement>(null)

  /** 计算所有匹配位置（段落索引 + 段落内偏移），用于高亮 + 跳转 */
  const searchHits = useMemo(() => {
    if (!inArticleSearch.trim() || !articleContent) return [] as { paraIdx: number; offset: number }[]
    const query = inArticleSearch.trim()
    const lowerQ = query.toLowerCase()
    const hits: { paraIdx: number; offset: number }[] = []
    const paras = splitContent(articleContent)
    for (let i = 0; i < paras.length; i++) {
      const lower = paras[i].toLowerCase()
      let idx = 0
      while ((idx = lower.indexOf(lowerQ, idx)) !== -1) {
        hits.push({ paraIdx: i, offset: idx })
        idx += query.length
      }
    }
    return hits
  }, [inArticleSearch, articleContent])

  /** 高亮搜索词的段落渲染函数 */
  const renderParagraphWithHighlights = useCallback((para: string, paraIdx: number) => {
    if (!inArticleSearch.trim()) {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>{para}</ReactMarkdown>
      )
    }

    const query = inArticleSearch.trim()
    // 使用 mark 标签包裹匹配词（带唯一 id 用于跳转）
    const hitsInThisPara = searchHits.filter(h => h.paraIdx === paraIdx)
    if (hitsInThisPara.length === 0) {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>{para}</ReactMarkdown>
      )
    }

    // 按偏移量从后往前替换（避免索引偏移）
    let result = para
    const sorted = [...hitsInThisPara].sort((a, b) => b.offset - a.offset)
    for (const hit of sorted) {
      const globalIdx = searchHits.findIndex(h => h.paraIdx === hit.paraIdx && h.offset === hit.offset)
      const matched = result.slice(hit.offset, hit.offset + query.length)
      result = result.slice(0, hit.offset) +
        `<mark id="search-hit-${globalIdx}" class="bg-yellow-300 dark:bg-yellow-700 rounded px-0.5 scroll-mt-20">${matched}</mark>` +
        result.slice(hit.offset + query.length)
    }

    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>{result}</ReactMarkdown>
    )
  }, [inArticleSearch, searchHits])

  /** 跳转到第 N 个匹配 */
  const scrollToHit = useCallback((idx: number) => {
    if (searchHits.length === 0) return
    const clamped = Math.max(0, Math.min(idx, searchHits.length - 1))
    setCurrentHitIndex(clamped)
    const el = document.getElementById(`search-hit-${clamped}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchHits.length])

  /** Ctrl+F 快捷键打开/关闭文章内搜索 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        if (isEditing) return
        setShowInArticleSearch(prev => {
          if (!prev) {
            // 等待 React 渲染并挂载 DOM 后再聚焦
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                inArticleSearchRef.current?.focus()
              })
            })
          }
          return !prev
        })
      }
      if (e.key === 'Escape') {
        setShowInArticleSearch(false)
        setInArticleSearch('')
        setCurrentHitIndex(0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ============ 选择段落摘要 ============
  const originalParagraphsIndexRef = useRef(0)
  const selectionSummaryAnchorRef = useRef<HTMLDivElement | null>(null)
  const [showSelectSummaryBar, setShowSelectSummaryBar] = useState(false)
  const [selectSummaryLang, setSelectSummaryLang] = useState('Chinese')
  const [selectSummaryDetail, setSelectSummaryDetail] = useState<'compact' | 'medium' | 'detailed'>('medium')

  /** 生成选中段落摘要 */
  const handleSelectiveSummarize = useCallback(async () => {
    if (!selectedArticleId || selectionSummaryLoading) return
    const c = useStore.getState().articleContent || ''
    const paras = splitContent(c)
    const indices = [...selectedParagraphIndices].sort((a, b) => a - b)
    if (indices.length === 0) return
    const selected = indices.map(i => paras[i]).filter(Boolean)
    if (selected.length === 0) return
    const art = useStore.getState().articles.find(a => a.id === selectedArticleId)
    if (!art) return
    setSelectionSummary('')
    setSelectionSummaryLoading(true)
    // 插入锚点到最后选中段落之后
    const lastIdx = indices[indices.length - 1]
    const anchor = document.createElement('div')
    anchor.id = '__selection_summary_anchor__'
    const paraNodes = readingAreaRef.current?.querySelectorAll('[data-para-index]') || []
    const target = paraNodes[lastIdx] as HTMLElement | undefined
    if (target) {
      target.parentNode?.insertBefore(anchor, target.nextSibling)
    } else {
      readingAreaRef.current?.appendChild(anchor)
    }
    selectionSummaryAnchorRef.current = anchor
    try {
      await window.api.summarizeSelection(selectedArticleId, art.title, selected, selectSummaryLang, selectSummaryDetail)
    } catch (err) {
      setError(String(err))
      setSelectionSummaryLoading(false)
    }
  }, [selectedArticleId, selectedParagraphIndices, selectionSummaryLoading, selectSummaryLang, selectSummaryDetail, setSelectionSummaryLoading, setSelectionSummary])

  /** 导出选中段落摘要 */
  const handleExportSelectSummary = useCallback(async () => {
    const art = useStore.getState().articles.find(a => a.id === selectedArticleId)
    if (!selectionSummary || !art) return
    try {
      const res = await window.api.exportSummaryMd(art.title, selectionSummary)
      if (!res.success && res.error) setError(String(res.error))
    } catch (err) {
      setError(String(err))
    }
  }, [selectionSummary, selectedArticleId])

  /** 清除选中段落和摘要 */
  const handleClearSelectSummary = useCallback(() => {
    clearSelectedParagraphs()
    setSelectionSummary('')
    setSelectionSummaryLoading(false)
    setShowSelectSummaryBar(false)
    if (selectionSummaryAnchorRef.current) {
      selectionSummaryAnchorRef.current.remove()
      selectionSummaryAnchorRef.current = null
    }
  }, [clearSelectedParagraphs, setSelectionSummaryLoading, setSelectionSummary])

  // 监听选中段落变化
  useEffect(() => {
    setShowSelectSummaryBar(selectedParagraphIndices.size > 0)
  }, [selectedParagraphIndices.size])

  // ============ 选中文本翻译：React Portal 浮动按钮 ============
  const readingAreaRef = useRef<HTMLDivElement>(null)
  const selectionTargetLangRef = useRef('Chinese')
  const selectedTextRef = useRef('')
  const [floatBtnPos, setFloatBtnPos] = useState<{ top: number; left: number } | null>(null)
  const [showFloatBtn, setShowFloatBtn] = useState(false)
  /** ★ 翻译结果锚点：插入在选中文本正下方 */
  const selectionResultAnchorRef = useRef<HTMLDivElement | null>(null)

  /** mouseup 监听 → React state 控制浮动按钮（仅限阅读区域） */
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!text || !sel || sel.isCollapsed) { setShowFloatBtn(false); selectedTextRef.current = ''; return }
      // 边界检查：选区必须在阅读区域内（readingAreaRef 或新标签翻译容器）
      const area = readingAreaRef.current
      if (!area) { setShowFloatBtn(false); selectedTextRef.current = ''; return }
      const target = e.target as Node | null
      const inReadingArea = target && (area.contains(target) || document.getElementById('new-tab-translation-root')?.contains(target) || document.getElementById('translation-output-area')?.contains(target))
      if (!inReadingArea) { setShowFloatBtn(false); selectedTextRef.current = ''; return }
      try {
        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        selectedTextRef.current = text
        setFloatBtnPos({ top: rect.bottom + 8, left: rect.left })
        setShowFloatBtn(true)
      } catch {
        setShowFloatBtn(false)
        selectedTextRef.current = ''
      }
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  /** 触发翻译 — surroundContents 包裹高亮（不破坏 DOM 结构）+ 锚点 */
  const triggerSelectiveTranslate = useCallback((targetLang: string) => {
    const currentId = selectedArticleIdRef.current
    const text = selectedTextRef.current.trim()
    if (!currentId || !text || selectionTranslateLoading) return
    setShowFloatBtn(false)
    selectedTextRef.current = ''
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) {
      try {
        const r = sel.getRangeAt(0)
        const mark = document.createElement('mark')
        mark.style.cssText = 'background:#bfdbfe;color:inherit;border-radius:2px;'
        mark.className = '__selection_highlight__'
        // surroundContents 包裹选区（不破坏 DOM 树结构）
        try {
          r.surroundContents(mark)
        } catch {
          // 降级到 extractContents
          const contents = r.extractContents()
          mark.appendChild(contents)
          r.insertNode(mark)
        }
        // 锚点插入 mark 之后
        const anchor = document.createElement('div')
        anchor.id = '__selection_result_anchor__'
        mark.parentNode?.insertBefore(anchor, mark.nextSibling)
        selectionResultAnchorRef.current = anchor
      } catch { /* 跨节点选区失败则静默 */ }
    }
    selectionTargetLangRef.current = targetLang
    setSelectionOriginal(text)
    resetSelectionTranslation()
    setSelectionTranslateLoading(true)
    window.api.translateSelection(currentId, text, targetLang).catch(err => {
      setError(String(err))
      setSelectionTranslateLoading(false)
    })
  }, [selectionTranslateLoading])

  const handleDismissSelectionTranslate = useCallback(() => {
    // 移除高亮 mark 标签
    document.querySelectorAll('.__selection_highlight__').forEach(mark => {
      const parent = mark.parentNode
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark)
        }
        parent.removeChild(mark)
      }
    })
    // 移除锚点 DOM
    if (selectionResultAnchorRef.current) {
      selectionResultAnchorRef.current.remove()
      selectionResultAnchorRef.current = null
    }
    resetSelectionTranslation()
    setSelectionTranslateLoading(false)
  }, [resetSelectionTranslation, setSelectionTranslateLoading])

  // ============ 计算属性 ============

  /** 是否有译文内容（翻译完成后） */
  const hasTranslation = paragraphTranslations.some(t => t && t.trim())
  /** 是否处于翻译状态中（用户点击翻译 → 翻译全部完成） */
  const isTranslating = translateLoading || hasTranslation
  const hasSummary = summarizingArticleId === selectedArticleId && summaryStream.trim()

  const selectedArticle = articles.find(a => a.id === selectedArticleId)

  // ★ 提取文章的基础 URL，用于解析相对路径的图片链接
  const articleBaseUrl = useMemo(() => {
    if (!selectedArticle?.url) return null
    try {
      const u = new URL(selectedArticle.url)
      return u.origin
    } catch {
      return null
    }
  }, [selectedArticle?.url])

  /** markdownComponents — 使用 articleBaseUrl 闭包传递给 SafeImage */
  const markdownComponents = useMemo(() => ({
    img: (props: any) => <SafeImage {...props} baseUrl={articleBaseUrl} />,
    a: ({ href, children, ...props }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-blue-600 dark:text-blue-400 underline decoration-blue-300 dark:decoration-blue-700 hover:decoration-blue-500 transition-colors"
        {...props}
      >
        {children}
      </a>
    ),
  }), [articleBaseUrl])

  /** 翻译开始时锁定的原始段落，确保原文和译文一一对应（必须在 originalParagraphs 之前声明） */
  const frozenOriginalParagraphsRef = useRef<string[]>([])

  // ★ 翻译中使用冻结的原始段落，确保与译文一一对应
  const originalParagraphs = isTranslating && frozenOriginalParagraphsRef.current.length > 0
    ? frozenOriginalParagraphsRef.current
    : (articleContent ? splitContent(articleContent) : [])

  /** 推导实际暗色状态（与 App.tsx 同步） */
  const darkMode = useMemo(() => {
    if (themeMode === 'dark') return true
    if (themeMode === 'light') return false
    return systemPrefersDark
  }, [themeMode, systemPrefersDark])

  // 标签系统计算值
  const articleTags = selectedArticleId ? (articleTagsMap[selectedArticleId] || []) : []

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
              existingTrans._summary = { text: chunk.fullText, lang: summaryTargetLangRef.current, detailLevel: summaryDetailLevelRef.current }
              return {
                articles: state.articles.map(a =>
                  a.id === chunk.articleId
                    ? { ...a, summary: chunk.fullText, translations: JSON.stringify(existingTrans) }
                    : a
                )
              }
            })
          }
          else if ('message' in chunk) {
            setError(chunk.message); setSummaryLoading(false)
            if (chunk.detail) setErrorDetail(chunk.detail)
          }
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
              const existing: Record<string, unknown> = targetArticle.translations
                ? JSON.parse(targetArticle.translations)
                : {}
              existing._v = 2
              const paras = [...((existing[lang] as string[]) || [])]
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
          else if ('message' in chunk) { setError(chunk.message); setTranslateLoading(false); if (chunk.detail) setErrorDetail(chunk.detail) }
        } else if (chunk.type === 'selectiveTranslate') {
          if (chunk.articleId !== selectedArticleIdRef.current) return
          if ('delta' in chunk) appendSelectionDelta(chunk.delta)
          else if ('fullText' in chunk) {
            setSelectionTranslateLoading(false)
          }
          else if ('message' in chunk) { setError(chunk.message); setSelectionTranslateLoading(false); if (chunk.detail) setErrorDetail(chunk.detail) }
        } else if (chunk.type === 'selectiveSummarize') {
          if (chunk.articleId !== selectedArticleIdRef.current) return
          if ('delta' in chunk) {
            useStore.setState(state => ({ selectionSummary: state.selectionSummary + chunk.delta }))
          } else if ('fullText' in chunk) {
            setSelectionSummaryLoading(false)
          }
          else if ('message' in chunk) { setError(chunk.message); setSelectionSummaryLoading(false); if (chunk.detail) setErrorDetail(chunk.detail) }
        }
      })
    }

    return () => { cleanup?.() }
  }, [])

  // 切换文章时重置翻译状态 + 拉取文章标签 + 清除段落选中
  useEffect(() => {
    translatingRef.current = false
    resetTranslate()
    resetParagraphTranslations()
    setTranslateMode('original')
    setTranslateLoading(false)
    clearSelectedParagraphs()
    setSelectionSummary('')
    setSelectionSummaryLoading(false)
    // 清除 DOM 残留
    document.querySelectorAll('.__selection_highlight__').forEach(mark => {
      const p = mark.parentNode
      if (p) { while (mark.firstChild) p.insertBefore(mark.firstChild, mark); p.removeChild(mark) }
    })
    document.querySelectorAll('#__selection_result_anchor__, #__selection_summary_anchor__').forEach(el => el.remove())
    selectionResultAnchorRef.current = null
    selectionSummaryAnchorRef.current = null
    // 拉取当前文章的标签
    if (selectedArticleId) {
      fetchArticleTags(selectedArticleId)
    }
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
        const cached = transMap._summary as { text: string; lang: string; detailLevel?: string } | undefined
        if (cached && cached.text && cached.lang === targetLang && (cached.detailLevel || 'medium') === summaryDetailLevel) {
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

  /** 打开标签选择面板时，初始化选中状态为当前已有标签 */
  const openTagPicker = useCallback(() => {
    const currentIds = new Set((articleTagsMap[selectedArticleId!] || []).map(t => t.id))
    setSelectedTagIds(currentIds)
    setAiSuggestions([])
    setQuickCreateName('')
    setShowTagPicker(true)
  }, [selectedArticleId, articleTagsMap])

  /** 切换单个标签的选中状态（不提交） */
  const toggleTagSelection = useCallback((tagId: number) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }, [])

  /** 修改标签颜色 */
  const handleChangeTagColor = useCallback(async (tagId: number, color: string) => {
    const tag = tags.find(t => t.id === tagId)
    if (!tag) return
    try {
      await useStore.getState().updateTag(tagId, tag.name, color)
      setEditingTagColor(null)
    } catch (err) {
      console.error('[ReaderView] 修改标签颜色失败：', err)
    }
  }, [tags])

  /** 删除标签（含确认） */
  const handleDeleteTag = useCallback(async (tagId: number) => {
    const tag = tags.find(t => t.id === tagId)
    if (!tag) return
    if (!window.confirm(`确定要删除标签「${tag.name}」吗？该标签将从所有文章中移除。`)) return
    try {
      await useStore.getState().deleteTag(tagId)
      // 从选中列表中移除
      setSelectedTagIds(prev => {
        const next = new Set(prev)
        next.delete(tagId)
        return next
      })
      // 如果当前文章已有此标签，刷新显示
      if (selectedArticleId) {
        await fetchArticleTags(selectedArticleId)
      }
    } catch (err) {
      console.error('[ReaderView] 删除标签失败：', err)
      useStore.getState().setError(String(err))
    }
  }, [tags, selectedArticleId, fetchArticleTags])

  /** 批量应用标签变更（含快速创建） */
  const applyTagChanges = useCallback(async () => {
    if (!selectedArticleId) return

    // ★ 先处理快速创建：输入框有内容时自动创建标签
    const name = quickCreateName.trim()
    let quickCreatedId: number | null = null
    if (name) {
      try {
        const res = await window.api.createTag(name, quickCreateColor)
        if (res.success && res.data) {
          quickCreatedId = res.data.id
          setQuickCreateName('')
          await fetchTags()
        }
      } catch (err) {
        console.error('[ReaderView] quickCreate 失败：', err)
      }
    }

    // 构建最终的标签 ID 列表（当前选中 + 刚创建的）
    const finalTagIds = [...selectedTagIds]
    if (quickCreatedId !== null && !finalTagIds.includes(quickCreatedId)) {
      finalTagIds.push(quickCreatedId)
    }

    const currentTags = articleTagsMap[selectedArticleId] || []
    const currentIds = new Set(currentTags.map(t => t.id))

    const toAdd = finalTagIds.filter(id => !currentIds.has(id))
    const toRemove = [...currentIds].filter(id => !finalTagIds.includes(id))

    // 先移除
    for (const id of toRemove) {
      await toggleArticleTag(selectedArticleId, id)
    }
    // 再批量添加
    if (toAdd.length > 0) {
      await batchAddTagsToArticle(selectedArticleId, toAdd)
    }
    // ★ 刷新标签显示（从 DB 读取，确保状态一致）
    await fetchArticleTags(selectedArticleId)
    await fetchTags()

    setShowTagPicker(false)
  }, [selectedArticleId, articleTagsMap, selectedTagIds, quickCreateName, quickCreateColor, toggleArticleTag, batchAddTagsToArticle, fetchArticleTags, fetchTags])

  /** AI 标签推荐 */
  const handleAiSuggest = useCallback(async () => {
    if (!selectedArticle) {
      console.warn('[ReaderView] handleAiSuggest — 无选中文章')
      return
    }
    openTagPicker()
    setAiSuggesting(true)
    setAiSuggestions([])
    setAiCheckedNames(new Set())
    try {
      const content = articleContent || selectedArticle.summary || ''
      console.log('[ReaderView] AI 推荐 — 标题:', selectedArticle.title, '内容长度:', content.length)
      const currentNames = (articleTagsMap[selectedArticle.id] || []).map(t => t.name)
      const res = await window.api.suggestTagsFromAI(selectedArticle.title, content, currentNames)
      console.log('[ReaderView] AI 推荐响应:', res)
      if (res.success && res.data) {
        setAiSuggestions(res.data)
      } else {
        console.error('[ReaderView] AI 推荐失败 — API error:', res.error || '未知错误')
      }
    } catch (err) {
      console.error('[ReaderView] AI 推荐异常:', err)
    } finally {
      setAiSuggesting(false)
    }
  }, [selectedArticle, articleContent, articleTagsMap, openTagPicker])

  /** 添加选中的 AI 推荐标签（创建不存在的标签 → 批量打标） */
  const handleApplyAiSuggestions = useCallback(async () => {
    if (!selectedArticleId || aiCheckedNames.size === 0) return
    setAiSuggesting(true)
    try {
      const selectedNames = [...aiCheckedNames]
      const currentTags = useStore.getState().tags
      const toAddIds: number[] = []
      const toCreate: string[] = []

      for (const name of selectedNames) {
        const existing = currentTags.find(t => t.name === name)
        if (existing) {
          toAddIds.push(existing.id)
        } else {
          toCreate.push(name)
        }
      }

      // 创建不存在的标签
      for (const name of toCreate) {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
        const color = colors[Math.floor(Math.random() * colors.length)]
        const res = await window.api.createTag(name, color)
        if (res.success && res.data) {
          toAddIds.push(res.data.id)
        }
      }

      // 刷新 tags 列表
      await fetchTags()

      // 批量打标
      if (toAddIds.length > 0) {
        await batchAddTagsToArticle(selectedArticleId, toAddIds)
      }

      setAiSuggestions([])
      setAiCheckedNames(new Set())
      setShowTagPicker(false)
    } catch (err) {
      console.error('[ReaderView] AI 推荐应用失败：', err)
    } finally {
      setAiSuggesting(false)
    }
  }, [selectedArticleId, aiCheckedNames, batchAddTagsToArticle, fetchTags])

  const handleStartTranslate = useCallback(async (targetLang: string) => {
    if (!selectedArticleId || !selectedArticle) return
    if (translateLoading) return
    setShowTranslateLangPicker(false)

    const transStr = selectedArticle.translations
    const transMap: Record<string, unknown> = {}
    if (transStr) {
      try { Object.assign(transMap, JSON.parse(transStr)) } catch {}
    }
    console.log('[缓存] 检查:', JSON.stringify({
      articleId: selectedArticleId,
      hasTranslations: !!transStr,
      v: transMap._v,
      keys: Object.keys(transMap).filter(k => k !== '_v' && k !== '_summary'),
      targetLang,
    }))

    // ★ 翻译缓存检查：优先使用已保存的翻译
    if (transMap._v === 2 && Array.isArray(transMap[targetLang]) && (transMap[targetLang] as any[]).length > 0) {
      const cached = transMap[targetLang] as string[]
      console.log(`[缓存] ✅ 命中 ${targetLang}，${cached.length} 段`)
      frozenOriginalParagraphsRef.current = splitContent(articleContent || '')
      translatingRef.current = true
      translateTargetLangRef.current = targetLang
      setTranslateLoading(true)
      useStore.setState({ paragraphTranslations: cached })
      setTimeout(() => setTranslateLoading(false), 50)
      return
    }

    console.log('[缓存] ❌ 未命中，调用 API')

    // API 翻译
    translatingRef.current = true
    translateTargetLangRef.current = targetLang
    setTranslateLoading(true)
    resetParagraphTranslations()
    frozenOriginalParagraphsRef.current = splitContent(articleContent || selectedArticle.summary || '')
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c.trim()) { setError('文章无内容'); setTranslateLoading(false); return }
      await window.api.translateParagraphs(selectedArticleId, c, selectedArticle.title, targetLang)
    } catch (err) {
      setError(String(err))
      setTranslateLoading(false)
    }
  }, [selectedArticleId, selectedArticle, articleContent, translateLoading])

  // ============ 渲染函数 ============

  /** ★ 按段落拆分渲染，每段带复选框（适用于任何 HTML 结构） */
  const renderParagraphsWithCheckboxes = () => {
    const displayContent = articleContent || selectedArticle?.summary || ''

    if (!displayContent && !isLoading) {
      return (
        <div className="text-gray-400 text-sm py-8 text-center">
          <Globe size={48} className="mx-auto mb-3 opacity-30" />
          {t('reader.noContent')}
        </div>
      )
    }

    const paras = splitContent(displayContent)
    return (
      <div className={`prose prose-sm ${darkMode ? 'prose-invert' : 'prose-gray'} max-w-none leading-relaxed`}>
        {paras.map((para, idx) => {
          const checked = selectedParagraphIndices.has(idx)
          const Icon = checked ? CheckSquare : Square
          return (
            <div key={idx} data-para-index={idx} className={`group flex gap-2 items-start mb-6 last:mb-0 ${checked ? 'bg-green-50/40 dark:bg-green-900/10 rounded px-2 -mx-2 py-1' : ''}`}>
              <button
                onClick={(e) => { e.stopPropagation(); toggleSelectedParagraph(idx) }}
                className="flex-shrink-0 mt-1 opacity-30 group-hover:opacity-100 transition-opacity"
                title={t('reader.selectiveTranslateBtn')}
              >
                <Icon size={14} className={checked ? 'text-green-500' : 'text-gray-400'} />
              </button>
              <div className="flex-1 min-w-0">
                {renderParagraphWithHighlights(para, idx)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  /** 渲染原始网页（original 模式） */
  const renderOriginalContent = () => {
    if (selectedArticle?.url) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Globe size={48} className="mb-3 opacity-30" />
          <p className="text-sm mb-4">{t('reader.originalNeedsBrowser')}</p>
          <a
            href={selectedArticle.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            <ExternalLink size={14} />
            {t('reader.openInBrowser')}
          </a>
        </div>
      )
    }
    return <div className="text-gray-400 text-sm py-8 text-center">{t('reader.noOriginalLink')}</div>
  }

  // ============ 空状态 ============

  if (!selectedArticleId || !selectedArticle) {
    return (
      <div className="reader-view flex items-center justify-center text-gray-400 text-sm">
        {t('reader.selectArticle')}
      </div>
    )
  }

  // ============ 渲染主内容 ============

  // 翻译/阅读区样式（跟随全局 darkMode）
  const proseCls = darkMode ? 'prose-invert' : 'prose-gray'
  const containerBg = darkMode ? 'bg-gray-900' : 'bg-white'

  return (
    <div className="reader-view flex" style={{ height: '100%', overflow: 'hidden' }}>
      {/* 左侧：阅读内容 + 摘要 */}
      <div
        className={containerBg}
        style={{
          flex: hasSummary ? `0 0 ${100 - summaryPanelWidth}%` : '1 1 100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingRight: hasSummary ? 16 : 0,
        }}
      >
        {/* ===== 顶部固定区域 ===== */}
        <div className="max-w-3xl mx-auto w-full flex-shrink-0 px-4 pt-3">
          {/* 标题 */}
          <h1 className="text-2xl font-bold leading-tight mb-2 dark:text-white">
            {selectedArticle.title || t('articleList.untitled')}
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
              {t('reader.openOriginal')}
            </a>
          </div>

          {/* ===== M5 标签区域 ===== */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {/* 已打标签 */}
            {articleTags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full cursor-pointer hover:opacity-80 transition-opacity group"
                style={{
                  backgroundColor: (tag.color || '#3b82f6') + '20',
                  color: tag.color || '#3b82f6',
                  border: '1px solid ' + (tag.color || '#3b82f6') + '40',
                }}
                onClick={() => {
                  if (selectedArticleId) toggleArticleTag(selectedArticleId, tag.id)
                }}
                title={t('reader.clickToRemoveTag')}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                {tag.name}
                <X size={10} className="opacity-50 group-hover:opacity-100" />
              </span>
            ))}

            {/* 管理标签按钮 → 弹出多选面板 */}
            <button
              onClick={openTagPicker}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-blue-500 hover:bg-blue-600
                       rounded-full transition-colors shadow-sm"
              title={t('reader.manageTags')}
            >
              <Tag size={11} />
              <Plus size={10} />
            </button>

            {/* AI 推荐按钮 */}
            <button
              onClick={handleAiSuggest}
              disabled={aiSuggesting}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-purple-500 hover:text-purple-600
                       border border-dashed border-purple-300 dark:border-purple-600 rounded-full
                       hover:border-purple-400 transition-colors disabled:opacity-50"
            >
              {aiSuggesting ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              {t('reader.aiRecommend')}
            </button>
          </div>

          {/* ===== 标签管理面板 ===== */}
          {showTagPicker && (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center pt-20"
              onClick={() => setShowTagPicker(false)}
            >
              <div
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-80 max-h-[70vh] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                {/* 面板标题 */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-blue-500" />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('reader.tagManagement')}</span>
                  </div>
                  <button onClick={() => setShowTagPicker(false)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                    <X size={14} />
                  </button>
                </div>

                {/* AI 推荐区域 */}
                {aiSuggestions.length > 0 && (
                  <div className="px-4 py-2 border-b border-purple-200 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap size={12} className="text-purple-500" />
                      <span className="text-xs font-medium text-purple-600 dark:text-purple-400">{t('reader.aiSuggestedTags')}</span>
                    </div>
                    <div className="space-y-0.5 mb-2">
                      {aiSuggestions.map(name => {
                        const checked = aiCheckedNames.has(name)
                        const AiIcon = checked ? CheckSquare : Square
                        return (
                          <button
                            key={name}
                            onClick={() => {
                              setAiCheckedNames(prev => {
                                const next = new Set(prev)
                                if (next.has(name)) next.delete(name)
                                else next.add(name)
                                return next
                              })
                            }}
                            className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs
                                     hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-colors
                                     text-purple-700 dark:text-purple-300"
                          >
                            <AiIcon size={14} className={checked ? 'text-purple-500' : 'text-purple-400'} />
                            <span>{name}</span>
                          </button>
                        )
                      })}
                    </div>
                    <button
                      onClick={handleApplyAiSuggestions}
                      disabled={aiSuggesting || aiCheckedNames.size === 0}
                      className="w-full py-1 text-xs font-medium text-white bg-purple-500 hover:bg-purple-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {aiSuggesting ? t('reader.applying') : `${t('reader.addSelected')} (${aiCheckedNames.size})`}
                    </button>
                  </div>
                )}

                {/* 标签列表（多选） */}
                <div className="flex-1 overflow-y-auto px-2 py-2 max-h-52">
                  {tags.length === 0 ? (
                    <div className="py-4 text-center text-xs text-gray-400">{t('reader.noTagsCreateBelow')}</div>
                  ) : (
                    tags.map(tag => {
                      const checked = selectedTagIds.has(tag.id)
                      const Icon = checked ? CheckSquare : Square
                      return (
                        <div
                          key={tag.id}
                          className="flex items-center gap-1 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <button
                            onClick={() => toggleTagSelection(tag.id)}
                            className="flex-1 flex items-center gap-2 min-w-0"
                          >
                            <Icon size={15} className={checked ? 'text-blue-500' : 'text-gray-400 flex-shrink-0'} />
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                            <span className="flex-1 text-left text-gray-700 dark:text-gray-200 text-xs truncate">{tag.name}</span>
                          </button>

                          {/* 颜色切换 */}
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingTagColor(editingTagColor === tag.id ? null : tag.id) }}
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              title="修改标签颜色"
                            >
                              <span className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-500" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                            </button>
                            {editingTagColor === tag.id && (
                              <div
                                className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 p-1.5 flex gap-1 flex-wrap w-[130px]"
                                onClick={e => e.stopPropagation()}
                              >
                                {PRESET_COLORS.map(c => (
                                  <button
                                    key={c}
                                    onClick={() => handleChangeTagColor(tag.id, c)}
                                    className={`w-5 h-5 rounded-full transition-transform hover:scale-110 border-2 ${tag.color === c ? 'border-blue-500 dark:border-blue-400' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                  />
                                ))}
                                <button
                                  onClick={() => setEditingTagColor(null)}
                                  className="w-full text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-0.5"
                                >
                                  取消
                                </button>
                              </div>
                            )}
                          </div>

                          {/* 删除标签 */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id) }}
                            className="flex-shrink-0 p-0.5 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="删除标签"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* 快速创建标签 */}
                <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">{t('reader.quickCreate')}</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="text"
                      value={quickCreateName}
                      onChange={e => setQuickCreateName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
                      placeholder={t('reader.newTagPlaceholder')}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-500
                               bg-white dark:bg-gray-700 dark:text-gray-100 rounded focus:outline-none
                               focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
                    />
                    <div className="flex gap-0.5 mt-1">
                      <span className="text-[9px] text-gray-400 mr-0.5 self-center">颜色：</span>
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setQuickCreateColor(c)}
                          className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${quickCreateColor === c ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* 底部按钮 */}
                <div className="flex gap-2 px-4 py-2.5 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setShowTagPicker(false)}
                    className="flex-1 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {t('reader.cancel')}
                  </button>
                  <button
                    onClick={applyTagChanges}
                    className="flex-1 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                  >
                    {t('reader.apply')}
                  </button>
                </div>
              </div>
            </div>
          )}

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
              title={readerMode === 'reader' ? t('reader.readerMode') : t('reader.originalMode')}
            >
              <BookOpen size={13} />
              {readerMode === 'reader' ? t('reader.readerMode') : t('reader.originalMode')}
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
                {summaryLoading ? t('reader.generatingSummary') : t('reader.aiSummary')}
              </button>
              {showSummaryLangPicker && (
                <div
                  className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-52 overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t('reader.summaryLanguage')}</span>
                  </div>
                  <div className="py-1">
                    {LANG_OPTIONS.map(l => (
                      <button
                        key={l.value}
                        onClick={(e) => { e.stopPropagation(); setSelectedSummaryLang(l.value) }}
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
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">{t('reader.detailLevel')}</span>
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
                          {level === 'compact' ? t('reader.compact') : level === 'medium' ? t('reader.medium') : t('reader.detailed')}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 确定按钮 */}
                  <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmSummary(selectedSummaryLang) }}
                      className="w-full py-1.5 text-xs font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                    >
                      {t('reader.confirm')}
                    </button>
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
                    {t(DISPLAY_MODE_LABEL_KEYS[m.value])}
                  </button>
                ))}
                <button
                  onClick={handleBackToOriginal}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                  {t('reader.backToOriginal')}
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
                    {t(DISPLAY_MODE_LABEL_KEYS[m.value])}
                  </button>
                ))}
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-blue-500 dark:text-blue-400">
                  <Loader size={12} className="animate-spin" />
                  {t('reader.translating')}
                </div>
                <button
                  onClick={handleBackToOriginal}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                  {t('reader.stop')}
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
                  {translateLoading ? t('reader.translating') : t('reader.translate')}
                </button>
                {showTranslateLangPicker && (
                  <div
                    className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-44 overflow-hidden"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t('reader.translateLanguage')}</span>
                    </div>
                    <div className="py-1">
                      {LANG_OPTIONS.map(l => (
                        <button
                          key={l.value}
                          onClick={(e) => { e.stopPropagation(); setSelectedTargetLang(l.value); setTranslateTargetLang(l.value) }}
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
                    {/* 确定按钮 */}
                    <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowTranslateLangPicker(false); handleStartTranslate(selectedTargetLang) }}
                        className="w-full py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        {t('reader.confirm')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* ===== 笔记按钮 ===== */}
            <button
              onClick={() => useStore.setState({ notePanelOpen: !notePanelOpen })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                ${notePanelOpen
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              title={t('reader.notes')}
            >
              <PenLine size={13} />
              {t('reader.notes')}
            </button>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* ===== 字体控制 ===== */}
            {/* 字号缩小 */}
            <button
              onClick={() => setReaderFontSize(Math.max(FONT_SIZE_MIN, readerFontSize - FONT_SIZE_STEP))}
              disabled={readerFontSize <= FONT_SIZE_MIN}
              className="flex items-center justify-center w-7 h-7 rounded text-xs text-gray-500 bg-transparent hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={t('reader.fontSizeReduce')}
            >
              <Minus size={12} />
            </button>

            {/* 当前字号显示 */}
            <span
              className="text-xs font-medium text-gray-600 dark:text-gray-300 min-w-[28px] text-center select-none cursor-default"
              title={t('reader.fontSize')}
            >
              {readerFontSize}
            </span>

            {/* 字号放大 */}
            <button
              onClick={() => setReaderFontSize(Math.min(FONT_SIZE_MAX, readerFontSize + FONT_SIZE_STEP))}
              disabled={readerFontSize >= FONT_SIZE_MAX}
              className="flex items-center justify-center w-7 h-7 rounded text-xs text-gray-500 bg-transparent hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={t('reader.fontSizeIncrease')}
            >
              <Plus size={12} />
            </button>

            {/* 字体选择 */}
            <button
              ref={fontBtnRef}
              onClick={() => {
                const btn = fontBtnRef.current
                if (btn) {
                  const rect = btn.getBoundingClientRect()
                  setFontPickerPos({ top: rect.bottom + 4, left: rect.right - 160 })
                }
                setShowFontPicker(!showFontPicker)
              }}
              className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
              title={t('reader.selectFont')}
            >
              <Type size={13} />
              {FONT_FAMILIES.find(f => f.value === readerFontFamily)?.label || t('reader.font')}
              <ChevronDown size={10} />
            </button>

            {/* ===== 文章内搜索按钮 ===== */}
            <button
              onClick={() => { setShowInArticleSearch(!showInArticleSearch); requestAnimationFrame(() => requestAnimationFrame(() => inArticleSearchRef.current?.focus())) }}
              className={`flex items-center justify-center w-7 h-7 rounded text-xs transition-colors bg-transparent
                ${showInArticleSearch
                  ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              title="在文章中搜索 (Ctrl+F)"
            >
              <Search size={13} />
            </button>

            <div className="flex-1" />

            {/* 设置按钮 */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={t('reader.llmSettings')}
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

          {/* ===== 文章内搜索栏 ===== */}
          {showInArticleSearch && (
          <div className="mb-3 p-2 bg-yellow-50/80 dark:bg-yellow-900/15 border border-yellow-200/60 dark:border-yellow-700/40 rounded-lg flex items-center gap-2">
            <Search size={14} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 opacity-60" />
            <input
              ref={inArticleSearchRef}
              type="text"
              value={inArticleSearch}
              onChange={(e) => { setInArticleSearch(e.target.value); setCurrentHitIndex(0) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (e.shiftKey) scrollToHit(currentHitIndex - 1)
                  else scrollToHit(currentHitIndex + 1)
                }
              }}
              placeholder="在文章中搜索..."
              className="flex-1 px-2 py-1 text-sm bg-transparent border-none outline-none placeholder-gray-400 dark:placeholder-gray-500"
            />
            {searchHits.length > 0 && (
              <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium whitespace-nowrap">
                {currentHitIndex + 1}/{searchHits.length}
              </span>
            )}
            {inArticleSearch && (
              <>
                <button
                  onClick={() => scrollToHit(currentHitIndex - 1)}
                  disabled={searchHits.length === 0}
                  className="p-1 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 disabled:opacity-30 transition-colors"
                  title="上一个匹配"
                >
                  <ArrowUp size={14} className="text-yellow-600 dark:text-yellow-400" />
                </button>
                <button
                  onClick={() => scrollToHit(currentHitIndex + 1)}
                  disabled={searchHits.length === 0}
                  className="p-1 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 disabled:opacity-30 transition-colors"
                  title="下一个匹配"
                >
                  <ArrowDown size={14} className="text-yellow-600 dark:text-yellow-400" />
                </button>
              </>
            )}
          </div>
          )}

          {/* 错误信息（增强：含错误类型标签和详细上下文） */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* 错误类型标签 */}
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {errorDetail && (
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        errorDetail.errorType === 'timeout' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                        errorDetail.errorType === 'network' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        errorDetail.errorType === 'auth' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        errorDetail.errorType === 'rate_limit' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        errorDetail.errorType === 'parse' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        errorDetail.errorType === 'config' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {errorDetail.errorType === 'timeout' ? '⏱ 超时' :
                         errorDetail.errorType === 'network' ? '🌐 网络错误' :
                         errorDetail.errorType === 'auth' ? '🔑 鉴权失败' :
                         errorDetail.errorType === 'rate_limit' ? '🚦 限流' :
                         errorDetail.errorType === 'parse' ? '📝 解析错误' :
                         errorDetail.errorType === 'config' ? '🔧 配置' :
                         '⚙️ 错误'}
                      </span>
                    )}
                    {errorDetail?.statusCode && (
                      <span className="text-[10px] text-red-400 dark:text-red-500 font-mono">HTTP {errorDetail.statusCode}</span>
                    )}
                  </div>
                  {/* 错误消息 */}
                  <span className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</span>
                  {/* 上下文信息 */}
                  {errorDetail?.url && (
                    <div className="mt-1 text-[11px] text-red-400 dark:text-red-500 truncate">
                      🔗 {errorDetail.url}
                    </div>
                  )}
                  {errorDetail?.position !== undefined && (
                    <div className="mt-0.5 text-[11px] text-red-400 dark:text-red-500">
                      📍 出错位置：第 {errorDetail.position + 1} 段
                      {errorDetail.context && <span className="opacity-70">（{errorDetail.context}...）</span>}
                    </div>
                  )}
                </div>
                <button onClick={() => { setError(false); setErrorDetail(null) }} className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs p-0.5">✕</button>
              </div>
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
                    {t('reader.translationBanner')}
                  </div>
                  <div className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
                    {t('reader.translatingParagraphs', { n: originalParagraphs.length })}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
        {/* ===== 内容主体（可滚动） ===== */}
        <div className="max-w-3xl mx-auto w-full flex-1 overflow-y-auto px-4 pb-6">
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
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
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
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
                              {paragraphTranslations[idx]}
                            </ReactMarkdown>
                          </div>
                        ) : translateLoading ? (
                          <div className="text-xs text-gray-400">{t('reader.translating')}</div>
                        ) : <div className="text-xs text-gray-300">-</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 上下对照模式 — 带边框盒子样式 */}
              {displayMode === 'topBottom' && isTranslating && (
                <div className="space-y-6">
                  {originalParagraphs.map((para: string, idx: number) => {
                    const hasTranslation = paragraphTranslations[idx] && paragraphTranslations[idx].trim()
                    return (
                    <div key={idx}>
                      <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
                          {para}
                        </ReactMarkdown>
                      </div>
                      {hasTranslation ? (
                        <div className="mt-3 border-2 border-blue-300 dark:border-blue-600 rounded-lg overflow-hidden">
                          <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 flex items-center gap-1.5 border-b border-blue-200 dark:border-blue-700">
                            <span className="text-xs">🌐</span>
                            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                              {LANG_LABEL_MAP[translateTargetLangRef.current] || t('reader.translatedFrom')}
                            </span>
                          </div>
                          <div className="bg-blue-50/30 dark:bg-blue-900/5 px-4 py-3">
                            <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed text-sm`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
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
                              {LANG_LABEL_MAP[translateTargetLangRef.current] || t('reader.translatedFrom')}
                            </span>
                            <Loader size={10} className="animate-spin text-blue-400 ml-1" />
                          </div>
                          <div className="bg-blue-50/20 dark:bg-blue-900/5 px-4 py-3 text-xs text-gray-400">
                            {t('reader.translating')}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 dark:bg-gray-800/30 px-3 py-1.5 flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-xs">🌐</span>
                            <span className="text-[11px] font-medium text-gray-400">
                              {LANG_LABEL_MAP[translateTargetLangRef.current] || t('reader.translatedFrom')}
                            </span>
                          </div>
                          <div className="bg-gray-50/30 dark:bg-gray-800/10 px-4 py-3 text-xs text-gray-400 italic">
                            {t('reader.noTranslation')}
                          </div>
                        </div>
                      )}
                    </div>
                    )
                  })}
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

              {/* 原文内容区域（始终渲染，选区检测依赖 ref） */}
              {/* 选择段落摘要工具栏 */}
              {showSelectSummaryBar && (
                <div className="sticky top-0 z-20 mb-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg shadow-sm flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                    📑 {t('reader.selectedParas', { n: selectedParagraphIndices.size })}
                  </span>
                  <select
                    value={selectSummaryLang}
                    onChange={e => setSelectSummaryLang(e.target.value)}
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded"
                  >
                    {LANG_OPTIONS.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                  <select
                    value={selectSummaryDetail}
                    onChange={e => setSelectSummaryDetail(e.target.value as 'compact' | 'medium' | 'detailed')}
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded"
                  >
                    <option value="compact">{t('reader.compact')}</option>
                    <option value="medium">{t('reader.medium')}</option>
                    <option value="detailed">{t('reader.detailed')}</option>
                  </select>
                  <button
                    onClick={handleSelectiveSummarize}
                    disabled={selectionSummaryLoading}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {selectionSummaryLoading ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {t('reader.generateSummary')}
                  </button>
                  {selectionSummary && (
                    <button
                      onClick={handleExportSelectSummary}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-lg transition-colors"
                    >
                      <Download size={12} />
                      {t('reader.exportMd')}
                    </button>
                  )}
                  <button
                    onClick={handleClearSelectSummary}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                  >
                    <X size={12} />
                    {t('reader.clearSummary')}
                  </button>
                </div>
              )}

              {/* 原文内容区域 — 翻译模式下隐藏（replace/sideBySide/topBottom 已渲染翻译内容） */}
              {!isTranslating && (
              <div
                ref={readingAreaRef}
                className={`rounded-lg p-6 ${containerBg}`}
              >
                {readerMode === 'reader' ? renderParagraphsWithCheckboxes() : renderOriginalContent()}
              </div>
              )}

              {/* 选择段落摘要结果 (Portal 到选中段落后) */}
              {(selectionSummary || selectionSummaryLoading) && selectionSummaryAnchorRef.current && document.body.contains(selectionSummaryAnchorRef.current) && createPortal(
                <div className="my-4 border-2 border-green-300 dark:border-green-600 rounded-lg overflow-hidden">
                  <div className="bg-green-50 dark:bg-green-900/20 px-3 py-1.5 flex items-center justify-between border-b border-green-200 dark:border-green-700">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-green-500" />
                      <span className="text-[11px] font-medium text-green-600 dark:text-green-400">
                        {t('reader.selectiveSummaryLabel')} · {LANG_LABEL_MAP[selectSummaryLang] || selectSummaryLang} · {selectSummaryDetail === 'compact' ? t('reader.compact') : selectSummaryDetail === 'detailed' ? t('reader.detailed') : t('reader.medium')}
                      </span>
                      {selectionSummaryLoading && <Loader size={10} className="animate-spin text-green-400 ml-1" />}
                    </div>
                    <button onClick={handleClearSelectSummary}
                      className="p-0.5 rounded text-green-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                  <div className="bg-green-50/30 dark:bg-green-900/5 px-4 py-3">
                    {selectionSummary ? (
                      <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed text-sm`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>{selectionSummary}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-xs text-green-500 dark:text-green-400 py-1">{t('reader.translating')}</div>
                    )}
                  </div>
                </div>,
                selectionSummaryAnchorRef.current
              )}

              {/* ===== 选择文本翻译结果（Portal 到选区末尾锚点） ===== */}
              {(selectionTranslation || selectionTranslateLoading)
                && selectionResultAnchorRef.current
                && document.body.contains(selectionResultAnchorRef.current)
                && createPortal(
                  <div className="mt-4 border-2 border-cyan-300 dark:border-cyan-600 rounded-lg overflow-hidden">
                    <div className="bg-cyan-50 dark:bg-cyan-900/20 px-3 py-1.5 flex items-center justify-between border-b border-cyan-200 dark:border-cyan-700">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🔍</span>
                        <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
                          {t('reader.selectiveTranslate')} {LANG_LABEL_MAP[selectionTargetLangRef.current] || selectionTargetLangRef.current}
                        </span>
                        {selectionTranslateLoading && <Loader size={10} className="animate-spin text-cyan-400 ml-1" />}
                      </div>
                      <button
                        onClick={handleDismissSelectionTranslate}
                        className="p-0.5 rounded text-cyan-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="bg-cyan-50/30 dark:bg-cyan-900/5 px-4 py-3">
                      {selectionTranslation ? (
                        <div className={`prose prose-sm ${proseCls} max-w-none leading-relaxed text-sm`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={markdownComponents}>
                            {selectionTranslation}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="text-xs text-cyan-500 dark:text-cyan-400 py-1">
                          {t('reader.translating')}
                        </div>
                      )}
                    </div>
                  </div>,
                  selectionResultAnchorRef.current
                )}
            </div>
          )}
        </div>
      </div>

      {/* ===== 选择文本翻译浮动按钮 (Portal 到 body) ===== */}
      {showFloatBtn && floatBtnPos && createPortal(
        <div
          data-selection-btn="true"
          className="fixed z-[9999] flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg px-2 py-1"
          style={{ top: Math.min(floatBtnPos.top, window.innerHeight - 40), left: Math.min(floatBtnPos.left, window.innerWidth - 140) }}
        >
          <span className="text-[10px] text-gray-400">🌐</span>
          {LANG_OPTIONS.slice(0, 4).map(l => (
            <button
              key={l.value}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); triggerSelectiveTranslate(l.value) }}
              className="px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded transition-colors"
            >
              {l.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* ===== 摘要面板（右侧） ===== */}
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
                    {t('reader.aiSummary')}{summaryLangLabel ? ` (${summaryLangLabel}${summaryDetailLevelRef.current === 'compact' ? t('reader.summaryDetailCompact') : summaryDetailLevelRef.current === 'detailed' ? t('reader.summaryDetailDetailed') : ''})` : ''}
                  </span>
                  {summaryLoading && <Loader size={12} className="animate-spin text-purple-400 ml-1" />}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      try {
                        const result = await window.api.exportSummaryMd(selectedArticle.title, summaryStream)
                        if (!result.success && result.error !== '用户取消') {
                          setError(result.error || '导出失败')
                        }
                      } catch (err) {
                        setError('导出失败: ' + String(err))
                      }
                    }}
                    disabled={!summaryStream.trim() || summaryLoading}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors disabled:opacity-30"
                    title={t('reader.exportSummary')}
                  >
                    <Download size={12} />
                  </button>
                  <button
                    onClick={resetSummary}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title={t('reader.closeSummaryPanel')}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </div>
            <div className={`text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap`}>
              {summaryStream}
            </div>
          </div>
        </>
      )}

          {/* ===== 字体选择弹出框 (fixed 定位) ===== */}
          {showFontPicker && fontPickerPos && (
            <div
              className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-40 max-h-60 overflow-y-auto"
              style={{ top: fontPickerPos.top, left: fontPickerPos.left }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t('reader.selectFont')}</span>
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

      {/* ===== 笔记面板（下方） ===== */}
          {showFontPicker && fontPickerPos && (
            <div
              className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-40 max-h-60 overflow-y-auto"
              style={{ top: fontPickerPos.top, left: fontPickerPos.left }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t('reader.selectFont')}</span>
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

          {/* ===== 笔记面板（下方） ===== */}
      {notePanelOpen && !hasSummary && (
        <>
          <ResizeHandle
            direction="vertical"
            onResize={(delta) => {
              const containerHeight = window.innerHeight - 200
              const deltaPct = (delta / (containerHeight || 1)) * 100
              setNotePanelWidth((prev) =>
                Math.min(60, Math.max(20, prev - deltaPct))
              )
            }}
          />
          <div className={`${containerBg} border-t border-gray-200 dark:border-gray-700`} style={{ flex: `0 0 ${notePanelWidth}%`, overflowY: 'auto' }}>
            <NotesPanel darkMode={darkMode} />
          </div>
        </>
      )}
    </div>
  )
}