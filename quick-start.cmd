@echo off
setlocal
title 6mang Quick Start

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 24 LTS first.
  echo Download: https://nodejs.org/
  echo After installing, close this window and try again. Node.js must be on PATH.
  pause
  exit /b 1
)

node "%~dp0scripts\quick-start.js" %*
set "SIXMANG_EXIT_CODE=%ERRORLEVEL%"
if not "%SIXMANG_EXIT_CODE%"=="0" pause
exit /b %SIXMANG_EXIT_CODE%
