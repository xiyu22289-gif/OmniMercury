/**
 * DeepSeek API 连通性测试脚本
 * 用法：在项目根目录运行 node test-deepseek-api.mjs YOUR_API_KEY
 */
import OpenAI from 'openai'

const apiKey = process.argv[2]
if (!apiKey) {
  console.error('❌ 请提供 API Key 作为参数')
  console.error('   node test-deepseek-api.mjs YOUR_DEEPSEEK_API_KEY')
  process.exit(1)
}

const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.deepseek.com/v1',
  timeout: 30_000
})

async function main() {
  console.log('🔗 正在测试 DeepSeek API 连通性...')
  console.log(`   baseURL: https://api.deepseek.com/v1`)
  console.log(`   model: deepseek-chat`)
  console.log(`   key: ${apiKey.slice(0, 8)}...`)
  console.log()

  try {
    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: 'Say hello in exactly 3 words.' }
      ],
      temperature: 0,
      max_tokens: 50,
      stream: true
    })

    console.log('✅ 流已建立，开始接收响应...')
    let fullText = ''
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        fullText += delta
        process.stdout.write(delta)
      }
    }
    console.log()
    console.log()
    console.log(`✅ 翻译测试成功！返回内容：${fullText}`)
    console.log('DeepSeek API 连通正常，模型可用。')
  } catch (err) {
    console.error()
    console.error(`❌ 测试失败：${err instanceof Error ? err.message : String(err)}`)
    if (err instanceof Error && 'status' in err) {
      console.error(`   HTTP 状态码：${(err as any).status}`)
    }
    process.exit(1)
  }
}

main()