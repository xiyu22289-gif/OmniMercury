import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { IpcRequest, IpcResponse } from '../shared/types'

/**
 * IPC 客户端 — 通过 Node.js 子进程的 stdin/stdout 与 C 后端通信。
 * C 后端使用 JSON 协议，每行一条完整消息。
 */

let backendProcess: ChildProcess | null = null
let requestId = 0
const pendingRequests = new Map<
  number,
  { resolve: (value: IpcResponse) => void; reject: (reason: Error) => void }
>()

/** 启动 C 后端进程 */
export function startBackend(backendPath?: string): void {
  if (backendProcess) return

  const exePath = backendPath || join(__dirname, '../../summer-rss-reader/build/summer-rss-reader')

  backendProcess = spawn(exePath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })

  backendProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const response: IpcResponse = JSON.parse(line)
        const id = requestId - 1 // 当前 FIFO 顺序处理
        const pending = pendingRequests.get(id)
        if (pending) {
          pending.resolve(response)
          pendingRequests.delete(id)
        }
      } catch {
        // 非 JSON 行（如 stderr 重定向），忽略
      }
    }
  })

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[backend stderr]', data.toString().trim())
  })

  backendProcess.on('close', (code) => {
    console.log(`[backend] process exited with code ${code}`)
    backendProcess = null
    // 拒绝所有未完成的请求
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error(`Backend process exited with code ${code}`))
    }
    pendingRequests.clear()
  })
}

/** 停止 C 后端进程 */
export function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
}

/** 发送请求并等待响应 */
function sendRequest(type: string, payload?: Record<string, unknown>): Promise<IpcResponse> {
  return new Promise((resolve, reject) => {
    if (!backendProcess || !backendProcess.stdin) {
      reject(new Error('Backend process not running'))
      return
    }

    const id = requestId++
    pendingRequests.set(id, { resolve, reject })

    const request: IpcRequest = { type, payload }
    const json = JSON.stringify(request) + '\n'

    backendProcess.stdin.write(json, (err) => {
      if (err) {
        pendingRequests.delete(id)
        reject(err)
      }
    })
  })
}

// ---- 公开的 API 方法 ----

export async function addFeed(url: string): Promise<IpcResponse> {
  return sendRequest('import_feed', { url })
}

export async function listFeeds(): Promise<IpcResponse> {
  return sendRequest('list_feeds')
}

export async function refreshFeeds(): Promise<IpcResponse> {
  return sendRequest('refresh_feeds')
}

export async function getArticles(
  feedId: number,
  offset = 0,
  limit = 20
): Promise<IpcResponse> {
  return sendRequest('list_articles', { feed_id: feedId, offset, limit })
}

export async function getArticleContent(articleId: number): Promise<IpcResponse> {
  return sendRequest('get_article_content', { article_id: articleId })
}

export async function removeFeed(feedId: number): Promise<IpcResponse> {
  return sendRequest('remove_feed', { feed_id: feedId })
}

export async function searchArticles(
  query: string,
  feedId?: number,
  offset = 0,
  limit = 20
): Promise<IpcResponse> {
  return sendRequest('search_articles', {
    query,
    feed_id: feedId || 0,
    offset,
    limit
  })
}