import { useEffect, useCallback, useState, useRef } from 'react'
import { useStore } from '../store'
import { Globe, ExternalLink, Sparkles, Languages, Loader, Settings, Check, Columns, AlignJustify, Replace, X } from 'lucide-react'
import type { LlmStreamChunk, LlmStreamDone, LlmStreamError } from '../../shared/types'

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

const LANG_LABEL_MAP: Record<string, string> = {
  Chinese: '中文',
  English: 'English',
  Japanese: '日本語',
  Korean: '한국어',
  French: 'Français',
  German: 'Deutsch',
}

export default function ReaderView() {
  const {
    selectedArticleId, articleContent, articles, isLoading, error,
    summaryStream, summaryLoading, translateLoading,
    paragraphTranslations, displayMode,
    setShowSettings, setSummaryLoading, appendSummaryDelta, resetSummary,
    setSummarizingArticleId, summarizingArticleId,
    setTranslateLoading, resetTranslate, setTranslateMode,
    appendParagraphTranslation, resetParagraphTranslations, appendTranslateDelta,
    setDisplayMode, setError
  } = useStore()

  const [showSummaryLangPicker, setShowSummaryLangPicker] = useState(false)
  const [showTranslateLangPicker, setShowTranslateLangPicker] = useState(false)
  const [selectedSummaryLang, setSelectedSummaryLang] = useState('Chinese')
  const [selectedTargetLang, setSelectedTargetLang] = useState('Chinese')

  // 摘要右侧面板宽度控制
  const [summaryPanelWidth, setSummaryPanelWidth] = useState(35) // 百分比
  const [summaryLangLabel, setSummaryLangLabel] = useState('')
  const isSummaryDragging = useRef(false)

  // 翻译分界线控制
  const [dividerPos, setDividerPos] = useState(50)
  const isDragging = useRef(false)

  const selectedArticle = articles.find(a => a.id === selectedArticleId)

  const originalParagraphs = articleContent ? splitHtml(articleContent) : []

  // 流式监听（全程注册一次，用 translatingRef 控制是否接收翻译回调）
  const translatingRef = useRef(false)
  const selectedArticleIdRef = useRef(selectedArticleId)
  useEffect(() => { selectedArticleIdRef.current = selectedArticleId }, [selectedArticleId])
  useEffect(() => {
    let cleanup: (() => void) | undefined
    if (typeof window.api?.onStreamChunk === 'function') {
      cleanup = window.api.onStreamChunk((chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => {
        if (chunk.type === 'summarize') {
          if (chunk.articleId !== selectedArticleIdRef.current) return
          if ('delta' in chunk) appendSummaryDelta(chunk.delta)
          else if ('fullText' in chunk) setSummaryLoading(false)
          else if ('message' in chunk) { setError(chunk.message); setSummaryLoading(false) }
        } else if (chunk.type === 'translateParagraph') {
          if (!translatingRef.current) return
          const idx = chunk.paragraphIndex ?? 0
          if ('delta' in chunk) appendParagraphTranslation(idx, chunk.delta)
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

  // 切换文章时重置
  useEffect(() => {
    translatingRef.current = false
    resetTranslate()
    resetParagraphTranslations()
    setTranslateMode('original')
  }, [selectedArticleId])

  // 翻译分界线拖拽
  const handleDividerMouseDown = useCallback(() => { isDragging.current = true }, [])
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      setDividerPos(Math.max(20, Math.min(80, (e.clientX / window.innerWidth) * 100)))
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // 摘要面板拖拽
  const handleSummaryDividerDown = useCallback(() => { isSummaryDragging.current = true }, [])
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isSummaryDragging.current) return
      setSummaryPanelWidth(Math.max(20, Math.min(60, (e.clientX / window.innerWidth) * 100)))
    }
    const onUp = () => { isSummaryDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const handleSummarize = useCallback(async (targetLang: string) => {
    if (!selectedArticleId || !selectedArticle) return
    if (summaryLoading) return
    resetSummary(); setSummarizingArticleId(selectedArticleId); setSummaryLoading(true); setSummaryLangLabel(LANG_LABEL_MAP[targetLang] || targetLang)
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c) { setError('文章无内容'); setSummaryLoading(false); return }
      await window.api.summarize(selectedArticleId, c, selectedArticle.title, targetLang)
    } catch (err) { setError(String(err)); setSummaryLoading(false) }
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
    translatingRef.current = true
    setTranslateLoading(true)
    resetParagraphTranslations()
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c.trim()) { setError('文章无内容'); setTranslateLoading(false); return }
      await window.api.translateParagraphs(selectedArticleId, c, selectedArticle.title, targetLang)
    } catch (err) { setError(String(err)) }
    setTranslateLoading(false)
  }, [selectedArticleId, selectedArticle, articleContent, selectedTargetLang, translateLoading])

  if (!selectedArticleId || !selectedArticle) {
    return <div className="reader-view flex items-center justify-center text-gray-400 text-sm">选择一篇文章开始阅读</div>
  }

  const hasTranslation = paragraphTranslations.some(t => t && t.trim())
  const hasSummary = summarizingArticleId === selectedArticleId && summaryStream.trim()

  return (
    <div className="reader-view flex" style={{ height: '100%', overflow: 'hidden' }}>
      {/* 左侧原文区域 */}
      <div style={{ width: hasSummary ? `${100 - summaryPanelWidth}%` : '100%', overflowY: 'auto', paddingRight: hasSummary ? 12 : 0 }}>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold leading-tight mb-2">{selectedArticle.title || '(Untitled)'}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-2">
            {selectedArticle.author && <span>{selectedArticle.author}</span>}
            {selectedArticle.published_at && <span>{new Date(selectedArticle.published_at).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>}
            <a href={selectedArticle.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-500 hover:text-blue-600"><ExternalLink size={14} />打开原文</a>
          </div>

          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <button onClick={() => setShowSummaryLangPicker(!showSummaryLangPicker)} disabled={summaryLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30 disabled:opacity-50 transition-colors">
                {summaryLoading ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {summaryLoading ? '生成摘要...' : 'AI 摘要'}
              </button>
              {showSummaryLangPicker && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-44 overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">摘要语言</span></div>
                  <div className="py-1">
                    {LANG_OPTIONS.map(l => (
                      <button key={l.value} onClick={() => { confirmSummary(l.value); }}
                        className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${selectedSummaryLang === l.value ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'}`}>
                        <span>{l.label}</span>{selectedSummaryLang === l.value && <Check size={13} className="text-purple-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {hasTranslation ? (
              <>
                {DISPLAY_MODES.map(m => (
                  <button key={m.value} onClick={() => setDisplayMode(m.value)}
                    className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${displayMode === m.value ? 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
                    <m.icon size={12} />{m.label}
                  </button>
                ))}
                <button onClick={handleBackToOriginal}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors">
                  <X size={12} />返回原文
                </button>
              </>
            ) : (
              <div className="relative">
                <button onClick={() => setShowTranslateLangPicker(!showTranslateLangPicker)} disabled={translateLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors">
                  {translateLoading ? <Loader size={13} className="animate-spin" /> : <Languages size={13} />}
                  {translateLoading ? '翻译中...' : '翻译'}
                </button>
                {showTranslateLangPicker && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-44 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700"><span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">翻译语言</span></div>
                    <div className="py-1">
                      {LANG_OPTIONS.map(l => (
                        <button key={l.value} onClick={() => { setSelectedTargetLang(l.value); setShowTranslateLangPicker(false); handleStartTranslate(l.value); }}
                          className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${selectedTargetLang === l.value ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'}`}>
                          <span>{l.label}</span>{selectedTargetLang === l.value && <Check size={13} className="text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex-1" />
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="LLM 设置"><Settings size={13} /></button>
          </div>

          {/* 关闭语言选择器 */}
          {(showSummaryLangPicker || showTranslateLangPicker) && (
            <div className="fixed inset-0 z-40" onClick={() => { setShowSummaryLangPicker(false); setShowTranslateLangPicker(false) }} />
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          )}

          {isLoading && <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}

          {/* 覆盖 */}
          {!isLoading && displayMode === 'replace' && (
            <div className="space-y-4">
              {(hasTranslation ? paragraphTranslations : originalParagraphs).map((html, idx) => (
                <div key={idx} className="prose prose-sm dark:prose-invert max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: html || '' }} />
              ))}
            </div>
          )}

          {/* 左右对照（段落对齐 + 可拖拽边界） */}
          {!isLoading && displayMode === 'sideBySide' && (
            <div className="space-y-6">
              {originalParagraphs.map((para, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
                  <div style={{ width: `${dividerPos}%`, paddingRight: 12 }}>
                    <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: para }} />
                  </div>
                  <div onMouseDown={handleDividerMouseDown} style={{ width: 6, cursor: 'col-resize', background: '#e5e7eb', flexShrink: 0, borderRadius: 3, alignSelf: 'stretch' }} className="hover:bg-blue-400 transition-colors" />
                  <div style={{ width: `${100 - dividerPos}%`, paddingLeft: 12 }}>
                    {paragraphTranslations[idx] ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: paragraphTranslations[idx] }} />
                    ) : translateLoading ? (
                      <div className="text-xs text-gray-400">翻译中...</div>
                    ) : <div className="text-xs text-gray-300">-</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 上下对照 */}
          {!isLoading && displayMode === 'topBottom' && (
            <div className="space-y-6">
              {originalParagraphs.map((para, idx) => (
                <div key={idx}>
                  <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: para }} />
                  <div className="h-3" />
                  {paragraphTranslations[idx] ? (
                    <div className="pl-3 border-l-4 border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 rounded-r py-2 pr-3">
                      <div className="text-[10px] text-blue-500 dark:text-blue-400 mb-1 flex items-center gap-1">🌐 译文 {translateLoading && <Loader size={10} className="animate-spin text-blue-400" />}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: paragraphTranslations[idx] }} />
                    </div>
                  ) : translateLoading ? (
                    <div className="pl-3 border-l-4 border-blue-200 bg-blue-50/30 dark:bg-blue-900/5 rounded-r py-2 pr-3 text-xs text-gray-400">翻译中...</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {!isLoading && !articleContent && (
            <div className="text-gray-400 text-sm py-8 text-center"><Globe size={48} className="mx-auto mb-3 opacity-30" />暂无内容。请尝试打开原文链接。</div>
          )}
        </div>
      </div>

      {/* 可拖拽分界线 + 右侧摘要面板 */}
      {hasSummary && (
        <>
          <div
            onMouseDown={handleSummaryDividerDown}
            style={{ width: 6, cursor: 'col-resize', background: '#d1d5db', flexShrink: 0, borderRadius: 3, alignSelf: 'stretch' }}
            className="hover:bg-purple-400 transition-colors"
          />
          <div style={{ width: `${summaryPanelWidth}%`, overflowY: 'auto', paddingLeft: 12 }}>
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm pb-2 mb-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-purple-500" />
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                  AI 摘要{summaryLangLabel ? ` (${summaryLangLabel})` : ''}
                </span>
                {summaryLoading && <Loader size={12} className="animate-spin text-purple-400 ml-1" />}
              </div>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
              {summaryStream}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

