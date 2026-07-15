import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import {
  startBackend,
  stopBackend,
  addFeed,
  listFeeds,
  getArticles,
  getArticleContent,
  removeFeed,
  searchArticles,
  refreshFeeds
} from './ipc-client'

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
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---- IPC 处理器：渲染进程通过 preload 调用主进程 ----

function setupIpcHandlers(): void {
  ipcMain.handle('backend:addFeed', async (_event, url: string) => {
    return addFeed(url)
  })

  ipcMain.handle('backend:listFeeds', async () => {
    return listFeeds()
  })

  ipcMain.handle('backend:refreshFeeds', async () => {
    return refreshFeeds()
  })

  ipcMain.handle('backend:getArticles', async (_event, feedId: number, offset?: number, limit?: number) => {
    return getArticles(feedId, offset, limit)
  })

  ipcMain.handle('backend:getArticleContent', async (_event, articleId: number) => {
    return getArticleContent(articleId)
  })

  ipcMain.handle('backend:removeFeed', async (_event, feedId: number) => {
    return removeFeed(feedId)
  })

  ipcMain.handle('backend:searchArticles', async (_event, query: string, feedId?: number, offset?: number, limit?: number) => {
    return searchArticles(query, feedId, offset, limit)
  })
}

// ---- 应用生命周期 ----

app.whenReady().then(() => {
  // 启动 C 后端
  startBackend()

  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})