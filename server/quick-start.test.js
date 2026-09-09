const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once, EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const { checkSqliteSupport, ensureEnvFile, browserUrl, browserCommand, openBrowser } = require("../scripts/quick-start");

const repoRoot = path.resolve(__dirname, "..");
const posixShell = process.env.SIXMANG_TEST_SHELL || (process.platform === "win32" ? null : "/bin/sh");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "6mang 启动测试 空格 & (括号)-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return directory;
}

function makeAppFixture(t, envText) {
  const rootDir = temporaryDirectory(t);
  for (const directory of ["scripts", "server", "public"]) fs.mkdirSync(path.join(rootDir, directory));
  for (const name of fs.readdirSync(path.join(repoRoot, "server"))) {
    if (name.endsWith(".js") && !name.endsWith(".test.js")) {
      fs.copyFileSync(path.join(repoRoot, "server", name), path.join(rootDir, "server", name));
    }
  }
  for (const name of ["gpt-image-2-sizes.js", "gpt-image-models.js"]) {
    fs.copyFileSync(path.join(repoRoot, "public", name), path.join(rootDir, "public", name));
  }
  for (const name of ["quick-start.cmd", "quick-start.command", "quick-start.sh", "scripts/quick-start.js"]) {
    fs.copyFileSync(path.join(repoRoot, name), path.join(rootDir, name));
  }
  fs.writeFileSync(path.join(rootDir, "public", "index.html"), "<title>6mang 启动测试</title>");
  fs.writeFileSync(path.join(rootDir, ".env.example"), envText);
  return rootDir;
}

function startFixture(t, rootDir, { command = process.execPath, args, env = {}, windowsVerbatimArguments = false } = {}) {
  const source = `
    const { launchServer } = require(${JSON.stringify(path.join(rootDir, "scripts", "quick-start.js"))});
    launchServer({ noBrowser: false, open: async (url) => {
      const response = await fetch(url);
      console.log("BROWSER_TEST " + JSON.stringify({ url, status: response.status, body: await response.text() }));
    }});
  `;
  const child = spawn(command, args || ["-e", source], {
    cwd: os.tmpdir(),
    env: { ...process.env, HOST: "", PORT: "", ADMIN_PASSWORD: "fixture-password-only", ADMIN_TOKEN: "", SIXMANG_NO_BROWSER: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    windowsVerbatimArguments,
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  });
  return { child, exited, output: () => output };
}

async function waitForOutput(fixture, marker) {
  const deadline = Date.now() + 10000;
  while (!fixture.output().includes(marker)) {
    assert.equal(fixture.child.exitCode, null, `应用提前退出：${fixture.output()}`);
    assert.ok(Date.now() < deadline, `等待启动超时：${fixture.output()}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return fixture.output();
}

test("启动探测实际可用的 SQLite，并给不支持的 Node 清晰提示", () => {
  assert.doesNotThrow(() => checkSqliteSupport());
  assert.throws(() => checkSqliteSupport(() => { throw new Error("unavailable"); }), /node:sqlite.*24 LTS.*22\.13\+/);
  assert.throws(() => checkSqliteSupport(() => ({ DatabaseSync: class { constructor() { throw new Error("disabled"); } } })), /node:sqlite/);
});

test("只在 .env 缺失时复制模板，已有配置保持逐字节不变", (t) => {
  const rootDir = temporaryDirectory(t);
  const original = "HOST='localhost'\r\nPORT=12345\r\nPRIVATE_TEST_VALUE=do-not-replace\r\n";
  fs.writeFileSync(path.join(rootDir, ".env.example"), original);
  assert.equal(ensureEnvFile(rootDir), true);
  assert.equal(fs.readFileSync(path.join(rootDir, ".env"), "utf8"), original);
  fs.writeFileSync(path.join(rootDir, ".env.example"), "PORT=9999\n");
  assert.equal(ensureEnvFile(rootDir), false);
  assert.equal(fs.readFileSync(path.join(rootDir, ".env"), "utf8"), original);
  fs.unlinkSync(path.join(rootDir, ".env.example"));
  assert.equal(ensureEnvFile(rootDir), false);
});

test("模板缺失时可沿用应用默认配置", (t) => {
  assert.equal(ensureEnvFile(temporaryDirectory(t)), false);
});

test("浏览器地址保留 HOST，并正确处理 IPv4/IPv6 通配监听", () => {
  const address = { address: "127.0.0.1", port: 23456 };
  assert.equal(browserUrl(address, "localhost"), "http://localhost:23456");
  assert.equal(browserUrl(address, "0.0.0.0"), "http://127.0.0.1:23456");
  assert.equal(browserUrl({ address: "::", port: 23456 }), "http://[::1]:23456");
  assert.equal(browserUrl(address, "::1"), "http://[::1]:23456");
});

test("各系统浏览器启动不经过 shell，Windows 隐藏辅助窗口，无桌面的 Linux 不调用打开程序", () => {
  const url = "http://127.0.0.1:23456";
  const windows = browserCommand(url, "win32", {});
  assert.equal(windows.options.windowsHide, true);
  assert.equal(windows.options.env.SIXMANG_START_URL, url);
  assert.ok(!windows.args.some((arg) => arg.includes(url)), "URL 通过独立环境变量传入，不拼进 PowerShell 代码");
  assert.equal(browserCommand(url, "darwin", {}).command, "open");
  assert.equal(browserCommand(url, "linux", { DISPLAY: ":0" }).command, "xdg-open");
  assert.equal(browserCommand(url, "linux", { WAYLAND_DISPLAY: "wayland-0" }).command, "xdg-open");
  let calls = 0;
  openBrowser(url, { platform: "linux", env: {}, spawnProcess: () => { calls += 1; } });
  assert.equal(calls, 0);
  openBrowser(url, { platform: "darwin", env: {}, spawnProcess: (command, args, options) => {
    calls += 1;
    assert.equal(options.shell, false);
    assert.deepEqual(args, [url]);
    const child = new EventEmitter();
    child.unref = () => {};
    return child;
  } });
  assert.equal(calls, 1);
});

test("默认浏览器无法打开时仍保留手动访问地址", () => {
  const messages = [];
  openBrowser("http://127.0.0.1:23456", { platform: "darwin", spawnProcess: () => {
    throw new Error("missing opener");
  }, warn: (message) => messages.push(message) });
  assert.match(messages.join("\n"), /手动访问 http:\/\/127\.0\.0\.1:23456/);
});

test("从中文与空格路径启动真实服务，只在就绪后打开浏览器，停止后释放自己的端口", { timeout: 15000 }, async (t) => {
  const rootDir = makeAppFixture(t, "HOST='localhost'\nPORT=0\n");
  const fixture = startFixture(t, rootDir);
  const output = await waitForOutput(fixture, "BROWSER_TEST ");
  const opened = JSON.parse(output.match(/BROWSER_TEST (.+)/)[1]);
  assert.match(opened.url, /^http:\/\/localhost:\d+$/);
  assert.equal(opened.status, 200);
  assert.match(opened.body, /6mang 启动测试/);
  assert.ok(output.indexOf("[已就绪]") < output.indexOf("BROWSER_TEST"));
  assert.equal(fs.readFileSync(path.join(rootDir, ".env"), "utf8"), "HOST='localhost'\nPORT=0\n");
  const port = Number(new URL(opened.url).port);
  fixture.child.kill("SIGINT");
  await fixture.exited;
  const replacement = http.createServer();
  replacement.listen(port, "localhost");
  await once(replacement, "listening");
  await new Promise((resolve) => replacement.close(resolve));
});

test("端口被其他程序占用时不打开浏览器、不终止其他程序，也不覆盖已有 .env", { timeout: 15000 }, async (t) => {
  const otherServer = http.createServer((req, res) => res.end("other-app-still-running"));
  otherServer.listen(0, "127.0.0.1");
  await once(otherServer, "listening");
  t.after(() => new Promise((resolve) => otherServer.close(resolve)));
  const port = otherServer.address().port;
  const rootDir = makeAppFixture(t, "HOST=localhost\nPORT=9999\n");
  const existingEnv = `HOST="127.0.0.1"\r\nPORT=${port}\r\nPRIVATE_TEST_VALUE=untouched\r\n`;
  fs.writeFileSync(path.join(rootDir, ".env"), existingEnv);
  const fixture = startFixture(t, rootDir);
  const [code] = await fixture.exited;
  assert.equal(code, 1);
  assert.match(fixture.output(), /已被占用/);
  assert.doesNotMatch(fixture.output(), /BROWSER_TEST|已就绪/);
  assert.equal(fs.readFileSync(path.join(rootDir, ".env"), "utf8"), existingEnv);
  assert.equal(await fetch(`http://127.0.0.1:${port}`).then((response) => response.text()), "other-app-still-running");
});

test("Windows 双击入口可从其他工作目录启动含中文、空格与符号的路径", { skip: process.platform !== "win32", timeout: 15000 }, async (t) => {
  const rootDir = makeAppFixture(t, "HOST=127.0.0.1\nPORT=0\n");
  // 独立的短生命周期 HTTP 服务，避免测试退出 cmd 时留下子进程。
  fs.writeFileSync(path.join(rootDir, "server", "server.js"), `
    const server = require("node:http").createServer((req, res) => res.end("ok"));
    server.listen(0, "127.0.0.1", () => setTimeout(() => server.close(), 100));
  `);
  const fixture = startFixture(t, rootDir, {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `""${path.join(rootDir, "quick-start.cmd")}" --no-browser"`],
    windowsVerbatimArguments: true,
  });
  const [code] = await fixture.exited;
  assert.equal(code, 0, fixture.output());
  assert.match(fixture.output(), /已就绪.*http:\/\/127\.0\.0\.1:/);
});

test("POSIX 快速启动入口支持 NODE_BINARY 的绝对路径与中文空格目录", { skip: !posixShell, timeout: 15000 }, async (t) => {
  const rootDir = makeAppFixture(t, "HOST=127.0.0.1\nPORT=0\n");
  fs.writeFileSync(path.join(rootDir, "server", "server.js"), `
    const server = require("node:http").createServer((req, res) => res.end("ok"));
    server.listen(0, "127.0.0.1", () => setTimeout(() => server.close(), 100));
  `);
  for (const entry of ["quick-start.sh", "quick-start.command"]) {
    const fixture = startFixture(t, rootDir, {
      command: posixShell,
      args: [path.join(rootDir, entry), "--no-browser"],
      env: { NODE_BINARY: process.execPath.replaceAll("\\", "/") },
    });
    const [code] = await fixture.exited;
    assert.equal(code, 0, fixture.output());
    assert.match(fixture.output(), /已就绪.*http:\/\/127\.0\.0\.1:/);
  }
});

test("POSIX 快速启动在指定 Node 不存在时提示安装与 PATH 修复", { skip: !posixShell, timeout: 15000 }, async (t) => {
  const rootDir = makeAppFixture(t, "HOST=127.0.0.1\nPORT=0\n");
  const fixture = startFixture(t, rootDir, {
    command: posixShell,
    args: [path.join(rootDir, "quick-start.sh"), "--no-browser"],
    env: { NODE_BINARY: "/nonexistent-sixmang-test-runtime/node" },
  });
  const [code] = await fixture.exited;
  assert.equal(code, 1);
  assert.match(fixture.output(), /没有找到 Node\.js/);
  assert.match(fixture.output(), /NODE_BINARY/);
  assert.doesNotMatch(fixture.output(), /已就绪/);
  assert.equal(fs.existsSync(path.join(rootDir, ".env")), false);
});
