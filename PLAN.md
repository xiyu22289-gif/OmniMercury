# 📅 PLAN.md - 项目分步执行计划

## 项目总览 (Overall Goal)
以 **Mercury** 为参考原型，开发一款**跨平台桌面端、本地优先、支持通用大模型接入**的 RSS 阅读器。

---

## Phase 1: 项目脚手架与 UI 骨架 (M1)
**对应里程碑**: M1  
**主责人**: 成员 A (前端交互) + 成员 C (AI与工程化)  
**目标**: 完成项目基础工程搭建，实现主界面三栏布局和基础路由，确保数据库可读写。

### Task 1.1: 初始化 Electron + Vite + React 项目
- **Overall Goal**: 搭建项目基础工程，确保开发服务器能正常运行。
- **Task Detail**:
    1. 使用 `electron-vite` 脚手架初始化项目。
    2. 配置 `main`, `preload`, `renderer` 三个进程的基础目录结构。
    3. 确保 `npm run dev` 可以启动应用，并显示一个空白窗口。
- **Affected Files**:
    - `package.json`
    - `electron.vite.config.ts`
    - `src/main/main.ts`
    - `src/preload/index.ts`
    - `src/renderer/main.tsx`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的目录结构约定。
    - 主进程与渲染进程通过 `preload` 脚本进行通信。
- **Verification**:
    - [ ] 执行 `npm run dev` 无报错。
    - [ ] 成功弹出一个标题为 "RSS Reader" 的空白应用窗口。

### Task 1.2: 集成 Tailwind CSS 与 shadcn/ui
- **Overall Goal**: 完成样式方案的配置，为 UI 开发做好准备。
- **Task Detail**:
    1. 在 `renderer` 进程中安装并配置 `tailwindcss`, `postcss`, `autoprefixer`。
    2. 初始化 `shadcn/ui` 组件库，并成功引入一个 Button 组件进行测试。
- **Affected Files**:
    - `src/renderer/index.css`
    - `tailwind.config.js`
    - `postcss.config.js`
    - `src/renderer/components/ui/button.tsx`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的样式方案约定。
- **Verification**:
    - [ ] 页面上能正确显示一个 `shadcn/ui` 风格的按钮。
    - [ ] Tailwind 的原子化类名（如 `bg-blue-500`）可以生效。

### Task 1.3: 实现主界面三栏布局
- **Overall Goal**: 完成应用的主框架 UI，包括侧边栏、文章列表区、阅读区。
- **Task Detail**:
    1. 使用 Flexbox 或 Grid 布局实现左侧（订阅源）、中间（文章列表）、右侧（阅读内容）的三栏结构。
    2. 为每个区域添加占位符内容和基础样式。
- **Affected Files**:
    - `src/renderer/App.tsx`
    - `src/renderer/pages/Layout.tsx`
    - `src/renderer/components/Sidebar.tsx`
    - `src/renderer/components/ArticleList.tsx`
    - `src/renderer/components/ReaderView.tsx`
- **Key Design**:
    - 布局需具备响应式能力。
- **Verification**:
    - [ ] 应用启动后，主界面呈现清晰的三栏布局。
    - [ ] 窗口缩放时，布局表现正常，无错位。

### Task 1.4: 集成并测试本地数据库 (better-sqlite3)
- **Overall Goal**: 确保主进程可以正常读写本地 SQLite 数据库。
- **Task Detail**:
    1. 在 `main` 进程中安装 `better-sqlite3`。
    2. 创建一个简单的数据表（如 `config` 表），并实现一个通过 `ipc` 调用的读写接口。
    3. 在渲染进程调用该接口，验证数据能否正确存取。
- **Affected Files**:
    - `src/main/db.ts`
    - `src/main/ipcHandlers.ts`
    - `src/preload/index.ts`
- **Key Design**:
    - 数据库操作必须在主进程进行，通过 `ipc` 暴露接口给渲染进程。
- **Verification**:
    - [ ] 渲染进程能成功调用接口，向数据库写入一条数据。
    - [ ] 渲染进程能成功调用接口，从数据库读取并显示刚刚写入的数据。

---

## Phase 2: 订阅源管理与文章列表 (M2)
**对应里程碑**: M2  
**主责人**: 成员 B (业务核心)  
**目标**: 实现 RSS 订阅源的添加、解析、列表展示和状态管理。

### Task 2.1: 实现订阅源添加与解析
- **Overall Goal**: 用户能够输入 RSS 链接并成功添加订阅源。
- **Task Detail**:
    1. 在 UI 上提供一个输入框和“添加”按钮。
    2. 使用 `axios` 获取用户输入的 RSS/Atom 链接内容。
    3. 使用 `rss-parser` 解析获取到的 XML 内容，提取出频道标题、文章列表等信息。
    4. 将解析后的订阅源信息存入本地数据库。
- **Affected Files**:
    - `src/renderer/components/AddFeedDialog.tsx`
    - `src/main/feedService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 网络请求和 XML 解析在主进程完成。
- **Verification**:
    - [ ] 输入一个有效的 RSS 链接，点击添加后，左侧订阅源列表中出现该源。
    - [ ] 数据库中 `feeds` 表新增一条记录。

### Task 2.2: 实现文章列表渲染与状态管理
- **Overall Goal**: 点击订阅源后，中间栏能正确显示文章列表，并管理已读/未读状态。
- **Task Detail**:
    1. 点击左侧订阅源时，从数据库查询对应的文章列表。
    2. 使用 `react-virtuoso` 渲染文章列表，实现虚拟滚动。
    3. 使用 `Zustand` 管理文章的已读/未读、星标状态。
    4. 点击文章时，更新其“已读”状态，并在右侧阅读区显示内容。
- **Affected Files**:
    - `src/renderer/components/ArticleList.tsx`
    - `src/renderer/store/articleStore.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 使用 `react-virtuoso` 优化长列表性能。
    - 使用 `Zustand` 进行全局状态管理。
- **Verification**:
    - [ ] 点击不同订阅源，中间文章列表能正确切换。
    - [ ] 点击文章后，该文章在列表中的样式变为“已读”状态（如变灰）。
    - [ ] 滚动文章列表流畅，无卡顿。

### Task 2.3: 实现 OPML 导入/导出
- **Overall Goal**: 支持批量导入和导出订阅源。
- **Task Detail**:
    1. 使用 `fast-xml-parser` 解析 OPML 文件，批量添加订阅源。
    2. 实现导出功能，将当前所有订阅源生成 OPML 文件并保存到本地。
- **Affected Files**:
    - `src/main/feedService.ts`
    - `src/renderer/components/FeedManager.tsx`
- **Key Design**:
    - 文件读写操作在主进程完成。
- **Verification**:
    - [ ] 能成功导入一个包含多个订阅源的 OPML 文件。
    - [ ] 能成功导出当前所有订阅源为一个 OPML 文件，且文件内容正确。

---

## Phase 3: 内容清洗流水线与阅读模式 (M3)
**对应里程碑**: M3  
**主责人**: 成员 B (业务核心) + 成员 A (前端交互)  
**目标**: 完成内容提取、清洗和 Markdown 转换，实现纯净的阅读模式。

### Task 3.1: 实现正文提取与内容清洗
- **Overall Goal**: 从文章原始网页中提取出纯净的正文内容。
- **Task Detail**:
    1. 点击文章时，使用 `axios` 获取文章的原始 HTML。
    2. 在主进程使用 `jsdom` 模拟浏览器环境。
    3. 使用 `@mozilla/readability` 库提取正文，得到纯净的 HTML。
- **Affected Files**:
    - `src/main/contentService.ts`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的“内容清洗流水线”设计。
- **Verification**:
    - [ ] 点击文章后，能从原始网页中成功提取出不含广告和导航栏的纯净 HTML 内容。

### Task 3.2: 实现 HTML 转 Markdown
- **Overall Goal**: 将提取出的纯净 HTML 转换为 Markdown 格式。
- **Task Detail**:
    1. 使用 `turndown` 库将上一步得到的纯净 HTML 转换为 Markdown 字符串。
    2. 将 Markdown 内容存入数据库，与文章关联。
- **Affected Files**:
    - `src/main/contentService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的“内容清洗流水线”设计。
- **Verification**:
    - [ ] 数据库中文章的 `content_md` 字段被正确填充。
    - [ ] Markdown 内容格式正确，图片、链接、列表等元素均被正确转换。

### Task 3.3: 实现阅读模式 UI
- **Overall Goal**: 在右侧阅读区渲染 Markdown 内容，并支持主题切换。
- **Task Detail**:
    1. 使用 `react-markdown` 及其插件（`remark-gfm`, `rehype-highlight`）渲染 Markdown 内容。
    2. 实现阅读模式与原始网页模式的切换。
    3. 实现浅色、深色、护眼等不同主题的切换功能。
- **Affected Files**:
    - `src/renderer/components/ReaderView.tsx`
    - `src/renderer/store/themeStore.ts`
- **Key Design**:
    - 使用 `react-markdown` 进行安全渲染。
- **Verification**:
    - [ ] 阅读区能正确、美观地显示 Markdown 渲染后的文章内容。
    - [ ] 点击主题切换按钮，阅读区的样式能实时变化。

---

## Phase 4: LLM 通用接入与 AI 摘要/翻译 (M4)
**对应里程碑**: M4  
**主责人**: 成员 C (AI与工程化)  
**目标**: 接入 LLM，实现文章摘要和翻译功能。

### Task 4.1: 实现 LLM 通用接入层
- **Overall Goal**: 封装一个通用的 LLM 调用接口，支持配置不同的服务商和模型。
- **Task Detail**:
    1. 使用 `openai` 官方 SDK，封装一个 `LLMService` 类。
    2. 该类支持通过配置 `baseURL` 和 `apiKey` 来切换不同的 LLM 服务商（如 OpenAI, Azure, Ollama）。
    3. 使用 `electron-store` 存储用户的 LLM 配置信息。
- **Affected Files**:
    - `src/main/llmService.ts`
    - `src/main/configService.ts`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的“LLM 接入层”和“敏感信息存储”设计。
- **Verification**:
    - [ ] 在设置页面配置不同的 LLM 服务商和 API Key 后，能成功调用其接口并返回结果。

### Task 4.2: 实现 AI 摘要功能
- **Overall Goal**: 为当前文章生成 AI 摘要，并支持流式输出。
- **Task Detail**:
    1. 在阅读区添加“生成摘要”按钮。
    2. 点击后，调用 `LLMService`，将文章的 Markdown 内容发送给 LLM，并附带摘要的提示词（Prompt）。
    3. 使用 `eventsource-parser` 解析 SSE 流式响应，实现逐字输出的打字机效果。
    4. 将生成的摘要存入数据库，并与文章关联。
- **Affected Files**:
    - `src/renderer/components/ReaderView.tsx`
    - `src/main/llmService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的“AI 流式响应”设计。
- **Verification**:
    - [ ] 点击“生成摘要”后，阅读区下方能逐字显示生成的摘要内容。
    - [ ] 摘要生成后，刷新页面，摘要内容依然存在。

### Task 4.3: 实现 AI 翻译功能
- **Overall Goal**: 为当前文章实现分段翻译，并支持中英对照。
- **Task Detail**:
    1. 在阅读区添加“翻译”按钮。
    2. 点击后，将文章的 Markdown 内容按段落分割，逐段调用 `LLMService` 进行翻译。
    3. 实现原文与译文的对照显示模式。
    4. 将翻译结果存入数据库。
- **Affected Files**:
    - `src/renderer/components/ReaderView.tsx`
    - `src/main/llmService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 采用分段翻译策略，提升响应速度和用户体验。
- **Verification**:
    - [ ] 点击“翻译”后，文章能逐段显示翻译结果。
    - [ ] 可以切换“仅原文”、“仅译文”、“中英对照”等显示模式。