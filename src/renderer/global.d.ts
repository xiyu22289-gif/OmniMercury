import type {
  IpcResponse,
  LlmStreamChunk,
  LlmStreamDone,
  LlmStreamError,
  LlmConfig,
  Tag,
  TokenStats,
  ArticleNote,
  LlmGlobalConfig,
  LlmFunctionConfig,
  LlmModelItem,
} from '../shared/types'
/** OPML 导入进度事件（类型定义同 preload/index.ts） */
interface OpmlImportProgress {
  current: number
  total: number
  feed: {
    title: string
    xmlUrl: string
    success: boolean
    feedId?: number
    error?: string
  }
}

export {}

declare global {
  interface Window {
    api: {
      // ---- RSS 业务 ----
      addFeed: (url: string) => Promise<IpcResponse>
      listFeeds: () => Promise<IpcResponse>
      refreshFeeds: () => Promise<IpcResponse>
      getArticles: (feedId: number, offset?: number, limit?: number) => Promise<IpcResponse>
      getArticleContent: (articleId: number) => Promise<IpcResponse>
      refreshArticleContent: (articleId: number) => Promise<IpcResponse>
      removeFeed: (feedId: number) => Promise<IpcResponse>
      renameFeed: (feedId: number, newName: string) => Promise<{ success: boolean; error?: string }>
      /** searchArticles: useFts=true 使用 FTS5 全文搜索（正文+标题），默认 false 使用标题模糊搜索 */
      searchArticles: (query: string, feedId?: number, offset?: number, limit?: number, useFts?: boolean) => Promise<IpcResponse>
      getCachedArticleContent: (articleId: number) => Promise<IpcResponse>
      getArticlesByIds: (ids: number[]) => Promise<IpcResponse>

      // ---- LLM 配置 ----
      getLlmConfig: () => Promise<LlmConfig>
      setLlmConfig: (updates: Record<string, string>) => Promise<{ success: boolean }>
      resetLlmConfig: () => Promise<{ success: boolean }>

      // ---- LLM 流式操作 ----
      summarize: (articleId: number, content: string, title: string, targetLang: string, detailLevel?: string) => Promise<{ success: boolean }>
      translate: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>
      translateParagraphs: (articleId: number, content: string, title: string, targetLang: string) => Promise<{ success: boolean }>

      /** 选择文本翻译（流式） */
      translateSelection: (articleId: number, selectedText: string, targetLang: string) => Promise<{ success: boolean }>

      /** 选择段落摘要（流式） */
      summarizeSelection: (articleId: number, title: string, selectedParagraphs: string[], targetLang: string, detailLevel: 'compact' | 'medium' | 'detailed') => Promise<{ success: boolean }>

      /** 监听流式数据块，返回取消监听的函数 */
      onStreamChunk: (
        callback: (chunk: LlmStreamChunk | LlmStreamDone | LlmStreamError) => void
      ) => () => void

      /** 测试 LLM API 连接 */
      testConnection: (config?: { baseUrl: string; apiKey: string; model: string }) => Promise<{ success: boolean; latencyMs: number; message: string }>

      // ---- 收藏/已读 ----
      deleteArticle: (articleId: number) => Promise<{ success: boolean; error?: string }>
      toggleStar: (articleId: number) => Promise<{ success: boolean; data?: { id: number; isStarred: number }; error?: string }>
      markRead: (articleId: number) => Promise<{ success: boolean; error?: string }>
      toggleRead: (articleId: number) => Promise<{ success: boolean; data?: { id: number; isRead: number }; error?: string }>
      getAllArticles: () => Promise<IpcResponse>
      getStarredArticles: () => Promise<IpcResponse>

      // ---- 函数级 LLM 配置（新版） ----
      getLlmGlobalConfig: () => Promise<LlmGlobalConfig>
      getLlmFunctionConfig: (funcType: string) => Promise<LlmFunctionConfig>
      setLlmFunctionConfig: (funcType: string, config: LlmFunctionConfig) => Promise<{ success: boolean }>

      // 模型列表查询
      listLlmModels: (baseUrl: string, apiKey: string) => Promise<import('../shared/types').ListModelsResult>

      /** Token 用量统计 */
      getTokenStats: () => Promise<{ error: number; stats?: TokenStats[]; message?: string }>
      /** 清除所有 Token 用量记录 */
      clearTokenStats: () => Promise<{ success: boolean; error?: string }>

      // ---- M5 标签系统 ----
      getTags: () => Promise<{ success: boolean; data?: Tag[]; error?: string }>
      getTagById: (id: number) => Promise<{ success: boolean; data?: Tag; error?: string }>
      createTag: (name: string, color?: string) => Promise<{ success: boolean; data?: Tag; error?: string }>
      updateTag: (id: number, name: string, color?: string) => Promise<{ success: boolean; data?: Tag; error?: string }>
      deleteTag: (id: number) => Promise<{ success: boolean; error?: string }>
      getTagsForArticle: (articleId: number) => Promise<{ success: boolean; data?: Tag[]; error?: string }>
      toggleArticleTag: (articleId: number, tagId: number) => Promise<{ success: boolean; data?: { added: boolean }; error?: string }>
      getArticlesByTag: (tagId: number) => Promise<{ success: boolean; data?: number[]; error?: string }>
      batchAddTagsToArticle: (articleId: number, tagIds: number[]) => Promise<{ success: boolean; error?: string }>
      suggestTagsFromAI: (title: string, content: string, existingTagNames: string[]) => Promise<{ success: boolean; data?: string[]; error?: string }>
      getTagArticleCounts: () => Promise<{ success: boolean; data?: Record<number, number>; error?: string }>

      // ---- 笔记系统 ----
      getNote: (articleId: number) => Promise<ArticleNote | null>
      saveNote: (articleId: number, content: string) => Promise<ArticleNote>
      deleteNote: (articleId: number) => Promise<void>
      exportNotesOpml: () => Promise<{ success: boolean; filePath?: string; error?: string }>

      // ---- 导出 ----
      exportSummaryMd: (articleTitle: string, summaryText: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      /** 导出单篇文章为 HTML（可勾选荧光笔/笔记） */
      exportArticle: (articleId: number, includeHighlights: boolean, includeNotes: boolean) => Promise<{ success: boolean; filePath?: string; error?: string }>

      // ---- OPML 导入 ----
      selectOpmlFile: () => Promise<{ canceled: boolean; filePath?: string; error?: string }>
      previewOpml: (filePath: string) => Promise<IpcResponse>
      importOpml: (filePath: string) => Promise<IpcResponse>
      exportOpml: () => Promise<{ success: boolean; filePath?: string; error?: string }>
      onOpmlProgress: (callback: (progress: OpmlImportProgress) => void) => () => void

      // ---- 浏览历史 ----
      logBrowseHistory: (articleId: number) => Promise<{ success: boolean; error?: string }>
      getBrowseHistory: (limit?: number) => Promise<{ success: boolean; data?: Array<{ id: number; articleId: number; articleTitle: string; articleLink: string | null; feedTitle: string | null; author: string | null; pubDate: string | null; viewedAt: string }>; error?: string }>
      clearBrowseHistory: () => Promise<{ success: boolean; error?: string }>

      // ---- M14 荧光笔 ----
      getHighlights: (articleId: number) => Promise<{ success: boolean; data?: string | null; error?: string }>
      saveHighlights: (articleId: number, highlights: string) => Promise<{ success: boolean; error?: string }>

      // ---- M16 术语库 ----
      getGlossary: () => Promise<{ success: boolean; data?: import('../main/db').Glossary[]; error?: string }>
      addGlossaryTerm: (sourceTerm: string, targetTerm: string, category?: string) => Promise<{ success: boolean; data?: any; error?: string }>
      updateGlossaryTerm: (id: number, sourceTerm: string, targetTerm: string, category?: string) => Promise<{ success: boolean; error?: string }>
      deleteGlossaryTerm: (id: number) => Promise<{ success: boolean; error?: string }>

      // ---- 窗口尺寸控制 ----
      setHalfScreen: () => Promise<{ success: boolean }>
      setFullScreen: () => Promise<{ success: boolean }>

      // ---- M15 AI 问答 ----
      askQuestion: (articleId: number, articleContent: string, articleTitle: string, question: string, lang?: string) => Promise<{ success: boolean }>
    }
  }
}