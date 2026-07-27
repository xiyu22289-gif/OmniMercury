/**
 * LLM 配置服务 — 本地持久化（函数级独立配置）。
 *
 * 遵循 AGENTS.md §3.2：
 * - 用户密钥本地持久化
 * - 禁止明文存数据库、禁止代码硬编码、禁止云端上传
 *
 * 存储结构：
 * - llm-config.json 存储 LlmGlobalConfig（4个功能独立配置 + 旧版兼容迁移）
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { LlmFunctionType, LlmFunctionConfig, LlmGlobalConfig, CustomModelConfig } from '../shared/types'

// ============================================================
// 类型（旧版兼容）
// ============================================================

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  apiKeys: Record<string, string>
}

// ============================================================
// JSON 文件读写
// ============================================================

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'llm-config.json')
}

function loadFromDisk(): Partial<LlmGlobalConfig & LlmConfig> {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveToDisk(data: LlmGlobalConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf-8')
}

// ============================================================
// 默认值
// ============================================================

function emptyFunctionConfig(): LlmFunctionConfig {
  return {
    model: 'deepseek-v4-flash',
    apiKeys: {},
    customModels: [],
  }
}

export function getDefaultGlobalConfig(): LlmGlobalConfig {
  return {
    fullTranslate: emptyFunctionConfig(),
    selectiveTranslate: emptyFunctionConfig(),
    fullSummary: emptyFunctionConfig(),
    selectiveSummary: emptyFunctionConfig(),
  }
}

// ============================================================
// 旧模型名 → 新模型名迁移映射
// ============================================================

const MODEL_MIGRATIONS: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'ecnu-chat': 'ecnu-max',
}

function migrateModel(model: string): string {
  return MODEL_MIGRATIONS[model] || model
}

// ============================================================
// 公共 API — 全局配置
// ============================================================

/** 获取全局 LLM 配置（4 个功能独立） */
export function getLlmGlobalConfig(): LlmGlobalConfig {
  const disk = loadFromDisk()
  const defaults = getDefaultGlobalConfig()

  // 检查是否是新格式（包含 fullTranslate 等 key）
  if (disk.fullTranslate && typeof disk.fullTranslate === 'object') {
    const merged: LlmGlobalConfig = {
      fullTranslate: { ...defaults.fullTranslate, ...disk.fullTranslate, apiKeys: { ...disk.fullTranslate.apiKeys } },
      selectiveTranslate: { ...defaults.selectiveTranslate, ...disk.selectiveTranslate, apiKeys: { ...disk.selectiveTranslate?.apiKeys } },
      fullSummary: { ...defaults.fullSummary, ...disk.fullSummary, apiKeys: { ...disk.fullSummary?.apiKeys } },
      selectiveSummary: { ...defaults.selectiveSummary, ...disk.selectiveSummary, apiKeys: { ...disk.selectiveSummary?.apiKeys } },
    }
    // 迁移模型名
    for (const fn of ['fullTranslate', 'selectiveTranslate', 'fullSummary', 'selectiveSummary'] as LlmFunctionType[]) {
      merged[fn].model = migrateModel(merged[fn].model)
    }
    return merged
  }

  // 旧格式迁移：将旧的单一配置复制到 4 个功能
  const oldConfig = disk as Partial<LlmConfig>
  if (oldConfig.model || oldConfig.baseUrl || oldConfig.apiKey) {
    const migratedFn: LlmFunctionConfig = {
      model: migrateModel(oldConfig.model || 'deepseek-v4-flash'),
      apiKeys: oldConfig.apiKeys || {},
      customModels: [],
    }
    const migrated: LlmGlobalConfig = {
      fullTranslate: { ...migratedFn },
      selectiveTranslate: { ...migratedFn },
      fullSummary: { ...migratedFn },
      selectiveSummary: { ...migratedFn },
    }
    saveToDisk(migrated)
    return migrated
  }

  return defaults
}

/** 更新某个功能的配置 */
export function setFunctionConfig(funcType: LlmFunctionType, config: LlmFunctionConfig): void {
  const global = getLlmGlobalConfig()
  global[funcType] = config
  saveToDisk(global)
}

/** 获取某个功能的配置 */
export function getFunctionConfig(funcType: LlmFunctionType): LlmFunctionConfig {
  const global = getLlmGlobalConfig()
  return global[funcType]
}

// ============================================================
// 公共 API — 旧版兼容（供 llmService 过渡使用）
// ============================================================

/** @deprecated 使用 getFunctionConfig */
export function getLlmConfig(): LlmConfig {
  const fn = getFunctionConfig('fullTranslate')
  return {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: fn.model,
    apiKeys: fn.apiKeys,
  }
}

/** 根据模型名找到 apiKey（优先从 functionConfig 查找） */
export function getApiKeyForModel(model: string): string {
  const global = getLlmGlobalConfig()
  // 遍历所有功能配置查找该模型的 apiKey
  for (const fn of ['fullTranslate', 'selectiveTranslate', 'fullSummary', 'selectiveSummary'] as LlmFunctionType[]) {
    const cfg = global[fn]
    if (cfg.apiKeys[model]) return cfg.apiKeys[model]
    // 也检查自定义模型
    const cm = cfg.customModels.find(c => c.model === model || c.label === model)
    if (cm) return cm.apiKey
  }
  return ''
}

/** 获取某个功能对应的有效配置（baseUrl, apiKey, model） */
export function getEffectiveConfig(funcType: LlmFunctionType): { baseUrl: string; apiKey: string; model: string } {
  const fn = getFunctionConfig(funcType)

  // 检查自定义模型（优先）
  const custom = fn.customModels.find(c => c.model === fn.model || c.label === fn.model)
  if (custom) {
    // apiKey 兜底：优先用 custom 里的，其次读 apiKeys 映射
    const apiKey = custom.apiKey || fn.apiKeys[custom.model] || ''
    return { baseUrl: custom.baseUrl, apiKey, model: custom.model }
  }

  // 预设模型
  return { baseUrl: '', apiKey: fn.apiKeys[fn.model] || '', model: fn.model }
}

/** @deprecated 使用 setFunctionConfig */
export function setLlmConfig(updates: Partial<LlmConfig>): void {
  // 旧版兼容：更新 fullTranslate
  if (updates.model || updates.apiKey || updates.apiKeys || updates.baseUrl) {
    const fn = getFunctionConfig('fullTranslate')
    if (updates.model) fn.model = updates.model
    if (updates.apiKeys) fn.apiKeys = { ...fn.apiKeys, ...updates.apiKeys }
    if (updates.apiKey && updates.model) {
      fn.apiKeys[updates.model] = updates.apiKey
    }
    setFunctionConfig('fullTranslate', fn)
  }
}

/** 重置为默认值 */
export function resetLlmConfig(): void {
  try {
    fs.unlinkSync(getConfigPath())
  } catch {
    // 文件不存在则忽略
  }
}