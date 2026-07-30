import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { X, RotateCcw, Check, Zap, Loader2, Eye, EyeOff, BarChart3, Globe, FileText, MousePointerClick, ListFilter, Star } from 'lucide-react'
import type { TokenStats, LlmFunctionType, LlmFunctionConfig, CustomModelConfig, LlmModelItem } from '../../shared/types'
import { ModelDetailView } from './LLMSettings'

const PRESET_MODELS = [
  { label: 'DeepSeek V4 Flash', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' },
  { label: 'ChatECNU (华东师大)', baseUrl: 'https://chat.ecnu.edu.cn/open/api/v1', model: 'ecnu-max' },
  { label: 'Kimi K2.7 Code', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.7-code' },
  { label: 'GPT-5.6 Luna (CodeAPI)', baseUrl: 'https://codeapi.icu/v1', model: 'gpt-5.6-luna' },
]

type LTabType = 'fullTranslate' | 'selectiveTranslate' | 'fullSummary' | 'selectiveSummary' | 'tokenStats'
const TAB_CONFIG: { key: LTabType; icon: typeof Globe; labelKey: string }[] = [
  { key: 'fullTranslate', icon: Globe, labelKey: 'llmSettings.tabFullTranslate' },
  { key: 'selectiveTranslate', icon: MousePointerClick, labelKey: 'llmSettings.tabSelectiveTranslate' },
  { key: 'fullSummary', icon: FileText, labelKey: 'llmSettings.tabFullSummary' },
  { key: 'selectiveSummary', icon: ListFilter, labelKey: 'llmSettings.tabSelectiveSummary' },
  { key: 'tokenStats', icon: BarChart3, labelKey: 'llmSettings.tabTokenStats' },
]
const ALL_FUNC_TYPES: LlmFunctionType[] = ['fullTranslate', 'selectiveTranslate', 'fullSummary', 'selectiveSummary']

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function CustomModelEditor({ editingIndex, customForm, showKey, listingModels, availableModels, recommendedModels, modelListError, modelListSuggestV1, duplicateHint, onFormChange, onCancel, onTestModels, onSave, onSelectModel, onSuggestV1Confirm, onSuggestV1Cancel }: {
  editingIndex: number; customForm: CustomModelConfig; showKey: boolean; listingModels: boolean; availableModels: LlmModelItem[]
  recommendedModels: string[]; modelListError: string; modelListSuggestV1: boolean; duplicateHint: string; onFormChange: (form: CustomModelConfig) => void; onCancel: () => void
  onTestModels: () => void; onSave: () => void; onSelectModel: (id: string) => void; onSuggestV1Confirm: () => void; onSuggestV1Cancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="border-2 border-indigo-300 dark:border-indigo-700 rounded-lg p-3 bg-indigo-50/30 dark:bg-indigo-900/10 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{editingIndex >= 0 ? t('llmSettings.editCustomModel') : t('llmSettings.newCustomModel')}</span>
        <button onClick={onCancel} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/80 mb-1">{t('llmSettings.customModelLabel')}</label>
        <input type="text" value={customForm.label} onChange={(e) => onFormChange({ ...customForm, label: e.target.value })} placeholder={t('llmSettings.customModelLabelPlaceholder')} spellCheck={false} className="w-full px-3 py-1.5 text-xs border-2 border-gray-500 dark:border-white/20 bg-white dark:bg-gray-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/80 mb-1">{t('llmSettings.baseUrl')}</label>
        <input type="url" value={customForm.baseUrl} onChange={(e) => onFormChange({ ...customForm, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" spellCheck={false} className="w-full px-3 py-1.5 text-xs border-2 border-gray-500 dark:border-white/20 bg-white dark:bg-gray-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/80 mb-1">{t('llmSettings.apiKey')}</label>
        <input type={showKey ? 'text' : 'password'} value={customForm.apiKey} onChange={(e) => onFormChange({ ...customForm, apiKey: e.target.value })} placeholder="sk-..." spellCheck={false} className="w-full px-3 py-1.5 text-xs border-2 border-gray-500 dark:border-white/20 bg-white dark:bg-gray-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>
      <button onClick={onTestModels} disabled={listingModels || !customForm.baseUrl.trim() || !customForm.apiKey.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{listingModels ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}{listingModels ? t('llmSettings.listingModels') : t('llmSettings.testAndListModels')}</button>
      {modelListError && (<div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded border border-red-200 dark:border-red-700">{modelListError}</div>)}
      {modelListSuggestV1 && (<div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 space-y-1.5"><p>{t('llmSettings.suggestV1')}</p><div className="flex gap-2"><button onClick={onSuggestV1Confirm} className="px-2 py-1 text-xs font-medium text-white bg-amber-500 rounded hover:bg-amber-600 transition-colors">{t('llmSettings.confirm')}</button><button onClick={onSuggestV1Cancel} className="px-2 py-1 text-xs text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-600 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">{t('llmSettings.cancel')}</button></div></div>)}
      {duplicateHint && (<div className="text-xs text-blue-500 dark:text-blue-400 italic">{duplicateHint}</div>)}
      {availableModels.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/80 mb-1">{t('llmSettings.availableModels', { count: availableModels.length })}</label>
          {recommendedModels.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1"><Star size={10} /> {t('llmSettings.recommendedModels')}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {recommendedModels.map(rm => (<button key={rm} onClick={() => onSelectModel(rm)} type="button" className={`cursor-pointer px-2 py-1 text-[11px] rounded border transition-all ${customForm.model === rm ? 'bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-600 dark:border-indigo-500 dark:text-white font-medium ring-2 ring-indigo-300' : 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 active:scale-95 dark:border-amber-600 dark:text-amber-300 dark:bg-amber-900/20 dark:hover:bg-amber-900/40'}`}>⭐ {rm}</button>))}
              </div>
            </div>
          )}
          <div className="max-h-40 overflow-y-auto border-2 border-gray-500 dark:border-white/20 rounded">
            {availableModels.map(m => (<button key={m.id} onClick={() => onSelectModel(m.id)} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${customForm.model === m.id ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-white font-medium' : 'text-gray-700 dark:text-white/80'}`}>{recommendedModels.includes(m.id) && <Star size={10} className="inline mr-1 text-amber-500" />}{m.name}</button>))}
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/80 mb-1">{t('llmSettings.model')}</label>
        <input type="text" value={customForm.model} onChange={(e) => onFormChange({ ...customForm, model: e.target.value })} placeholder="gpt-4o-mini" className="w-full px-3 py-1.5 text-xs border-2 border-gray-500 dark:border-white/20 bg-white dark:bg-gray-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 text-xs text-gray-600 dark:text-white/80 border-2 border-gray-500 dark:border-white/20 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">{t('llmSettings.cancel')}</button>
        <button onClick={onSave} className="flex-1 py-1.5 text-xs font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors">{t('llmSettings.saveCustomModel')}</button>
      </div>
    </div>
  )
}

interface LlmConfigPanelProps { funcType: LlmFunctionType; config: LlmFunctionConfig; onSave: (config: LlmFunctionConfig) => Promise<boolean> }
function LlmConfigPanel({ funcType, config, onSave }: LlmConfigPanelProps) {
  const { t } = useTranslation()
  const [selectedModel, setSelectedModel] = useState(config.model)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ ...config.apiKeys })
  const [customModels, setCustomModels] = useState<CustomModelConfig[]>([...config.customModels])
  const [saved, setSaved] = useState(false); const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs: number; message: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [editingCustomIndex, setEditingCustomIndex] = useState<number | null>(null)
  const [customForm, setCustomForm] = useState<CustomModelConfig>({ label: '', baseUrl: '', apiKey: '', model: '' })
  const [listingModels, setListingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<LlmModelItem[]>([])
  const [recommendedModels, setRecommendedModels] = useState<string[]>([])
  const [modelListError, setModelListError] = useState('')
  const [modelListSuggestV1, setModelListSuggestV1] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [checkedForDelete, setCheckedForDelete] = useState<Set<number>>(new Set())
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [duplicateHint, setDuplicateHint] = useState('')

  useEffect(() => { setSelectedModel(config.model); setApiKeys({ ...config.apiKeys }); setCustomModels([...config.customModels]) }, [config])

  useEffect(() => {
    const u = customForm.baseUrl.trim().replace(/\/+$/, '')
    const k = customForm.apiKey.trim()
    const m = customForm.model.trim()
    if (!u || !k || !m) { setDuplicateHint(''); return }
    const dup = customModels.find((c, i) => {
      if (i === editingCustomIndex) return false
      const eu = c.baseUrl.trim().replace(/\/+$/, '')
      return eu === u && c.apiKey.trim() === k && c.model === m
    })
    if (dup) setDuplicateHint(t('llmSettings.duplicateModelHint', { name: dup.label }))
    else setDuplicateHint('')
  }, [customForm.baseUrl, customForm.apiKey, customForm.model, customModels, editingCustomIndex, t])

  const currentModel = selectedModel; const preset = PRESET_MODELS.find(p => p.model === currentModel)
  const currentCustom = customModels.find(c => c.model === currentModel || c.label === currentModel)
  const isPresetModel = !!preset; const showingCustomDetail = !!currentCustom && editingCustomIndex === null
  const currentLabel = isPresetModel ? preset!.label : (currentCustom?.label || currentModel)
  const currentBaseUrl = isPresetModel ? preset!.baseUrl : (currentCustom?.baseUrl || '')
  const currentModelId = isPresetModel ? preset!.model : (currentCustom?.model || currentModel)

  const handlePresetClick = (modelId: string) => { setSelectedModel(modelId); setTestResult(null) }
  const handleCustomModelClick = (cm: CustomModelConfig) => { setSelectedModel(cm.model); setTestResult(null) }
  const handleApiKeyChange = (model: string, value: string) => { setApiKeys(prev => ({ ...prev, [model]: value })) }

  const handleTest = async () => {
    const key = isPresetModel ? (apiKeys[currentModelId] || '') : (currentCustom?.apiKey || '')
    if (!key.trim()) { setTestResult({ success: false, latencyMs: 0, message: '请先填写 API Key' }); return }
    setTesting(true); setTestResult(null)
    try { const result = await window.api.testConnection({ baseUrl: currentBaseUrl, apiKey: key, model: currentModelId }); setTestResult(result) }
    catch (err) { setTestResult({ success: false, latencyMs: 0, message: String(err) }) }
    finally { setTesting(false) }
  }

  const handleSave = async () => {
    const updated: LlmFunctionConfig = { model: selectedModel, apiKeys: { ...apiKeys }, customModels: [...customModels] }
    if (isPresetModel) { const key = apiKeys[preset!.model] || ''; if (key.trim()) { setTesting(true); try { const result = await window.api.testConnection({ baseUrl: preset!.baseUrl, apiKey: key, model: preset!.model }); setTestResult(result); if (!result.success) { setTesting(false); return } } catch (err) { setTestResult({ success: false, latencyMs: 0, message: String(err) }); setTesting(false); return }; setTesting(false) } }
    const newKeys: Record<string, string> = {}; for (const m of PRESET_MODELS) { if (apiKeys[m.model]?.trim()) newKeys[m.model] = apiKeys[m.model] }
    for (const cm of customModels) { const mp = PRESET_MODELS.find(p => p.model === cm.model); if (mp && cm.apiKey.trim()) newKeys[cm.model] = cm.apiKey }
    const success = await onSave(updated)
    if (success && Object.keys(newKeys).length > 0) { for (const otherFunc of ALL_FUNC_TYPES) { if (otherFunc === funcType) continue; try { const oc = await window.api.getLlmFunctionConfig(otherFunc); let ch = false; const ua = { ...oc.apiKeys }; for (const [m, k] of Object.entries(newKeys)) { if (ua[m] !== k) { ua[m] = k; ch = true } }; if (ch) await window.api.setLlmFunctionConfig(otherFunc, { ...oc, apiKeys: ua }) } catch {} } }
    if (success) { setSaved(true); setTimeout(() => setSaved(false), 400) }
  }

  const startEditCustom = (index: number) => { setEditingCustomIndex(index); setCustomForm(index >= 0 ? { ...customModels[index] } : { label: '', baseUrl: '', apiKey: '', model: '' }); setTestResult(null) }
  const cancelEditCustom = () => { setEditingCustomIndex(null); setAvailableModels([]); setRecommendedModels([]); setModelListError(''); setDeleteMode(false); setCheckedForDelete(new Set()) }

  const handleListModels = async (baseUrlOverride?: string) => {
    const url = baseUrlOverride || customForm.baseUrl
    if (!url.trim() || !customForm.apiKey.trim()) { setModelListError(t('llmSettings.fillBaseUrlAndKey')); return }
    setModelListError(''); setModelListSuggestV1(false); setListingModels(true); setAvailableModels([]); setRecommendedModels([])
    try { const r = await window.api.listLlmModels(url, customForm.apiKey); if (r.success) { if (r.models.length === 0) { if (!url.includes('/v1')) { setModelListSuggestV1(true); setModelListError(''); } else { setModelListError(t('llmSettings.noModelsFound')) } } else { setAvailableModels(r.models); setRecommendedModels(r.recommended || []) } } else { if (!url.includes('/v1')) { setModelListSuggestV1(true); setModelListError(''); } else { setModelListError(r.error) } } }
    catch (err) { if (!url.includes('/v1')) { setModelListSuggestV1(true); setModelListError(''); } else { setModelListError(String(err)) } }
    finally { setListingModels(false) }
  }

  const saveCustomModel = async () => {
    if (!customForm.label.trim()) { setModelListError('请输入模型名称'); return }
    if (!customForm.baseUrl.trim() || !customForm.apiKey.trim()) { setModelListError('请填写 Base URL 和 API Key'); return }
    if (!customForm.model.trim()) { setModelListError('请选择或输入模型名称'); return }
    const isNew = editingCustomIndex === null || editingCustomIndex < 0; const updated = isNew ? [...customModels, { ...customForm }] : customModels.map((cm, i) => i === editingCustomIndex ? { ...customForm } : cm)
    const sa = { ...apiKeys, [customForm.model]: customForm.apiKey }; const fc: LlmFunctionConfig = { model: customForm.model, apiKeys: sa, customModels: updated }
    setCustomModels(updated); setSelectedModel(customForm.model); setEditingCustomIndex(null); setAvailableModels([]); setRecommendedModels([]); setModelListError(''); setListingModels(false); setTestResult(null)
    const success = await onSave(fc)
    if (success) {
      for (const otherFunc of ALL_FUNC_TYPES) { if (otherFunc === funcType) continue; try { const oc = await window.api.getLlmFunctionConfig(otherFunc); const ei = oc.customModels.findIndex(c => c.label === customForm.label || c.model === customForm.model); let nc: CustomModelConfig[]; if (ei >= 0) nc = oc.customModels.map((c, i) => i === ei ? { ...customForm } : c); else nc = [...oc.customModels, { ...customForm }]; const sk = { ...oc.apiKeys, [customForm.model]: customForm.apiKey }; await window.api.setLlmFunctionConfig(otherFunc, { model: customForm.model, apiKeys: sk, customModels: nc }) } catch {} }
      await useStore.getState().loadLlmGlobalConfig(); setSaved(true); setTimeout(() => setSaved(false), 400)
    }
  }

  const enterDeleteMode = () => { setDeleteMode(true); setCheckedForDelete(new Set()) }
  const exitDeleteMode = () => { setDeleteMode(false); setCheckedForDelete(new Set()) }
  const toggleDeleteCheck = (idx: number) => {
    setCheckedForDelete(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }
  const selectAllForDelete = () => setCheckedForDelete(new Set(customModels.map((_, i) => i)))
  const deselectAllForDelete = () => setCheckedForDelete(new Set())

  const executeBatchDelete = () => {
    const toDelete = customModels.filter((_, i) => checkedForDelete.has(i))
    if (toDelete.length === 0) return
    const names = toDelete.map(c => `「${c.label}」`).join('\n')
    setConfirmDialog({
      message: t('llmSettings.deleteSelectedWarning', { names }),
      onConfirm: async () => {
        setConfirmDialog(null)
        const remaining = customModels.filter((_, i) => !checkedForDelete.has(i))
        const deletedLabels = new Set(toDelete.map(c => c.label))
        const deletedModels = new Set(toDelete.map(c => c.model))
        setCustomModels(remaining)
        if (deletedModels.has(selectedModel) || deletedLabels.has(selectedModel)) {
          if (remaining.length > 0) setSelectedModel(remaining[0].model)
          else setSelectedModel(PRESET_MODELS[0].model)
        }
        setDeleteMode(false); setCheckedForDelete(new Set())
        for (const ft of ALL_FUNC_TYPES) {
          try {
            const oc = await window.api.getLlmFunctionConfig(ft)
            const nc = oc.customModels.filter(c => !deletedLabels.has(c.label) && !deletedModels.has(c.model))
            if (nc.length !== oc.customModels.length) {
              const needNewModel = deletedLabels.has(oc.model) || deletedModels.has(oc.model)
              const newModel = needNewModel ? (nc.length > 0 ? nc[0].model : PRESET_MODELS[0].model) : oc.model
              await window.api.setLlmFunctionConfig(ft, { model: newModel, apiKeys: oc.apiKeys, customModels: nc })
            }
          } catch {}
        }
        await useStore.getState().loadLlmGlobalConfig()
      }
    })
  }
  const showDetail = (isPresetModel || showingCustomDetail) && editingCustomIndex === null && !listingModels

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{t('llmSettings.currentModel')}：</span>
        <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold">{currentLabel}</span>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-white/90 mb-2">{t('llmSettings.presets')}</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PRESET_MODELS.map((p) => { const isActive = currentModel === p.model; return (
            <button key={p.model} onClick={() => handlePresetClick(p.model)} className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${isActive ? 'bg-blue-500 text-white border-blue-500 dark:bg-blue-600 dark:border-blue-500 dark:text-white' : 'border-gray-400 text-gray-600 hover:bg-gray-100 dark:border-white/30 dark:text-white/80 dark:hover:bg-gray-700'}`}>{p.label}</button>)})}
          {customModels.map((cm, idx) => { const isActive = currentModel === cm.model || currentModel === cm.label; return (
            <button key={`custom-${idx}`} onClick={() => handleCustomModelClick(cm)} className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1 ${isActive ? 'bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-600 dark:border-indigo-500 dark:text-white' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-600 dark:text-indigo-300 dark:hover:bg-indigo-900/30'}`}>{cm.label}</button>)})}
          {editingCustomIndex === null && (
            <button onClick={() => startEditCustom(-1)} className="px-2.5 py-1 text-xs rounded-full border border-dashed border-indigo-400 text-indigo-500 hover:bg-indigo-50 dark:border-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/20 transition-colors">+ 自定义</button>)}
        </div>
      </div>
      {showDetail && (<ModelDetailView modelId={currentModelId} baseUrl={currentBaseUrl} initialApiKey={isPresetModel ? (apiKeys[currentModelId] || '') : (currentCustom?.apiKey || '')} showKey={showKey} onShowKeyToggle={() => setShowKey(!showKey)} onApiKeyChange={(value) => { if (isPresetModel) handleApiKeyChange(currentModelId, value); else if (currentCustom) setCustomModels(prev => prev.map(c => { if (c.model === currentCustom.model || c.label === currentCustom.label) return { ...c, apiKey: value }; return c })) }} testing={testing} onTest={handleTest} testResult={testResult} isPreset={isPresetModel} />)}
      {editingCustomIndex !== null && (<CustomModelEditor editingIndex={editingCustomIndex} customForm={customForm} showKey={showKey} listingModels={listingModels} availableModels={availableModels} recommendedModels={recommendedModels} modelListError={modelListError} modelListSuggestV1={modelListSuggestV1} duplicateHint={duplicateHint} onFormChange={setCustomForm} onCancel={cancelEditCustom} onTestModels={() => handleListModels()} onSave={saveCustomModel} onSelectModel={(id) => setCustomForm(p => ({ ...p, model: id }))} onSuggestV1Confirm={() => { const newUrl = customForm.baseUrl.replace(/\/+$/, '') + '/v1'; setCustomForm(p => ({ ...p, baseUrl: newUrl })); handleListModels(newUrl) }} onSuggestV1Cancel={() => { setModelListSuggestV1(false); setModelListError(t('llmSettings.noModelsFound')) }} />)}
      {!deleteMode && customModels.length > 0 && editingCustomIndex === null && (
        <button onClick={enterDeleteMode} className="px-2 py-0.5 text-[11px] text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">{t('llmSettings.deleteCustomModels')}</button>
      )}
      {deleteMode && editingCustomIndex === null && (
        <div className="space-y-2 border-2 border-red-300 dark:border-red-700 rounded-lg p-3 bg-red-50/30 dark:bg-red-900/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-700 dark:text-red-300">{t('llmSettings.selectModelsToDelete')}</span>
            <button onClick={exitDeleteMode} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {customModels.map((cm, idx) => {
              const checked = checkedForDelete.has(idx)
              return (
                <button key={`del-${idx}`} onClick={() => toggleDeleteCheck(idx)} className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${checked ? 'bg-red-500 text-white border-red-500 dark:bg-red-600 dark:border-red-500 dark:text-white' : 'border-red-300 text-red-500 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/30'}`}>
                  {checked ? '☒ ' : '☐ '}{cm.label}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={selectAllForDelete} className="text-[11px] text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">{t('llmSettings.selectAll')}</button>
            <button onClick={deselectAllForDelete} className="text-[11px] text-gray-400 hover:text-gray-500 dark:text-white/60 dark:hover:text-white/80">{t('llmSettings.deselectAll')}</button>
          </div>
          <div className="flex gap-2">
            <button onClick={exitDeleteMode} className="flex-1 py-1.5 text-xs text-gray-600 dark:text-white/80 border-2 border-gray-500 dark:border-white/20 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">{t('llmSettings.cancel')}</button>
            <button onClick={executeBatchDelete} disabled={checkedForDelete.size === 0} className="flex-1 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{t('llmSettings.confirmDelete', { count: checkedForDelete.size })}</button>
          </div>
        </div>
      )}
      {confirmDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white dark:bg-gray-800 border-2 border-red-400 dark:border-red-600 rounded-xl p-5 max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <X size={20} className="flex-shrink-0 mt-0.5 text-red-500" />
              <p className="text-sm text-gray-800 dark:text-white whitespace-pre-wrap leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-1.5 text-xs font-medium rounded-lg border-2 border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">{t('llmSettings.cancel')}</button>
              <button onClick={confirmDialog.onConfirm} className="px-4 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors">{t('llmSettings.confirm')}</button>
            </div>
          </div>
        </div>
      )}
      <div className="pt-3 border-t-2 border-gray-300 dark:border-white/20 flex justify-end">
        <button onClick={handleSave} disabled={testing || listingModels} className="flex items-center gap-1.5 px-5 py-2 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{saved ? <><Check size={14} />{t('llmSettings.saved')}</> : t('llmSettings.save')}</button>
      </div>
    </div>
  )
}

function TokenStatsPanel() {
  const { t } = useTranslation(); const { tokenStats, tokenStatsLoading, loadTokenStats } = useStore()
  useEffect(() => { loadTokenStats() }, [loadTokenStats])
  if (tokenStatsLoading) return <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-purple-500" /></div>
  if (!tokenStats || tokenStats.length === 0) return <div className="text-center py-8 text-sm text-gray-400 dark:text-white/60">{t('llmSettings.noTokenData')}</div>
  return (
    <div className="px-5 py-4 space-y-4">
      {tokenStats.map((stat: TokenStats) => (
        <div key={stat.model} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border-2 border-gray-500 dark:border-white/20">
          <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-semibold text-gray-800 dark:text-white">{stat.model}</h4><span className="text-xs text-gray-400 dark:text-white/60">{stat.callCount} {t('llmSettings.calls')}</span></div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-white dark:bg-gray-800 rounded p-2 text-center"><div className="text-xs text-gray-400 dark:text-white/60">{t('llmSettings.inputTokens')}</div><div className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatTokens(stat.totalPromptTokens)}</div></div>
            <div className="bg-white dark:bg-gray-800 rounded p-2 text-center"><div className="text-xs text-gray-400 dark:text-white/60">{t('llmSettings.outputTokens')}</div><div className="text-sm font-bold text-green-600 dark:text-green-400">{formatTokens(stat.totalCompletionTokens)}</div></div>
            <div className="bg-white dark:bg-gray-800 rounded p-2 text-center"><div className="text-xs text-gray-400 dark:text-white/60">{t('llmSettings.totalTokens')}</div><div className="text-sm font-bold text-purple-600 dark:text-purple-400">{formatTokens(stat.totalTokens)}</div></div>
          </div>
          {stat.byOperation.length > 0 && (<div className="text-xs text-gray-500 dark:text-white/70 space-y-1">{stat.byOperation.map(op => (<div key={op.operation} className="flex items-center justify-between"><span>{op.operation === 'summarize' ? '📝 ' + t('llmSettings.operationSummarize') : '🌐 ' + t('llmSettings.operationTranslate')}</span><span>{t('llmSettings.inputTokens')} {formatTokens(op.prompt)} / {t('llmSettings.outputTokens')} {formatTokens(op.completion)}</span></div>))}</div>)}
        </div>
      ))}
      <div className="flex justify-center"><button onClick={loadTokenStats} disabled={tokenStatsLoading} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30 disabled:opacity-50 transition-colors"><RotateCcw size={12} />{t('llmSettings.refreshStats')}</button></div>
    </div>
  )
}

/** LLM 设置的全部内容（不含外层模态框），供 SystemSettings 内嵌使用 */
export function LLMSettingsFull() {
  const { t } = useTranslation(); const { llmGlobalConfig, loadLlmGlobalConfig } = useStore()
  const [activeTab, setActiveTab] = useState<LTabType>('fullTranslate')
  useEffect(() => { loadLlmGlobalConfig() }, [loadLlmGlobalConfig])
  const handleSave = async (funcType: LlmFunctionType, config: LlmFunctionConfig): Promise<boolean> => { try { await window.api.setLlmFunctionConfig(funcType, config); await loadLlmGlobalConfig(); return true } catch (err) { console.error('[LLMSettings] 保存失败：', err); return false } }

  return (
    <div>
      {/* LLM 子标签 */}
      <div className="flex-shrink-0 border-b-2 border-gray-300 dark:border-white/20 px-2">
        <div className="flex gap-0.5 overflow-x-auto">
          {TAB_CONFIG.map(tab => { const Icon = tab.icon; const isActive = activeTab === tab.key; return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${isActive ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white'}`}><Icon size={13} />{t(tab.labelKey)}</button>)})}
        </div>
      </div>
      <div className="flex items-center justify-end px-5 pt-2">
        <button onClick={async () => { await window.api.resetLlmConfig(); await loadLlmGlobalConfig() }} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title={t('llmSettings.reset')}><RotateCcw size={13} />{t('llmSettings.reset')}</button>
      </div>
      {activeTab === 'tokenStats' ? (<TokenStatsPanel />) : (<LlmConfigPanel funcType={activeTab} config={llmGlobalConfig?.[activeTab] ?? { model: 'deepseek-v4-flash', apiKeys: {}, customModels: [] }} onSave={(config) => handleSave(activeTab, config)} />)}
    </div>
  )
}