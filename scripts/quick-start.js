#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

function checkSqliteSupport(loadSqlite = () => require("node:sqlite")) {
  try {
    const { DatabaseSync } = loadSqlite();
    const probe = new DatabaseSync(":memory:");
    probe.close();
  } catch {
    throw new Error(`当前 Node.js ${process.version} 无法使用内置 node:sqlite。请安装 Node.js 24 LTS（或 22.13+），重新打开终端后再启动：https://nodejs.org/`);
  }
}

function ensureEnvFile(rootDir) {
  const destination = path.join(rootDir, ".env");
  if (fs.existsSync(destination)) return false;
  try {
    // COPYFILE_EXCL 同时防止两个启动窗口覆盖刚创建的配置。
    fs.copyFileSync(path.join(rootDir, ".env.example"), destination, fs.constants.COPYFILE_EXCL);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    if (error.code === "ENOENT" && !fs.existsSync(path.join(rootDir, ".env.example"))) return false;
    throw error;
  }
}

function browserUrl(address, configuredHost) {
  // 监听通配地址时，浏览器使用本机地址；其他情况保留 HOST，避免改变浏览器数据所属站点。
  let host = configuredHost || address.address;
  if (host === "0.0.0.0") host = "127.0.0.1";
  if (host === "::" || host === "[::]") host = "::1";
  if (host.includes(":") && !host.startsWith("[")) host = `[${host}]`;
  return `http://${host}:${address.port}`;
}

function browserCommand(url, platform = process.platform, env = process.env) {
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $env:SIXMANG_START_URL -WindowStyle Hidden"],
      options: { env: { ...env, SIXMANG_START_URL: url }, windowsHide: true, stdio: "ignore" },
    };
  }
  if (platform === "darwin") return { command: "open", args: [url], options: { stdio: "ignore" } };
  if (platform === "linux" && (env.DISPLAY || env.WAYLAND_DISPLAY)) {
    return { command: "xdg-open", args: [url], options: { stdio: "ignore" } };
  }
  return null;
}

function openBrowser(url, { platform = process.platform, env = process.env, spawnProcess = spawn, warn = console.warn } = {}) {
  const opener = browserCommand(url, platform, env);
  if (!opener) return;
  const reportFailure = () => warn(`[提示] 无法自动打开浏览器，请手动访问 ${url}`);
  let child;
  try {
    child = spawnProcess(opener.command, opener.args, { ...opener.options, shell: false });
  } catch {
    reportFailure();
    return;
  }
  child.once("error", reportFailure);
  child.once("exit", (code) => { if (code !== 0 && code !== null) reportFailure(); });
  child.unref();
}

function launchServer({
  rootDir = path.resolve(__dirname, ".."),
  open = openBrowser,
  noBrowser = process.argv.includes("--no-browser") || process.env.SIXMANG_NO_BROWSER === "1",
  log = console.log,
  reportError = console.error,
  loadServer = () => require(path.join(rootDir, "server", "server.js")),
} = {}) {
  checkSqliteSupport();
  if (!fs.existsSync(path.join(rootDir, "server", "server.js"))) {
    throw new Error("缺少 server/server.js，请先完整解压或拉取仓库，再运行快速启动文件。");
  }
  process.chdir(rootDir);
  if (ensureEnvFile(rootDir)) log("[提示] 已从 .env.example 创建 .env；API 平台在画布设置中配置。");
  log("正在启动 6mang……关闭此终端窗口或按 Ctrl+C 可停止服务。");

  // 服务在本进程运行，不生成后台服务。只在本次同步加载期间捕获它的 listen，
  // 从真实 listening 事件判断就绪，避免端口占用时误开其他程序。
  const originalListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (...args) {
    this.once("listening", () => {
      const address = this.address();
      if (!address || typeof address === "string") return;
      const url = browserUrl(address, process.env.HOST);
      log(`[已就绪] ${url}`);
      if (!noBrowser) open(url);
    });
    this.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reportError(`[错误] 端口 ${process.env.PORT || 8787} 已被占用。请检查已有的 6mang 启动窗口或其他程序；确认后自行关闭，或修改 .env 的 PORT 再启动。`);
      } else {
        reportError(`[错误] 服务未能启动（${error.code || "未知错误"}）。请检查 .env 的 HOST/PORT 和当前目录的写入权限。`);
      }
      process.exitCode = 1;
    });
    return originalListen.apply(this, args);
  };
  try {
    loadServer();
  } finally {
    http.Server.prototype.listen = originalListen;
  }
}

if (require.main === module) {
  try {
    launchServer();
  } catch (error) {
    console.error(`[错误] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { checkSqliteSupport, ensureEnvFile, browserUrl, browserCommand, openBrowser, launchServer };
