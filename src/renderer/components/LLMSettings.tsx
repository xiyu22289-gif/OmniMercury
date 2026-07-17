import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { Settings, X, RotateCcw, Check } from 'lucide-react'

interface FormData {
  baseUrl: string
  apiKey: string
  model: string
  translateTarget: string
}

const PRESET_MODELS = [
  { label: 'OpenAI (GPT-4o-mini)', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek (deepseek-chat)', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: '通义千问 (qwen-turbo)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  { label: '智谱 (glm-4-flash)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
]

export default function LLMSettings() {
  const { showSettings, setShowSettings, llmConfig, setLlmConfig, loadLlmConfig } = useStore()

  const [form, setForm] = useState<FormData>({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    translateTarget: 'Chinese'
  })
  const [saved, setSaved] = useState(false)

  // 弹窗打开时从 store 同步配置到表单
  useEffect(() => {
    if (showSettings && llmConfig) {
      setForm({
        baseUrl: llmConfig.baseUrl,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        translateTarget: llmConfig.translateTarget
      })
    }
  }, [showSettings, llmConfig])

  const handlePreset = (preset: typeof PRESET_MODELS[number]) => {
    setForm((prev) => ({
      ...prev,
      baseUrl: preset.baseUrl,
      model: preset.model
    }))
  }

  const handleSave = async () => {
    await window.api.setLlmConfig(form as unknown as Record<string, string>)
    await loadLlmConfig()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = async () => {
    await window.api.resetLlmConfig()
    await loadLlmConfig()
  }

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-850 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              LLM 通用设置
            </h2>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="px-5 py-4 space-y-4">
          {/* 快捷预设 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              快捷预设
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MODELS.map((preset) => (
                <button
                  key={preset.model}
                  onClick={() => handlePreset(preset)}
                  className="px-2.5 py-1 text-xs rounded-full border border-gray-300 dark:border-gray-600
                           text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:border-blue-300
                           dark:hover:bg-blue-900/30 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Base URL
            </label>
            <input
              type="url"
              value={form.baseUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600
                       dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600
                       dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              密钥仅存储在本地，绝不联网上传
            </p>
          </div>

          {/* 模型名称 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              模型名称
            </label>
            <input
              type="text"
              value={form.model}
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600
                       dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* 翻译目标语言 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              翻译目标语言
            </label>
            <select
              value={form.translateTarget}
              onChange={(e) => setForm((prev) => ({ ...prev, translateTarget: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600
                       dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="Chinese">中文</option>
              <option value="English">English</option>
              <option value="Japanese">日本語</option>
              <option value="Korean">한국어</option>
              <option value="French">Français</option>
              <option value="German">Deutsch</option>
            </select>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-red-500
                     rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <RotateCcw size={13} />
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={!form.apiKey.trim()}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-medium text-white
                     bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
          >
            {saved ? (
              <>
                <Check size={14} />
                已保存
              </>
            ) : (
              '保存配置'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}