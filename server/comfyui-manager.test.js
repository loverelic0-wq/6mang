const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createComfyUiManager } = require("./comfyui-manager");

function fixture() {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), "6mang-comfyui-"));
  fs.mkdirSync(path.join(installDir, "ComfyUI"));
  fs.mkdirSync(path.join(installDir, "python_embeded"));
  fs.writeFileSync(path.join(installDir, "ComfyUI", "main.py"), "# test");
  fs.writeFileSync(path.join(installDir, "python_embeded", "python.exe"), "test");
  return installDir;
}

function provider(installDir, overrides = {}) {
  return {
    adapter: "comfyui",
    baseUrl: "http://127.0.0.1:8190",
    autoStart: true,
    installDir,
    pythonPath: path.join(installDir, "python_embeded", "python.exe"),
    readyPollMs: 1,
    readyTimeoutMs: 100,
    ...overrides,
  };
}

test("未配置安装目录时明确报错，不猜测发布者的电脑路径", async () => {
  const manager = createComfyUiManager({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    spawnImpl: () => { throw new Error("should not spawn"); },
  });
  await assert.rejects(() => manager.ensureReady({ autoStart: true }), /未配置 ComfyUI 安装目录/);
});

test("复用已经运行的 ComfyUI，不启动新进程", async () => {
  let spawnCount = 0;
  const manager = createComfyUiManager({
    spawnImpl: () => { spawnCount += 1; throw new Error("should not spawn"); },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  const result = await manager.ensureReady(provider(""));
  assert.equal(result.ready, true);
  assert.equal(result.started, false);
  assert.equal(result.reused, true);
  assert.equal(spawnCount, 0);
});

test("ComfyUI 未运行时启动隐藏进程并等待 API 就绪", async () => {
  const installDir = fixture();
  let spawnOptions;
  let probes = 0;
  const child = new EventEmitter();
  child.pid = 4321;
  const manager = createComfyUiManager({
    logRoot: path.join(installDir, "logs"),
    spawnImpl: (command, args, options) => {
      spawnOptions = { command, args, options };
      return child;
    },
    fetchImpl: async () => ({ ok: ++probes >= 2, status: probes >= 2 ? 200 : 503 }),
    setTimeoutImpl: (resolve) => setImmediate(resolve),
  });
  const result = await manager.ensureReady(provider(installDir));
  assert.equal(result.ready, true);
  assert.equal(result.started, true);
  assert.equal(result.pid, 4321);
  assert.equal(spawnOptions.command, path.join(installDir, "python_embeded", "python.exe"));
  assert.deepEqual(spawnOptions.args, ["-s", path.join("ComfyUI", "main.py"), "--windows-standalone-build", "--listen", "127.0.0.1", "--port", "8190"]);
  assert.equal(spawnOptions.options.cwd, installDir);
  assert.equal(spawnOptions.options.windowsHide, process.platform === "win32");
  fs.rmSync(installDir, { recursive: true, force: true });
});

test("关闭自动启动时返回明确错误", async () => {
  const manager = createComfyUiManager({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => manager.ensureReady(provider("", { autoStart: false })), /未运行.*自动启动/);
});

test("stop 只关闭管理器自己启动的 ComfyUI", async () => {
  const installDir = fixture();
  const child = new EventEmitter();
  child.pid = 8765;
  let killed = 0;
  child.kill = () => { killed += 1; };
  let probes = 0;
  const manager = createComfyUiManager({
    spawnImpl: () => child,
    fetchImpl: async () => ({ ok: ++probes > 1, status: probes > 1 ? 200 : 503 }),
    setTimeoutImpl: (resolve) => resolve(),
  });
  const config = provider(installDir, { keepAlive: false });
  await manager.ensureReady(config);
  assert.equal(manager.stop(config), true);
  assert.equal(killed, 1);
  assert.equal(manager.stop(config), false);
  fs.rmSync(installDir, { recursive: true, force: true });
});

test("启动进程提前退出时不继续等待", async () => {
  const installDir = fixture();
  const child = new EventEmitter();
  child.pid = 7654;
  const manager = createComfyUiManager({
    spawnImpl: () => {
      process.nextTick(() => child.emit("exit", 1, null));
      return child;
    },
    fetchImpl: async () => ({ ok: false, status: 503 }),
    setTimeoutImpl: (resolve) => setImmediate(resolve),
  });
  await assert.rejects(() => manager.ensureReady(provider(installDir)), /启动进程已退出/);
  fs.rmSync(installDir, { recursive: true, force: true });
});
