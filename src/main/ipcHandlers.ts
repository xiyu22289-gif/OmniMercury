import { ipcMain, BrowserWindow } from 'electron'
import { addFeed, listFeeds, getArticles, searchArticles, getCachedArticleContent } from './feedService'
import {
  getDb,
  getFeedById,
  feeds as feedsTable,
  articles as articlesTable
} from './db'
import { eq } from 'drizzle-orm'
import { summarizeArticle, translateArticle } from './llmService'
import { getLlmConfig, setLlmConfig, resetLlmConfig } from './configService'
import { getOrFetchArticleContent } from './contentService'
import type {
  IpcResponse,
  Feed,
  Article,
  ArticleContent,
  SummarizeRequest,
  TranslateRequest
} from '../shared/types'

/**
 * 注册所有 IPC 处理器。
 *
 * 三条核心通道（addFeed / listFeeds / getArticles）统一通过 feedService，
 * 其余辅助通道（removeFeed / getArticleContent / refreshFeeds / searchArticles）
 * 视复杂度选择 feedService 封装或直接 DB 调用。
 */
export function registerIpcHandlers(): void {
  // ================================================================
  // backend:addFeed — 添加 RSS 订阅源（→ feedService.addFeed）
  // ================================================================
  ipcMain.handle('backend:addFeed', async (_event, url: string): Promise<IpcResponse> => {
    const result = await addFeed(url)

    if (result.success) {
      const feed = getFeedById(result.feedId)
      return {
        type: 'import_feed',
        payload: {
          error: 0,
          feed: feed
            ? {
                id: feed.id,
                title: feed.title,
                url: feed.url,
                link: feed.link ?? undefined,
                description: feed.description ?? undefined,
                added_at: feed.createdAt ?? ''
              }
            : undefined,
          feed_id: result.feedId,
          message: `已添加：${result.title}`
        }
      }
    }

    return {
      type: 'import_feed',
      payload: { error: 1, message: result.error }
    }
  })

  // ================================================================
  // backend:listFeeds — 获取全部订阅源（→ feedService.listFeeds）
  // ================================================================
  ipcMain.handle('backend:listFeeds', async (): Promise<IpcResponse> => {
    const feedList = listFeeds()

    const feeds: Feed[] = feedList.map((f) => ({
      id: f.id,
      title: f.title,
      url: f.url,
      link: f.link ?? undefined,
      description: f.description ?? undefined,
      added_at: f.createdAt ?? ''
    }))

    return {
      type: 'list_feeds',
      payload: { error: 0, feeds }
    }
  })

  // ================================================================
  // backend:getArticles — 获取某订阅源的文章列表（→ feedService.getArticles）
  // ================================================================
  ipcMain.handle(
    'backend:getArticles',
    async (_event, feedId: number, _offset?: number, _limit?: number): Promise<IpcResponse> => {
      const articleList = getArticles(feedId)

      const articles: Article[] = articleList.map((a) => ({
        id: a.id,
        feed_id: feedId,
        title: a.title,
        url: a.link ?? '',
        author: a.author ?? undefined,
        summary: a.summary ?? undefined,
        published_at: a.pubDate ?? a.createdAt ?? '',
        fetched_at: a.createdAt ?? '',
        is_read: a.isRead === 1
      }))

      return {
        type: 'list_articles',
        payload: { error: 0, articles }
      }
    }
  )

  // ================================================================
  // backend:getArticleContent — 获取文章正文（含 M3 清洗流水线）
  // ================================================================
  ipcMain.handle(
    'backend:getArticleContent',
    async (_event, articleId: number): Promise<IpcResponse> => {
      // 1. 查询文章基本信息（含 link 用于清洗流水线）
      const article = getDb()
        .select({
          id: articlesTable.id,
          content: articlesTable.content,
          contentMd: articlesTable.contentMd,
          link: articlesTable.link,
        })
        .from(articlesTable)
        .where(eq(articlesTable.id, articleId))
        .get()

      if (!article) {
        return {
          type: 'get_article_content',
          payload: { error: 1, message: '文章不存在' }
        }
      }

      // 2. 如果已有缓存的 contentMd，直接返回（快速路径）
      if (article.contentMd) {
        const content: ArticleContent = {
          id: article.id,
          content: article.contentMd
        }
        return {
          type: 'get_article_content',
          payload: { error: 0, content }
        }
      }

      // 3. 如果文章有原始链接，走清洗流水线
      if (article.link) {
        try {
          const result = await getOrFetchArticleContent(articleId, article.link)

          const content: ArticleContent = {
            id: articleId,
            content: result.content
          }

          return {
            type: 'get_article_content',
            payload: { error: 0, content }
          }
        } catch (err) {
          console.error('[ipcHandlers] getOrFetchArticleContent 异常：', err)
          // 降级：尝试返回原始 content
          const fallback = article.content ?? '(暂无正文内容)'
          const content: ArticleContent = {
            id: articleId,
            content: fallback
          }
          return {
            type: 'get_article_content',
            payload: { error: 0, content }
          }
        }
      }

      // 4. 没有链接也没有缓存 contentMd，返回原始 content
      const body = article.content ?? '(暂无正文内容)'

      const content: ArticleContent = {
        id: article.id,
        content: body
      }

      return {
        type: 'get_article_content',
        payload: { error: 0, content }
      }
    }
  )

  // ================================================================
  // backend:removeFeed — 删除订阅源（级联删除其文章）
  // ================================================================
  ipcMain.handle('backend:removeFeed', async (_event, feedId: number): Promise<IpcResponse> => {
    try {
      getDb().delete(feedsTable).where(eq(feedsTable.id, feedId)).run()
      return {
        type: 'remove_feed',
        payload: { error: 0, message: '已删除' }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        type: 'remove_feed',
        payload: { error: 1, message }
      }
    }
  })

  // ================================================================
  // backend:refreshFeeds — 刷新全部订阅源
  // TODO: Phase 2 完善 — 逐个重新拉取并更新文章
  // ================================================================
  ipcMain.handle('backend:refreshFeeds', async (): Promise<IpcResponse> => {
    return {
      type: 'refresh_feeds',
      payload: { error: 0, message: 'Refresh not yet implemented' }
    }
  })

  // ================================================================
  // backend:searchArticles — 按标题模糊搜索文章
  // ================================================================
  ipcMain.handle(
    'backend:searchArticles',
    async (_event, query: string, _feedId?: number, _offset?: number, _limit?: number): Promise<IpcResponse> => {
      if (!query || !query.trim()) {
        return {
          type: 'search_articles',
          payload: { error: 0, articles: [] }
        }
      }

      const limit = typeof _limit === 'number' && _limit > 0 ? _limit : 20
      const results = searchArticles(query.trim(), limit)

      const articles: Article[] = results.map((a) => ({
        id: a.id,
        feed_id: a.feedId,
        title: a.title,
        url: a.link ?? '',
        author: a.author ?? undefined,
        summary: a.summary ?? undefined,
        published_at: a.pubDate ?? a.createdAt ?? '',
        fetched_at: a.createdAt ?? '',
        is_read: a.isRead === 1
      }))

      return {
        type: 'search_articles',
        payload: { error: 0, articles }
      }
    }
  )

  // ================================================================
  // backend:getCachedArticleContent — 从本地 DB 获取文章离线内容
  // ================================================================
  ipcMain.handle(
    'backend:getCachedArticleContent',
    async (_event, articleId: number): Promise<IpcResponse> => {
      const cached = getCachedArticleContent(articleId)

      if (!cached) {
        return {
          type: 'get_cached_article_content',
          payload: { error: 1, message: '本地无缓存内容' }
        }
      }

      const content: ArticleContent = {
        id: cached.id,
        content: cached.body
      }

      return {
        type: 'get_cached_article_content',
        payload: { error: 0, content }
      }
    }
  )

  // ================================================================
  // M4 — LLM 通用接入 IPC 通道
  // ================================================================

  // LLM 配置读写
  ipcMain.handle('llm:getConfig', async () => {
    return getLlmConfig()
  })

  ipcMain.handle('llm:setConfig', async (_event, updates: Record<string, string>) => {
    setLlmConfig(updates)
    return { success: true }
  })

  ipcMain.handle('llm:resetConfig', async () => {
    resetLlmConfig()
    return { success: true }
  })

  // 流式摘要 — 主进程主动推送 chunk 到渲染进程
  // 渲染进程调用 invoke('llm:summarize', request) 触发，
  // 主进程通过 webContents.send('llm:stream-chunk', ...) 推送进度
  ipcMain.handle('llm:summarize', async (event, request: SummarizeRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }

    // 在后台启动流式调用，不阻塞 invoke 返回
    summarizeArticle(request, (chunk) => {
      win.webContents.send('llm:stream-chunk', chunk)
    }).catch((err) => {
      console.error('[ipcHandlers] summarizeArticle 未捕获异常：', err)
      win.webContents.send('llm:stream-chunk', {
        type: 'summarize',
        articleId: request.articleId,
        message: String(err)
      })
    })

    return { success: true }
  })

  // 流式翻译 — 同上
  ipcMain.handle('llm:translate', async (event, request: TranslateRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }

    translateArticle(request, (chunk) => {
      win.webContents.send('llm:stream-chunk', chunk)
    }).catch((err) => {
      console.error('[ipcHandlers] translateArticle 未捕获异常：', err)
      win.webContents.send('llm:stream-chunk', {
        type: 'translate',
        articleId: request.articleId,
        message: String(err)
      })
    })

    return { success: true }
  })
}
