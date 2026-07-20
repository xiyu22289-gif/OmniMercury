# AGENTS\.md — AI 开发执行操作手册

**文档定位：本文件是 AI 开发的最高优先级指令集。它固化了项目的不可变决策、架构红线、历史踩坑记录及交互协议。人类与 AI 均禁止随意修改本章节内容，如需修订需经过架构评审。**

## 0\. AI 认知初始化（加载本文档后优先读取）

**身份定位**：精通 Electron 底层原理、React 性能优化及 Node\.js 原生模块兼容性的高级全栈工程师。

**核心座右铭**：本地优先 \(Local\-First\) 、进程隔离 \(Process Isolation\) 、类型安全 \(Type Safety\)。

**决策优先级（需求未明确时，按序执行）**

1. **本地优先**：凡是涉及用户数据（密钥、配置、文章），必须默认存本地，严禁默认开启云端上传或强制联网。

2. **复用 \> 新增**：优先使用 shadcn/ui 现有组件库，优先复用 renderer/lib 中的工具函数。

3. **主进程轻量化**：能放渲染进程的 UI 逻辑，绝不拖慢主进程；但涉及文件 I/O、网络请求、DOM 模拟，必须坚守主进程。

4. **最小改动原则**：若估算改动涉及架构红线，须先输出改动方案征求确认，严禁直接编码。

## 1\. 不可变架构红线（AI 强制遵守，禁止突破）

所有代码生成、功能开发、问题修复必须遵守以下硬性约束，违者视为违规开发。

### 1\.1 进程隔离铁律

渲染进程（UI）只允许做界面渲染、用户交互、状态响应。所有文件读写、数据库、原始网络请求、DOM 模拟必须放在主进程。渲染进程仅通过预暴露的 `window.electron` 调用主进程能力。

### 1\.2 目录结构铁律

- **主进程**：`src/main`（包含 main.ts, preload.ts, ipcHandlers.ts, db.ts, feedService.ts）
- **渲染进程**：`src/renderer`（强制拆分 `components/ / pages/ / store/ / lib/ / hooks/`）
- 禁止在 renderer 下创建 utils、services 等自定义混乱目录，统一收敛至 lib。

### 1\.3 数据库铁律

使用 better\-sqlite3 \+ Drizzle ORM。强制 TS 类型安全，优先手写原生 SQL（利用 sql 模板标签），禁止重度 ORM 封装（如复杂的 relations 和 migrate 黑盒），禁止使用 any 绕过类型。

### 1\.4 状态管理铁律

全局状态统一使用 Zustand，禁止引入 Redux、MobX，禁止使用 React Context 进行全局状态传递（仅允许主题、语言等极少数静态依赖注入）。

### 1\.5 本地优先铁律

用户密钥、配置、订阅数据、文章数据全部本地持久化，禁止默认云端上传、禁止强制联网。

## 2\. 技术栈固化锁死（版本 \& 选型禁止替换）

以下为项目唯一合法技术栈，AI 开发**禁止替换、禁止升级大版本、禁止新增同类替代库**。

|类别|技术选型|版本约束|
|---|---|---|
|桌面基座|Electron \+ electron\-vite|31\.x \+ 2\.x|
|前端框架|React \+ TypeScript|18\.x \+ 5\.x（严格模式开启）|
|UI 体系|Tailwind CSS \+ shadcn/ui \+ Lucide React|3\.x \+ latest|
|状态管理|Zustand|4\.x|
|长列表|react\-virtuoso|4\.x|
|数据库|better\-sqlite3 \+ Drizzle ORM|12\.x \+ 最新|
|Feed 解析|rss\-parser \+ fast\-xml\-parser|3\.x \+ 4\.x|
|正文清洗|@mozilla/readability \+ jsdom \+ turndown|0\.9\.x \+ 24\.x \+ 7\.x|
|LLM 调用|openai SDK \+ eventsource\-parser|4\.x \+ 1\.x|
|工具链|axios, dayjs, tiktoken, js\-yaml, lodash\-es|锁定最新兼容版本|
|打包工具|electron\-builder|24\.x|

## 3\. 核心领域逻辑固化（AI 开发必须复用）

### 3\.1 内容清洗固定流水线（禁止改动顺序，含强制降级）

**标准流程**：axios 拉取原文 HTML \-\> jsdom 模拟浏览器 DOM 环境 \-\> readability 提纯正文 \-\> turndown 转标准 Markdown \-\> 入库 / 渲染 / AI 处理

**强制降级约束**：流水线中任一环节报错（超时、空内容、转换异常等），必须：

1. 捕获异常并在主进程记录错误日志；

2. 返回原始内容或友好错误提示文案，如：`【正文提取失败】该页面结构复杂，请尝试打开原文链接。`；

3. 严禁抛出未捕获异常，杜绝渲染进程白屏、主进程崩溃。

### 3\.2 LLM 能力固定方案

- 统一使用 openai SDK，通过 `baseURL`、`apiKey` 适配全品类兼容 OpenAI 协议大模型（DeepSeek、通义、智谱等）。

- 流式输出固定使用 eventsource\-parser 解析 SSE，实现逐字打印交互效果。

- 用户密钥通过 electron\-store 本地持久化，禁止明文存数据库、禁止代码硬编码、禁止云端上传。

## 4\. 代码地图（AI 开发文件入口索引）

修改代码前，优先按以下顺序读取核心文件，建立项目认知：

- **主进程入口**：`src/main/main.ts`（注册IPC、初始化数据库、创建窗口）

- **预加载脚本**：`src/preload/index.ts`（`window.electron` API 白名单暴露）

- **渲染进程入口**：`src/renderer/main.tsx`（React挂载、全局样式注入）

- **全局状态**：`src/renderer/store/index.ts`（Zustand全局状态管理）

- **路由结构**：`src/renderer/App.tsx`（页面路由映射）

**核心业务文件**：
- **数据库层**：`src/main/db.ts`（SQLite + Drizzle ORM，包含 feeds/articles 表操作）
- **业务逻辑层**：`src/main/feedService.ts`（RSS 解析、订阅源管理、文章查询）
- **IPC 通信层**：`src/main/ipcHandlers.ts`（主进程 IPC 通道注册）

**新增功能目录规范**：页面统一新建于 `src/renderer/pages/`，必须包含 `index.tsx` 主文件；复杂页面的私有组件收拢在当前页面文件夹内，禁止跨页面私有组件引用。

## 5\. 编码强制约束与质量门禁（AI 代码自检必过）

AI 生成代码后，必须完成以下自检，全部通过方可输出、提交。

1. **TS 严格检查**：杜绝任意 `any`、杜绝 `@ts-ignore`；必须使用精确类型或 `unknown`\+类型守卫。

2. **进程违规检查**：渲染进程文件严禁引入 fs、child\_process、better\-sqlite3 等 Node 原生模块，相关逻辑必须下沉主进程、IPC 调用。

3. **UI 一致性检查**：仅使用 Tailwind 工具类、shadcn/ui、Lucide React；禁止自定义零散CSS、禁止引入第三方UI库。

4. **代码规范检查**：严格符合 ESLint、Prettier 规则，无格式错误、无规则告警。

5. **Git 提交检查**：Commit 严格遵循 Conventional Commits 规范。

## 6\. 历史报错固化记忆（AI 强制避坑）

所有历史致命报错、问题根因、解决方案永久固化，禁止重复踩坑。

### 6\.1 electron\-vite 配置混淆（致命）

**问题**：未区分 main / preload / renderer 三进程独立打包配置，主进程混入前端依赖，导致启动白屏、`window.electron` 挂载失败、打包API失效。

**解决方案**：三进程 build\.rollupOptions 完全独立配置，严格隔离前后端依赖。

### 6\.2 better\-sqlite3 原生模块加载失败（致命）

**问题**：electron\-vite 未将 better\-sqlite3 加入 external，Vite 强行打包原生模块，导致运行`module not found`、`require is not defined`。

**解决方案**：主进程构建配置强制 external 声明 better\-sqlite3。

### 6\.3 readability 环境报错（功能失效）

**问题**：主进程无浏览器 DOM 环境，直接调用 readability 会抛出 `document is not defined`。

**解决方案**：主进程调用必须通过 jsdom 手动构造浏览器 window 环境，再传入 Readability 实例。

### 6\.4 GitHub Actions macOS 打包 better-sqlite3 编译失败（已解决）

**问题**：GitHub Actions macOS 环境中，Python 3.14 移除了 `distutils` 模块，导致 `better-sqlite3` 原生模块编译失败。同时 Node.js 18 不满足 `better-sqlite3@12.x` 的引擎要求。

**解决方案**：
1. 在 `build.yml` 中指定 `node-version: 20`
2. 使用 `actions/setup-python@v5` 指定 `python-version: '3.11'`
3. 添加 `CSC_IDENTITY_AUTO_DISCOVERY: false` 跳过代码签名
4. 在 `package.json` 的 `build` 配置中设置 `"target": "portable"` 或使用 `--publish never` 避免自动发布失败

## 7\. AI 开发执行工作流（迭代优先级锁定）

开启开发必须按阶段顺序推进，禁止跳跃开发、超前开发未规划模块。

1. **M1**：项目脚手架、三进程配置、基础布局与路由 ✅ **已完成**

2. **M2**：RSS订阅源解析、新增、列表展示、Zustand状态管理 ✅ **已完成**

3. **M3**：内容清洗流水线、HTML转MD、纯净阅读模式 🔄 **进行中**

4. **M4**：LLM通用接入、密钥管理、流式逐字渲染能力 ⬜ **待开始（下周一前需完成）**

5. **M5\-M8**：标签分类、笔记批注、文件导出、Token统计、多语言国际化 ⬜ **待开始（选做）**

## 8\. AI 交互与冲突处理协议（最高优先级）

用户需求与架构红线、技术栈约束冲突时，**禁止妥协、禁止绕过、禁止直接拒绝**，必须执行标准三步处理法。

### 8\.1 标准响应三步法

1. **列出冲突**：明确对标具体违规条款；

2. **说明风险**：阐述违规实现带来的崩溃、兼容、体验、安全问题；

3. **提供方案**：给出1\-2条合规替代方案，交由用户决策。

### 8\.2 自动拒绝清单（无需论证，礼貌直接拒绝）

- 引入 Redux / MobX 替代 Zustand

- 升级 Electron 至 32\.x 或降级至 29\.x

- 关闭 TypeScript `strict: true` 严格模式

- 使用 Ant Design、MUI 等第三方UI库替换 shadcn/ui

## 9\. 已知问题 \& 待修复记忆

### 9.1 主题跟随系统
**描述**：深色/浅色模式当前需要手动切换，未自动跟随 macOS/Windows 系统主题。
**计划**：使用 `window.matchMedia('(prefers-color-scheme: dark)')` 监听系统主题变化，实现自动跟随。

### 9.2 OPML 导入完善
**描述**：OPML 导入功能基础框架已存在，需完善 UI 交互和批量导入流程。
**计划**：在设置页面或侧边栏添加 OPML 导入/导出入口，支持拖拽上传。

## 10\. 当前状态 (Current Status)

| 里程碑 | 状态 | 说明 |
|:---|:---|:---|
| **M1 (脚手架与UI骨架)** | ✅ **已完成** | Electron + Vite + React 配置完成，三栏布局、Tailwind + shadcn/ui 已集成，数据库已初始化 |
| **M2 (订阅源管理与文章列表)** | ✅ **已完成** | RSS/Atom 解析、订阅源 CRUD、文章列表虚拟滚动、已读/未读状态、OPML 基础导入导出 |
| **M3 (内容清洗流水线)** | 🔄 **进行中** | readability + jsdom + turndown 框架已就绪，待完善错误降级和阅读模式 UI |
| **M4 (LLM接入与AI摘要/翻译)** | ⬜ **待开始** | 下周一前需完成 |
| **M5-M8 (选做功能)** | ⬜ **待开始** | 标签、笔记、用量统计、多语言 |

**打包与发布**：
- ✅ Windows 安装包已生成（`Summer RSS Reader-Setup-2.0.0.exe`）
- ✅ macOS 安装包已生成（`Summer RSS Reader-2.0.0-arm64.dmg`，通过 GitHub Actions）
- ✅ GitHub Actions CI/CD 已配置
- ✅ GitHub Release 已发布

## 11\. 未来规划 (Roadmap)

| 里程碑 | 目标 | 预计完成 |
|:---|:---|:---|
| **M1** | 项目脚手架搭建，三栏布局和基本路由 | ✅ 已完成 |
| **M2** | RSS 订阅源添加、解析、列表展示和状态管理 | ✅ 已完成 |
| **M3** | 内容提取、清洗和 Markdown 转换，阅读模式 | 🔄 进行中 |
| **M4** | LLM 接入，文章摘要和翻译功能 | 下周一前 |
| **M5** | 标签系统（手动打标 + AI推荐） | 选做 |
| **M6** | 笔记与文摘导出 | 选做 |
| **M7** | 大模型用量统计 | 选做 |
| **M8** | 界面多语言 | 选做 |

> （注：部分内容可能由 AI 生成）