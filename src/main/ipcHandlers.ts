import { ipcMain, BrowserWindow, dialog } from 'electron'
import { addFeed, listFeeds, getArticles, searchArticles, getCachedArticleContent } from './feedService'
import { parseOpmlFile, importOpmlFile } from './opmlService'
import { getDb, getFeedById, feeds as feedsTable, articles as articlesTable } from './db'
import { eq } from 'drizzle-orm'
import { summarizeArticle, translateArticle, translateParagraphs } from './llmService'
import { getLlmConfig, setLlmConfig, resetLlmConfig } from './configService'
import type { IpcResponse, Feed, Article, ArticleContent, SummarizeRequest, TranslateRequest } from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('backend:addFeed', async (_event, url: string): Promise<IpcResponse> => {
    const result = await addFeed(url)
    if (result.success) {
      const feed = getFeedById(result.feedId)
      return { type: 'import_feed', payload: { error: 0, feed: feed ? { id: feed.id, title: feed.title, url: feed.url, link: feed.link ?? undefined, description: feed.description ?? undefined, added_at: feed.createdAt ?? '' } : undefined, feed_id: result.feedId, message: `已添加：${result.title}` } }
    }
    return { type: 'import_feed', payload: { error: 1, message: result.error } }
  })

  ipcMain.handle('backend:listFeeds', async (): Promise<IpcResponse> => {
    const feeds: Feed[] = listFeeds().map(f => ({ id: f.id, title: f.title, url: f.url, link: f.link ?? undefined, description: f.description ?? undefined, added_at: f.createdAt ?? '' }))
    return { type: 'list_feeds', payload: { error: 0, feeds } }
  })

  ipcMain.handle('backend:getArticles', async (_event, feedId: number): Promise<IpcResponse> => {
    const articles: Article[] = getArticles(feedId).map(a => ({ id: a.id, feed_id: feedId, title: a.title, url: a.link ?? '', author: a.author ?? undefined, summary: a.summary ?? undefined, published_at: a.pubDate ?? a.createdAt ?? '', fetched_at: a.createdAt ?? '', is_read: a.isRead === 1 }))
    return { type: 'list_articles', payload: { error: 0, articles } }
  })

  ipcMain.handle('backend:getArticleContent', async (_event, articleId: number): Promise<IpcResponse> => {
    const article = getDb().select({ id: articlesTable.id, content: articlesTable.content, contentMd: articlesTable.contentMd }).from(articlesTable).where(eq(articlesTable.id, articleId)).get()
    if (!article) return { type: 'get_article_content', payload: { error: 1, message: '文章不存在' } }
    const body = article.contentMd ?? article.content ?? '(暂无正文内容)'
    return { type: 'get_article_content', payload: { error: 0, content: { id: article.id, content: body } } }
  })

  ipcMain.handle('backend:removeFeed', async (_event, feedId: number): Promise<IpcResponse> => {
    try { getDb().delete(feedsTable).where(eq(feedsTable.id, feedId)).run(); return { type: 'remove_feed', payload: { error: 0, message: '已删除' } } }
    catch (err) { return { type: 'remove_feed', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } } }
  })

  ipcMain.handle('backend:refreshFeeds', async (): Promise<IpcResponse> => ({ type: 'refresh_feeds', payload: { error: 0, message: 'Refresh not yet implemented' } }))

  ipcMain.handle('backend:searchArticles', async (_event, query: string, _feedId?: number, _offset?: number, _limit?: number): Promise<IpcResponse> => {
    if (!query?.trim()) return { type: 'search_articles', payload: { error: 0, articles: [] } }
    const limit = typeof _limit === 'number' && _limit > 0 ? _limit : 20
    const results = searchArticles(query.trim(), limit)
    const articles: Article[] = results.map(a => ({ id: a.id, feed_id: a.feedId, title: a.title, url: a.link ?? '', author: a.author ?? undefined, summary: a.summary ?? undefined, published_at: a.pubDate ?? a.createdAt ?? '', fetched_at: a.createdAt ?? '', is_read: a.isRead === 1 }))
    return { type: 'search_articles', payload: { error: 0, articles } }
  })

  ipcMain.handle('backend:getCachedArticleContent', async (_event, articleId: number): Promise<IpcResponse> => {
    const cached = getCachedArticleContent(articleId)
    if (!cached) return { type: 'get_cached_article_content', payload: { error: 1, message: '本地无缓存内容' } }
    return { type: 'get_cached_article_content', payload: { error: 0, content: { id: cached.id, content: cached.body } } }
  })

  // LLM 配置
  ipcMain.handle('llm:getConfig', async () => getLlmConfig())
  ipcMain.handle('llm:setConfig', async (_event, updates: Record<string, string>) => { setLlmConfig(updates); return { success: true } })
  ipcMain.handle('llm:resetConfig', async () => { resetLlmConfig(); return { success: true } })

  // 流式摘要
  ipcMain.handle('llm:summarize', async (event, request: SummarizeRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    summarizeArticle(request, (chunk) => win.webContents.send('llm:stream-chunk', chunk))
      .catch(err => { console.error('[ipcHandlers] summarizeArticle 异常：', err); win.webContents.send('llm:stream-chunk', { type: 'summarize', articleId: request.articleId, message: String(err) }) })
    return { success: true }
  })

  // 流式翻译（全文）
  ipcMain.handle('llm:translate', async (event, request: TranslateRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    translateArticle(request, (chunk) => win.webContents.send('llm:stream-chunk', chunk))
      .catch(err => { console.error('[ipcHandlers] translateArticle 异常：', err); win.webContents.send('llm:stream-chunk', { type: 'translate', articleId: request.articleId, message: String(err) }) })
    return { success: true }
  })

  // 段落级翻译
  ipcMain.handle('llm:translateParagraphs', async (event, request: TranslateRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    translateParagraphs(request, (chunk) => win.webContents.send('llm:stream-chunk', chunk))
      .catch(err => { console.error('[ipcHandlers] translateParagraphs 异常：', err); win.webContents.send('llm:stream-chunk', { type: 'translate', articleId: request.articleId, message: String(err) }) })
    return { success: true }
  })

  // ============================================================
  // OPML 导入
  // ============================================================

  /** 打开文件选择对话框供用户选择 .opml 文件，返回选择的文件路径 */
  ipcMain.handle('opml:selectFile', async (event): Promise<{ canceled: boolean; filePath?: string; error?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { canceled: true, error: '窗口不存在' }

    const result = await dialog.showOpenDialog(win, {
      title: '选择 OPML 文件',
      filters: [
        { name: 'OPML 文件', extensions: ['opml', 'xml'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    return { canceled: false, filePath: result.filePaths[0] }
  })

  /** 预览 OPML 文件中的订阅源列表（仅解析，不导入） */
  ipcMain.handle('opml:preview', async (_event, filePath: string): Promise<IpcResponse> => {
    try {
      const result = parseOpmlFile(filePath)
      return {
        type: 'opml_preview',
        payload: {
          error: 0,
          message: `找到 ${result.totalFeeds} 个订阅源`,
          feed_count: result.totalFeeds,
          opml_title: result.title,
        },
      }
    } catch (err) {
      return {
        type: 'opml_preview',
        payload: {
          error: 1,
          message: err instanceof Error ? err.message : String(err),
        },
      }
    }
  })

  /** 执行 OPML 文件导入，批量添加订阅源并抓取文章 */
  ipcMain.handle('opml:import', async (event, filePath: string): Promise<IpcResponse> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { type: 'opml_import', payload: { error: 1, message: '窗口不存在' } }

    try {
      // 通过 IPC 事件发送进度给渲染进程
      const result = await importOpmlFile(filePath, (progress) => {
        win.webContents.send('opml:import-progress', progress)
      })

      return {
        type: 'opml_import',
        payload: {
          error: 0,
          message: `导入完成：${result.success}/${result.total} 个订阅源成功`,
          feed_count: result.success,
          failed_count: result.failed,
        },
      }
    } catch (err) {
      return {
        type: 'opml_import',
        payload: {
          error: 1,
          message: err instanceof Error ? err.message : String(err),
        },
      }
    }
  })
}
