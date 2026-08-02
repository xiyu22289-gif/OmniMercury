# INIT.md - 项目初始化文档

## 一、项目目标 (Project Goal)
以 **Mercury** 为参考原型，开发一款**跨平台桌面端、本地优先、支持通用大模型接入**的 RSS 阅读器。

## 二、团队分工 (Team Roles)

| 成员 | 角色定位 | 核心职责 |
| :--- | :--- | :--- |
| **成员 A** | **前端交互负责人** | 跨端框架搭建、界面布局、阅读渲染、主题样式、交互逻辑 |
| **成员 B** | **业务核心负责人** | 订阅源解析、内容清洗流水线、本地数据持久化、业务逻辑封装 |
| **成员 C** | **AI与工程化负责人** | LLM接入层、AI Agent实现、工程化构建、文档沉淀、协同管理 |

## 三、核心功能规划 (Core Features)

### 1. 核心功能 (Milestones 1-8) — 全部已完成 ✅
*   **M1: 项目脚手架与 UI 骨架**
    *   内容：初始化工程、三栏布局框架、基础路由、本地数据库核心表结构、项目规范落地。
    *   状态：✅ 已完成
*   **M2: 订阅源管理与文章列表**
    *   内容：RSS/Atom/JSON Feed 解析、OPML 导入导出、同步刷新、文章列表渲染、已读/未读/星标状态、虚拟滚动（react-virtuoso）。
    *   状态：✅ 已完成
*   **M3: 内容清洗流水线与阅读模式**
    *   内容：网页正文提取（readability + jsdom）、广告/导航清洗、HTML 转 Markdown（turndown）、Reader 纯净模式、原始网页模式切换、主题/字体定制（含护眼模式）、系统主题自动跟随。
    *   状态：✅ 已完成
*   **M4: LLM 通用接入与 AI 摘要/翻译**
    *   内容：LLM Provider 抽象层、多服务商预设（DeepSeek/ChatECNU/Kimi/OpenAI）、流式调用封装（eventsource-parser SSE）、摘要 Agent（三级详细度）、段落翻译 Agent、选择文本翻译、选择段落摘要、AI 问答面板、术语库管理、双语对照渲染、结果本地持久化。
    *   状态：✅ 已完成
*   **M5: 标签系统**
    *   内容：手动打标签、AI 标签推荐、按标签筛选、标签库管理（CRUD + 颜色预设）。
    *   状态：✅ 已完成
*   **M6: 笔记与文摘导出**
    *   内容：富文本笔记编辑器（contentEditable）、自动保存、字体/字号自定义、OPML 导出笔记。
    *   状态：✅ 已完成
*   **M7: 大模型用量统计**
    *   内容：Token 消耗记录（token_usage 表）、多维度统计报表（按服务商/模型/功能）、LLM 设置面板集成。
    *   状态：✅ 已完成
*   **M8: 界面多语言**
    *   内容：中/英/繁三语界面（i18next + i18next-browser-languagedetector）、语言自动检测与持久化。
    *   状态：✅ 已完成

### 2. 额外已实现扩展 (Already Implemented)
*   **全文搜索**：SQLite FTS5 虚拟表（articles_fts）+ 全局搜索栏（SearchBar），Ctrl/Cmd+K 快捷键唤起。
*   **浏览历史**：browse_history 表 + HistoryView 面板，记录文章浏览时间线和"多久之前"。
*   **术语库**：glossary 表 + 翻译时自定义术语替换，提升 AI 翻译一致性。
*   **全键盘快捷键**：Ctrl/Cmd+K 搜索、Ctrl/Cmd+R 刷新、Ctrl/Cmd+, 设置、j/k 导航文章、m 切换已读等。
*   **全局错误边界**：ErrorBoundary 捕获渲染异常，避免白屏。

### 3. 可选扩展方向 (Optional Roadmap)
*   自动同步与后台刷新、数据一键备份与恢复、移动端适配 / PWA。

## 四、技术选型 (Technology Stack)

| 技术领域 | 选型方案 |
| :--- | :--- |
| **跨平台框架** | **Electron 31.x + electron-vite 2.x** |
| **前端框架** | **React 18 + TypeScript 5.x（strict 严格模式）** |
| **样式方案** | **Tailwind CSS 3.x + shadcn/ui + Lucide React** |
| **本地数据库** | **SQLite + better-sqlite3 12.x + Drizzle ORM** |
| **Feed 解析** | **rss-parser 3.x + fast-xml-parser 4.x** |
| **正文提取** | **@mozilla/readability + jsdom + turndown** |
| **LLM 接入** | **OpenAI SDK 4.x + eventsource-parser（SSE 流式）** |
| **Markdown 渲染** | **react-markdown + rehype-highlight + remark-gfm** |
| **多语言** | **i18next + react-i18next** |
| **工程化** | **Vite 5.x + electron-builder 24.x** |
| **状态管理** | **Zustand 4.x** |
| **虚拟滚动** | **react-virtuoso 4.x** |

## 五、项目约束 (Constraints)
1.  **本地优先**：数据必须本地存储（SQLite + electron-store），无需服务端，保障隐私。
2.  **大模型中立**：必须兼容 OpenAI 格式标准 API（openai SDK），支持本地/云端模型。
3.  **跨平台**：必须天然支持 Windows/macOS/Linux 三端运行。
4.  **进程隔离**：渲染进程仅做 UI，主进程处理 I/O/网络/数据库，通过 preload 白名单暴露 API。
5.  **禁止自研**：正文提取等核心难点必须使用成熟的第三方库（如 `@mozilla/readability`），禁止重复造轮子。
