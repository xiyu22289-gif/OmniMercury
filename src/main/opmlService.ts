import fs from 'fs';
import { addFeed, listFeeds } from './feedService';
import type { AddFeedResult } from './feedService';
import { FEED_FETCH_TIMEOUT, OPML_IMPORT_CONCURRENCY } from './configService';

// ============================================================
// 类型定义
// ============================================================

/** OPML outline 原始节点（递归结构） */
export interface OpmlOutline {
  title?: string;
  text?: string;
  xmlUrl?: string;
  htmlUrl?: string;
  type?: string;
  children: OpmlOutline[];
}

/** 单个订阅源导入结果 */
export interface OpmlFeedResult {
  title: string;
  xmlUrl: string;
  success: boolean;
  feedId?: number;
  error?: string;
}

/** OPML 文件解析结果 */
export interface OpmlParseResult {
  title: string;
  totalFeeds: number;
  feeds: OpmlOutline[];
}

/** 批量导入进度回调 */
export type ImportProgressCallback = (progress: {
  current: number;
  total: number;
  feed: OpmlFeedResult;
}) => void;

// ============================================================
// OPML XML 解析器（手写轻量实现，无需额外依赖）
// ============================================================

/**
 * 简易 XML 实体解码。
 * OPML 文件中常见 & < > " '
 */
function decodeXmlEntities(str: string): string {
  return str
    // 先解码数字实体
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // 再解码命名实体（必须在数字实体之后，避免 & 中的 & 干扰后续匹配）
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}

/**
 * 解析 OPML 文件内容，提取所有带 xmlUrl 的 RSS 订阅源 outline 节点。
 *
 * OPML 2.0 规范（简化版）：
 *   <opml version="2.0">
 *     <head><title>...</title></head>
 *     <body>
 *       <outline text="Folder" ...>
 *         <outline type="rss" text="Blog Name" xmlUrl="..." htmlUrl="..." />
 *       </outline>
 *     </body>
 *   </opml>
 *
 * 本解析器使用正则匹配所有 outline 标签，提取 xmlUrl / text / title 属性，
 * 忽略纯文件夹节点（无 xmlUrl），递归处理嵌套结构。
 */
export function parseOpmlXml(xml: string): OpmlParseResult {
  // 提取 <head><title>
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(xml);
  const opmlTitle = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : 'OPML Import';

  // 提取所有 outline 节点（递归匹配嵌套）
  const feeds: OpmlOutline[] = [];
  // 先提取 body 部分
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xml);
  const bodyContent = bodyMatch ? bodyMatch[1] : xml;

  // 用栈递归解析 outline 标签
  const outlineRegex = /<outline\b([^>]*?)(\/?)>/gi;
  const closeRegex = /<\/outline>/gi;

  // 简化方案：直接匹配所有 outline 开始标签，提取属性
  // outline 属性格式：type="rss" text="Name" xmlUrl="http://..." 等
  const attrRegex = /\b(type|text|title|xmlUrl|htmlUrl)\s*=\s*"([^"]*)"/gi;

  // 收集所有 outline 标签及其位置
  interface TagMatch {
    index: number;
    isClose: boolean;
    raw: string;
  }

  const tags: TagMatch[] = [];

  // 匹配开始标签
  let match: RegExpExecArray | null;
  outlineRegex.lastIndex = 0;
  while ((match = outlineRegex.exec(bodyContent)) !== null) {
    const selfClose = match[2] === '/'; // <outline ... />
    tags.push({ index: match.index, isClose: false, raw: match[1] });
    if (selfClose) {
      // 自闭合：立即视为 close
      tags.push({ index: match.index + match[0].length, isClose: true, raw: '' });
    }
  }

  // 匹配结束标签
  closeRegex.lastIndex = 0;
  while ((match = closeRegex.exec(bodyContent)) !== null) {
    tags.push({ index: match.index, isClose: true, raw: '' });
  }

  // 按位置排序
  tags.sort((a, b) => a.index - b.index);

  // 用栈构建树
  const stack: OpmlOutline[] = [];
  const roots: OpmlOutline[] = [];

  for (const tag of tags) {
    if (tag.isClose) {
      const popped = stack.pop();
      if (popped && stack.length > 0) {
        stack[stack.length - 1].children.push(popped);
      } else if (popped) {
        roots.push(popped);
      }
    } else {
      // 解析属性
      const attrs: Record<string, string> = {};
      let attrMatch: RegExpExecArray | null;
      attrRegex.lastIndex = 0;
      while ((attrMatch = attrRegex.exec(tag.raw)) !== null) {
        attrs[attrMatch[1]] = decodeXmlEntities(attrMatch[2]);
      }

      const node: OpmlOutline = {
        title: attrs.title || attrs.text,
        text: attrs.text || attrs.title,
        xmlUrl: attrs.xmlUrl,
        htmlUrl: attrs.htmlUrl,
        type: attrs.type,
        children: [],
      };

      // 有 xmlUrl 的才是 RSS 订阅源
      if (node.xmlUrl) {
        feeds.push(node);
      }

      stack.push(node);
    }
  }

  // 处理完所有标签后，栈中剩余的也加入
  for (const node of stack) {
    if (roots.length > 0 || feeds.includes(node)) {
      // 已经是已处理的节点
    } else {
      roots.push(node);
    }
  }

  return {
    title: opmlTitle,
    totalFeeds: feeds.length,
    feeds,
  };
}

/**
 * 从文件路径读取并解析订阅源文件（支持多种格式）。
 *
 * 支持的格式：
 * - .opml / .xml — OPML 2.0 XML
 * - .csv — CSV 文件（列：url, title 或 title, url）
 * - .txt — 纯文本 URL 列表（每行一个，忽略空行和 # 注释）
 * - .json — JSON 数组 [{url, title}] 或 {feeds: [{url, title}]}
 */
export function parseSubscriptionFile(filePath: string): OpmlParseResult {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const raw = fs.readFileSync(filePath, 'utf-8')

  if (ext === 'csv') {
    return parseCsvSubscriptionList(raw)
  }
  if (ext === 'txt') {
    return parseTxtSubscriptionList(raw)
  }
  if (ext === 'json') {
    return parseJsonSubscriptionList(raw)
  }
  // 默认按 OPML 处理
  return parseOpmlXml(raw)
}

/**
 * 解析 CSV 订阅源列表。
 * 支持的表头：url, title 或 title, url（大小写不敏感）
 * 无表头时默认第一列为 URL
 */
export function parseCsvSubscriptionList(text: string): OpmlParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) {
    throw new Error('CSV 文件为空')
  }

  // 检测是否有表头
  const firstLine = lines[0].toLowerCase()
  const hasHeader = /(url|link|rss)/.test(firstLine)

  const dataLines = hasHeader ? lines.slice(1) : lines
  const headerParts = hasHeader ? lines[0].split(',').map(h => h.trim().toLowerCase()) : []
  const urlColIndex = headerParts.findIndex(h => h === 'url' || h === 'link' || h === 'rss')
  const titleColIndex = headerParts.findIndex(h => h === 'title' || h === 'name')

  const feeds: OpmlOutline[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const parts = dataLines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''))
    if (parts.length === 0 || !parts[0]) continue

    const url = urlColIndex >= 0 ? parts[urlColIndex] : parts[0]
    const title = titleColIndex >= 0 ? parts[titleColIndex]
      : (parts.length > 1 ? parts[1] : url)

    if (!url || !/^https?:\/\//i.test(url)) continue

    feeds.push({ title, text: title, xmlUrl: url, children: [] })
  }

  if (feeds.length === 0) {
    throw new Error('CSV 文件中未找到有效 URL')
  }

  return { title: 'CSV 导入', totalFeeds: feeds.length, feeds }
}

/**
 * 解析纯文本 URL 列表。
 * 每行一个 URL，忽略空行和以 # 开头的注释行。
 */
export function parseTxtSubscriptionList(text: string): OpmlParseResult {
  const feeds: OpmlOutline[] = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    // 提取 URL（行内可能包含注释）
    const urlMatch = trimmed.match(/(https?:\/\/\S+)/i)
    if (urlMatch) {
      const url = urlMatch[1].replace(/[.,;]$/, '') // 去掉尾部标点
      feeds.push({ title: url, text: url, xmlUrl: url, children: [] })
    }
  }

  if (feeds.length === 0) {
    throw new Error('文本文件中未找到有效 URL')
  }

  return { title: '文本导入', totalFeeds: feeds.length, feeds }
}

/**
 * 解析 JSON 订阅源列表。
 * 支持格式：
 * - [{url: "...", title: "..."}, ...]
 * - {feeds: [{url: "...", title: "..."}, ...]}
 * - {subscriptions: [{xmlUrl: "...", title: "..."}, ...]}
 */
export function parseJsonSubscriptionList(text: string): OpmlParseResult {
  let data: any
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`)
  }

  let items: any[] = []

  if (Array.isArray(data)) {
    items = data
  } else if (data && typeof data === 'object') {
    // 尝试常见属性名
    const candidate = data.feeds || data.subscriptions || data.items || data.sources
    if (Array.isArray(candidate)) {
      items = candidate
    } else {
      // 单个对象
      items = [data]
    }
  }

  const feeds: OpmlOutline[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const url = item.url || item.xmlUrl || item.link || item.xmlurl || ''
    const title = item.title || item.name || item.text || url
    if (url && /^https?:\/\//i.test(url)) {
      feeds.push({ title, text: title, xmlUrl: url, children: [] })
    }
  }

  if (feeds.length === 0) {
    throw new Error('JSON 文件中未找到有效订阅源')
  }

  return { title: 'JSON 导入', totalFeeds: feeds.length, feeds }
}

/**
 * 从文件路径读取并解析 OPML 文件。
 */
export function parseOpmlFile(filePath: string): OpmlParseResult {
  const xml = fs.readFileSync(filePath, 'utf-8');
  return parseOpmlXml(xml);
}

/**
 * 批量导入 OPML 文件中的所有 RSS 订阅源（并发控制 + 独立超时）。
 *
 * 流程：
 *   1. 读取并解析文件（多格式支持）
 *   2. 并发调用 addFeed（最多 OPML_IMPORT_CONCURRENCY 个同时进行）
 *   3. 每个源独立 15s 超时，超时后标记失败并继续
 *   4. 通过回调函数实时报告进度
 *   5. 返回汇总结果
 *
 * @param filePath - 文件的绝对路径
 * @param onProgress - 进度回调（可选）
 * @returns 导入结果汇总
 */
export async function importOpmlFile(
  filePath: string,
  onProgress?: ImportProgressCallback,
): Promise<{
  total: number;
  success: number;
  failed: number;
  results: OpmlFeedResult[];
}> {
  const parseResult = parseSubscriptionFile(filePath);
  const { feeds, totalFeeds } = parseResult;

  const results: OpmlFeedResult[] = new Array(totalFeeds).fill(null);
  let completedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  /**
   * 导入单个源（含独立超时）
   * 使用 Promise.race 在 addFeed 和超时之间竞速
   */
  async function importOne(index: number): Promise<void> {
    const outline = feeds[index];
    const xmlUrl = outline.xmlUrl!;
    const title = outline.title || outline.text || '';

    let feedResult: OpmlFeedResult;

    try {
      // 独立超时竞速：addFeed vs. 15s 超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`连接超时（${FEED_FETCH_TIMEOUT / 1000}s）`));
        }, FEED_FETCH_TIMEOUT);
      });

      const addResult: AddFeedResult = await Promise.race([
        addFeed(xmlUrl),
        timeoutPromise,
      ]);

      if (addResult.success) {
        feedResult = {
          title: addResult.title,
          xmlUrl,
          success: true,
          feedId: addResult.feedId,
        };
        successCount++;
      } else {
        feedResult = {
          title: title || xmlUrl,
          xmlUrl,
          success: false,
          error: `导入订阅源 - ${xmlUrl} ${addResult.errorCode ? `[${addResult.errorCode}] ` : ''}- ${addResult.error}`,
        };
        failedCount++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('超时') || msg.includes('timeout');
      feedResult = {
        title: title || xmlUrl,
        xmlUrl,
        success: false,
        error: `导入订阅源 - ${xmlUrl} ${isTimeout ? '连接超时' : '请求失败'} - ${isTimeout ? '请检查该地址是否可访问' : msg}`,
      };
      failedCount++;
    }

    results[index] = feedResult;
    completedCount++;

    if (onProgress) {
      onProgress({
        current: completedCount,
        total: totalFeeds,
        feed: feedResult,
      });
    }
  }

  // 并发控制：用滑动窗口逐个推进
  const concurrency = Math.min(OPML_IMPORT_CONCURRENCY, totalFeeds);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < totalFeeds) {
      const i = cursor++;
      await importOne(i);
    }
  }

  // 启动 concurrency 个 worker
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    total: totalFeeds,
    success: successCount,
    failed: failedCount,
    results,
  };
}

// ============================================================
// OPML 导出
// ============================================================

/** XML 实体编码 */
function encodeXmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 生成 OPML 2.0 XML 字符串 */
export function generateOpmlXml(): string {
  const feeds = listFeeds()
  const now = new Date().toISOString()

  const outlines = feeds.map(f => {
    const title = encodeXmlEntities(f.title)
    const xmlUrl = encodeXmlEntities(f.url)
    const htmlUrl = encodeXmlEntities(f.link || f.url)
    return `      <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}" />`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Summer RSS Reader — 订阅源导出</title>
    <dateCreated>${now}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`
}

/** 导出 OPML 到文件，返回保存路径 */
export function exportOpmlFile(filePath: string): string {
  const xml = generateOpmlXml()
  fs.writeFileSync(filePath, xml, 'utf-8')
  return filePath
}