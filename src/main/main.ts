import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipcHandlers'

// WSLg: app.whenReady 之前禁用 GPU 硬件加速，避免 viz_main_impl 崩溃
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    minWidth: 800,
    minHeight: 600,
    title: 'Summer RSS Reader',
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 拦截所有导航和弹窗，统一在外部浏览器打开链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 阻止应用内导航（非 dev server 的 URL），在外部浏览器打开
    if (!url.startsWith('http://localhost:') && !url.startsWith('http://127.0.0.1:')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // 窗口准备好后再显示，避免白屏
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // ★ 图片请求拦截：移除 Referer/Origin 避免第三方服务器返回 403
  //   部分服务器检查 Referer/Origin 头，拒绝来自 localhost/file:// 的请求
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    {
      urls: ['*://*/*'],
      types: ['image'],
    },
    (details, callback) => {
      // 仅对跨站请求生效：请求来自本地 origin 但 URL 是外部站点
      const urlHost = new URL(details.url).host
      const refererHost = details.referrer ? new URL(details.referrer).host : ''
      if (urlHost !== refererHost) {
        delete details.requestHeaders['Referer']
        delete details.requestHeaders['Origin']
      }
      callback({ requestHeaders: details.requestHeaders })
    },
  )

  // 开发模式加载 Vite dev server，生产模式加载打包文件
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else if (!app.isPackaged) {
    // Fallback: dev 模式下 env 未注入时，从环境变量 PORT 或默认 5173 连接
    const port = process.env['VITE_DEV_SERVER_PORT'] || '5173'
    mainWindow.loadURL(`http://localhost:${port}`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---- 应用生命周期 ----

app.whenReady().then(async () => {
  // 初始化 SQLite 数据库（用户数据目录下）
  const dbPath = join(app.getPath('userData'), 'summer-rss.db')
  initDatabase(dbPath)

  // 清除缓存的图片响应（避免旧 403 缓存残留）
  try {
    await session.defaultSession.clearCache()
  } catch { /* 静默 */ }

  // ⚠️ 临时：打包前清空测试数据，执行一次后请删除或注释掉此行
  // clearAllData()

  // 注册 IPC 处理器（桥接 feedService ↔ renderer）
  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
