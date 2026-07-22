import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { Tag as TagIcon, Plus, X, Edit, Trash2, Check, Palette } from 'lucide-react'

// ============ 预设颜色 ============

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

const COLOR_LABELS: Record<string, string> = {
  '#ef4444': '红色', '#f97316': '橙色', '#eab308': '黄色', '#22c55e': '绿色',
  '#06b6d4': '青色', '#3b82f6': '蓝色', '#8b5cf6': '紫色', '#ec4899': '粉色',
}

// ============ 组件 ============

interface TagManagerProps {
  open: boolean
  onClose: () => void
}

export default function TagManager({ open, onClose }: TagManagerProps) {
  const { t } = useTranslation()
  const { tags, fetchTags, createTag, deleteTag } = useStore()

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[5]) // 默认蓝色
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [creating, setCreating] = useState(false)

  // 编辑状态
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  // 删除确认
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  // 打开时刷新
  useEffect(() => {
    if (open) fetchTags()
  }, [open])

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

  const handleDelete = async (id: number) => {
    await deleteTag(id)
    setDeleteConfirmId(null)
  }

  // 文章数量模拟 — 后续可以从 store 派生
  const getArticleCount = (_tagId: number) => 0

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[70vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <TagIcon size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {t('tagManager.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 创建区域 */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder={t('tagManager.tagName')}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-500
                       bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none
                       focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400"
            />
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-8 h-8 rounded-lg border border-gray-300 dark:border-gray-500 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                      title={COLOR_LABELS[c]}
                    />
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg
                       hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={13} />
              {t('tagManager.create')}
            </button>
          </div>
        </div>

        {/* 标签列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
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
                    // 编辑模式
                    <>
                      <div className="relative">
                        <button
                          onClick={() => setShowColorPicker(!showColorPicker)}
                          className="w-5 h-5 rounded-full flex-shrink-0 border-2 border-gray-300 dark:border-gray-500"
                          style={{ backgroundColor: editColor }}
                        />
                      </div>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-0.5 text-sm border border-gray-300 dark:border-gray-500
                                 bg-white dark:bg-gray-700 dark:text-gray-100 rounded focus:outline-none
                                 focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={cancelEdit}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <X size={13} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 text-green-500 hover:text-green-600"
                      >
                        <Check size={13} />
                      </button>
                    </>
                  ) : (
                    // 展示模式
                    <>
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color || '#3b82f6' }}
                      />
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
                        {tag.name}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[1.5rem] text-right">
                        {getArticleCount(tag.id)}
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

        {/* 底部 */}
        <div className="px-5 py-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {t('tagManager.close')}
          </button>
        </div>
      </div>

      {/* 删除确认对话框 */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
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
