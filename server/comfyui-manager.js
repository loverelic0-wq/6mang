const fs = require("node:fs");
const path = require("node:path");
const { spawn: defaultSpawn } = require("node:child_process");

const DEFAULT_PORT = 8190;
const DEFAULT_READY_TIMEOUT_MS = 120000;
const DEFAULT_POLL_MS = 500;

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  return raw ? raw.replace(/\/$/, "") : `http://127.0.0.1:${DEFAULT_PORT}`;
}

function defaultInstallDir() {
  return "";
}

function defaultPythonPath(installDir) {
  if (!installDir) return "";
  return path.join(installDir, process.platform === "win32" ? "python_embeded\\python.exe" : "python_embeded/python");
}

function defaultLaunchArgs(provider) {
  const port = Number(provider?.port) || DEFAULT_PORT;
  return [
    "-s",
    path.join("ComfyUI", "main.py"),
    "--windows-standalone-build",
    "--listen",
    "127.0.0.1",
    "--port",
    String(port),
  ];
}

function wait(ms, setTimeoutImpl) {
  return new Promise((resolve) => setTimeoutImpl(resolve, ms));
}

function responseLooksReady(response) {
  return Boolean(response && (response.ok || response.status === 200));
}

function createComfyUiManager(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const spawnImpl = options.spawnImpl || defaultSpawn;
  const setTimeoutImpl = options.setTimeoutImpl || setTimeout;
  const logger = options.logger || console;
  const logRoot = options.logRoot || path.join(options.rootDir || process.cwd(), "data");
  const active = new Map();

  async function probe(provider) {
    const baseUrl = normalizeBaseUrl(provider?.baseUrl);
    try {
      const response = await fetchImpl(`${baseUrl}/system_stats`, { method: "GET", headers: { Accept: "application/json" } });
      return { ready: responseLooksReady(response), baseUrl };
    } catch (error) {
      return { ready: false, baseUrl, error };
    }
  }

  function launchConfig(provider) {
    const installDir = String(provider?.installDir || defaultInstallDir()).trim();
    const pythonPath = String(provider?.pythonPath || defaultPythonPath(installDir)).trim();
    const port = Number(provider?.port) || DEFAULT_PORT;
    const args = Array.isArray(provider?.launchArgs) && provider.launchArgs.length
      ? provider.launchArgs.map(String)
      : defaultLaunchArgs({ ...provider, port });
    return { installDir, pythonPath, port, args };
  }

  function ensureLogDir() {
    try { fs.mkdirSync(logRoot, { recursive: true }); } catch {}
  }

  function startProcess(provider) {
    const config = launchConfig(provider);
    if (!config.installDir) throw new Error("未配置 ComfyUI 安装目录");
    if (!config.pythonPath) throw new Error("未配置 ComfyUI Python 路径");
    if (!fs.existsSync(config.pythonPath)) throw new Error(`未找到 ComfyUI Python：${config.pythonPath}`);
    if (!fs.existsSync(path.join(config.installDir, "ComfyUI", "main.py"))) {
      throw new Error(`未找到 ComfyUI 主程序：${path.join(config.installDir, "ComfyUI", "main.py")}`);
    }

    ensureLogDir();
    const logPath = path.join(logRoot, `comfyui-${config.port}.log`);
    let logFd = null;
    try { logFd = fs.openSync(logPath, "a"); } catch {}
    const child = spawnImpl(config.pythonPath, config.args, {
      cwd: config.installDir,
      windowsHide: process.platform === "win32",
      // ComfyUI is a user-facing local service. Keep it alive when the
      // 6mang process exits so a slow model load is not interrupted and the
      // next 6mang session can reuse the already-loaded instance.
      detached: true,
      stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"],
    });
    child.unref?.();
    const entry = { child, baseUrl: normalizeBaseUrl(provider?.baseUrl), logPath, startedAt: Date.now(), ready: false };
    child.once?.("error", (error) => { entry.error = error; });
    child.once?.("exit", (code, signal) => {
      entry.exit = { code, signal };
      if (logFd !== null) {
        try { fs.closeSync(logFd); } catch {}
        logFd = null;
      }
    });
    logger.log?.(`[comfyui] started ${config.pythonPath} ${config.args.join(" ")}`);
    return entry;
  }

  async function waitUntilReady(provider, entry, timeoutMs = DEFAULT_READY_TIMEOUT_MS, pollMs = DEFAULT_POLL_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (entry.error) throw new Error(`启动 ComfyUI 失败：${entry.error.message}`);
      if (entry.exit) throw new Error(`ComfyUI 启动进程已退出（代码 ${entry.exit.code ?? "未知"}）`);
      const status = await probe(provider);
      if (status.ready) {
        entry.ready = true;
        return { ...status, started: true, pid: entry.child?.pid || null, logPath: entry.logPath };
      }
      await wait(pollMs, setTimeoutImpl);
    }
    throw new Error(`等待 ComfyUI 就绪超时，请检查日志：${entry.logPath}`);
  }

  async function ensureReady(provider) {
    const existing = await probe(provider);
    if (existing.ready) return { ...existing, started: false, reused: true };
    if (provider?.autoStart !== true) {
      throw new Error("ComfyUI 未运行，且当前 Provider 未开启自动启动");
    }

    const key = normalizeBaseUrl(provider?.baseUrl);
    const existingEntry = active.get(key);
    if (existingEntry?.exit || existingEntry?.error) active.delete(key);
    if (active.has(key) && active.get(key).ready) {
      const stillReady = await probe(provider);
      if (stillReady.ready) return { ...stillReady, started: true, reused: true, pid: active.get(key).child?.pid || null, logPath: active.get(key).logPath };
      active.delete(key);
    }
    if (!active.has(key)) {
      const entry = startProcess(provider);
      entry.promise = waitUntilReady(provider, entry, Number(provider?.readyTimeoutMs) || DEFAULT_READY_TIMEOUT_MS, Number(provider?.readyPollMs) || DEFAULT_POLL_MS)
        .finally(() => {
          if (!entry.ready) active.delete(key);
        });
      active.set(key, entry);
    }
    return active.get(key).promise;
  }

  async function status(provider) {
    const result = await probe(provider);
    const entry = active.get(result.baseUrl);
    return {
      ...result,
      managed: Boolean(entry),
      starting: Boolean(entry && !entry.ready),
      pid: entry?.child?.pid || null,
      startedAt: entry?.startedAt || null,
      logPath: entry?.logPath || null,
    };
  }

  function stop(provider) {
    const key = normalizeBaseUrl(provider?.baseUrl);
    const entry = active.get(key);
    if (!entry) return false;
    active.delete(key);
    try { entry.child?.kill?.(); } catch {}
    return true;
  }

  return { probe, ensureReady, status, stop, launchConfig, active };
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_READY_TIMEOUT_MS,
  createComfyUiManager,
};
