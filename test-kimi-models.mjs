// 快速查询 Kimi API Key 可用的模型列表
// 用法: node test-kimi-models.mjs <your-api-key>

import OpenAI from 'openai'

const apiKey = process.argv[2]
if (!apiKey || apiKey.startsWith('sk-') === false) {
  console.error('用法: node test-kimi-models.mjs <你的Kimi API Key>')
  console.error('示例: node test-kimi-models.mjs sk-xxxxx')
  process.exit(1)
}

const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.moonshot.cn/v1',
  timeout: 15_000,
})

console.log('正在查询可用模型列表...\n')

try {
  const response = await client.models.list()
  const models = response.data || []

  console.log(`共 ${models.length} 个可用模型：\n`)
  models.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.id}`)
  })

  if (models.length === 0) {
    console.log('  (无模型返回，请检查 API Key 是否正确)')
  }
} catch (err) {
  console.error('查询失败:', err.message)
  process.exit(1)
}