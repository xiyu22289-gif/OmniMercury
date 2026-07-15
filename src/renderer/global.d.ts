export {}

declare global {
  interface Window {
    api: {
      addFeed: (url: string) => Promise<import('../shared/types').IpcResponse>
      listFeeds: () => Promise<import('../shared/types').IpcResponse>
      refreshFeeds: () => Promise<import('../shared/types').IpcResponse>
      getArticles: (feedId: number, offset?: number, limit?: number) => Promise<import('../shared/types').IpcResponse>
      getArticleContent: (articleId: number) => Promise<import('../shared/types').IpcResponse>
      removeFeed: (feedId: number) => Promise<import('../shared/types').IpcResponse>
      searchArticles: (query: string, feedId?: number, offset?: number, limit?: number) => Promise<import('../shared/types').IpcResponse>
    }
  }
}