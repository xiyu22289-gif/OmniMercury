import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { Settings, X, RotateCcw, Check, Zap, Loader2, Eye, EyeOff, BarChart3 } from 'lucide-react'
import type { TokenStats } from '../../shared/types'

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
]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function LLMSettings() {
  const { showSettings, setShowSettings, llmConfig, loadLlmConfig, tokenStats, tokenStatsLoading, loadTokenStats } = useStore()

  const [form, setForm] = useState<FormData>({
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat'
  })
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs: number; message: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    if (showSettings && llmConfig) {
      setForm({
        baseUrl: llmConfig.baseUrl,
        apiKey: llmConfig.apiKeys?.[llmConfig.model] || llmConfig.apiKey,
        model: llmConfig.model
      })
    }
  }, [showSettings, llmConfig])

  // 打开弹窗时加载 Token 统计
  useEffect(() => {
    if (showSettings && showStats) {
      loadTokenStats()
    }
  }, [showSettings, showStats])

  const handlePreset = (preset: typeof PRESET_MODELS[number]) => {
    const savedKey = llmConfig?.apiKeys?.[preset.model] || ''
    setForm((prev) => ({ ...prev, baseUrl: preset.baseUrl, model: preset.model, apiKey: savedKey }))
  }

  const handleSave = async () => {
    const updatedApiKeys = { ...(llmConfig?.apiKeys ?? {}), [form.model]: form.apiKey }
    await window.api.setLlmConfig({ ...form, apiKeys: updatedApiKeys, apiKey: form.apiKey } as unknown as Record<string, string>)
    await loadLlmConfig()
    setSaved(true)
    setTimeout(() => { setSaved(false); setShowSettings(false) }, 400)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.testConnection({ baseUrl: form.baseUrl, apiKey: form.apiKey, model: form.model })
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, latencyMs: 0, message: String(err) })
    } finally { setTesting(false) }
  }

  const handleReset = async () => { await window.api.resetLlmConfig(); await loadLlmConfig() }

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              LLM 通用设置
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowStats(!showStats)}
              className={`p-1 rounded transition-colors ${showStats ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
              title="Token 用量统计"
            >
              <BarChart3 size={16} />
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {showStats ? (
            /* ===== Token 统计面板 ===== */
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Token 用量统计（近 30 天）</h3>

              {tokenStatsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-purple-500" />
                </div>
              ) : !tokenStats || tokenStats.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
                  暂无数据。使用 AI 摘要或翻译功能后将自动统计。
                </div>
              ) : (
                <div className="space-y-4">
                  {tokenStats.map((stat: TokenStats) => (
                    <div key={stat.model} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{stat.model}</h4>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{stat.callCount} 次调用</span>
                      </div>

                      {/* 总计 */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-white dark:bg-gray-800 rounded p-2 text-center">
                          <div className="text-xs text-gray-400 dark:text-gray-500">Input</div>
                          <div className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatTokens(stat.totalPromptTokens)}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded p-2 text-center">
                          <div className="text-xs text-gray-400 dark:text-gray-500">Output</div>
                          <div className="text-sm font-bold text-green-600 dark:text-green-400">{formatTokens(stat.totalCompletionTokens)}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded p-2 text-center">
                          <div className="text-xs text-gray-400 dark:text-gray-500">Total</div>
                          <div className="text-sm font-bold text-purple-600 dark:text-purple-400">{formatTokens(stat.totalTokens)}</div>
                        </div>
                      </div>

                      {/* 按操作类型细分 */}
                      {stat.byOperation.length > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                          {stat.byOperation.map(op => (
                            <div key={op.operation} className="flex items-center justify-between">
                              <span>
                                {op.operation === 'summarize' ? '📝 摘要' : '🌐 翻译'}
                              </span>
                              <span>
                                Input {formatTokens(op.prompt)} / Output {formatTokens(op.completion)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 手动刷新 */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={loadTokenStats}
                  disabled={tokenStatsLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw size={12} />
                  刷新统计
                </button>
              </div>
            </div>
          ) : (
            /* ===== LLM 配置表单 ===== */
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
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Base URL</label>
                <input
                  type="url"
                  value={form.baseUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 pr-9 text-sm border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title={showKey ? '隐藏 API Key' : '显示 API Key'}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  密钥仅存储在本地，绝不联网上传
                </p>
              </div>

              {/* 模型名称 */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">模型名称</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="gpt-4o-mini"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>

              {/* 测试连接 */}
              <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing || !form.apiKey.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                    {testing ? '测试中...' : '测试连接'}
                  </button>
                  {testResult && (
                    <span className={`text-xs ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      {testResult.success ? '✓' : '✗'} {testResult.latencyMs > 0 ? `${testResult.latencyMs}ms` : ''} {testResult.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮（仅配置模式显示） */}
        {!showStats && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <RotateCcw size={13} />
              重置
            </button>
            <button
              onClick={handleSave}
              disabled={!form.apiKey.trim()}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saved ? (<> <Check size={14} /> 已保存 </>) : '保存配置'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}