"use strict";
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
let backendProcess = null;
let requestId = 0;
const pendingRequests = /* @__PURE__ */ new Map();
function startBackend(backendPath) {
  if (backendProcess) return;
  const exePath = path.join(__dirname, "../../summer-rss-reader/build/summer-rss-reader");
  backendProcess = child_process.spawn(exePath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  backendProcess.stdout?.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        const id = requestId - 1;
        const pending = pendingRequests.get(id);
        if (pending) {
          pending.resolve(response);
          pendingRequests.delete(id);
        }
      } catch {
      }
    }
  });
  backendProcess.stderr?.on("data", (data) => {
    console.error("[backend stderr]", data.toString().trim());
  });
  backendProcess.on("close", (code) => {
    console.log(`[backend] process exited with code ${code}`);
    backendProcess = null;
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error(`Backend process exited with code ${code}`));
    }
    pendingRequests.clear();
  });
}
function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}
function sendRequest(type, payload) {
  return new Promise((resolve, reject) => {
    if (!backendProcess || !backendProcess.stdin) {
      reject(new Error("Backend process not running"));
      return;
    }
    const id = requestId++;
    pendingRequests.set(id, { resolve, reject });
    const request = { type, payload };
    const json = JSON.stringify(request) + "\n";
    backendProcess.stdin.write(json, (err) => {
      if (err) {
        pendingRequests.delete(id);
        reject(err);
      }
    });
  });
}
async function addFeed(url) {
  return sendRequest("import_feed", { url });
}
async function listFeeds() {
  return sendRequest("list_feeds");
}
async function refreshFeeds() {
  return sendRequest("refresh_feeds");
}
async function getArticles(feedId, offset = 0, limit = 20) {
  return sendRequest("list_articles", { feed_id: feedId, offset, limit });
}
async function getArticleContent(articleId) {
  return sendRequest("get_article_content", { article_id: articleId });
}
async function removeFeed(feedId) {
  return sendRequest("remove_feed", { feed_id: feedId });
}
async function searchArticles(query, feedId, offset = 0, limit = 20) {
  return sendRequest("search_articles", {
    query,
    feed_id: feedId || 0,
    offset,
    limit
  });
}
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Summer RSS Reader",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function setupIpcHandlers() {
  electron.ipcMain.handle("backend:addFeed", async (_event, url) => {
    return addFeed(url);
  });
  electron.ipcMain.handle("backend:listFeeds", async () => {
    return listFeeds();
  });
  electron.ipcMain.handle("backend:refreshFeeds", async () => {
    return refreshFeeds();
  });
  electron.ipcMain.handle("backend:getArticles", async (_event, feedId, offset, limit) => {
    return getArticles(feedId, offset, limit);
  });
  electron.ipcMain.handle("backend:getArticleContent", async (_event, articleId) => {
    return getArticleContent(articleId);
  });
  electron.ipcMain.handle("backend:removeFeed", async (_event, feedId) => {
    return removeFeed(feedId);
  });
  electron.ipcMain.handle("backend:searchArticles", async (_event, query, feedId, offset, limit) => {
    return searchArticles(query, feedId, offset, limit);
  });
}
electron.app.whenReady().then(() => {
  startBackend();
  setupIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  stopBackend();
});
