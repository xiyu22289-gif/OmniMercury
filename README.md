# OmniMercury
小组作业，跨平台RSS阅读器
# OmniMercury

OmniMercury is a cross-platform, local-first RSS reader focused on comfortable and convenient information aggregation and reading. It boosts your efficiency with highly customizable AI features, entry notes, article export, and a tag system, including article summarization, bilingual translation, AI-suggested tags, and batch tagging, powered by any large language model you have access to, whether via online service or local deployment.

OmniMercury 是一款跨平台、强调本地优先（*local first*）的 RSS 阅读器，专注于方便舒适的信息聚合与阅读体验，并通过高度可定制的 AI 功能、文章笔记、文章导出，以及标签系统（如文章摘要、双语翻译、AI 推荐标签与打标签）提升你的效率，支持任何兼容 OpenAI 协议的大语言模型。

[English Readme](#features) | [中文说明](#功能特性) | [Screenshots / 截屏](#screenshots--截屏)

---

## Screenshots / 截屏

![截图说明](屏幕截图%202026-08-02%20203729.png)
![截图说明](屏幕截图%202026-08-02%20211731.png)
![截图说明](屏幕截图%202026-08-02%20212136.png)
![截图说明](屏幕截图%202026-08-02%20212201.png)
![截图说明](屏幕截图%202026-08-02%20212305.png)
![截图说明](屏幕截图%202026-08-02%20212446.png)
![截图说明](屏幕截图%202026-08-02%20213222.png)
![截图说明](屏幕截图%202026-08-02%20213307.png)
![截图说明](屏幕截图%202026-08-02%20213324.png)
![截图说明](屏幕截图%202026-08-02%20213339.png)




---

## Features

- **Cross-platform desktop experience**: Built with Electron + React + TypeScript, runs on Windows and macOS
- **Local-first**: No registration, no login, no subscription — all your data (feeds, articles, notes, tags, annotations, LLM config, glossary, browsing history) stays on your machine in a local SQLite database
- **Multi-format feeds**: Supports RSS and Atom; batch import and export via OPML (with progress tracking)
- **Resizable three-column layout**: Feed list (left) · Article list (center) · Reader (right), all with drag-to-resize handles
- **Virtual-scrolled article list**: Smooth scrolling through thousands of articles with read/unread and starred state tracking
- **Article management**: Mark as read/unread, star articles, delete articles, browse history tracking
- **Focused reading**: Clean Reader mode powered by readability + jsdom + turndown content cleaning pipeline, with four customizable themes (light / dark / system auto / eye-care), fonts (system default, serif, sans-serif, KaiTi, LXGW WenKai, monospace), and adjustable font size; well supports tables, images, code blocks, and list structures
- **Reader / Original toggle**: Switch between cleaned reading mode and the original web page
- **Content refresh**: Force re-fetch article content when the initial extraction is incomplete; auto-refresh for articles with truncated content
- **UI localization**: Interface available in Simplified Chinese (简体中文), English, and Traditional Chinese (繁體中文), switchable at any time in Settings without restart
- **Global search**: Search bar in the toolbar for finding articles across all feeds
- **In-article search**: Ctrl+F to search within the current article with match count and navigation
- **AI Summary**: Generate article summaries with a single click — specify language and three detail levels (compact / medium / detailed); streaming SSE output for real-time rendering; selective paragraph summary via checkboxes; summary caching for instant recall; export summary as Markdown
- **AI Translation**: Full-text paragraph-by-paragraph bilingual translation with four display modes (replace / side-by-side / top-bottom / new-tab); selective paragraph translation; floating text selection translation (4 languages) and summary; translation caching
- **Glossary-based translation**: Built-in glossary (术语库) system — add source→target term pairs to ensure consistent and accurate translation of specialized terminology across articles; toggle glossary usage per translation session
- **Tag system**: Manual tagging with 8 color options, AI tag suggestions, tag-based filtering in the sidebar, tag CRUD; tags persisted per article in the local database
- **Entry notes**: Rich-text note editor (contentEditable) for each article with bold, italic, strikethrough, ordered/unordered lists, font family, and font size customization; auto-save with 2-second debounce (Ctrl+S to save immediately); OPML export for notes
- **Article export as HTML**: Export current article as a standalone HTML file with optional inclusion of highlight annotations and notes
- **Highlight annotations**: Built-in highlighter with 8 colors and eraser for marking up article content; annotations restricted to the reading area only; saved locally per article; included in HTML exports when enabled
- **AI Q&A**: Ask questions about the current article and receive streaming AI responses in a resizable side panel
- **LLM function-level configuration**: Independently configure model, API key, and base URL for each AI function (full translation / selective translation / full summary / selective summary); supports preset models (DeepSeek, ChatECNU, Kimi, GPT) and custom user-defined models; test connection button to verify API reachability
- **LLM token usage tracking**: Built-in usage statistics panel organized by model and operation dimensions, integrated in LLM settings; viewable and clearable
- **Open, privacy-respecting AI integration**: Compatible with any OpenAI-format API. API keys stored locally via electron-store, never embedded in code or uploaded

## Requirements

- Windows 10/11 or macOS 11+

To use AI features, you also need:

- An OpenAI-compatible API key and endpoint

## Installation

1. Go to the [Releases](https://github.com/xiyu22289-gif/OmniMercury/releases/latest) page and download the latest installer for your platform
2. Run the installer and follow the setup wizard
3. Launch OmniMercury

## Getting Started

### Adding Feeds

- Click the **+** button in the left sidebar to open the feed dialog
- Enter a feed URL and click confirm to subscribe
- Or select **Import OPML** to add feeds in bulk (with progress tracking)
- Right-click a feed in the sidebar for refresh / rename / delete options
- Export all feeds as OPML via the sidebar menu

### Configuring AI

OmniMercury's AI features are driven by LLM providers. Configure them in **Settings → LLM**:

1. For each function (full translation / selective translation / full summary / selective summary):
   - Select a **preset model** (DeepSeek, ChatECNU, Kimi, GPT) or add a **custom model** with your own model name, base URL, and API key
   - Enter your **API key** — stored only on your local machine
   - Click **Test** to verify connectivity and latency
2. Switch to the **Token Usage** tab to review consumption statistics and clear history

### Setting Up Glossary for Translation

In **Settings → Translation**, you can manage a **glossary** (术语库) of specialized terms:

- Add source term → target term pairs (e.g. "attention mechanism" → "注意力机制")
- Toggle **Use Glossary Translation** to ensure consistent translation of domain-specific terminology
- Edit or delete glossary entries at any time

### Using AI Summary

Open any article, click **AI Summary** in the toolbar, select the target language and detail level, then confirm. The summary streams into a resizable right-side panel. Click the refresh button to regenerate, or the download button to export as Markdown. Check paragraph checkboxes to generate a **selective paragraph summary**.

### Using AI Translation

Open any article, click **Translate** in the toolbar, select the target language, and confirm. Switch between four display modes:

- **Replace** — show only translations
- **Side-by-side** — original and translation with a draggable divider
- **Top-Bottom** — original above, translation below in bordered cards
- **New Tab** — two-column layout with drag-to-resize

Select specific text to see a floating toolbar for **text translation** (4 languages) or **text summary**. If glossary is enabled, specialized terms will be translated according to your glossary entries.

### Using Tags

Open any article, click the tag button (+) below the title to open the tagging panel. You can:

- Multi-select from existing tags
- Quick-create a new tag with a custom name and color (8 presets)
- Click **AI Recommend** for AI-generated tag suggestions
- Click an applied tag on the article to remove it

Manage all tags in **Settings → Tags** (create, edit color, delete). Filter articles by tag from the sidebar.

### Using Notes

Open any article, click **Notes** in the toolbar to open the panel below the reader. The rich-text editor supports **bold, italic, strikethrough, ordered/unordered lists**, and font/font-size selection. Notes auto-save after 2 seconds (Ctrl+S to save immediately). Export notes via the download button in OPML format.

### Using Highlight Annotations

Click **标注** in the toolbar to enter annotation mode. Choose a color from 8 options and drag over text in the reading area to highlight. Switch to the eraser to remove individual highlights. Annotations are saved locally per article. When exporting the article as HTML, you can optionally include highlights.

### Exporting Articles

Click **导出文章** below the article title to export the current article as a standalone HTML file. In the export dialog, choose whether to include:
- **荧光笔笔迹** (highlight annotations)
- **笔记** (entry notes)

The exported HTML preserves all formatting, images, and is ready for sharing or archiving.

### Reading Experience

- **Theme switching**: Light → Dark → System Auto → Eye-care (warm amber tones for extended reading)
- **Font customization**: 6 font families (system default, serif, sans-serif, KaiTi, LXGW WenKai, monospace) with adjustable size
- **Scroll to top**: Floating button appears when scrolled down
- **Browsing history**: Recently viewed articles accessible via history

## Privacy

OmniMercury follows the local-first principle:

- All subscription data, articles, reading history, notes, annotations, summaries, translations, tags, and glossary entries are stored in a local SQLite database
- No usage data is collected; no information is shared with any third party
- No account or login required
- API keys are stored locally via electron-store, never hardcoded or uploaded
- AI requests are sent directly from your machine to the API provider you configure; OmniMercury does not proxy or log any request content
- The content cleaning pipeline (readability + turndown) runs entirely in the main process with forced graceful degradation — errors never crash the UI

## Building from Source

Requirements:
- Node.js 20+
- npm

```bash
git clone https://github.com/xiyu22289-gif/OmniMercury.git
cd OmniMercury
npm install
npm run dev
```

To build distributable packages:

```bash
npm run build
```

Installers are generated in the `release/` directory.

### Tech Stack

| Category | Technology | Version |
|:---|:---|:---|
| Desktop Framework | Electron + electron-vite | 31.x + 2.x |
| Frontend | React + TypeScript (strict) | 18.x + 5.x |
| UI System | Tailwind CSS + shadcn/ui + Lucide React | 3.x |
| State Management | Zustand | 4.x |
| Virtual Scrolling | react-virtuoso | 4.x |
| Database | better-sqlite3 + Drizzle ORM | 12.x |
| Feed Parsing | rss-parser + fast-xml-parser | 3.x + 4.x |
| Content Cleaning | @mozilla/readability + jsdom + turndown | 0.9.x + 24.x + 7.x |
| LLM Integration | openai SDK + eventsource-parser | 4.x + 1.x |
| Bundling | electron-builder | 24.x |

## Feedback

- **Bug reports / feature requests** — Submit via [GitHub Issues](https://github.com/xiyu22289-gif/OmniMercury/issues)
- **AI-related issues** — If summary or translation results are poor, try the force refresh button to re-fetch cleaner article content, or switch models in Settings → LLM. For domain-specific translation accuracy issues, add entries to the glossary in Settings → Translation

## License

This project is released under the [MIT License](LICENSE.md).

---

## 功能特性

- **跨平台桌面体验**：基于 Electron + React + TypeScript 构建，支持 Windows 和 macOS
- **本地优先**：无需注册、无需登录、无需订阅——所有数据（订阅源、文章、笔记、标签、标注、LLM 配置、术语库、浏览历史）保存在本机 SQLite 数据库中
- **多格式订阅源**：支持 RSS 和 Atom；支持 OPML 批量导入（带进度追踪）和导出
- **三栏可拖拽布局**：订阅源列表（左）· 文章列表（中）· 阅读区（右），拖拽分隔条自由调整宽度
- **虚拟滚动文章列表**：基于 react-virtuoso，流畅浏览数千篇文章；支持已读/未读和收藏状态
- **文章管理**：标记已读/未读、收藏文章、删除文章、浏览历史记录
- **专注阅读**：基于 readability + jsdom + turndown 内容清洗流水线的纯净阅读模式；支持四种主题（浅色 / 深色 / 跟随系统 / 护眼），六种字体（系统默认、宋体、黑体、楷体、霞鹜文楷、等宽），字号可调；良好支持表格、图片、代码块和列表结构
- **阅读/原文切换**：纯净阅读模式与原始网页一键切换
- **内容刷新**：初始抓取不完整时可强制刷新文章正文；短内容自动触发完整抓取
- **界面多语言**：支持简体中文、English、繁體中文，在设置中随时切换，无需重启
- **全局搜索**：顶部搜索栏查找所有订阅源中的文章
- **文章内搜索**：Ctrl+F 在当前文章中搜索，显示匹配数量和导航
- **AI 摘要**：一键生成文章摘要，指定语言和三级详细度（简洁 / 中等 / 详细）；流式 SSE 推送，实时渲染；段落复选框选择摘要；摘要缓存复用；可导出摘要为 Markdown
- **AI 翻译**：全文段落级双语对照翻译，四种显示模式（覆盖 / 左右对照 / 上下对照 / 新标签）；段落选择翻译；选中文本浮动翻译（4 种语言）和摘要；翻译缓存复用
- **术语库翻译**：内置术语库（Glossary）系统——添加源术语→目标术语配对，确保专业名词在各文章中翻译一致；可按翻译任务开关术语库功能
- **标签系统**：手动打标（8 色可选），AI 标签推荐，侧边栏按标签筛选文章，标签增删改查；标签按文章本地持久化
- **文章笔记**：富文本笔记编辑器（contentEditable），支持加粗、斜体、删除线、有序/无序列表、字体和字号选择；2 秒防抖自动保存，Ctrl+S 快捷键；支持 OPML 格式导出笔记
- **文章导出为 HTML**：导出当前文章为独立的 HTML 文件，可选择是否包含荧光笔标注和笔记
- **荧光笔标注**：内置 8 色荧光笔 + 橡皮擦，标注仅限文章阅读区域内操作，结果本地持久化；导出文章时可选择包含
- **AI 问答**：针对当前文章提问，AI 流式回答展示在可拖拽调整宽度的侧面板
- **LLM 功能级独立配置**：四个 AI 功能（全文翻译 / 选择翻译 / 全文摘要 / 选择摘要）可分别配置模型、API Key 和 Base URL；支持预设模型（DeepSeek / ChatECNU / Kimi / GPT）以及自定义模型；支持测试连接按钮验证 API 可达性
- **大模型用量统计**：按模型和操作维度分列的 Token 消耗统计面板，集成于 LLM 设置中，可查看和清除
- **开放、注重隐私的 AI 接入**：兼容任何 OpenAI 格式 API，密钥通过 electron-store 仅存本地，不嵌入代码、不上传云端

## 系统要求

- Windows 10/11 或 macOS 11+

如需使用 AI 功能，还需要：

- 一个兼容 OpenAI 格式的 API Key 和服务端点

## 安装

1. 前往 [Releases](https://github.com/xiyu22289-gif/OmniMercury/releases/latest) 页面，下载对应平台的最新安装包
2. 运行安装程序并按向导操作
3. 启动 OmniMercury

## 快速上手

### 添加订阅源

- 点击左侧边栏的 **+** 按钮打开添加订阅对话框
- 输入订阅源 URL 并确认订阅
- 或选择**导入 OPML** 批量添加（带进度追踪）
- 右键侧边栏中的订阅源可刷新 / 重命名 / 删除
- 通过侧边栏菜单导出所有订阅源为 OPML 格式

### 配置 AI

AI 功能由 LLM 驱动，在 **设置 → LLM** 中配置：

1. 在四个功能（全文翻译 / 选择翻译 / 全文摘要 / 选择摘要）中分别：
   - 选择**预设模型**（DeepSeek、ChatECNU、Kimi、GPT）或添加**自定义模型**（填入模型名称、Base URL、API Key）
   - 填入 **API Key**——仅保存在本机
   - 点击**测试**按钮验证连接和延迟
2. 切换到**用量统计**标签查看消耗数据，可清除历史记录

### 设置术语库翻译

在 **设置 → 翻译** 中管理**术语库**：

- 添加源术语 → 目标术语配对（如 "attention mechanism" → "注意力机制"）
- 开启**使用术语库翻译**开关，确保专业术语在各文章中翻译一致
- 随时编辑或删除术语条目

### 使用 AI 摘要

打开任意文章，点击工具栏 **AI 摘要**，选择目标语言和详细度后确认。摘要将在右侧面板流式输出。点击刷新按钮重新生成，点击下载按钮导出为 Markdown。勾选段落复选框可生成**选中段落摘要**。

### 使用 AI 翻译

打开任意文章，点击工具栏 **翻译**，选择目标语言后确认。四种显示模式可切换：

- **覆盖**：仅显示译文
- **左右对照**：原文与译文左右对照，分隔条可拖拽
- **上下对照**：原文在上、译文在下，带边框卡片样式
- **新标签**：双栏布局，可拖拽调整宽度

选中文本后会弹出浮动工具栏，可选择**翻译**（4 种语言）或**摘要**。如已启用术语库，专业术语将按术语库条目翻译。

### 使用标签

打开任意文章，点击标题下方标签按钮 (+) 打开标签面板。可以：

- 多选已有标签
- 快速创建新标签（自定义名称和 8 种颜色）
- 点击 **AI 推荐** 获取 AI 建议标签
- 点击文章上已应用的标签可移除

在 **设置 → 标签** 中管理所有标签（创建、编辑颜色、删除）。侧边栏可按标签筛选文章。

### 使用笔记

打开任意文章，点击 **笔记** 按钮在阅读区下方打开面板。支持**加粗、斜体、删除线、有序/无序列表**，字体和字号可选。笔记 2 秒后自动保存（Ctrl+S 立即保存）。点击下载按钮以 OPML 格式导出。

### 使用荧光笔标注

点击工具栏 **标注** 进入标注模式，选择 8 种颜色之一后在文章区域拖选文字高亮。切换到橡皮擦可擦除单笔标注。标注结果本地持久化，导出文章时可选择是否包含。

### 导出文章

点击文章标题下方的**导出文章**按钮，选择是否包含**荧光笔笔迹**和**笔记**，导出为独立 HTML 文件，保留所有格式和图片。

### 阅读体验

- **主题切换**：浅色 → 深色 → 跟随系统 → 护眼（暖琥珀色调，适合长时间阅读）
- **字体定制**：6 种字体（系统默认 / 宋体 / 黑体 / 楷体 / 霞鹜文楷 / 等宽），字号可调
- **返回顶部**：滚动一定距离后出现浮动按钮
- **浏览历史**：可查看最近浏览的文章

## 隐私

OmniMercury 遵循本地优先原则：

- 所有订阅数据、文章、阅读记录、笔记、标注、摘要、翻译、标签和术语库均存储在本机 SQLite 数据库中
- 不收集任何使用数据，不与任何第三方共享信息
- 无需账号、无需登录
- API 密钥通过 electron-store 仅存本机，不硬编码、不上传
- AI 请求由你配置的 API 提供者直接处理，OmniMercury 不代理、不记录任何请求内容
- 内容清洗流水线（readability + turndown）全部在主进程运行，具备强制降级能力——出错不会导致界面崩溃

## 从源码构建

要求：
- Node.js 20+
- npm

```bash
git clone https://github.com/xiyu22289-gif/OmniMercury.git
cd OmniMercury
npm install
npm run dev
```

构建可分发包：

```bash
npm run build
```

安装包生成在 `release/` 目录。

## 问题反馈

- **Bug 报告 / 功能建议** — 在 [GitHub Issues](https://github.com/xiyu22289-gif/OmniMercury/issues) 提交
- **AI 相关问题** — 结果不理想时可尝试强制刷新文章内容，或在设置中切换模型。如需专业术语翻译一致性，请在设置 → 翻译中添加术语库条目

## 许可证

本项目基于 [MIT License](LICENSE) 发布。
