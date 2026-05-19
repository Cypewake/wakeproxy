@echo off
chcp 65001 >nul
echo ========================================
echo 学习通助手 - Deno Deploy 代理部署脚本
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 检查 Deno 是否已安装...
deno --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Deno 未安装！
    echo 请先安装 Deno: irm https://deno.land/install.ps1 | iex
    pause
    exit /b 1
)
echo [成功] Deno 已安装
echo.

echo [2/4] 检查 deployctl 是否已安装...
deployctl --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] deployctl 未安装，正在安装...
    deno install -gArf jsr:@deno/deployctl
    if %errorlevel% neq 0 (
        echo [错误] deployctl 安装失败！
        pause
        exit /b 1
    )
)
echo [成功] deployctl 已安装
echo.

echo [3/4] 检查 .env 文件...
if not exist ".env" (
    echo [提示] .env 文件不存在，正在从 .env.example 复制...
    copy .env.example .env
    echo.
    echo [重要] 请先编辑 .env 文件，填入 Supabase 配置！
    echo 文件位置: %CD%\.env
    echo.
    pause
    exit /b 0
)
echo [成功] .env 文件已存在
echo.

echo [4/4] 开始部署到 Deno Deploy...
echo.
deployctl deploy --project=wakeproxy --env-file=.env

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo [成功] 部署完成！
    echo ========================================
    echo.
    echo 请记录部署输出的 URL（类似 https://xuetong-proxy-xxxxx.deno.dev）
    echo 然后将此 URL 配置到脚本的 PROXY_API_URL 变量中
    echo.
) else (
    echo.
    echo ========================================
    echo [错误] 部署失败！
    echo ========================================
    echo.
    echo 请检查：
    echo 1. 是否已登录 Deno Deploy（deployctl login）
    echo 2. .env 文件中的配置是否正确
    echo.
)

pause
