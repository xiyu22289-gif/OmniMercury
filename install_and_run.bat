@echo off
setlocal
echo ==========================================
echo   Summer RSS Reader - Windows Setup
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/3] Cleaning old files...
rmdir /s /q node_modules 2>nul
rmdir /s /q dist 2>nul
echo done.

echo.
echo [2/3] Installing dependencies...
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
set NO_PROXY=*
set no_proxy=*
npm config set registry https://registry.npmmirror.com
call npm install

if not exist "node_modules\electron\package.json" (
    echo.
    echo [ERROR] Install failed. Check network or try closing proxy apps.
    pause
    exit /b 1
)

echo.
echo [3/3] Starting dev server...
rmdir /s /q dist 2>nul
call npm run dev

pause