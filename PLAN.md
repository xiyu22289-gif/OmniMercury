# 📅 PLAN.md - 项目分步执行计划

## 项目总览 (Overall Goal)
以 **Mercury** 为参考原型，开发一款**跨平台桌面端、本地优先、支持通用大模型接入**的 RSS 阅读器。

**当前进度**：M1 ✅ 已完成 | M2 ✅ 已完成 | M3 ✅ 已完成 | M4 ✅ 已完成 | M5 ✅ 已完成 | M6 ✅ 已完成 | M7 ✅ 已完成 | M8 ✅ 已完成


## Phase 1: 项目脚手架与 UI 骨架 (M1) ✅ 已完成
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
    - [x] 执行 `npm run dev` 无报错。
    - [x] 成功弹出一个标题为 "RSS Reader" 的空白应用窗口。

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
    - [x] 页面上能正确显示一个 `shadcn/ui` 风格的按钮。
    - [x] Tailwind 的原子化类名（如 `bg-blue-500`）可以生效。

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
    - [x] 应用启动后，主界面呈现清晰的三栏布局。
    - [x] 窗口缩放时，布局表现正常，无错位。

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
    - [x] 渲染进程能成功调用接口，向数据库写入一条数据。
    - [x] 渲染进程能成功调用接口，从数据库读取并显示刚刚写入的数据。


## Phase 2: 订阅源管理与文章列表 (M2) ✅ 已完成
**对应里程碑**: M2  
**主责人**: 成员 B (业务核心)  
**目标**: 实现 RSS 订阅源的添加、解析、列表展示和状态管理。

### Task 2.1: 实现订阅源添加与解析
- **Overall Goal**: 用户能够输入 RSS 链接并成功添加订阅源。
- **Task Detail**:
    1. 在 UI 上提供一个输入框和"添加"按钮。
    2. 使用 `axios` 获取用户输入的 RSS/Atom 链接内容。
    3. 使用 `rss-parser` 解析获取到的 XML 内容，提取出频道标题、文章列表等信息。
    4. 将解析后的订阅源信息存入本地数据库。
- **Affected Files**:
    - `src/renderer/components/Sidebar.tsx`（添加按钮和输入框）
    - `src/main/feedService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 网络请求和 XML 解析在主进程完成。
- **Verification**:
    - [x] 输入一个有效的 RSS 链接，点击添加后，左侧订阅源列表中出现该源。
    - [x] 数据库中 `feeds` 表新增一条记录。

### Task 2.2: 实现文章列表渲染与状态管理
- **Overall Goal**: 点击订阅源后，中间栏能正确显示文章列表，并管理已读/未读状态。
- **Task Detail**:
    1. 点击左侧订阅源时，从数据库查询对应的文章列表。
    2. 使用 `react-virtuoso` 渲染文章列表，实现虚拟滚动。
    3. 使用 `Zustand` 管理文章的已读/未读、星标状态。
    4. 点击文章时，更新其"已读"状态，并在右侧阅读区显示内容。
- **Affected Files**:
    - `src/renderer/components/ArticleList.tsx`
    - `src/renderer/store/index.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 使用 `react-virtuoso` 优化长列表性能。
    - 使用 `Zustand` 进行全局状态管理。
- **Verification**:
    - [x] 点击不同订阅源，中间文章列表能正确切换。
    - [x] 点击文章后，该文章在列表中的样式变为"已读"状态（如变灰）。
    - [x] 滚动文章列表流畅，无卡顿。

### Task 2.3: 实现 OPML 导入/导出
- **Overall Goal**: 支持批量导入和导出订阅源。
- **Task Detail**:
    1. 使用 `fast-xml-parser` 解析 OPML 文件，批量添加订阅源。
    2. 实现导出功能，将当前所有订阅源生成 OPML 文件并保存到本地。
- **Affected Files**:
    - `src/main/feedService.ts`
    - `src/renderer/components/Sidebar.tsx`
- **Key Design**:
    - 文件读写操作在主进程完成。
- **Verification**:
    - [x] 能成功导入一个包含多个订阅源的 OPML 文件。
    - [x] 能成功导出当前所有订阅源为一个 OPML 文件，且文件内容正确。


## Phase 3: 内容清洗流水线与阅读模式 (M3) ✅ 已完成
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
    - 遵循 `AGENTS.md` 中的"内容清洗流水线"设计。
- **Verification**:
    - [x] 点击文章后，能从原始网页中成功提取出不含广告和导航栏的纯净 HTML 内容。

### Task 3.2: 实现 HTML 转 Markdown
- **Overall Goal**: 将提取出的纯净 HTML 转换为 Markdown 格式。
- **Task Detail**:
    1. 使用 `turndown` 库将上一步得到的纯净 HTML 转换为 Markdown 字符串。
    2. 将 Markdown 内容存入数据库，与文章关联。
- **Affected Files**:
    - `src/main/contentService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的"内容清洗流水线"设计。
- **Verification**:
    - [x] 数据库中文章的 `content_md` 字段被正确填充。
    - [x] Markdown 内容格式正确，图片、链接、列表等元素均被正确转换。

### Task 3.3: 实现阅读模式 UI
- **Overall Goal**: 在右侧阅读区渲染 Markdown 内容，并支持主题切换。
- **Task Detail**:
    1. 使用 `react-markdown` 及其插件（`remark-gfm`, `rehype-highlight`）渲染 Markdown 内容。
    2. 实现阅读模式与原始网页模式的切换。
    3. 实现浅色、深色、护眼等不同主题的切换功能。
    4. **已实现**：深色/浅色模式跟随系统主题（`window.matchMedia('(prefers-color-scheme: dark)')`）。
- **Affected Files**:
    - `src/renderer/components/ReaderView.tsx`
    - `src/renderer/store/index.ts`
- **Key Design**:
    - 使用 `react-markdown` 进行安全渲染。
- **Verification**:
    - [x] 阅读区能正确、美观地显示 Markdown 渲染后的文章内容。
    - [x] 点击主题切换按钮，阅读区的样式能实时变化。
    - [x] 系统主题变化时，应用主题自动跟随。


## Phase 4: LLM 通用接入与 AI 摘要/翻译 (M4) ✅ 已完成
**对应里程碑**: M4  
**主责人**: 成员 C (AI与工程化) + 成员 B (业务核心)  
**目标**: 接入 LLM，实现文章摘要和翻译功能。

### Task 4.1: 实现 LLM 通用接入层
- **Overall Goal**: 封装一个通用的 LLM 调用接口，支持配置不同的服务商和模型。
- **Task Detail**:
    1. 使用 `openai` 官方 SDK，封装一个 `LLMService` 类。
    2. 该类支持通过配置 `baseURL` 和 `apiKey` 来切换不同的 LLM 服务商（如 DeepSeek、Kimi、OpenAI、ChatECNU）。
    3. 使用 `electron-store` 存储用户的 LLM 配置信息。
    4. 支持快捷预设切换（DeepSeek V4 Flash / ChatECNU / Kimi K2.7 Code / OpenAI GPT-4o-mini）。
- **Affected Files**:
    - `src/main/llmService.ts`
    - `src/main/configService.ts`
    - `src/renderer/components/LLMSettings.tsx`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的"LLM 接入层"和"敏感信息存储"设计。
- **Verification**:
    - [x] 在设置页面配置不同的 LLM 服务商和 API Key 后，能成功调用其接口并返回结果。
    - [x] 测试连接按钮可验证 API 连通性并显示延迟和可用模型数。

### Task 4.2: 实现 AI 摘要功能
- **Overall Goal**: 为当前文章生成 AI 摘要，并支持流式输出和多级详细度。
- **Task Detail**:
    1. 在阅读区添加"生成摘要"按钮。
    2. 点击后，调用 `LLMService`，将文章的 Markdown 内容发送给 LLM，并附带摘要的提示词（Prompt）。
    3. 使用流式响应实现逐字输出的打字机效果。
    4. 支持三级摘要详细度：简洁（compact）、标准（medium）、详细（detailed）。
    5. 支持选择段落摘要：选中若干段落后生成针对选中内容的摘要。
    6. 将生成的摘要存入数据库，与文章关联，避免重复调用浪费 Token。
- **Affected Files**:
    - `src/renderer/components/ReaderView.tsx`
    - `src/main/llmService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 遵循 `AGENTS.md` 中的"AI 流式响应"设计。
    - AI 结果持久化到数据库，避免重复调用。
- **Verification**:
    - [x] 点击"生成摘要"后，阅读区下方能逐字显示生成的摘要内容。
    - [x] 摘要生成后，刷新页面，摘要内容依然存在。
    - [x] 可切换简洁/标准/详细三种详细度。

### Task 4.3: 实现 AI 翻译功能
- **Overall Goal**: 为当前文章实现分段翻译，并支持中英对照。
- **Task Detail**:
    1. 在阅读区添加"翻译"按钮。
    2. 将文章的 Markdown 内容按段落分割，逐段调用 `LLMService` 进行翻译。
    3. 支持四种展示模式：替换原文（replace）、左右对照（sideBySide）、上下对照（topBottom）、新标签页（newTab）。
    4. 支持选择文本翻译：选中任意文字后弹出翻译浮窗，流式返回结果。
    5. 翻译时自动保护 Markdown 图片链接、HTML 标签不被破坏。
    6. 将翻译结果存入数据库。
- **Affected Files**:
    - `src/renderer/components/ReaderView.tsx`
    - `src/main/llmService.ts`
    - `src/main/db.ts`
- **Key Design**:
    - 采用分段翻译策略，提升响应速度和用户体验。
- **Verification**:
    - [x] 点击"翻译"后，文章能逐段显示翻译结果。
    - [x] 可以切换多种对照显示模式。
    - [x] 翻译过程中，UI 显示加载状态和逐段进度。
    - [x] 选择文本翻译正常运作并流式展示结果。


## Phase 5: 标签系统 (M5) ✅ 已完成
**对应里程碑**: M5  
**主责人**: 成员 A (前端交互) + 成员 C (AI与工程化)  
**目标**: 实现手动打标、AI 标签推荐、按标签筛选文章的完整标签系统。

### Task 5.1: 标签 CRUD 管理
- **Overall Goal**: 创建、编辑、删除标签，管理标签库。
- **Task Detail**:
    1. 在侧边栏增加"标签管理"入口。
    2. 支持自定义标签名称和颜色。
    3. 标签数据存储于 SQLite。
- **Verification**:
    - [x] 可创建/编辑/删除标签。
    - [x] 标签颜色正确显示。

### Task 5.2: 文章打标与按标签筛选
- **Overall Goal**: 为文章添加/移除标签，按标签筛选文章列表。
- **Task Detail**:
    1. 阅读区顶部显示文章已关联的标签。
    2. 点击标签可切换筛选，再次点击取消筛选。
    3. 标签筛选后文章列表仅显示已打该标签的文章。
    4. 侧边栏标签旁显示各标签对应的文章数量。
- **Verification**:
    - [x] 可为文章添加/移除标签。
    - [x] 按标签筛选后可正确过滤文章列表。
    - [x] 标签文章计数准确。

### Task 5.3: AI 标签推荐
- **Overall Goal**: 利用 LLM 为文章自动推荐分类标签。
- **Task Detail**:
    1. 发送文章标题+前 3000 字内容给 LLM。
    2. LLM 返回 3-5 个简洁分类标签（每标签 2-6 字）。
    3. 避免与已有标签重复推荐。
- **Verification**:
    - [x] AI 推荐标签功能正常工作。
    - [x] 推荐标签不与文章已有标签重复。


## Phase 6: 笔记与文摘导出 (M6) ✅ 已完成
**对应里程碑**: M6  
**主责人**: 成员 A (前端交互) + 成员 B (业务核心)  
**目标**: 实现富文本笔记编辑器、自动保存、OPML 导出笔记功能。

### Task 6.1: 富文本笔记编辑器
- **Overall Goal**: 为每篇文章提供独立的笔记编辑空间。
- **Task Detail**:
    1. 使用 `contentEditable` 实现富文本编辑器。
    2. 支持加粗、斜体、删除线、有序/无序列表。
    3. 支持字体选择（系统默认/衬线/黑体/楷体/等宽）和字号自定义。
    4. 粘贴时自动剥离格式，仅保留纯文本。
- **Verification**:
    - [x] 笔记编辑功能正常，格式工具栏生效。
    - [x] 字体/字号切换即时反映在编辑器内。

### Task 6.2: 自动保存
- **Overall Goal**: 笔记自动定时保存，防止数据丢失。
- **Task Detail**:
    1. 编辑器输入后 2 秒防抖自动保存到 SQLite。
    2. 支持 Ctrl+S 手动立即保存。
    3. 显示"保存中..."和最后保存时间。
    4. 关闭面板时立即保存。
- **Verification**:
    - [x] 笔记自动保存成功。
    - [x] 关闭后重新打开，笔记内容仍在。

### Task 6.3: OPML 导出笔记
- **Overall Goal**: 将带笔记的文章导出为 OPML 文件。
- **Task Detail**:
    1. 导出选项包含笔记 HTML 内容、文章标题/URL、订阅源标题、更新时间。
    2. 导出前自动保存当前笔记。
- **Verification**:
    - [x] OPML 文件正确包含笔记数据。


## Phase 7: 大模型用量统计 (M7) ✅ 已完成
**对应里程碑**: M7  
**主责人**: 成员 C (AI与工程化)  
**目标**: 实现 Token 消耗记录和多维度统计面板。

### Task 7.1: Token 用量记录
- **Overall Goal**: 记录每次 LLM 调用的 Token 消耗量。
- **Task Detail**:
    1. 每次 LLM 调用后自动估算并记录 prompt tokens 和 completion tokens。
    2. 记录字段：模型名称、操作类型（summarize/translate/translateParagraphs/selectiveSummarize/selectiveTranslate）、Token 数、来源标记。
    3. Token 估算策略：中文 0.555 tokens/字，英文 0.25 tokens/字。
- **Verification**:
    - [x] 数据库中 token_usage 表正确记录每次调用。

### Task 7.2: 统计面板
- **Overall Goal**: 在 LLM 设置面板中展示用量统计。
- **Task Detail**:
    1. LLM 设置面板集成"统计"切换按钮。
    2. 按模型分组展示：总调用次数、输入/输出/总 Token。
    3. 按操作类型细分展示各功能的 Token 消耗。
    4. 支持手动刷新统计数据。
- **Verification**:
    - [x] 统计面板正确展示各模型各操作的 Token 消耗。


## Phase 8: 界面多语言 (M8) ✅ 已完成
**对应里程碑**: M8  
**主责人**: 成员 A (前端交互) + 成员 C (AI与工程化)  
**目标**: 实现中/英/繁三语界面切换。

### Task 8.1: i18n 框架集成
- **Overall Goal**: 集成 `i18next` + `react-i18next` 实现国际化。
- **Task Detail**:
    1. 安装并配置 `i18next`、`react-i18next`、`i18next-browser-languagedetector`。
    2. 创建 `zh.json`、`en.json`、`zh-TW.json` 三个语言资源文件。
    3. 自动检测浏览器语言偏好并持久化到 `localStorage`。
    4. 默认回退到简体中文（`fallbackLng: 'zh'`）。
- **Affected Files**:
    - `src/renderer/i18n.ts`
    - `src/renderer/locales/zh.json`
    - `src/renderer/locales/en.json`
    - `src/renderer/locales/zh-TW.json`
- **Verification**:
    - [x] 界面语言可切换为中/英/繁。
    - [x] 语言偏好持久化保存。
    - [x] 重启后语言设置保持。
    - [x] 所有核心 UI 文本均已翻译（侧边栏、设置、阅读器、笔记面板、标签管理等）。


## 📦 打包与发布状态

| 平台 | 安装包 | 状态 |
|:---|:---|:---|
| Windows | `Summer RSS Reader-Setup-2.0.0.exe` | ✅ 已发布 |
| macOS (Apple Silicon) | `Summer RSS Reader-2.0.0-arm64.dmg` | ✅ 已发布（GitHub Actions） |
| Linux | 待打包 | ⬜ 待定 |

**CI/CD**：
- ✅ GitHub Actions 自动打包 macOS 版本
- ✅ 代码已上传至 GitHub
- ✅ Release 已创建