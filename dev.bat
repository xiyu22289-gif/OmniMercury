@echo off
REM ============================================================
REM Summer RSS Reader — Windows 原生开发启动
REM 在 CMD 中双击运行，或拖入 PowerShell 执行
REM ============================================================
echo.

REM ---- 1. 清除代理环境变量 ----
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=

REM ---- 2. 切到项目目录 ----
cd /d "%~dp0"

REM ---- 3. 清理上次构建 ----
if exist dist rmdir /s /q dist

REM ---- 4. 安装依赖（仅首次或 node_modules 缺失时） ----
if not exist node_modules (
    echo [安装依赖...]
    call npm install
)

REM ---- 5. 启动 ----
echo [启动 Summer RSS Reader 开发服务器...]
call npm run dev
pause