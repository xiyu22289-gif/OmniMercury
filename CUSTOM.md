[English](#english-version) | [中文](#chinese-version)

<a id="english-version"></a>

# OmniMercury Customization Guide

## What This Guide Covers

OmniMercury is designed to be highly customizable. This guide covers all the ways you can tailor the app to your workflow:

- Feed management (add, rename, remove, OPML import/export)
- Article management (read/unread, star, delete, browse history)
- LLM provider and model configuration (function-level independence)
- Glossary setup for consistent domain-specific translation
- AI summary and translation display modes
- Reading experience (theme, font, font size, reader/original mode)
- Highlight annotations (colors, eraser, export with articles)
- Notes system (editor formatting, auto-save, OPML export)
- Article export as HTML (with highlights and notes)
- Tag system management (manual, AI-suggested, color-coded filtering)
- AI Q&A
- Interface language switching
- Keyboard shortcuts
- Content refresh and force re-fetch

This guide focuses on practical, step-by-step instructions. It does not attempt to document every internal implementation detail — it prioritises the questions that matter most in actual daily use.

## Quick Start

### Configure LLM for AI Features

1. Open **Settings** (gear icon in the sidebar, or through the toolbar).
2. Switch to the **LLM** tab.
3. For each function (Full Translation / Selective Translation / Full Summary / Selective Summary):
   - Choose a **preset model** (DeepSeek, ChatECNU, Kimi, GPT) or add a **custom model** with your own model name, base URL, and API key.
   - Enter your **API key** (stored only on your machine).
   - Click **Test** to verify connectivity.
4. Switch to the **Token Usage** tab to monitor consumption.

### Set Up Glossary for Translation

1. Open **Settings** → **Translation**.
2. In the **Glossary** section, add source term → target term pairs (e.g. `attention mechanism` → `注意力机制`).
3. Toggle **Use Glossary Translation** on.
4. Glossary entries are applied automatically during translation — no additional steps needed.

### Customize Reading Experience

1. Open any article.
2. In the Reader toolbar:
   - Click **Reader/Original** to toggle between cleaned reading mode and the original web page.
   - Click the font selector (icon: `Aa`) to choose from 6 font families and adjust font size.
3. In **Settings** → **General**:
   - Switch theme: Light / Dark / System Auto / Eye-care.
   - Set default reader font family and font size.

### Switch Interface Language

1. Open **Settings** → **General**.
2. Choose from Simplified Chinese (简体中文), English, or Traditional Chinese (繁體中文).
3. The change takes effect immediately — no restart required.

## LLM Configuration in Detail

### Understanding Function-Level Independence

OmniMercury separates AI capabilities into four independent functions:

| Function | What It Does |
|:---|:---|
| **Full Translation** | Translates the entire article paragraph by paragraph |
| **Selective Translation** | Translates only selected text or checked paragraphs |
| **Full Summary** | Generates a summary of the entire article |
| **Selective Summary** | Generates a summary of selected paragraphs or text |

Each function can use a **different model and API key**. This means you can, for example:
- Use a fast, cheap model (e.g. DeepSeek) for translation
- Use a more capable model (e.g. GPT) for summary generation
- Use a local model for one function and a cloud API for another

### Preset vs Custom Models

**Preset models** (DeepSeek, ChatECNU, Kimi, GPT) come with pre-configured base URLs. You only need to provide the API key.

**Custom models** let you add any OpenAI-compatible endpoint with your own:
- **Model name** — as recognised by the API provider
- **Base URL** — the endpoint, e.g. `https://api.example.com/v1`
- **API key** — the credential for that provider

Custom models are saved per function, so you can maintain different custom endpoints for different tasks.

### Testing Connectivity

Every model configuration has a **Test** button that sends a minimal request to verify:
- The base URL is reachable
- The API key is valid
- The model responds correctly

Use this before relying on a model for actual translation or summary tasks.

### Token Usage Tracking

The **Token Usage** tab in Settings → LLM shows:
- Consumption broken down by model and operation (translation / summary)
- Estimated token counts (input and output)
- Option to clear history

Tokens are estimated locally when the API does not return exact counts, using a CJK-aware heuristic.

## Glossary: Consistent Domain-Specific Translation

### How Glossary Translation Works

When glossary translation is enabled, OmniMercury processes the article text before sending it to the LLM:

1. **Before translation**: The system scans the article for source terms (e.g. `API`) that match your glossary entries. Matching terms are replaced with their target equivalents (e.g. `应用程序接口`).
2. **Translation**: The LLM receives the pre-processed text and translates it normally — the glossary terms are already present in the target language.
3. **After translation**: Any remaining placeholder patterns are resolved.

This approach ensures specialized terminology is always translated consistently, regardless of the LLM's training data.

### Managing Glossary Entries

In **Settings → Translation → Glossary**:

- **Add**: Enter the source term (typically English) and the target term (e.g. Chinese), then click +.
- **Edit**: Click the entry to modify source term, target term, or both.
- **Delete**: Remove entries you no longer need.

Glossary entries are stored in the local SQLite database and persist across app restarts.

### When to Use Glossary Translation

- Technical documentation with domain-specific jargon
- Articles with consistent proper noun translations
- Multi-article series where terminology consistency matters
- Any content where the default LLM translation of specific terms is inconsistent

### When Not to Use It

- Casual reading where terminology precision is not critical
- When the glossary is empty (no effect anyway)
- For content in languages where the source terms rarely appear

## Theme Customization

OmniMercury offers four themes, switchable in **Settings → General**:

| Theme | Best For |
|:---|:---|
| **Light** | Daytime reading, high-contrast environments |
| **Dark** | Low-light environments, OLED displays |
| **System Auto** | Automatically follows your OS light/dark setting |
| **Eye-care** | Extended reading sessions — warm amber background reduces eye strain |

The eye-care theme remaps all interface colours to a warm palette:
- Background: `#FFF8E6` (sidebar, article list), `#E8DBC2` (reader)
- Text: `#3C3328` (deep brown)
- Borders: `#C4AE8A` (warm tan)
- Buttons: `#D9C8AA` → hover `#C4AE8A`

Eye-care mode is applied globally to the sidebar, article list, reader, toolbar, LLM settings dialog, and notes panel, with carefully separated rules to avoid colour conflicts.

## Font and Reading Preferences

### Available Fonts

| Font Display Name | Technical Font Stack |
|:---|:---|
| System Default | `ui-sans-serif, system-ui, ...` |
| Serif | `Georgia, "Times New Roman", serif` |
| Sans-serif / HeiTi | `"PingFang SC", "Microsoft YaHei", ...` |
| KaiTi | `"KaiTi", "STKaiti", ...` |
| LXGW WenKai | `"LXGW WenKai", "Noto Serif SC", serif` |
| Monospace | `Consolas, "SF Mono", "Fira Code", monospace` |

### Font Size

Adjustable from 12px to 28px (step 2px) via:
- **Settings → General** (default for all articles)
- **Reader toolbar** (per-article override)

### Notes Editor Font

The notes panel has its own independent font settings:
- 5 font options (system default, serif, heiti, kaiti, monospace)
- 8 size options (12px to 32px)
- Setting is global — applied to all notes

## Language Switching

OmniMercury supports three interface languages:
- **简体中文** (Simplified Chinese)
- **English**
- **繁體中文** (Traditional Chinese)

Switch in **Settings → General** → Language dropdown. The change is instant.

Translation and summary output languages are configured separately in the AI toolbar (not in Settings). Supported target languages: Chinese, English, Japanese, Korean, French, German.

## Keyboard Shortcuts

| Shortcut | Context | Action |
|:---|:---|:---|
| `Ctrl+S` | Notes panel | Manual save (auto-save also fires after 2s idle) |
| `Ctrl+F` | Reader view | Open in-article search bar |
| `Enter` | In-article search | Next match |
| `Shift+Enter` | In-article search | Previous match |
| `Escape` | In-article search / modals | Close search bar or dialog |

## Tag System Management

### Creating and Editing Tags

Tags are managed in two places:

1. **Per-article tagging panel** (click the tag button below the article title):
   - Multi-select from existing tags
   - Quick-create new tags with name + color
   - AI-suggested tags via the **AI Recommend** button

2. **Settings → Tags** (global management):
   - Create new tags
   - Edit tag names and colors (8 color presets)
   - Delete tags (removes from all articles)

### Color Customization

Each tag has one of 8 preset colors that appear as:
- A colored dot next to links in the article list
- A colored badge below the article title (with semi-transparent background)

Click the color swatch next to any tag to change its color. The change applies immediately across all articles that use that tag.

### AI Tag Suggestions

Click **AI Recommend** in the tagging panel to get LLM-generated tag suggestions based on the article title and content. Suggestions appear as a checklist — check the ones you want, then click **Add Selected** to apply them all at once.

### Filtering by Tags

In the sidebar, switch to the **Tags** view to filter articles by one or more tags. This filters across all feeds.

## Content Refresh

### When to Force Refresh

Click the **🔄 刷新正文** button below the article title when:
- Images are missing or broken (re-runs the full content cleaning pipeline including `resolveImageUrls`)
- The initial extraction was truncated (auto-refresh also triggers for articles < 1000 characters)
- The formatting looks wrong after an update

### Auto-Refresh

OmniMercury detects when fetched article content is unusually short (< 1000 characters) and automatically re-fetches it. Each article is auto-refreshed at most once per session.

## Feed Management

### Adding and Organizing Feeds

- Click the **+** button in the left sidebar to open the feed dialog — enter a URL and confirm to subscribe.
- **Import OPML**: Select an OPML file to add feeds in bulk. A progress tracker shows import status for each feed.
- **Export OPML**: Save all current feeds as an OPML file via the sidebar menu.
- Right-click any feed in the sidebar to **refresh**, **rename**, or **remove** it.

### Refreshing All Feeds

Click the refresh button in the sidebar toolbar to fetch new articles from all subscribed feeds simultaneously. New articles appear at the top of the article list.

## Article Management

OmniMercury provides several ways to organize your reading:

| Action | How |
|:---|:---|
| **Mark read/unread** | Click the article in the list — read articles appear with reduced opacity |
| **Star / unstar** | Toggle the star icon to bookmark articles for later |
| **Delete** | Right-click an article or use the delete button |
| **Browse history** | Access recently read articles from the history view |

The article list uses **virtual scrolling** (react-virtuoso), so performance remains smooth even with thousands of articles.

## AI Summary and Translation Display Modes

### Summary Detail Levels

When generating a summary, you can choose from three detail levels:

| Level | Length | Best For |
|:---|:---|:---|
| **Compact** (简洁) | ~100 words | Quick overview, scanning many articles |
| **Medium** (中等) | ~200 words | General reading, balanced detail |
| **Detailed** (详细) | ~300 words | Deep understanding, research |

The summary streams in real-time via SSE and is cached locally — viewing the same article again will show the cached result instantly unless you force regeneration.

Summary can also be exported as a standalone Markdown file via the download button in the summary panel.

### Translation Display Modes

When translating an article, four display modes are available:

| Mode | Layout |
|:---|:---|
| **Replace** (覆盖) | Shows only the translation, replacing the original |
| **Side-by-Side** (左右对照) | Original on the left, translation on the right with a draggable divider |
| **Top-Bottom** (上下对照) | Original on top, translation below in a bordered card |
| **New Tab** (新标签) | Two-column separated layout with independent scrolling |

**Selective translation**: Select specific text in the article to see a floating toolbar with quick-translate buttons for 4 languages (中文, English, 日本語, 한국어) and a text summary option. Check paragraph checkboxes to generate a summary of only selected paragraphs.

**Caching**: Translations are cached per language per article. Viewing the same translation again is instant. Click the refresh icon to force regeneration.

## Highlight Annotations

### Entering Annotation Mode

Click the **标注** button in the Reader toolbar to toggle annotation mode. When active, the button highlights in pink, and a floating toolbar appears below it with color and tool options.

### Using the Highlighter

1. Select the highlighter tool (default).
2. Choose a color from the 8-color palette.
3. Drag over text in the reading area to highlight it.
4. Highlighting preserves the original text formatting where possible.

### Using the Eraser

Switch to the eraser tool, then click on any highlighted area to remove that specific highlight. The eraser removes one annotation at a time — it targets the innermost highlight span.

### Annotation Persistence

Highlights are saved automatically after each operation to the local database, keyed by article ID. When you reopen an article, previous annotations are restored. When exporting an article as HTML, you can choose to include or exclude highlight annotations.

## Notes System

### Opening the Notes Panel

Click **Notes** in the Reader toolbar to toggle the notes panel below the reader area. The panel height is adjustable via a vertical drag handle.

### Editor Features

The rich-text editor (contentEditable) supports:
- **Bold**, **italic**, **strikethrough**
- **Ordered** and **unordered** lists
- **Font family** selection (5 options: system default, serif, heiti, kaiti, monospace)
- **Font size** selection (8 options: 12px to 32px)

### Auto-Save

Notes auto-save after 2 seconds of inactivity in the editor. Press **Ctrl+S** to save immediately. The last saved timestamp appears in the panel header. If the panel is closed while editing, the current content is saved in the background before closing.

### Exporting Notes

Click the download button in the notes panel header to export all notes as an OPML file. Notes are exported with their associated article metadata.

## Article Export as HTML

Click the **导出文章** button below the article title to export the current article as a standalone HTML file. A dialog appears with two checkboxes:

- **包含荧光笔笔迹** (Include highlight annotations)
- **包含笔记** (Include entry notes)

The exported HTML preserves:
- All original formatting, images, and links from the cleaned article content
- Highlight annotations (if enabled)
- Notes content (if enabled)

The export uses a native save dialog — choose the destination folder and filename, and the file is written directly to disk.

## AI Q&A

Click the **AI Q&A** button in the Reader toolbar to open a resizable side panel. Type your question about the current article and press Enter to send it. The AI response streams in real-time.

The Q&A feature sends the article content (up to 6000 characters) plus your question to the configured LLM. The response language follows the current interface language setting. Each article has independent Q&A state — switching articles resets the conversation.

## Practical Advice

### Getting Started as a New User

1. **Import your feeds first** — either add URLs one by one or import an OPML file.
2. **Set up at least one LLM model** — even just a free-tier API key for DeepSeek enables all AI features.
3. **Try the eye-care theme** — especially if you read for more than 30 minutes at a time.
4. **Add a few glossary entries** — even 5-10 domain-specific terms noticeably improve translation quality.
5. **Use notes for long-form reading** — notes auto-save, so you can write freely without worrying about losing work.

### Recommended Model Configurations

- **Cost-effective setup**: DeepSeek for all four functions — fast, affordable, good quality for both translation and summary.
- **Quality-focused setup**: DeepSeek for translation, GPT or Kimi for summary — leverage stronger reasoning for summary quality.
- **Privacy-focused setup**: Run a local model (e.g. via Ollama) and configure it as a custom model with `http://localhost:11434/v1` as the base URL.

### Troubleshooting Customization Issues

- **AI features not working**: Use the **Test** button in LLM Settings to verify model reachability. Check that the API key is correct and the base URL includes the full path (e.g. `https://api.deepseek.com/v1`).
- **Translation quality inconsistent**: Add domain-specific terms to the glossary in Settings → Translation. Enable glossary translation.
- **Theme not applying correctly**: Some dialogs (e.g. LLM settings) have independent eye-care styling. If colours look wrong, toggle the theme or restart the app.
- **Notes not saving**: Notes auto-save after 2 seconds of inactivity. Use Ctrl+S to force-save immediately. Check that the article is still selected when saving.
- **Summary or translation cache not updating**: Click the refresh icon (🔄) next to the summary or translation to force regeneration and clear the cache for that language.

### Restoring Defaults

- **LLM config**: Delete `llm-config.json` from the app's user data directory, or click **Reset** in the LLM settings panel.
- **Glossary**: Delete entries individually in Settings → Translation.
- **Tags**: Delete individually in Settings → Tags.
- **Theme and fonts**: Return to Settings → General and select defaults (Light theme, system font, 16px).

---

<a id="chinese-version"></a>

# OmniMercury 自定义指南

## 这份文档解决什么问题

OmniMercury 设计为高度可定制。本指南涵盖所有定制方式：

- 订阅源管理（添加、重命名、删除、OPML 导入/导出）
- 文章管理（已读/未读、收藏、删除、浏览历史）
- LLM 模型与 API 配置（功能级独立）
- 术语库配置（确保专业翻译一致性）
- AI 摘要与翻译显示模式
- 阅读体验（主题、字体、字号、阅读/原文模式）
- 荧光笔标注（多色、橡皮擦、随文章导出）
- 笔记系统（编辑器格式、自动保存、OPML 导出）
- 文章导出为 HTML（含荧光笔和笔记）
- 标签系统管理（手动、AI 推荐、颜色编码筛选）
- AI 问答
- 界面语言切换
- 键盘快捷键
- 内容刷新与强制重新抓取

本指南侧重于实用、逐步的操作说明，不试图记录所有内部实现细节。

## 快速开始

### 配置 LLM 以启用 AI 功能

1. 打开 **设置**（侧边栏齿轮图标或工具栏图标）。
2. 切换到 **LLM** 标签页。
3. 分别在四个功能（全文翻译 / 选择翻译 / 全文摘要 / 选择摘要）中：
   - 选择**预设模型**（DeepSeek、ChatECNU、Kimi、GPT）或添加**自定义模型**（填入模型名称、Base URL、API Key）。
   - 填入 **API Key**（仅保存在本机）。
   - 点击 **测试** 验证连通性。
4. 切换到 **用量统计** 标签查看消耗。

### 设置术语库翻译

1. 打开 **设置** → **翻译**。
2. 在**术语库**区域添加源术语 → 目标术语配对（如 `attention mechanism` → `注意力机制`）。
3. 开启**使用术语库翻译**开关。
4. 术语库在翻译时自动生效，无需额外操作。

### 定制阅读体验

1. 打开任意文章。
2. 在 Reader 工具栏中：
   - 点击 **阅读/原文** 切换纯净阅读模式与原始网页。
   - 点击字体图标选择 6 种字体之一，调整字号。
3. 在 **设置** → **通用** 中：
   - 切换主题：浅色 / 深色 / 跟随系统 / 护眼。
   - 设置默认字体和字号。

### 切换界面语言

1. 打开 **设置** → **通用**。
2. 在下拉菜单中选择简体中文、English 或繁體中文。
3. 切换即时生效，无需重启。

## LLM 配置详解

### 功能级独立配置

OmniMercury 将 AI 能力拆分为四个独立功能：

| 功能 | 用途 |
|:---|:---|
| **全文翻译** | 逐段翻译整篇文章 |
| **选择翻译** | 仅翻译选中的文本段落 |
| **全文摘要** | 生成整篇文章的摘要 |
| **选择摘要** | 为选中的段落或文本生成摘要 |

每个功能可以使用**不同的模型和 API Key**。例如：
- 用快速便宜的模型（如 DeepSeek）处理翻译
- 用更强的模型（如 GPT）生成摘要
- 一个功能用本地模型，另一个用云端 API

### 预设模型与自定义模型

**预设模型**（DeepSeek、ChatECNU、Kimi、GPT）带有预配置的 Base URL，只需提供 API Key。

**自定义模型**允许添加任何兼容 OpenAI 的端点：
- **模型名称** — API 提供者认可的模型标识
- **Base URL** — 端点地址，如 `https://api.example.com/v1`
- **API Key** — 该提供者的密钥

自定义模型按功能独立保存，不同功能可使用不同端点。

### 测试连接

每个模型配置旁都有**测试**按钮，发送最小请求验证：
- Base URL 可达
- API Key 有效
- 模型正常响应

在实际翻译或摘要前建议先测试。

### Token 用量统计

**设置 → LLM → 用量统计** 标签显示：
- 按模型和操作（翻译 / 摘要）分列的消耗
- 估算的 Token 数（输入和输出）
- 可清除历史记录

API 未返回精确计数时使用本地 CJK 感知估算算法。

## 术语库：专业术语翻译一致性

### 工作原理

启用术语库翻译后，OmniMercury 在发送给 LLM 前预处理文章文本：

1. **翻译前**：扫描文章内容，匹配术语库中的源术语（如 `API`），替换为目标术语（如 `应用程序接口`）。
2. **翻译中**：LLM 收到已包含目标语言术语的文本，正常翻译即可。
3. **翻译后**：还原占位符。

这样无论 LLM 训练数据如何，专业术语始终翻译一致。

### 管理术语条目

在 **设置 → 翻译 → 术语库** 中：

- **添加**：输入源术语（通常英文）和目标术语（如中文），点击 + 。
- **编辑**：点击条目修改。
- **删除**：移除不再需要的条目。

术语库存于本地 SQLite 数据库，重启后保留。

## 主题定制

四种主题在 **设置 → 通用** 中切换：

| 主题 | 适用场景 |
|:---|:---|
| **浅色** | 白天阅读，高对比度环境 |
| **深色** | 低光环境，OLED 屏幕 |
| **跟随系统** | 自动跟随系统浅色/深色设置 |
| **护眼** | 长时间阅读 — 暖琥珀色背景减轻眼疲劳 |

护眼模式全局重映射颜色：背景 `#FFF8E6`/`#E8DBC2`、文字 `#3C3328`、边框 `#C4AE8A`，覆盖侧边栏、文章列表、阅读区、工具栏、LLM 设置对话框和笔记面板。

## 字体与阅读偏好

### 可选字体

| 显示名称 | 字体栈 |
|:---|:---|
| 系统默认 | `ui-sans-serif, system-ui, ...` |
| 宋体/衬线 | `Georgia, "Times New Roman", serif` |
| 黑体/雅黑 | `"PingFang SC", "Microsoft YaHei", ...` |
| 楷体 | `"KaiTi", "STKaiti", ...` |
| 霞鹜文楷 | `"LXGW WenKai", "Noto Serif SC", serif` |
| 等宽 | `Consolas, "SF Mono", "Fira Code", monospace` |

字号范围 12px–28px（步长 2px），在设置（全局默认）或阅读工具栏（当前文章）中调节。

### 笔记编辑器字体

笔记面板有独立字体设置：5 种字体 + 8 档字号（12px–32px），全局生效。

## 语言切换

支持三种界面语言，在 **设置 → 通用** 中切换，即时生效。翻译/摘要输出语言在 AI 工具栏中单独配置，支持中文、English、日本語、한국어、Français、Deutsch。

## 键盘快捷键

| 快捷键 | 场景 | 功能 |
|:---|:---|:---|
| `Ctrl+S` | 笔记面板 | 手动保存（空闲 2 秒也自动保存） |
| `Ctrl+F` | 阅读区 | 打开文章内搜索 |
| `Enter` | 文章内搜索 | 下一个匹配 |
| `Shift+Enter` | 文章内搜索 | 上一个匹配 |
| `Escape` | 搜索/对话框 | 关闭 |

## 标签系统管理

### 创建与编辑标签

两个入口：

1. **文章标签面板**（点击标题下方标签按钮）：
   - 多选已有标签
   - 快速新建（名称 + 颜色）
   - AI 推荐标签

2. **设置 → 标签**（全局管理）：
   - 新建、编辑名称和颜色、删除

### 颜色定制

每个标签有 8 种预设颜色可选。点击标签旁的色块切换颜色，所有使用该标签的文章即时更新。

### AI 标签推荐

在标签面板中点击 **AI 推荐**，基于文章标题和内容生成建议标签。勾选需要的标签后点击**添加选中**批量应用。

### 按标签筛选

侧边栏切换到标签视图，按标签筛选跨订阅源文章。

## 内容刷新

### 何时强制刷新

在以下情况点击文章标题下方的 **🔄 刷新正文**：
- 图片缺失或无法加载
- 初始抓取内容不完整
- 格式显示异常

短内容（< 1000 字符）会自动触发一次刷新，每篇文章每会话最多一次。

## 订阅源管理

### 添加与组织订阅源

- 点击左侧边栏的 **+** 按钮打开添加订阅对话框，输入 URL 并确认订阅。
- **导入 OPML**：选择 OPML 文件批量添加订阅源，带进度追踪。
- **导出 OPML**：通过侧边栏菜单将所有当前订阅源保存为 OPML 文件。
- 右键侧边栏中的订阅源可**刷新**、**重命名**或**删除**。

### 刷新全部订阅源

点击侧边栏工具栏中的刷新按钮，同时从所有已订阅源获取新文章。新文章显示在文章列表顶部。

## 文章管理

OmniMercury 提供多种方式组织阅读：

| 操作 | 方法 |
|:---|:---|
| **标记已读/未读** | 点击文章列表中的文章 — 已读文章透明度降低 |
| **收藏/取消收藏** | 切换星标图标将文章加入书签 |
| **删除** | 右键文章或使用删除按钮 |
| **浏览历史** | 从历史视图查看最近阅读的文章 |

文章列表使用**虚拟滚动**（react-virtuoso），即使有数千篇文章也能保持流畅性能。

## AI 摘要与翻译显示模式

### 摘要详细程度

生成摘要时，可以选择三个详细级别：

| 级别 | 长度 | 适用场景 |
|:---|:---|:---|
| **简洁** (Compact) | ~100 字 | 快速概览，浏览多篇文章 |
| **中等** (Medium) | ~200 字 | 日常阅读，信息均衡 |
| **详细** (Detailed) | ~300 字 | 深度理解，研究参考 |

摘要通过 SSE 实时流式输出，并本地缓存——再次查看同一文章时即时显示缓存结果，除非强制重新生成。

摘要也可通过摘要面板的下载按钮导出为独立的 Markdown 文件。

### 翻译显示模式

翻译文章时，四种显示模式可选：

| 模式 | 布局 |
|:---|:---|
| **覆盖** (Replace) | 仅显示译文，替换原文 |
| **左右对照** (Side-by-Side) | 原文在左、译文在右，分隔条可拖拽 |
| **上下对照** (Top-Bottom) | 原文在上、译文在下，带边框卡片 |
| **新标签** (New Tab) | 双栏独立滚动布局 |

**选择性翻译**：在文章中选中文本，弹出浮动工具栏，提供 4 种语言快速翻译按钮（中文、English、日本語、한국어）和文本摘要选项。勾选段落复选框可生成仅选中段落的摘要。

**翻译缓存**：按语言和文章缓存翻译结果。再次查看相同翻译即时显示。点击刷新图标强制重新生成。

## 荧光笔标注

### 进入标注模式

点击阅读工具栏的**标注**按钮切换标注模式。激活时按钮显示为粉色，其下方弹出浮动工具栏，包含颜色和工具选项。

### 使用荧光笔

1. 选择荧光笔工具（默认）。
2. 从 8 色调色板中选择颜色。
3. 在阅读区域拖选文字进行高亮。
4. 高亮操作尽可能保留原始文本格式。

### 使用橡皮擦

切换到橡皮擦工具，然后点击任意已标注区域即可清除该笔标注。橡皮擦每次移除一笔标注——它定位到最内层的高亮 span。

### 标注持久化

每次操作后标注自动保存到本地数据库，按文章 ID 索引。重新打开文章时，之前的标注会自动恢复。导出文章为 HTML 时可选择包含或排除荧光笔标注。

## 笔记系统

### 打开笔记面板

点击阅读工具栏中的**笔记**按钮，在阅读区下方切换笔记面板。面板高度可通过垂直拖拽手柄调整。

### 编辑器功能

富文本编辑器（contentEditable）支持：
- **加粗**、**斜体**、**删除线**
- **有序**和**无序**列表
- **字体**选择（5 种：系统默认、宋体、黑体、楷体、等宽）
- **字号**选择（8 档：12px 到 32px）

### 自动保存

笔记在编辑器 2 秒无操作后自动保存。按 **Ctrl+S** 可立即保存。最后保存时间显示在面板标题中。如果在编辑中关闭面板，当前内容会在关闭前后台保存。

### 导出笔记

点击笔记面板标题栏中的下载按钮，将所有笔记导出为 OPML 文件。笔记与其关联的文章元数据一起导出。

## 文章导出为 HTML

点击文章标题下方的**导出文章**按钮，将当前文章导出为独立 HTML 文件。弹出对话框包含两个复选框：

- **包含荧光笔笔迹**
- **包含笔记**

导出的 HTML 保留：
- 清洗后文章内容的所有原始格式、图片和链接
- 荧光笔标注（如已启用）
- 笔记内容（如已启用）

导出使用系统原生保存对话框——选择目标文件夹和文件名，文件直接写入磁盘。

## AI 问答

点击阅读工具栏中的 **AI 问答** 按钮，打开可拖拽调整宽度的侧面板。输入关于当前文章的问题，按回车发送。AI 回答实时流式输出。

AI 问答功能将文章内容（最多 6000 字符）和你的问题一起发送到已配置的 LLM。回答语言跟随当前界面语言设置。每篇文章有独立的问答状态——切换文章会重置对话。

## 实用建议

### 新用户上手顺序

1. **先导入订阅源** — 逐个添加 URL 或 OPML 批量导入。
2. **至少配置一个 LLM 模型** — 免费的 DeepSeek API Key 即可启用全部 AI 功能。
3. **试试护眼主题** — 尤其是单次阅读超过 30 分钟时。
4. **加几条术语库条目** — 5-10 个专业术语就能明显提升翻译质量。
5. **善用笔记功能** — 笔记自动保存，无需担心丢失。

### 推荐模型配置

- **经济方案**：四个功能都用 DeepSeek — 快速、便宜、摘要和翻译质量都不错。
- **品质方案**：翻译用 DeepSeek，摘要用 GPT 或 Kimi — 利用更强推理能力提升摘要质量。
- **隐私方案**：运行本地模型（如 Ollama），配置为自定义模型，Base URL 填 `http://localhost:11434/v1`。

### 常见问题排查

- **AI 功能不可用**：用 LLM 设置中的**测试**按钮验证模型可达性。检查 API Key 和 Base URL（需含完整路径如 `/v1`）。
- **翻译质量不稳定**：在设置 → 翻译中添加专业术语到术语库，开启术语库翻译。
- **主题显示异常**：LLM 设置等对话框有独立的护眼规则。切换主题或重启应用。
- **笔记未保存**：笔记空闲 2 秒后自动保存，Ctrl+S 可立即保存。确认保存时文章仍处于选中状态。
- **摘要/翻译缓存不更新**：点击刷新图标强制重新生成并清除该语言缓存。

### 恢复默认设置

- **LLM 配置**：删除应用用户数据目录下的 `llm-config.json`，或在 LLM 设置中点击 Reset。
- **术语库**：在设置 → 翻译中逐条删除。
- **标签**：在设置 → 标签中逐条删除。
- **主题和字体**：在设置 → 通用中选择默认值。

---

> 如果你在使用中遇到问题或希望某个功能支持更深入的定制，欢迎通过 [GitHub Issues](https://github.com/xiyu22289-gif/OmniMercury/issues) 反馈。
