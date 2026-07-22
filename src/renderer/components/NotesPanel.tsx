import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Strikethrough, List, ListOrdered,
  X, Download, Check, Type, ChevronDown,
  PenLine
} from 'lucide-react'
import { useStore } from '../store'

/** 字体选项 */
const FONT_OPTIONS = [
  { value: 'ui-sans-serif, system-ui', label: '系统默认' },
  { value: 'Georgia, "Times New Roman", serif', label: '衬线' },
  { value: '"Microsoft YaHei", "PingFang SC", sans-serif', label: '黑体' },
  { value: '"KaiTi", "STKaiti", serif', label: '楷体' },
  { value: 'Consolas, monospace', label: '等宽' },
]

const FONT_SIZE_OPTIONS = ['12', '14', '16', '18', '20', '24', '28', '32']

interface NotesPanelProps {
  darkMode: boolean
}

export default function NotesPanel({ darkMode }: NotesPanelProps) {
  const {
    selectedArticleId,
    noteContent,
    notePanelOpen,
    noteLastSaved,
    setError,
  } = useStore()

  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showSizePicker, setShowSizePicker] = useState(false)
  const [currentFont, setCurrentFont] = useState(FONT_OPTIONS[0].value)
  const [currentSize, setCurrentSize] = useState('16')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 点击外部关闭弹出选择器（替代全屏遮罩，不走 z-index 覆盖问题）
  useEffect(() => {
    if (!showFontPicker && !showSizePicker) return
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowFontPicker(false)
        setShowSizePicker(false)
      }
    }
    // 延迟绑定避免当前点击触发
    setTimeout(() => document.addEventListener('click', onDocClick), 0)
    return () => document.removeEventListener('click', onDocClick)
  }, [showFontPicker, showSizePicker])

  // 加载笔记
  useEffect(() => {
    if (!selectedArticleId || !notePanelOpen) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    const loadNote = async () => {
      try {
        const note = await window.api.getNote(selectedArticleId)
        if (note && note.content) {
          useStore.setState({ noteContent: note.content, noteLastSaved: note.updatedAt })
        } else {
          useStore.setState({ noteContent: '', noteLastSaved: null })
        }
      } catch {
        useStore.setState({ noteContent: '', noteLastSaved: null })
      }
    }
    loadNote()
  }, [selectedArticleId, notePanelOpen])

  // 当 noteContent 变化后，同步到编辑器 DOM
  useEffect(() => {
    if (editorRef.current && noteContent !== undefined) {
      if (editorRef.current.innerHTML !== noteContent) {
        editorRef.current.innerHTML = noteContent
      }
    }
  }, [noteContent])

  // 自动保存（防抖 2 秒）
  const autoSave = useCallback(() => {
    if (!selectedArticleId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const content = editorRef.current?.innerHTML ?? ''
        const saved = await window.api.saveNote(selectedArticleId, content)
        useStore.setState({ noteContent: content, noteLastSaved: saved.updatedAt })
      } catch (err) {
        setError('笔记保存失败: ' + String(err))
      } finally {
        setSaving(false)
      }
    }, 2000)
  }, [selectedArticleId, setError])

  // 手动保存 (Ctrl+S)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        autoSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [autoSave])

  // 编辑器输入事件
  const handleInput = useCallback(() => {
    if (!editorRef.current) return
    useStore.setState({ noteContent: editorRef.current.innerHTML })
    autoSave()
  }, [autoSave])

  // 格式命令
  const execCmd = useCallback((cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    handleInput()
  }, [handleInput])

  // 关闭面板 — 立即关闭，后台保存
  const handleClose = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const contentToSave = editorRef.current?.innerHTML
    const aid = selectedArticleId
    // 先关面板
    useStore.setState({ notePanelOpen: false })
    // 后台保存（不等返回）
    if (aid && contentToSave !== undefined) {
      window.api.saveNote(aid, contentToSave).catch(() => {})
    }
  }, [selectedArticleId])

  // 导出笔记
  const handleExport = useCallback(async () => {
    try {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (editorRef.current && selectedArticleId) {
        await window.api.saveNote(selectedArticleId, editorRef.current.innerHTML)
      }
      const result = await window.api.exportNotesOpml()
      if (!result.success) {
        setError('导出失败: ' + (result.error ?? '未知错误'))
      }
    } catch (err) {
      setError('导出失败: ' + String(err))
    }
  }, [selectedArticleId, setError])

  // 粘贴时清理
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
    handleInput()
  }, [handleInput])

  if (!notePanelOpen) return null

  const bg = darkMode ? 'bg-gray-900' : 'bg-white'
  const border = darkMode ? 'border-gray-700' : 'border-gray-200'
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500'
  const textMain = darkMode ? 'text-gray-200' : 'text-gray-700'
  const btnHover = darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'

  return (
    <div ref={containerRef} className={`${bg} flex flex-col`} style={{ width: '100%', height: '100%' }}>
      {/* 标题栏 */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${border}`}>
        <div className="flex items-center gap-1.5">
          <PenLine size={14} className="text-amber-500" />
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            笔记
          </span>
          {saving && (
            <span className="text-[10px] text-gray-400 animate-pulse">保存中…</span>
          )}
          {noteLastSaved && !saving && (
            <span className="text-[10px] text-gray-400">
              已保存 {new Date(noteLastSaved).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExport}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${textMuted} ${btnHover} transition-colors`}
            title="导出所有笔记为 Markdown"
          >
            <Download size={12} />
            导出
          </button>
          <button
            onClick={handleClose}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${textMuted} hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors`}
          >
            <X size={12} />
            关闭
          </button>
        </div>
      </div>

      {/* 格式工具栏 */}
      <div className={`flex items-center gap-0.5 px-2 py-1.5 border-b ${border} flex-wrap`}>
        <button onClick={() => execCmd('bold')} className={`p-1 rounded ${btnHover} transition-colors ${textMain}`} title="加粗 (Ctrl+B)">
          <Bold size={14} />
        </button>
        <button onClick={() => execCmd('italic')} className={`p-1 rounded ${btnHover} transition-colors ${textMain}`} title="斜体 (Ctrl+I)">
          <Italic size={14} />
        </button>
        <button onClick={() => execCmd('strikeThrough')} className={`p-1 rounded ${btnHover} transition-colors ${textMain}`} title="删除线">
          <Strikethrough size={14} />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button onClick={() => execCmd('insertUnorderedList')} className={`p-1 rounded ${btnHover} transition-colors ${textMain}`} title="无序列表">
          <List size={14} />
        </button>
        <button onClick={() => execCmd('insertOrderedList')} className={`p-1 rounded ${btnHover} transition-colors ${textMain}`} title="有序列表">
          <ListOrdered size={14} />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* 字体选择 */}
        <div className="relative">
          <button
            onClick={() => { setShowFontPicker(!showFontPicker); setShowSizePicker(false) }}
            className={`flex items-center gap-1 px-1.5 py-1 text-xs rounded ${textMuted} ${btnHover} transition-colors`}
            title="选择字体"
          >
            <Type size={12} />
            {FONT_OPTIONS.find(f => f.value === currentFont)?.label ?? '字体'}
            <ChevronDown size={8} />
          </button>
          {showFontPicker && (
            <div className={`absolute top-full left-0 mt-1 z-30 ${bg} rounded-lg shadow-xl border ${border} w-36 overflow-hidden`}>
              {FONT_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => { execCmd('fontName', f.value); setCurrentFont(f.value); setShowFontPicker(false) }}
                  className={`w-full text-left px-2 py-1 text-xs flex items-center justify-between transition-colors
                    ${currentFont === f.value
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      : `${btnHover} ${textMain}`
                    }`}
                  style={{ fontFamily: f.value }}
                >
                  <span>{f.label}</span>
                  {currentFont === f.value && <Check size={10} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 字体大小 */}
        <div className="relative">
          <button
            onClick={() => { setShowSizePicker(!showSizePicker); setShowFontPicker(false) }}
            className={`flex items-center gap-1 px-1.5 py-1 text-xs rounded ${textMuted} ${btnHover} transition-colors`}
            title="字号"
          >
            {currentSize}
            <ChevronDown size={8} />
          </button>
          {showSizePicker && (
            <div className={`absolute top-full left-0 mt-1 z-30 ${bg} rounded-lg shadow-xl border ${border} w-20 overflow-hidden`}>
              {FONT_SIZE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { execCmd('fontSize', s); setCurrentSize(s); setShowSizePicker(false) }}
                  className={`w-full text-left px-2 py-1 text-xs flex items-center justify-between transition-colors
                    ${currentSize === s
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      : `${btnHover} ${textMain}`
                    }`}
                >
                  <span>{s}</span>
                  {currentSize === s && <Check size={10} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 编辑区域 */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        className={`flex-1 px-4 py-3 text-sm ${textMain} leading-relaxed outline-none overflow-y-auto`}
        style={{
          fontFamily: currentFont,
          fontSize: currentSize + 'px',
          minHeight: '100px',
        }}
        data-placeholder="在此输入笔记…"
        suppressContentEditableWarning
      />

      <style>{`
        [contentEditable]:empty:before {
          content: attr(data-placeholder);
          color: ${darkMode ? '#6b7280' : '#9ca3af'};
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}