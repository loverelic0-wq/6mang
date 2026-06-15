@echo off
setlocal
title 6mang Quick Start

cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT=8787"

if not exist package.json (
  echo [ERROR] package.json was not found. Please run this file from the project root.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js LTS first: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please reinstall Node.js LTS.
  pause
  exit /b 1
)

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo [INFO] Created .env from .env.example.
    echo [INFO] Configure API providers in the app settings panel after first login.
  ) else (
    echo [INFO] .env.example was not found. The app will use default settings.
  )
)

if exist .env (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="HOST" set "HOST=%%B"
    if /i "%%A"=="PORT" set "PORT=%%B"
  )
)

set "APP_URL=http://%HOST%:%PORT%"
echo.
echo Starting 6mang...
echo URL: %APP_URL%
echo.
echo Close this window to stop the server.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2; Start-Process '%APP_URL%'" >nul 2>nul
npm run dev

echo.
echo Server stopped.
pause
