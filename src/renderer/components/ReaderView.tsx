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

export default function ReaderView() {
  const {
    selectedArticleId, articleContent, articles, isLoading, error,
    summaryStream, summaryLoading, translateLoading,
    paragraphTranslations, displayMode,
    setShowSettings, setSummaryLoading, appendSummaryDelta, resetSummary,
    setTranslateLoading, resetTranslate, setTranslateMode,
    appendParagraphTranslation, resetParagraphTranslations,
    setDisplayMode, setError
  } = useStore()

  const [showLangPicker, setShowLangPicker] = useState(false)
  const [selectedTargetLang, setSelectedTargetLang] = useState('Chinese')
  const [dividerPos, setDividerPos] = useState(50)
  const isDragging = useRef(false)
  const selectedArticle = articles.find(a => a.id === selectedArticleId)

  const originalParagraphs = articleContent ? splitHtml(articleContent) : []

  // 流式监听（全程注册一次，用 translatingRef 控制是否接收翻译回调）
  const translatingRef = useRef(false)
  useEffect(() => {
    let cleanup: (() => void) | undefined
    if (typeof window.api?.onStreamChunk === 'function') {
      cleanup = window.api.onStreamChunk((chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => {
        if (chunk.type === 'summarize') {
          if ('delta' in chunk) appendSummaryDelta(chunk.delta)
          else if ('fullText' in chunk) setSummaryLoading(false)
          else if ('message' in chunk) { setError(chunk.message); setSummaryLoading(false) }
        } else if (chunk.type === 'translateParagraph') {
          if (!translatingRef.current) return // 已返回原文或取消了翻译
          const idx = chunk.paragraphIndex ?? 0
          if ('delta' in chunk) appendParagraphTranslation(idx, chunk.delta)
          else if ('message' in chunk) appendParagraphTranslation(idx, `[错误] ${chunk.message}`)
        } else if (chunk.type === 'translate') {
          if ('message' in chunk) { setError(chunk.message); setTranslateLoading(false) }
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

  const handleSummarize = useCallback(async () => {
    if (!selectedArticleId || !selectedArticle) return
    if (summaryLoading) return
    resetSummary(); setSummaryLoading(true)
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c) { setError('文章无内容'); setSummaryLoading(false); return }
      await window.api.summarize(selectedArticleId, c, selectedArticle.title)
    } catch (err) { setError(String(err)); setSummaryLoading(false) }
  }, [selectedArticleId, selectedArticle, articleContent, summaryLoading])

  const handleBackToOriginal = useCallback(() => {
    translatingRef.current = false
    resetParagraphTranslations()
    setTranslateLoading(false)
  }, [resetParagraphTranslations, setTranslateLoading])

  const handleStartTranslate = useCallback(async () => {
    if (!selectedArticleId || !selectedArticle) return
    if (translateLoading) return
    setShowLangPicker(false)
    translatingRef.current = true
    setTranslateLoading(true)
    resetParagraphTranslations()
    try {
      const c = articleContent || selectedArticle.summary || ''
      if (!c.trim()) { setError('文章无内容'); setTranslateLoading(false); return }
      await window.api.translateParagraphs(selectedArticleId, c, selectedArticle.title, selectedTargetLang)
    } catch (err) { setError(String(err)) }
    setTranslateLoading(false)
  }, [selectedArticleId, selectedArticle, articleContent, selectedTargetLang, translateLoading])

  if (!selectedArticleId || !selectedArticle) {
    return <div className="reader-view flex items-center justify-center text-gray-400 text-sm">选择一篇文章开始阅读</div>
  }

  const hasTranslation = paragraphTranslations.some(t => t && t.trim())

  return (
    <div className="reader-view" style={{ cursor: isDragging.current ? 'col-resize' : undefined }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold leading-tight mb-2">{selectedArticle.title || '(Untitled)'}</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-2">
          {selectedArticle.author && <span>{selectedArticle.author}</span>}
          {selectedArticle.published_at && <span>{new Date(selectedArticle.published_at).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>}
          <a href={selectedArticle.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-500 hover:text-blue-600"><ExternalLink size={14} />打开原文</a>
        </div>

        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
          <button onClick={handleSummarize} disabled={summaryLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30 disabled:opacity-50 transition-colors">
            {summaryLoading ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {summaryLoading ? '生成摘要...' : 'AI 摘要'}
          </button>

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
            <button onClick={() => setShowLangPicker(true)} disabled={translateLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors">
              {translateLoading ? <Loader size={13} className="animate-spin" /> : <Languages size={13} />}
              {translateLoading ? '翻译中...' : '翻译'}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="LLM 设置"><Settings size={13} /></button>
        </div>

        {showLangPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowLangPicker(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-xs mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700"><span className="text-sm font-semibold text-gray-700 dark:text-gray-200">选择翻译目标语言</span></div>
              <div className="p-2 space-y-0.5">
                {LANG_OPTIONS.map(l => (
                  <button key={l.value} onClick={() => setSelectedTargetLang(l.value)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-between ${selectedTargetLang === l.value ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'}`}>
                    <span>{l.label}</span>{selectedTargetLang === l.value && <Check size={14} className="text-blue-500" />}
                  </button>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button onClick={handleStartTranslate} className="px-5 py-1.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600">确认</button>
              </div>
            </div>
          </div>
        )}

        {summaryStream && (
          <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-1.5 mb-2"><Sparkles size={13} className="text-purple-500" /><span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">AI 摘要</span>{summaryLoading && <Loader size={12} className="animate-spin text-purple-400 ml-1" />}</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{summaryStream}</div>
          </div>
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
  )
}