import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import {
  Settings, X, Monitor, Sun, Moon, Eye, Type, Globe, Languages, Keyboard, Check, ChevronDown, Columns,
  Sparkles, BarChart3, Tag as TagIcon, Plus, Edit, Trash2, Palette
} from 'lucide-react'
import { LLMSettingsFull } from './LLMSettingsFull'

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

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

type TabKey = 'general' | 'translation' | 'llm' | 'tags'

const TAB_CONFIG: { key: TabKey; icon: typeof Settings; labelKey: string }[] = [
  { key: 'general', icon: Monitor, labelKey: 'systemSettings.tabGeneral' },
  { key: 'translation', icon: Languages, labelKey: 'systemSettings.tabTranslation' },
  { key: 'llm', icon: Sparkles, labelKey: 'systemSettings.tabLLM' },
  { key: 'tags', icon: TagIcon, labelKey: 'systemSettings.tabTags' },
]

// ============ 通用设置面板 ============

function GeneralSettingsPanel() {
  const { t, i18n } = useTranslation()
  const {
    layoutMode, setLayoutMode,
    themeMode, setThemeMode,
    readerFontFamily, setReaderFontFamily,
    readerFontSize, setReaderFontSize,
  } = useStore()

  const [showFontPicker, setShowFontPicker] = useState(false)
  const fontBtnRef = useRef<HTMLButtonElement>(null)

  const THEME_OPTIONS = [
    { value: 'light' as const, icon: Sun, label: t('theme.light') },
    { value: 'dark' as const, icon: Moon, label: t('theme.dark') },
    { value: 'system' as const, icon: Monitor, label: t('theme.system') },
    { value: 'eyeCare' as const, icon: Eye, label: t('theme.eyeCare') },
  ]

  return (
    <div className="px-5 py-4 space-y-5">
      {/* 布局模式 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          <Columns size={13} className="inline mr-1" />
          布局模式
        </label>
        <div className="flex gap-1.5">
          {([
            { value: 'full' as const, label: '全屏模式', desc: '侧栏 + 列表 + 阅读区' },
            { value: 'compact' as const, label: '半屏模式', desc: '专注阅读' },
          ]).map(o => (
            <button
              key={o.value}
              onClick={() => {
                setLayoutMode(o.value)
                // 切换窗口尺寸
                if (o.value === 'compact') window.api.setHalfScreen().catch(() => {})
                else window.api.setFullScreen().catch(() => {})
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-xs rounded-lg border-2 transition-colors ${
                layoutMode === o.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
                  : 'border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="font-medium">{o.label}</span>
              <span className="text-[9px] opacity-60">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* 主题 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          <Monitor size={13} className="inline mr-1" />
          {t('systemSettings.theme')}
        </label>
        <div className="flex gap-1.5">
          {THEME_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setThemeMode(o.value)}
              className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 text-xs rounded-lg border-2 transition-colors ${
                themeMode === o.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
                  : 'border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <o.icon size={16} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* 语言 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          <Globe size={13} className="inline mr-1" />
          {t('systemSettings.language')}
        </label>
        <div className="flex gap-1.5">
          {([
            { code: 'zh', label: '中文简体' },
            { code: 'zh-TW', label: '中文繁體' },
            { code: 'en', label: 'English' },
          ]).map(l => (
            <button
              key={l.code}
              onClick={() => i18n.changeLanguage(l.code)}
              className={`flex-1 px-3 py-1.5 text-xs rounded-lg border-2 transition-colors ${
                i18n.language === l.code
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
                  : 'border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* 字体设置 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          <Type size={13} className="inline mr-1" />
          {t('systemSettings.font')}
        </label>

        {/* 字体选择 */}
        <div className="relative mb-3">
          <button
            ref={fontBtnRef}
            onClick={() => setShowFontPicker(!showFontPicker)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm border-2 border-gray-300 dark:border-white/20 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <span style={{ fontFamily: readerFontFamily }}>
              {FONT_FAMILIES.find(f => f.value === readerFontFamily)?.label || readerFontFamily}
            </span>
            <ChevronDown size={14} />
          </button>
          {showFontPicker && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-52 overflow-y-auto">
              {FONT_FAMILIES.map(f => (
                <button
                  key={f.value}
                  onClick={() => { setReaderFontFamily(f.value); setShowFontPicker(false) }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                    readerFontFamily === f.value
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'
                  }`}
                  style={{ fontFamily: f.value }}
                >
                  <span>{f.label}</span>
                  {readerFontFamily === f.value && <Check size={12} className="text-blue-500 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
          {showFontPicker && (
            <div className="fixed inset-0 z-[5]" onClick={() => setShowFontPicker(false)} />
          )}
        </div>

        {/* 字号调整 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setReaderFontSize(Math.max(FONT_SIZE_MIN, readerFontSize - FONT_SIZE_STEP))}
            disabled={readerFontSize <= FONT_SIZE_MIN}
            className="w-8 h-8 rounded-lg border-2 border-gray-300 dark:border-white/20 flex items-center justify-center text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            −
          </button>
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-gray-800 dark:text-white">{readerFontSize}</div>
            <div className="text-[10px] text-gray-400 dark:text-white/60 uppercase">{t('systemSettings.fontSize')}</div>
          </div>
          <button
            onClick={() => setReaderFontSize(Math.min(FONT_SIZE_MAX, readerFontSize + FONT_SIZE_STEP))}
            disabled={readerFontSize >= FONT_SIZE_MAX}
            className="w-8 h-8 rounded-lg border-2 border-gray-300 dark:border-white/20 flex items-center justify-center text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* 快捷键参考 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          <Keyboard size={13} className="inline mr-1" />
          {t('systemSettings.shortcuts')}
        </label>
        <div className="space-y-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border-2 border-gray-200 dark:border-white/10">
          {([
            ['Ctrl+K', t('systemSettings.shortcutSearch')],
            ['Ctrl+R', t('systemSettings.shortcutRefresh')],
            ['Ctrl+,', t('systemSettings.shortcutLlmSettings')],
            ['Ctrl+B', t('systemSettings.shortcutSidebar')],
            ['s', t('systemSettings.shortcutStar')],
            ['k/↑', t('systemSettings.shortcutPrev')],
            ['j/↓', t('systemSettings.shortcutNext')],
            ['Ctrl+F', t('systemSettings.shortcutFind')],
          ] as const).map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-[10px] font-mono font-semibold text-gray-600 dark:text-gray-300 min-w-[60px] text-center">{key}</kbd>
              <span className="text-gray-500 dark:text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ 翻译设置面板 ============

function TranslationSettingsPanel() {
  const {
    translationUseTextBased, setTranslationUseTextBased,
    translationUseGlossary, setTranslationUseGlossary,
  } = useStore()
  const [glossary, setGlossary] = useState<Array<{ id: number; sourceTerm: string; targetTerm: string; category: string | null }>>([])
  const [newSource, setNewSource] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSource, setEditSource] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.getGlossary().then(r => { if (r.success && r.data) setGlossary(r.data) }).catch(() => {})
  }, [])

  const handleAdd = async () => {
    const s = newSource.trim(); const t = newTarget.trim()
    if (!s || !t) return
    setLoading(true)
    try {
      const r = await window.api.addGlossaryTerm(s, t)
      if (r.success && r.data) { setGlossary(prev => [...prev, r.data]); setNewSource(''); setNewTarget('') }
    } finally { setLoading(false) }
  }

  const handleUpdate = async () => {
    const s = editSource.trim(); const t = editTarget.trim()
    if (!s || !t || editingId === null) return
    setLoading(true)
    try {
      await window.api.updateGlossaryTerm(editingId, s, t)
      setGlossary(prev => prev.map(g => g.id === editingId ? { ...g, sourceTerm: s, targetTerm: t } : g))
      setEditingId(null); setEditSource(''); setEditTarget('')
    } finally { setLoading(false) }
  }

  const handleDelete = async (id: number) => {
    setLoading(true)
    try { await window.api.deleteGlossaryTerm(id); setGlossary(prev => prev.filter(g => g.id !== id)) } finally { setLoading(false) }
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          <Languages size={13} className="inline mr-1" />
          翻译方式
        </label>
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-gray-200 dark:border-white/10 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <input type="checkbox" checked={translationUseTextBased} onChange={e => setTranslationUseTextBased(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <div><span className="text-sm font-medium text-gray-700 dark:text-gray-200">根据文本翻译</span><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">直接对原文文本进行语言模型翻译</p></div>
          </label>
          <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-gray-200 dark:border-white/10 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <input type="checkbox" checked={translationUseGlossary} onChange={e => setTranslationUseGlossary(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <div><span className="text-sm font-medium text-gray-700 dark:text-gray-200">使用术语库翻译</span><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">翻译时参考自定义术语库，确保专业名词翻译一致</p></div>
          </label>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* 术语库管理 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          📖 术语库
        </label>
        <div className="flex gap-2 mb-3">
          <input type="text" value={newSource} onChange={e => setNewSource(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} placeholder="英文术语" className="flex-1 px-2 py-1.5 text-xs border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-gray-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <input type="text" value={newTarget} onChange={e => setNewTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} placeholder="中文翻译" className="flex-1 px-2 py-1.5 text-xs border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-gray-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <button onClick={handleAdd} disabled={loading || !newSource.trim() || !newTarget.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors flex items-center gap-1"><Plus size={13} />添加</button>
        </div>
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {glossary.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400">暂无术语，请添加</div>
          ) : (
            glossary.map(g => (
              <div key={g.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group text-xs">
                {editingId === g.id ? (
                  <>
                    <input value={editSource} onChange={e => setEditSource(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleUpdate() }} className="flex-1 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-gray-100 rounded" autoFocus />
                    <input value={editTarget} onChange={e => setEditTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleUpdate() }} className="flex-1 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-gray-100 rounded" />
                    <button onClick={() => { setEditingId(null); setEditSource(''); setEditTarget('') }} className="px-1 py-0.5 text-gray-400 hover:text-red-500"><X size={12} /></button>
                    <button onClick={handleUpdate} disabled={loading || !editSource.trim() || !editTarget.trim()} className="px-1 py-0.5 text-green-500 hover:text-green-600 disabled:opacity-40">✓</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-gray-700 dark:text-gray-200 truncate font-medium">{g.sourceTerm}</span>
                    <span className="text-gray-400 dark:text-gray-500">→</span>
                    <span className="flex-1 text-gray-700 dark:text-gray-200 truncate">{g.targetTerm}</span>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(g.id); setEditSource(g.sourceTerm); setEditTarget(g.targetTerm) }} className="px-1 py-0.5 text-gray-400 hover:text-blue-500" title="编辑"><Edit size={11} /></button>
                      <button onClick={() => handleDelete(g.id)} className="px-1 py-0.5 text-gray-400 hover:text-red-500" title="删除"><Trash2 size={11} /></button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ============ 标签管理面板 ============

function TagsSettingsPanel() {
  const { t } = useTranslation()
  const { tags, fetchTags, createTag, updateTag, deleteTag, tagArticleCounts } = useStore()

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[5])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  useEffect(() => { fetchTags() }, [fetchTags])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      await createTag(name, newColor)
      setNewName('')
      setNewColor(PRESET_COLORS[5])
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (tag: { id: number; name: string; color: string | null }) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || PRESET_COLORS[5])
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditColor('')
  }

  const handleUpdate = async () => {
    const name = editName.trim()
    if (!name || editingId === null) return
    setCreating(true)
    try {
      await updateTag(editingId, name, editColor)
      cancelEdit()
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    await deleteTag(id)
    setDeleteConfirmId(null)
  }

  return (
    <div className="px-5 py-4 space-y-4">
      {/* 创建区域 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            placeholder={t('tagManager.tagName')}
            className="flex-1 px-3 py-1.5 text-sm border-2 border-gray-300 dark:border-white/20 bg-white dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400"
          />
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-8 h-8 rounded-lg border-2 border-gray-300 dark:border-white/20 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title={t('tagManager.chooseColor')}
            >
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: newColor }} />
            </button>
            {showColorPicker && (
              <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-2 flex gap-1.5">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setNewColor(c); setShowColorPicker(false) }}
                    className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${newColor === c ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={13} />
            {t('tagManager.create')}
          </button>
        </div>
        {showColorPicker && <div className="fixed inset-0 z-10" onClick={() => setShowColorPicker(false)} />}
      </div>

      {/* 标签列表 */}
      <div className="max-h-60 overflow-y-auto">
        {tags.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            {t('tagManager.noTagsYet')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
              >
                {editingId === tag.id ? (
                  <>
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 border-2 border-gray-300 dark:border-gray-500"
                      style={{ backgroundColor: editColor }}
                    />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate() }}
                      className="flex-1 px-2 py-0.5 text-sm border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-gray-100 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                    <button onClick={cancelEdit} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <X size={13} />
                    </button>
                    <button
                      onClick={handleUpdate}
                      disabled={creating || !editName.trim()}
                      className="p-1 text-green-500 hover:text-green-600 disabled:opacity-40 transition-colors"
                    >
                      <Check size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color || '#3b82f6' }}
                    />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
                      {tag.name}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[1.5rem] text-right">
                      {tagArticleCounts[tag.id] ?? 0}
                    </span>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(tag)}
                        className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors"
                        title={t('tagManager.edit')}
                      >
                        <Edit size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(tag.id)}
                        className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                        title={t('tagManager.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认 */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-80">
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-4">
              {t('tagManager.confirmDelete')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('tagManager.cancel')}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                {t('tagManager.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ 主组件 ============

export default function SystemSettings() {
  const { t } = useTranslation()
  const { showSettings, setShowSettings } = useStore()
  const [activeTab, setActiveTab] = useState<TabKey>('general')

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b-2 border-gray-300 dark:border-white/20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">{t('systemSettings.title')}</h2>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 标签页导航 */}
        <div className="flex-shrink-0 border-b-2 border-gray-300 dark:border-white/20 px-2">
          <div className="flex gap-0.5 overflow-x-auto">
            {TAB_CONFIG.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  {t(tab.labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'general' && <GeneralSettingsPanel />}
          {activeTab === 'translation' && <TranslationSettingsPanel />}
          {activeTab === 'llm' && <LLMSettingsFull />}
          {activeTab === 'tags' && <TagsSettingsPanel />}
        </div>
      </div>
    </div>
  )
}