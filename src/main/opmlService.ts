import fs from 'fs';
import { addFeed } from './feedService';
import type { AddFeedResult } from './feedService';

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
 * 从文件路径读取并解析 OPML 文件。
 */
export function parseOpmlFile(filePath: string): OpmlParseResult {
  const xml = fs.readFileSync(filePath, 'utf-8');
  return parseOpmlXml(xml);
}

/**
 * 批量导入 OPML 文件中的所有 RSS 订阅源。
 *
 * 流程：
 *   1. 读取并解析 OPML 文件
 *   2. 遍历所有订阅源，逐个调用 addFeed（含文章抓取）
 *   3. 通过回调函数实时报告进度
 *   4. 返回汇总结果
 *
 * @param filePath - OPML 文件的绝对路径
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
  const parseResult = parseOpmlFile(filePath);
  const { feeds, totalFeeds } = parseResult;

  const results: OpmlFeedResult[] = [];
  let successCount = 0;
  let failedCount = 0;

  // 逐个添加订阅源（顺序执行，避免并发请求过多导致的网络限流）
  for (let i = 0; i < feeds.length; i++) {
    const outline = feeds[i];
    const xmlUrl = outline.xmlUrl!;
    const title = outline.title || outline.text || '';

    let feedResult: OpmlFeedResult;

    try {
      const addResult: AddFeedResult = await addFeed(xmlUrl);

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
          error: addResult.error,
        };
        failedCount++;
      }
    } catch (err) {
      feedResult = {
        title: title || xmlUrl,
        xmlUrl,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
      failedCount++;
    }

    results.push(feedResult);

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: totalFeeds,
        feed: feedResult,
      });
    }
  }

  return {
    total: totalFeeds,
    success: successCount,
    failed: failedCount,
    results,
  };
}