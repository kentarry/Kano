@echo off
chcp 65001 >nul
title Kano Codex 本機分析服務
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js。請先安裝 Node.js 20 以上版本。
  echo https://nodejs.org/
  pause
  exit /b 1
)

where codex >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Codex CLI。請先安裝並登入 Codex。
  echo npm install -g @openai/codex
  pause
  exit /b 1
)

echo 正在啟動 Kano Codex...
node server.mjs
if errorlevel 1 (
  echo.
  echo [錯誤] 啟動失敗，請保留上方訊息以便排查。
  pause
)
