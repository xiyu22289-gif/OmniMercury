"use strict";
const electron = require("electron");
const api = {
  addFeed: (url) => electron.ipcRenderer.invoke("backend:addFeed", url),
  listFeeds: () => electron.ipcRenderer.invoke("backend:listFeeds"),
  refreshFeeds: () => electron.ipcRenderer.invoke("backend:refreshFeeds"),
  getArticles: (feedId, offset, limit) => electron.ipcRenderer.invoke("backend:getArticles", feedId, offset, limit),
  getArticleContent: (articleId) => electron.ipcRenderer.invoke("backend:getArticleContent", articleId),
  removeFeed: (feedId) => electron.ipcRenderer.invoke("backend:removeFeed", feedId),
  searchArticles: (query, feedId, offset, limit) => electron.ipcRenderer.invoke("backend:searchArticles", query, feedId, offset, limit)
};
electron.contextBridge.exposeInMainWorld("api", api);
