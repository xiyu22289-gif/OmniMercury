#!/usr/bin/env bash
# Summer RSS Reader - 开发启动脚本
# 用法（在 WSL/Linux 终端中）:
#   cd /mnt/c/Users/wo_sh/OmniMercury
#   bash dev.sh
# 或:
#   chmod +x dev.sh && ./dev.sh

set -e

# 加载 nvm（如果存在）
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi

# 切换到项目目录
cd "$(dirname "$0")"

# 清理上次构建产物
rm -rf dist

# 启动开发服务器
echo "> 启动 Summer RSS Reader 开发服务器..."
npm run dev