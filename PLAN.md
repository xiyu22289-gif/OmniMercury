# 📅 PLAN.md

## 项目总览

**Summer RSS Reader** 是一款跨平台桌面 RSS 阅读器，基于 Electron + React + TypeScript 开发，支持 Windows / macOS / Linux 三端。

**核心特点**：
- 本地优先：数据存储在 SQLite，无需注册登录
- 大模型中立：支持任何兼容 OpenAI 协议的 LLM
- 功能完整：订阅管理 + 内容清洗 + AI 摘要/翻译 + 标签系统 + 笔记导出 + 用量统计 + 多语言

**当前状态**：✅ **全部 8 个里程碑已完成**

| 里程碑 | 状态 |
|:---|:---:|
| M1 脚手架与 UI 骨架 | ✅ |
| M2 订阅源管理与文章列表 | ✅ |
| M3 内容清洗流水线与阅读模式 | ✅ |
| M4 LLM 接入与 AI 摘要/翻译 | ✅ |
| M5 标签系统 | ✅ |
| M6 笔记与文摘导出 | ✅ |
| M7 大模型用量统计 | ✅ |
| M8 界面多语言 | ✅ |


## Phase 1: 项目脚手架与 UI 骨架 (M1) ✅
**对应里程碑**: M1  
**主责人**: 成员 A + 成员 C
**状态**: 已完成

### Task 1.1: 初始化 Electron + Vite + React 项目
- **Overall Goal**: 搭建项目基础工程，确保开发服务器能正常运行。
- **Affected Files**: `package.json`, `electron.vite.config.ts`, `src/main/main.ts`, `src/preload/index.ts`, `src/renderer/main.tsx`
- **Verification**:
    - [x] 执行 `npm run dev` 无报错。
    - [x] 成功弹出一个标题为 "RSS Reader" 的空白应用窗口。

### Task 1.2: 集成 Tailwind CSS 与 shadcn/ui
- **Overall Goal**: 完成样式方案的配置，为 UI 开发做好准备。
- **Affected Files**: `src/renderer/index.css`, `tailwind.config.js`, `postcss.config.js`
- **Verification**:
    - [x] 页面上能正确显示一个 `shadcn/ui` 风格的按钮。
    - [x] Tailwind 的原子化类名可以生效。

### Task 1.3: 实现主界面三栏布局
- **Overall Goal**: 完成应用的主框架 UI，包括侧边栏、文章列表区、阅读区。
- **Affected Files**: `src/renderer/App.tsx`, `src/renderer/components/Sidebar.tsx`, `src/renderer/components/ArticleList.tsx`, `src/renderer/components/ReaderView.tsx`
- **Verification**:
    - [x] 应用启动后，主界面呈现清晰的三栏布局。
    - [x] 窗口缩放时，布局表现正常，无错位。

### Task 1.4: 集成并测试本地数据库 (better-sqlite3)
- **Overall Goal**: 确保主进程可以正常读写本地 SQLite 数据库。
- **Affected Files**: `src/main/db.ts`, `src/main/ipcHandlers.ts`, `src/preload/index.ts`
- **Verification**:
    - [x] 渲染进程能成功调用接口，向数据库写入一条数据。
    - [x] 渲染进程能成功调用接口，从数据库读取并显示刚刚写入的数据。


## Phase 2: 订阅源管理与文章列表 (M2) ✅
**对应里程碑**: M2  
**主责人**: 成员 B
**状态**: 已完成

### Task 2.1: 实现订阅源添加与解析
- **Affected Files**: `src/renderer/components/Sidebar.tsx`, `src/main/feedService.ts`, `src/main/db.ts`
- **Verification**:
    - [x] 输入一个有效的 RSS 链接，点击添加后，左侧订阅源列表中出现该源。
    - [x] 数据库中 `feeds` 表新增一条记录。

### Task 2.2: 实现文章列表渲染与状态管理
- **Affected Files**: `src/renderer/components/ArticleList.tsx`, `src/renderer/store/index.ts`, `src/main/db.ts`
- **Verification**:
    - [x] 点击不同订阅源，中间文章列表能正确切换。
    - [x] 点击文章后，该文章在列表中的样式变为"已读"状态。
    - [x] 滚动文章列表流畅，无卡顿。

### Task 2.3: 实现 OPML 导入/导出
- **Affected Files**: `src/main/feedService.ts`, `src/renderer/components/Sidebar.tsx`
- **Verification**:
    - [x] 能成功导入一个包含多个订阅源的 OPML 文件。
    - [x] 能成功导出当前所有订阅源为一个 OPML 文件，且文件内容正确。


## Phase 3: 内容清洗流水线与阅读模式 (M3) ✅
**对应里程碑**: M3  
**主责人**: 成员 B + 成员 A
**状态**: 已完成

### Task 3.1: 实现正文提取与内容清洗
- **Affected Files**: `src/main/contentService.ts`
- **Verification**:
    - [x] 点击文章后，能从原始网页中成功提取出不含广告和导航栏的纯净 HTML 内容。

### Task 3.2: 实现 HTML 转 Markdown
- **Affected Files**: `src/main/contentService.ts`, `src/main/db.ts`
- **Verification**:
    - [x] 数据库中文章的 `content_md` 字段被正确填充。
    - [x] Markdown 内容格式正确，图片、链接、列表等元素均被正确转换。

### Task 3.3: 实现阅读模式 UI
- **Affected Files**: `src/renderer/components/ReaderView.tsx`, `src/renderer/store/index.ts`
- **Verification**:
    - [x] 阅读区能正确、美观地显示 Markdown 渲染后的文章内容。
    - [x] 点击主题切换按钮，阅读区的样式能实时变化。
    - [x] 系统主题变化时，应用主题自动跟随。


## Phase 4: LLM 通用接入与 AI 摘要/翻译 (M4) ✅
**对应里程碑**: M4  
**主责人**: 成员 C + 成员 B
**状态**: 已完成

### Task 4.1: 实现 LLM 通用接入层
- **Affected Files**: `src/main/llmService.ts`, `src/main/configService.ts`, `src/renderer/components/LLMSettings.tsx`
- **Verification**:
    - [x] 在设置页面配置不同的 LLM 服务商和 API Key 后，能成功调用其接口并返回结果。
    - [x] 测试连接按钮可验证 API 连通性并显示延迟和可用模型数。

### Task 4.2: 实现 AI 摘要功能
- **Affected Files**: `src/renderer/components/ReaderView.tsx`, `src/main/llmService.ts`, `src/main/db.ts`
- **Verification**:
    - [x] 点击"生成摘要"后，阅读区下方能逐字显示生成的摘要内容。
    - [x] 摘要生成后，刷新页面，摘要内容依然存在。
    - [x] 可切换简洁/标准/详细三种详细度。

### Task 4.3: 实现 AI 翻译功能
- **Affected Files**: `src/renderer/components/ReaderView.tsx`, `src/main/llmService.ts`, `src/main/db.ts`
- **Verification**:
    - [x] 点击"翻译"后，文章能逐段显示翻译结果。
    - [x] 可以切换多种对照显示模式。
    - [x] 翻译过程中，UI 显示加载状态和逐段进度。
    - [x] 选择文本翻译正常运作并流式展示结果。


## Phase 5: 标签系统 (M5) ✅
**对应里程碑**: M5  
**主责人**: 成员 A + 成员 C
**状态**: 已完成

### Task 5.1: 标签 CRUD 管理
- **Verification**: [x] 可创建/编辑/删除标签，标签颜色正确显示。

### Task 5.2: 文章打标与按标签筛选
- **Verification**: [x] 可为文章添加/移除标签；按标签筛选后可正确过滤文章列表；标签文章计数准确。

### Task 5.3: AI 标签推荐
- **Verification**: [x] AI 推荐标签功能正常工作，推荐标签不与文章已有标签重复。


## Phase 6: 笔记与文摘导出 (M6) ✅
**对应里程碑**: M6  
**主责人**: 成员 A + 成员 B
**状态**: 已完成

### Task 6.1: 富文本笔记编辑器
- **Verification**: [x] 笔记编辑功能正常，格式工具栏生效；字体/字号切换即时反映在编辑器内。

### Task 6.2: 自动保存
- **Verification**: [x] 笔记自动保存成功；关闭后重新打开，笔记内容仍在。

### Task 6.3: OPML 导出笔记
- **Verification**: [x] OPML 文件正确包含笔记数据。


## Phase 7: 大模型用量统计 (M7) ✅
**对应里程碑**: M7  
**主责人**: 成员 C
**状态**: 已完成

### Task 7.1: Token 用量记录
- **Verification**: [x] 数据库中 token_usage 表正确记录每次调用。

### Task 7.2: 统计面板
- **Verification**: [x] 统计面板正确展示各模型各操作的 Token 消耗。


## Phase 8: 界面多语言 (M8) ✅
**对应里程碑**: M8  
**主责人**: 成员 A + 成员 C
**状态**: 已完成

### Task 8.1: i18n 框架集成
- **Affected Files**: `src/renderer/i18n.ts`, `src/renderer/locales/zh.json`, `src/renderer/locales/en.json`, `src/renderer/locales/zh-TW.json`
- **Verification**:
    - [x] 界面语言可切换为中/英/繁。
    - [x] 语言偏好持久化保存。
    - [x] 重启后语言设置保持。
    - [x] 所有核心 UI 文本均已翻译。


## 📦 打包与发布状态

| 平台 | 安装包 | 状态 |
|:---|:---|:---|
| Windows | `Summer RSS Reader-Setup-3.2.0.exe` | ✅ 已发布 |
| macOS | `Summer RSS Reader-3.2.0.dmg` | ✅ 已发布（GitHub Actions） |
| Linux | `Summer RSS Reader-3.2.0.AppImage` | ✅ 已发布 |

**CI/CD**：
- ✅ GitHub Actions 自动打包 macOS / Linux 版本
- ✅ 代码已上传至 GitHub
- ✅ Release v3.2.0 已创建