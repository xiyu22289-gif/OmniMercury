import { ipcMain, BrowserWindow, dialog } from 'electron'
import { addFeed, listFeeds, getArticles, getArticlesByIdList, searchArticles, fullTextSearch, getCachedArticleContent, refreshAllFeeds } from './feedService'
import { parseOpmlFile, parseSubscriptionFile, importOpmlFile, exportOpmlFile } from './opmlService'
import { getDb, getFeedById, feeds as feedsTable, articles as articlesTable, getTokenStats } from './db'
import { eq } from 'drizzle-orm'
import { summarizeArticle, translateArticle, translateParagraphs, testConnection, suggestTagsForArticle, translateSelection, summarizeSelection, listModels } from './llmService'
import { getLlmConfig, getLlmGlobalConfig, setFunctionConfig, getFunctionConfig, setLlmConfig, resetLlmConfig } from './configService'
import { getOrFetchArticleContent } from './contentService'
import {
  getAllTags, getTagById, createTag, updateTag, deleteTag,
  getTagsForArticle, toggleArticleTag, getArticlesByTag, batchAddTagsToArticle,
  getTagArticleCounts,
} from './tagService'
import type {
  IpcResponse,
  Feed,
  Article,
  ArticleContent,
  SummarizeRequest,
  TranslateRequest,
  SelectiveTranslateRequest
} from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('backend:addFeed', async (_event, url: string): Promise<IpcResponse> => {
    const result = await addFeed(url)
    if (result.success) {
      const feed = getFeedById(result.feedId)
      return { type: 'import_feed', payload: { error: 0, errorCode: 'OK' as const, feed: feed ? { id: feed.id, title: feed.title, url: feed.url, link: feed.link ?? undefined, description: feed.description ?? undefined, added_at: feed.createdAt ?? '' } : undefined, feed_id: result.feedId, message: `已添加：${result.title}` } }
    }
    return { type: 'import_feed', payload: { error: 1, errorCode: result.errorCode, message: result.error } }
  })

  ipcMain.handle('backend:listFeeds', async (): Promise<IpcResponse> => {
    try {
      const feeds: Feed[] = listFeeds().map(f => ({ id: f.id, title: f.title, url: f.url, link: f.link ?? undefined, description: f.description ?? undefined, added_at: f.createdAt ?? '' }))
      return { type: 'list_feeds', payload: { error: 0, feeds } }
    } catch (err) {
      console.error('[ipcHandlers] listFeeds 异常：', err)
      return { type: 'list_feeds', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } }
    }
  })

  ipcMain.handle('backend:getArticles', async (_event, feedId: number): Promise<IpcResponse> => {
    try {
      const articles: Article[] = getArticles(feedId).map(a => ({ id: a.id, feed_id: feedId, title: a.title, url: a.link ?? '', author: a.author ?? undefined, summary: a.summary ?? undefined, translations: a.translations ?? undefined, published_at: a.pubDate ?? a.createdAt ?? '', fetched_at: a.createdAt ?? '', is_read: a.isRead === 1, is_starred: a.isStarred === 1 }))
      return { type: 'list_articles', payload: { error: 0, articles } }
    } catch (err) {
      console.error('[ipcHandlers] getArticles 异常：', err)
      return { type: 'list_articles', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } }
    }
  })

  // ================================================================
  // backend:getArticleContent — 获取文章正文（含 M3 清洗流水线）
  // ================================================================
  ipcMain.handle(
    'backend:getArticleContent',
    async (_event, articleId: number): Promise<IpcResponse> => {
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

      if (article.contentMd) {
        // 返回缓存的翻译和摘要数据，供前端检查避免重复 API 调用
        return {
          type: 'get_article_content',
          payload: {
            error: 0,
            content: {
              id: article.id,
              content: article.contentMd,
              summary: article.summary,
              translations: article.translations,
            }
          }
        }
      }

      if (article.link) {
        try {
          const result = await getOrFetchArticleContent(articleId, article.link)
          return {
            type: 'get_article_content',
            payload: { error: 0, content: { id: articleId, content: result.content }, message: result.degraded ? result.reason : undefined }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[ipcHandlers] getOrFetchArticleContent 异常：', err)
          const fallback = article.content ?? `（正文抓取失败：${msg}）`
          return {
            type: 'get_article_content',
            payload: { error: 0, content: { id: articleId, content: fallback }, message: msg }
          }
        }
      }

      const body = article.content ?? '(暂无正文内容)'
      return {
        type: 'get_article_content',
        payload: { error: 0, content: { id: article.id, content: body } }
      }
    }
  )

  // ================================================================
  // backend:getAllArticles — 全部文章（跨订阅源，按时间倒序）
  // ================================================================
  ipcMain.handle('backend:getAllArticles', async (): Promise<IpcResponse> => {
    try {
      const { getAllArticles } = await import('./db');
      const rows = getAllArticles();
      const articles: Article[] = rows.map(a => ({
        id: a.id, feed_id: a.feedId, title: a.title,
        url: a.link ?? '', author: a.author ?? undefined,
        summary: a.summary ?? undefined, translations: a.translations ?? undefined,
        published_at: a.pubDate ?? a.createdAt ?? '', fetched_at: a.createdAt ?? '',
        is_read: a.isRead === 1, is_starred: a.isStarred === 1,
      }));
      return { type: 'list_articles', payload: { error: 0, articles } };
    } catch (err) {
      return { type: 'list_articles', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } };
    }
  });

  // ================================================================
  // backend:removeFeed — 删除订阅源
  // ================================================================
  // ---- Star / Read Toggle ----
  ipcMain.handle('backend:deleteArticle', async (_event, articleId: number) => {
    try {
      const { deleteArticle } = await import('./db');
      deleteArticle(articleId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('backend:toggleStar', async (_event, articleId: number) => {
    try {
      const { toggleStarArticle } = await import('./db')
      const result = toggleStarArticle(articleId)
      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('backend:markRead', async (_event, articleId: number) => {
    try {
      const { markArticleRead } = await import('./db')
      markArticleRead(articleId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('backend:getStarredArticles', async (): Promise<IpcResponse> => {
    try {
      const { getStarredArticles } = await import('./db')
      const rows = getStarredArticles()
      const articles: Article[] = rows.map(a => ({
        id: a.id, feed_id: a.feedId, title: a.title,
        url: a.link ?? '', author: a.author ?? undefined,
        summary: a.summary ?? undefined, translations: a.translations ?? undefined,
        published_at: a.pubDate ?? a.createdAt ?? '', fetched_at: a.createdAt ?? '',
        is_read: a.isRead === 1, is_starred: a.isStarred === 1,
      }))
      return { type: 'list_articles', payload: { error: 0, articles } }
    } catch (err) {
      return { type: 'list_articles', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } }
    }
  })

  ipcMain.handle('backend:removeFeed', async (_event, feedId: number): Promise<IpcResponse> => {
    try { getDb().delete(feedsTable).where(eq(feedsTable.id, feedId)).run(); return { type: 'remove_feed', payload: { error: 0, message: '已删除' } } }
    catch (err) { return { type: 'remove_feed', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } } }
  })

  ipcMain.handle('backend:refreshFeeds', async (): Promise<IpcResponse> => {
    try {
      const result = await refreshAllFeeds()
      return { type: 'refresh_feeds', payload: { error: 0, message: `刷新完成，新增 ${result.newCount} 篇文章`, new_count: result.newCount } }
    } catch (err) {
      return { type: 'refresh_feeds', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } }
    }
  })

  ipcMain.handle('backend:searchArticles', async (_event, query: string, _feedId?: number, _offset?: number, _limit?: number, _useFts?: boolean): Promise<IpcResponse> => {
    try {
      if (!query?.trim()) return { type: 'search_articles', payload: { error: 0, articles: [] } }
      const limit = typeof _limit === 'number' && _limit > 0 ? _limit : 20

      // Enter 回车搜索使用 FTS5 全文搜索，输入建议使用标题模糊搜索
      let results: Array<{
        id: number
        feedId: number
        title: string
        link: string | null
        summary: string | null
        translations: string | null
        author: string | null
        pubDate: string | null
        createdAt: string | null
        isRead: number | null
      }>

      if (_useFts) {
        results = fullTextSearch(query.trim(), limit).map(a => ({
          id: a.id, feedId: a.feedId, title: a.title, link: a.link,
          summary: a.summary, translations: a.translations, author: a.author,
          pubDate: a.pubDate, createdAt: a.createdAt, isRead: a.isRead, isStarred: a.isStarred,
        }))
      } else {
        results = searchArticles(query.trim(), limit)
      }

      const articles: Article[] = results.map(a => ({ id: a.id, feed_id: a.feedId, title: a.title, url: a.link ?? '', author: a.author ?? undefined, summary: a.summary ?? undefined, translations: a.translations ?? undefined, published_at: a.pubDate ?? a.createdAt ?? '', fetched_at: a.createdAt ?? '', is_read: a.isRead === 1, is_starred: a.isStarred === 1 }))
      return { type: 'search_articles', payload: { error: 0, articles } }
    } catch (err) {
      console.error('[ipcHandlers] searchArticles 异常：', err)
      return { type: 'search_articles', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } }
    }
  })

  ipcMain.handle('backend:getCachedArticleContent', async (_event, articleId: number): Promise<IpcResponse> => {
    try {
      const cached = getCachedArticleContent(articleId)
      if (!cached) return { type: 'get_cached_article_content', payload: { error: 1, message: '本地无缓存内容' } }
      return { type: 'get_cached_article_content', payload: { error: 0, content: { id: cached.id, content: cached.body } } }
    } catch (err) {
      console.error('[ipcHandlers] getCachedArticleContent 异常：', err)
      return { type: 'get_cached_article_content', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } }
    }
  })

  // ================================================================
  // M5: 按 ID 列表获取文章（跨订阅源，用于标签筛选）
  // ================================================================
  ipcMain.handle('backend:getArticlesByIds', async (_event, ids: number[]): Promise<IpcResponse> => {
    try {
      const articles: Article[] = getArticlesByIdList(ids).map(a => ({ id: a.id, feed_id: 0, title: a.title, url: a.link ?? '', author: a.author ?? undefined, summary: a.summary ?? undefined, translations: a.translations ?? undefined, published_at: a.pubDate ?? a.createdAt ?? '', fetched_at: a.createdAt ?? '', is_read: a.isRead === 1, is_starred: a.isStarred === 1 }))
      return { type: 'list_articles', payload: { error: 0, articles } }
    } catch (err) {
      console.error('[ipcHandlers] getArticlesByIds 异常：', err)
      return { type: 'list_articles', payload: { error: 1, message: err instanceof Error ? err.message : String(err) } }
    }
  })

  // ================================================================
  // LLM 配置
  // ================================================================
  ipcMain.handle('llm:getConfig', async () => getLlmConfig())
  ipcMain.handle('llm:setConfig', async (_event, updates: Record<string, string>) => { setLlmConfig(updates); return { success: true } })
  ipcMain.handle('llm:resetConfig', async () => { resetLlmConfig(); return { success: true } })
  ipcMain.handle('llm:testConnection', async (_event, config?: { baseUrl: string; apiKey: string; model: string }) => {
    return await testConnection(config)
  })

  // 函数级 LLM 配置（新版）
  ipcMain.handle('llm:getGlobalConfig', async () => getLlmGlobalConfig())
  ipcMain.handle('llm:getFunctionConfig', async (_event, funcType: string) => getFunctionConfig(funcType as import('../shared/types').LlmFunctionType))
  ipcMain.handle('llm:setFunctionConfig', async (_event, funcType: string, config: import('../shared/types').LlmFunctionConfig) => {
    setFunctionConfig(funcType as import('../shared/types').LlmFunctionType, config)
    return { success: true }
  })

  // 模型列表查询
  ipcMain.handle('llm:listModels', async (_event, baseUrl: string, apiKey: string) => {
    return await listModels(baseUrl, apiKey)
  })

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

  // 选择文本翻译
  ipcMain.handle('llm:translateSelection', async (event, request: SelectiveTranslateRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    translateSelection(request, (chunk) => win.webContents.send('llm:stream-chunk', chunk))
      .catch(err => { console.error('[ipcHandlers] translateSelection 异常：', err); win.webContents.send('llm:stream-chunk', { type: 'selectiveTranslate', articleId: request.articleId, message: String(err) }) })
    return { success: true }
  })

  // 选择段落摘要
  ipcMain.handle('llm:summarizeSelection', async (event, request: import('../shared/types').SelectiveSummarizeRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    summarizeSelection(request, (chunk) => win.webContents.send('llm:stream-chunk', chunk))
      .catch(err => { console.error('[ipcHandlers] summarizeSelection 异常：', err); win.webContents.send('llm:stream-chunk', { type: 'selectiveSummarize', articleId: request.articleId, message: String(err) }) })
    return { success: true }
  })

  // ================================================================
  // M7: Token 用量统计
  // ================================================================
  ipcMain.handle('llm:getTokenStats', async (): Promise<{ error: number; stats?: import('../shared/types').TokenStats[]; message?: string }> => {
    try {
      const stats = getTokenStats(30)
      return { error: 0, stats }
    } catch (err) {
      return { error: 1, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // ================================================================
  // M6: 摘要导出
  // ================================================================
  ipcMain.handle('summary:exportMd', async (event, articleTitle: string, summaryText: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    const safeName = articleTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'summary'
    const result = await dialog.showSaveDialog(win, {
      title: '导出摘要 Markdown',
      defaultPath: `summary-${safeName}-${new Date().toISOString().slice(0, 10)}.md`,
      filters: [{ name: 'Markdown 文件', extensions: ['md'] }, { name: '所有文件', extensions: ['*'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, error: '用户取消' }
    try {
      const fs = await import('fs')
      const parts = ['# ' + articleTitle, '', '**摘要：**', '', summaryText]
      fs.writeFileSync(result.filePath, parts.join('\n'), 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ================================================================
  // M6: 笔记系统
  // ================================================================
  ipcMain.handle('note:get', async (_event, articleId: number) => {
    const { getNoteByArticleId } = await import('./db')
    return getNoteByArticleId(articleId) ?? null
  })

  ipcMain.handle('note:save', async (_event, articleId: number, content: string) => {
    const { upsertNote } = await import('./db')
    return upsertNote(articleId, content)
  })

  ipcMain.handle('note:delete', async (_event, articleId: number) => {
    const { deleteNoteByArticleId } = await import('./db')
    deleteNoteByArticleId(articleId)
  })

  ipcMain.handle('note:exportOpml', async (event): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    const result = await dialog.showSaveDialog(win, {
      title: '导出笔记 Markdown',
      defaultPath: `notes-export-${new Date().toISOString().slice(0, 10)}.md`,
      filters: [{ name: 'Markdown 文件', extensions: ['md'] }, { name: '所有文件', extensions: ['*'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, error: '用户取消' }
    try {
      const { exportNotesToOpml } = await import('./notesExportService')
      exportNotesToOpml(result.filePath)
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ================================================================
  // OPML 导入导出
  // ================================================================
  ipcMain.handle('opml:selectFile', async (event): Promise<{ canceled: boolean; filePath?: string; error?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { canceled: true, error: '窗口不存在' }
    const result = await dialog.showOpenDialog(win, {
      title: '选择 OPML 文件',
      filters: [
        { name: '支持的订阅格式', extensions: ['opml', 'xml', 'csv', 'txt', 'json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    return { canceled: false, filePath: result.filePaths[0] }
  })

  ipcMain.handle('opml:preview', async (_event, filePath: string): Promise<IpcResponse> => {
    try {
      const result = parseSubscriptionFile(filePath)
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

  ipcMain.handle('opml:import', async (event, filePath: string): Promise<IpcResponse> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { type: 'opml_import', payload: { error: 1, message: '窗口不存在' } }
    try {
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

  ipcMain.handle('opml:export', async (event): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不存在' }
    const result = await dialog.showSaveDialog(win, {
      title: '导出 OPML 文件',
      defaultPath: `summer-rss-export-${new Date().toISOString().slice(0, 10)}.opml`,
      filters: [
        { name: 'OPML 文件', extensions: ['opml'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePath) return { success: false, error: '用户取消' }
    try {
      exportOpmlFile(result.filePath)
      return { success: true, filePath: result.filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ================================================================
  // M5 标签系统
  // ================================================================
  ipcMain.handle('tag:getAll', async () => {
    try {
      const data = getAllTags()
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:getById', async (_event, id: number) => {
    try {
      const data = getTagById(id)
      if (!data) return { success: false, error: `标签 ID=${id} 不存在` }
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:create', async (_event, name: string, color?: string) => {
    try {
      const data = createTag(name, color)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:update', async (_event, id: number, name: string, color?: string) => {
    try {
      const data = updateTag(id, name, color)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:delete', async (_event, id: number) => {
    try {
      deleteTag(id)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:getForArticle', async (_event, articleId: number) => {
    try {
      const data = getTagsForArticle(articleId)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:toggleArticle', async (_event, articleId: number, tagId: number) => {
    try {
      const data = toggleArticleTag(articleId, tagId)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:getArticlesByTag', async (_event, tagId: number) => {
    try {
      const data = getArticlesByTag(tagId)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:batchAddToArticle', async (_event, articleId: number, tagIds: number[]) => {
    try {
      batchAddTagsToArticle(articleId, tagIds)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:getArticleCounts', async () => {
    try {
      const data = getTagArticleCounts()
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tag:suggestFromAI', async (_event, title: string, content: string, existingTagNames: string[]) => {
    try {
      const suggestions = await suggestTagsForArticle(title, content, existingTagNames)
      return { success: true, data: suggestions }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}