/** IPC 协议中使用的共享类型 */

export interface Feed {
  id: number
  title: string
  url: string
  link?: string
  description?: string
  added_at: string
}

export interface Article {
  id: number
  feed_id: number
  title: string
  url: string
  author?: string
  summary?: string
  published_at: string
  fetched_at: string
  is_read: boolean
}

export interface ArticleContent {
  id: number
  content: string
}

export interface IpcRequest {
  type: string
  payload?: Record<string, unknown>
}

export interface IpcResponse {
  type: string
  payload: {
    error: number
    feed?: Feed
    feeds?: Feed[]
    articles?: Article[]
    content?: ArticleContent
    feed_id?: number
    new_count?: number
    message?: string
  }
}