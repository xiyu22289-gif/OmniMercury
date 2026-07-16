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
  translateTarget: string
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
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  translateTarget: 'Chinese'
}

/** 获取当前 LLM 配置 */
export function getLlmConfig(): LlmConfig {
  const disk = loadFromDisk()
  return { ...DEFAULTS, ...disk }
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