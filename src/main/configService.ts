/**
 * LLM 配置服务 — 本地持久化。
 *
 * 遵循 AGENTS.md §3.2：
 * - 用户密钥本地持久化
 * - 禁止明文存数据库、禁止代码硬编码、禁止云端上传
 *
 * ⚠️ 替代方案：使用 JSON 文件存储，而非 electron-store。
 * electron-store 8.x 在 ESM + electron-vite 环境下需要额外配置。
 * 改用简单的 fs 读写 JSON 文件，存放在 app.getPath('userData') 下。
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// ============================================================
// 类型
// ============================================================

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** 每个模型独立的 API Key 映射 */
  apiKeys: Record<string, string>
}

// ============================================================
// JSON 文件读写
// ============================================================

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'llm-config.json')
}

function loadFromDisk(): Partial<LlmConfig> {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveToDisk(config: LlmConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

// ============================================================
// 公共 API
// ============================================================

const DEFAULTS: LlmConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-v4-flash',
  apiKeys: {}
}

/** 旧模型名 → 新模型名迁移映射 */
const MODEL_MIGRATIONS: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'ecnu-chat': 'ecnu-max',
}

/** 获取当前 LLM 配置（自动迁移过时的模型名） */
export function getLlmConfig(): LlmConfig {
  const disk = loadFromDisk()
  const merged = { ...DEFAULTS, ...disk }
  // 自动迁移旧的模型名
  if (merged.model && MODEL_MIGRATIONS[merged.model]) {
    merged.model = MODEL_MIGRATIONS[merged.model]
  }
  return merged
}

/** 获取指定模型上次保存的 API Key，若无则返回空字符串 */
export function getApiKeyForModel(model: string): string {
  const config = getLlmConfig()
  return config.apiKeys[model] || config.apiKey || ''
}

/** 更新 LLM 配置（部分更新） */
export function setLlmConfig(updates: Partial<LlmConfig>): void {
  const current = getLlmConfig()
  const merged = { ...current, ...updates }
  saveToDisk(merged)
}

/** 重置为默认值 */
export function resetLlmConfig(): void {
  try {
    fs.unlinkSync(getConfigPath())
  } catch {
    // 文件不存在则忽略
  }
}