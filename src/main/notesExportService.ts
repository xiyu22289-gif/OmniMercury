import * as fs from 'fs'
import { eq } from 'drizzle-orm'
import {
  getNoteByArticleId,
  getAllNoteArticleIds,
  getDb,
  articles as articlesTable,
  feeds as feedsTable,
} from './db'
import type { NoteExportItem } from '../shared/types'

/**
 * 导出所有笔记到 Markdown 文件。
 * 每条笔记的格式：
 *   第一行：文章标题
 *   第二行："笔记："
 *   第三行及以后：笔记内容（保留原有格式，HTML 转 Markdown）
 */
export function exportNotesToOpml(filePath: string): void {
  // 动态加载 turndown（避免主进程冷启动开销）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const TurndownService = require('turndown')
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  })

  const db = getDb()
  const articleIds = getAllNoteArticleIds().map((r) => r.articleId)
  const items: NoteExportItem[] = []

  for (const articleId of articleIds) {
    const note = getNoteByArticleId(articleId)
    if (!note || !note.content || !note.content.trim()) continue

    const article = db
      .select({
        title: articlesTable.title,
        link: articlesTable.link,
        feedId: articlesTable.feedId,
      })
      .from(articlesTable)
      .where(eq(articlesTable.id, articleId))
      .get()

    const articleTitle = article?.title ?? 'Article #' + String(articleId)
    const articleUrl = article?.link ?? ''

    items.push({
      articleId,
      articleTitle,
      articleUrl,
      feedTitle: '',
      noteHtml: note.content,
      updatedAt: note.updatedAt ?? note.createdAt ?? '',
    })
  }

  if (items.length === 0) {
    fs.writeFileSync(filePath, '# No Notes\n', 'utf-8')
    return
  }

  const parts: string[] = []
  parts.push('# OmniMercury Notes Export')
  parts.push('')
  parts.push('> 导出时间：' + new Date().toLocaleString('zh-CN'))
  parts.push('')

  // 分隔线
  parts.push('---')
  parts.push('')

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // 文章标题（H2 标题）
    parts.push('## ' + item.articleTitle)
    parts.push('')

    // "笔记："标签
    parts.push('**笔记：**')
    parts.push('')

    // 笔记内容（HTML → Markdown）
    const mdContent = turndown.turndown(item.noteHtml)
    parts.push(mdContent)
    parts.push('')

    // 笔记间分隔线
    if (i < items.length - 1) {
      parts.push('---')
      parts.push('')
    }
  }

  fs.writeFileSync(filePath, parts.join('\n'), 'utf-8')
}
