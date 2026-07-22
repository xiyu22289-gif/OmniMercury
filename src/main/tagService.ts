/**
 * M5 标签服务 — 标签 CRUD + 文章打标管理。
 *
 * 所有函数使用 db.ts 导出的 getDb() + Drizzle ORM 查询，
 * 外键 ON DELETE CASCADE 由 SQLite 自动处理。
 */

import { eq, and, inArray, sql } from 'drizzle-orm'
import { getDb, tags, articleTags, articles, type Tag, type NewTag, type ArticleTag } from './db'

// ============================================================
// 工具
// ============================================================

/** 包装 SQLite 唯一约束错误，返回友好信息 */
function wrapUniqueError(err: unknown, name: string): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('UNIQUE constraint failed: tags.name')) {
    return new Error(`标签名「${name}」已存在，请使用其他名称。`)
  }
  if (msg.includes('UNIQUE constraint failed: article_tags')) {
    return new Error('该文章已打过此标签，无需重复操作。')
  }
  return err instanceof Error ? err : new Error(String(err))
}

// ============================================================
// 标签 CRUD
// ============================================================

/** 获取所有标签，按 id 升序排列 */
export function getAllTags(): Tag[] {
  try {
    return getDb()
      .select()
      .from(tags)
      .orderBy(sql`${tags.id} ASC`)
      .all()
  } catch (err) {
    console.error('[tagService] getAllTags 失败：', err)
    throw new Error('获取标签列表失败')
  }
}

/** 根据 ID 获取单个标签，未找到返回 undefined */
export function getTagById(id: number): Tag | undefined {
  try {
    return getDb()
      .select()
      .from(tags)
      .where(eq(tags.id, id))
      .get()
  } catch (err) {
    console.error('[tagService] getTagById 失败：', err)
    throw new Error('获取标签失败')
  }
}

/**
 * 创建新标签。
 * name 唯一 — 重名时抛出明确错误。
 * @returns 新创建的标签完整记录
 */
export function createTag(name: string, color?: string): Tag {
  try {
    return getDb()
      .insert(tags)
      .values({ name, color: color ?? null })
      .returning()
      .get()
  } catch (err) {
    console.error('[tagService] createTag 失败：', err)
    throw wrapUniqueError(err, name)
  }
}

/**
 * 更新标签名称和颜色。
 * name 唯一 — 改为已有名称时抛出明确错误。
 * @returns 更新后的标签完整记录
 */
export function updateTag(id: number, name: string, color?: string): Tag {
  try {
    const updated = getDb()
      .update(tags)
      .set({ name, color: color ?? null })
      .where(eq(tags.id, id))
      .returning()
      .get()

    if (!updated) {
      throw new Error(`标签 ID=${id} 不存在`)
    }
    return updated
  } catch (err) {
    console.error('[tagService] updateTag 失败：', err)
    // 如果是找不到记录的错误，直接抛出；否则检查唯一约束
    if (err instanceof Error && err.message.includes('不存在')) throw err
    throw wrapUniqueError(err, name)
  }
}

/**
 * 删除标签。
 * article_tags 中的关联记录由 ON DELETE CASCADE 自动清理。
 */
export function deleteTag(id: number): void {
  try {
    const result = getDb()
      .delete(tags)
      .where(eq(tags.id, id))
      .run()

    if (result.changes === 0) {
      throw new Error(`标签 ID=${id} 不存在`)
    }
  } catch (err) {
    console.error('[tagService] deleteTag 失败：', err)
    throw err instanceof Error ? err : new Error(String(err))
  }
}

// ============================================================
// 文章打标
// ============================================================

/** 获取某篇文章的所有标签 */
export function getTagsForArticle(articleId: number): Tag[] {
  try {
    return getDb()
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
      })
      .from(tags)
      .innerJoin(articleTags, eq(tags.id, articleTags.tagId))
      .where(eq(articleTags.articleId, articleId))
      .orderBy(sql`${tags.id} ASC`)
      .all() as Tag[]
  } catch (err) {
    console.error('[tagService] getTagsForArticle 失败：', err)
    throw new Error('获取文章标签失败')
  }
}

/**
 * 切换文章标签：已打标则取消，未打标则打上。
 * @returns { added: boolean } — true 表示打上，false 表示取消
 */
export function toggleArticleTag(articleId: number, tagId: number): { added: boolean } {
  try {
    // 查询是否已存在关联
    const existing = getDb()
      .select()
      .from(articleTags)
      .where(
        and(
          eq(articleTags.articleId, articleId),
          eq(articleTags.tagId, tagId),
        ),
      )
      .get()

    if (existing) {
      // 已存在 → 取消
      getDb()
        .delete(articleTags)
        .where(eq(articleTags.id, existing.id))
        .run()
      return { added: false }
    } else {
      // 不存在 → 打上
      getDb()
        .insert(articleTags)
        .values({ articleId, tagId })
        .run()
      return { added: true }
    }
  } catch (err) {
    console.error('[tagService] toggleArticleTag 失败：', err)
    // 联合唯一约束冲突（并发场景）：视为已打标
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      return { added: false }
    }
    throw new Error('操作文章标签失败')
  }
}

/** 获取打了某标签的所有文章 ID 列表 */
export function getArticlesByTag(tagId: number): number[] {
  try {
    const rows = getDb()
      .select({ articleId: articleTags.articleId })
      .from(articleTags)
      .where(eq(articleTags.tagId, tagId))
      .all()

    return rows.map(r => r.articleId)
  } catch (err) {
    console.error('[tagService] getArticlesByTag 失败：', err)
    throw new Error('获取标签关联文章失败')
  }
}

/**
 * 统计所有标签各自关联的文章数量。
 * @returns { tagId: number } 映射
 */
export function getTagArticleCounts(): Record<number, number> {
  try {
    const rows = getDb()
      .select({
        tagId: articleTags.tagId,
        count: sql<number>`COUNT(*)`,
      })
      .from(articleTags)
      .groupBy(articleTags.tagId)
      .all()

    const counts: Record<number, number> = {}
    // 同时为所有标签（即使无文章）初始化 0
    const allTags = getAllTags()
    for (const t of allTags) {
      counts[t.id] = 0
    }
    for (const r of rows) {
      counts[r.tagId] = r.count
    }
    return counts
  } catch (err) {
    console.error('[tagService] getTagArticleCounts 失败：', err)
    throw new Error('获取标签文章统计失败')
  }
}

/**
 * 批量给文章打上多个标签。
 * 已存在的关联跳过（不报错），新关联插入。
 */
export function batchAddTagsToArticle(articleId: number, tagIds: number[]): void {
  try {
    // 先查出已有关联，避免重复插入报错
    const existing = getDb()
      .select({ tagId: articleTags.tagId })
      .from(articleTags)
      .where(eq(articleTags.articleId, articleId))
      .all()
    const existingIds = new Set(existing.map(r => r.tagId))

    for (const tagId of tagIds) {
      if (existingIds.has(tagId)) continue
      try {
        getDb()
          .insert(articleTags)
          .values({ articleId, tagId })
          .run()
      } catch (err) {
        // 并发时可能已被其他请求插入，忽略 UNIQUE 冲突
        if (!(err instanceof Error && err.message.includes('UNIQUE constraint failed'))) {
          throw err
        }
      }
    }
  } catch (err) {
    console.error('[tagService] batchAddTagsToArticle 失败：', err)
    throw new Error('批量添加标签失败')
  }
}
