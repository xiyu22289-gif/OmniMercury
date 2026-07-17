import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipcHandlers'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Summer RSS Reader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 开发模式加载 Vite dev server，生产模式加载打包文件
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else if (!app.isPackaged) {
    // Fallback: dev 模式下 env 未注入时手动连 localhost
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---- 应用生命周期 ----

app.whenReady().then(() => {
  // 初始化 SQLite 数据库（用户数据目录下）
  const dbPath = join(app.getPath('userData'), 'summer-rss.db')
  initDatabase(dbPath)

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
