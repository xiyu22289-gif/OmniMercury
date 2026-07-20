import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { Settings, X, RotateCcw, Check } from 'lucide-react'

interface FormData {
  baseUrl: string
  apiKey: string
  model: string
}

const PRESET_MODELS = [
  { label: 'DeepSeek V4 Flash', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' },
  { label: 'ChatECNU (华东师大)', baseUrl: 'https://chat.ecnu.edu.cn/open/api/v1', model: 'ecnu-max' },
  { label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' },
  { label: 'OpenAI (ChatGPT)', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Claude', baseUrl: 'https://codeapi.icu/v1', model: 'claude-sonnet-5' },
]

export default function LLMSettings() {
  const { showSettings, setShowSettings, llmConfig, setLlmConfig, loadLlmConfig } = useStore()

  const [form, setForm] = useState<FormData>({
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat'
  })
  const [saved, setSaved] = useState(false)

  // 弹窗打开时从 store 同步配置到表单
  useEffect(() => {
    if (showSettings && llmConfig) {
      setForm({
        baseUrl: llmConfig.baseUrl,
        apiKey: llmConfig.apiKeys?.[llmConfig.model] || llmConfig.apiKey,
        model: llmConfig.model
      })
    }
  }, [showSettings, llmConfig])

  const handlePreset = (preset: typeof PRESET_MODELS[number]) => {
    // 读取该模型之前存储的 API Key，若无则为空
    const savedKey = llmConfig?.apiKeys?.[preset.model] || ''
    setForm((prev) => ({
      ...prev,
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiKey: savedKey
    }))
  }

  const handleSave = async () => {
    // 将当前 key 写入 apiKeys[当前模型]
    const updatedApiKeys = { ...(llmConfig?.apiKeys ?? {}), [form.model]: form.apiKey }
    await window.api.setLlmConfig({
      ...form,
      apiKeys: updatedApiKeys,
      apiKey: form.apiKey
    } as unknown as Record<string, string>)
    await loadLlmConfig()
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setShowSettings(false)
    }, 400)
  }

  const handleReset = async () => {
    await window.api.resetLlmConfig()
    await loadLlmConfig()
  }

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
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
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">
              快捷预设
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MODELS.map((preset) => {
                const isActive = form.model === preset.model
                return (
                  <button
                    key={preset.model}
                    onClick={() => handlePreset(preset)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      isActive
                        ? 'bg-blue-500 text-white border-blue-500 dark:bg-blue-600 dark:border-blue-500 dark:text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
              Base URL
            </label>
            <input
              type="url"
              value={form.baseUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-500
                       bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none
                       focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
              API Key
            </label>
            <input
              type="text"
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-500
                       bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none
                       focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              密钥仅存储在本地，绝不联网上传
            </p>
          </div>

          {/* 模型名称 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
              模型名称
            </label>
            <input
              type="text"
              value={form.model}
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-500
                       bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none
                       focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-red-500
                     dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
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