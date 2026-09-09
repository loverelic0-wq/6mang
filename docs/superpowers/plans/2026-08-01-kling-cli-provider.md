# 6mang 可灵 CLI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 6mang 现有图片/视频节点内提供完整、动态发现、可在设置页 OAuth 的可灵 CLI Provider。

**Architecture:** 新增独立 `server/kling-cli.js` 负责无 shell 子进程、OAuth、能力缓存、素材临时文件和结果归一化；现有 `server/server.js` 只做 Provider 路由和 HTTP 契约。前端把 `kling-cli` 当受管理 Provider，复用现有节点并基于 `who_am_i` 模型声明动态渲染参数。

**Tech Stack:** Node.js 22+ 内置模块（`child_process`、`fs`、`os`、`node:test`）、原生 `http`、vanilla JavaScript、SQLite；零新增 npm 依赖。

## Global Constraints

- 真实入口只修改 `server/` 和 `public/`；不修改根目录旧 file:// 副本。
- 保留工作区现有未提交的分镜助手、换脸、图片对比和视频历史改动。
- 可灵调用不读写 `transactions`、余额和 `api_usage`；现有 HTTP Provider 的先扣费、失败退款结构保持不变。
- OAuth Token 只由 CLI 保存在 `~/.kling/.credentials`，任何 API 都不得返回 Token。
- 所有带用户内容的 CLI 调用使用 `spawn(process.execPath, argv)`，禁止 `shell: true`。
- 不为验证自动提交任何付费生成任务。

---

### Task 1: CLI 进程适配器与基础测试

**Files:**
- Create: `server/kling-cli.js`
- Create: `server/kling-cli.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createKlingCli(options?)`，返回 `{ availability, run, startLogin, loginSnapshot, logout, capabilities, account, tools, submit, queryTask, close }`。
- Produces: `normalizeCapabilities(body)`、`normalizeTask(body, generationId)`、`buildGenerationArgs(request)` 供测试和后端使用。

- [ ] **Step 1: 写 CLI 定位、JSON、错误和超时的失败测试**

```js
test("run parses the final quiet JSON line", async () => {
  const cli = createKlingCli({ cliScriptPath: fixturePath });
  const result = await cli.run(["echo", "ok"], { timeoutMs: 1000 });
  assert.deepEqual(result, { ok: true, body: { value: "ok" } });
});

test("run rejects malformed JSON and timed out commands", async () => {
  await assert.rejects(() => cli.run(["malformed"]), /未返回有效 JSON/);
  await assert.rejects(() => cli.run(["hang"], { timeoutMs: 20 }), /超时/);
});
```

- [ ] **Step 2: 运行单测确认失败**

Run: `node --test server/kling-cli.test.js`

Expected: FAIL，因为 `server/kling-cli.js` 尚不存在。

- [ ] **Step 3: 实现无 shell 的 CLI runner 和定位逻辑**

```js
function runCli(args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliScriptPath, ...args, "--quiet"], {
      cwd: rootDir,
      env: { ...process.env, KLING_NONINTERACTIVE: "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // 限制输出、超时 kill、解析 stdout 最后一个非空 JSON 行。
  });
}
```

- [ ] **Step 4: 实现 OAuth 单例进程状态机**

```js
const loginState = { status: "idle", startedAt: "", finishedAt: "", error: "" };

function startLogin() {
  if (loginChild) return loginSnapshot();
  loginState.status = "waiting";
  loginChild = spawn(process.execPath, [cliScriptPath, "login", "--quiet"], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return loginSnapshot();
}
```

- [ ] **Step 5: 运行测试确认通过并增加 test 脚本**

Run: `node --test server/kling-cli.test.js`

Expected: PASS。

`package.json` 增加：

```json
"test": "node --test server/*.test.js"
```

### Task 2: 能力、命令参数、素材和任务归一化

**Files:**
- Modify: `server/kling-cli.js`
- Modify: `server/kling-cli.test.js`

**Interfaces:**
- Consumes: Task 1 的 `createKlingCli()`。
- Produces: `capabilities({force})` 返回 `{ user, tools, providers: {image, video}, raw }`。
- Produces: `submit({tool, model, prompt, params, images, rationale})` 返回 `{adapter,id,status}`。
- Produces: `queryTask(id)` 返回 `{adapter,id,status,urls,video_url,error,raw}`。

- [ ] **Step 1: 写能力归一化和模型合并失败测试**

```js
const caps = normalizeCapabilities({ availableModels: {
  text_to_video: { models: [{ model: "v3", alias: "可灵3.0", arguments: [], inputs: [] }] },
  image_to_video: { models: [{ model: "v3", alias: "可灵3.0", arguments: [{name:"duration", allowedValues:["5","10"]}], inputs: [{name:"first_image", required:true}] }] },
}});
assert.deepEqual(caps.providers.video.models[0].tools, ["text_to_video", "image_to_video"]);
assert.equal(caps.providers.video.models[0].specs.image_to_video.inputs[0].name, "first_image");
```

- [ ] **Step 2: 写四类生成命令映射失败测试**

```js
assert.deepEqual(buildGenerationArgs({
  tool: "image_to_video", model: "v3", prompt: "移动", params: {duration:"5"}, images:["a.png","b.png"],
}), ["image_to_video", "--model", "v3", "--duration", "5", "--image", "a.png", "--tailImage", "b.png", "移动"]);
```

- [ ] **Step 3: 写 data URL 临时文件和清理失败测试**

测试 PNG/JPEG 扩展名、30MB 限制、提交结束清理独立临时目录；远程 `https://` URL 不落盘。

- [ ] **Step 4: 实现能力缓存、参数白名单和素材映射**

只允许把当前模型 `arguments` 中声明的名称传给 CLI；`prompt`、`model`、`poll`、`quiet` 不从前端动态参数覆盖。`first_image/tail_image` 使用 `--image/--tailImage`，`image_1..image_7` 使用重复 `--image`。

- [ ] **Step 5: 实现任务状态和媒体 URL 归一化**

```js
function normalizeStatus(status) {
  if (["succeed", "succeeded", "success", "completed", "partial_completed"].includes(status)) return "succeeded";
  if (["failed", "error", "canceled", "cancelled", "expired"].includes(status)) return "failed";
  return "processing";
}
```

递归收集 `urlWithoutWatermark`、`url`、`video_url`、`image_url`，保持完整查询参数并去重。

- [ ] **Step 6: 运行适配器测试**

Run: `npm test`

Expected: 全部 PASS，且测试结束后临时目录不存在。

### Task 3: 后端 Provider 与 HTTP 路由

**Files:**
- Modify: `server/server.js`
- Modify: `server/kling-cli.test.js`

**Interfaces:**
- Consumes: `const kling = createKlingCli({rootDir})`。
- Produces: 受管理 Provider `kling-cli`；OAuth/账户/工具/任务接口；现有图片和视频创建接口的可灵分支。

- [ ] **Step 1: 写受管理 Provider 注入与计费判定测试**

```js
assert.equal(isKlingProvider({ adapter: "kling-cli" }), true);
assert.equal(usesCanvasBilling({ adapter: "kling-cli" }), false);
assert.equal(usesCanvasBilling({ adapter: "http" }), true);
```

- [ ] **Step 2: 扩展 Provider schema 并强制注入可灵**

`normalizeProviderItem()` 保留 `adapter/managed`；`ensureManagedProviders()` 给 image/video 注入 `kling-cli`。`publicProvidersStatus()` 用 `kling.capabilities()` 缓存覆盖动态模型，并只暴露 `configured/installed/authenticated/models`。

- [ ] **Step 3: 添加管理员 OAuth 与诊断路由**

```js
if (url.pathname === "/api/kling/login" && req.method === "POST") {
  requireAdminOrThrow(req);
  sendJson(res, 202, await kling.startLogin());
  return;
}
```

同组实现 `/status`、`/logout`、`/refresh`、`/account`、`/tools`；登录/退出/账户要求管理员。

- [ ] **Step 4: 添加统一任务查询路由**

解析 `/api/kling/tasks/<generationId>`，要求画布用户登录，调用 `kling.queryTask()`，返回归一化契约。

- [ ] **Step 5: 在图片/视频创建入口添加免画布计费分支**

```js
if (isKlingProvider(provider)) {
  const tool = body.images?.length ? "image_to_image" : "text_to_image";
  sendJson(res, 200, await kling.submit({ tool, model, prompt: body.prompt, params: body.dynamicParams, images: body.images }));
  return;
}
```

视频同理；这段必须位于 `adjustBalance(-cost)` 之前。HTTP 分支原有扣费、退款、记账代码不移动。

- [ ] **Step 6: 运行测试与语法检查**

Run: `npm test`

Run: `node --check server/server.js`

Expected: 全部 PASS。

### Task 4: 设置页 OAuth、账户和受管理 Provider

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `/api/status` 中 `adapter/managed/configured/models`；`/api/kling/*` 管理接口。
- Produces: 设置页登录、退出、刷新、账户展示；受管理 Provider 不可删除或手工改 Base URL/Key/模型。

- [ ] **Step 1: 添加客户端可灵状态与刷新函数**

```js
let klingUiState = { installed: false, authenticated: false, login: {status:"idle"}, account: null };
async function refreshKlingUi({force = false} = {}) {
  klingUiState = await apiFetch(`/api/kling/status${force ? "?refresh=1" : ""}`);
  await loadBackendStatus();
}
```

- [ ] **Step 2: 为 managed Provider 渲染专用编辑器**

显示 CLI 版本、OAuth 状态、账号、会员、剩余积分、能力更新时间和“登录/重新登录、退出、刷新能力”按钮；不渲染通用 Key 编辑器。

- [ ] **Step 3: 实现 OAuth 轮询**

登录按钮 POST `/api/kling/login`，每 1500ms 查询状态；成功或失败停止，最长五分钟。关闭设置对话框时清理前端定时器，但不杀后端登录进程。

- [ ] **Step 4: 保护受管理 Provider**

隐藏删除、添加模型和修改字段；保存设置时保留 `adapter/managed`，服务端仍做最终强制注入。

- [ ] **Step 5: 添加状态样式并做静态检查**

Run: `node --check public/app.js`

Expected: PASS。

### Task 5: 节点动态模型、参数和可灵异步生成

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: Provider 模型项 `{id,label,tools,specs}`。
- Produces: `klingToolForNode(node)`、`klingSpecForNode(node)`、`renderKlingDynamicParams(node)`、`getKlingDynamicParams(node)`、`pollKlingTask(id)`。

- [ ] **Step 1: 实现按节点输入选择工具与过滤模型**

图片无图/有图映射 `text_to_image/image_to_image`；视频无图/有图映射 `text_to_video/image_to_video`。模型下拉只展示声明支持当前工具的模型。

- [ ] **Step 2: 动态渲染参数**

跳过 `prompt`；枚举用 select，布尔枚举显示“开启/关闭”，自由参数用 input；显示 required、default 和 description。值保存到 `node.data.dynamicParams["kling-cli"][model]`。

- [ ] **Step 3: 参数与素材提交前校验**

拒绝未声明参数、非法枚举、缺少 required 输入和参考视频；错误指出具体字段。可选参数未改动时不提交，让 CLI 默认值生效。

- [ ] **Step 4: 扩展图片请求的可灵异步轮询**

`requestImageGeneration()` 收到 `{adapter:"kling-cli",id}` 后调用 `pollKlingTask()`；成功时包装为 `{data:[{url}]}`，让故事板、换脸、扩图等现有调用方继续复用 `extractImageSource()`。

- [ ] **Step 5: 扩展视频请求与轮询**

提交 `dynamicParams`；`requestVideoQuery()` 在 `providerId === "kling-cli"` 时改用 `/api/kling/tasks/<id>`。成功后继续执行 `recordProjectHistory()` 和本地回流地址替换。

- [ ] **Step 6: 节点 UI 样式与语法检查**

Run: `node --check public/app.js`

Expected: PASS。

### Task 6: 全链路验证、文档与记忆

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `E:/AI/AI项目/obstian/Codex/projects/6mang.md`

**Interfaces:**
- Consumes: 前五项全部交付。
- Produces: 可复现的启动、OAuth、节点使用和故障排查说明。

- [ ] **Step 1: 更新项目文档**

记录 Node 22+、`npm install -g @klingai/cli-cn`、设置页 OAuth、动态模型参数、可灵免画布计费、结果 24 小时 URL 会立即落盘，以及可选 `KLING_CLI_JS` 覆盖路径。

- [ ] **Step 2: 运行自动验证**

Run: `npm test`

Run: `node --check server/server.js`

Run: `node --check public/app.js`

Expected: 全部退出码 0。

- [ ] **Step 3: 启动本地服务做只读 API 验证**

启动 `node server/server.js`，验证 `/api/status` 可返回 `kling-cli` 图片/视频 Provider；使用已存在 OAuth 只读调用 `who_am_i` 和 `account`，不提交生成。

- [ ] **Step 4: 浏览器回归**

验证设置页可灵卡片、登录状态、图片/视频 Provider 模型过滤、动态参数控件、普通 HTTP Provider 设置仍可编辑；控制台无未捕获错误。

- [ ] **Step 5: 检查工作区边界**

Run: `git diff --check`

Run: `git status --short`

确认没有覆盖用户已有修改、没有凭据/Token/临时素材进入 Git、没有付费生成记录。

- [ ] **Step 6: 更新长期项目记忆**

在 `Codex/projects/6mang.md` 追加已验证架构、命令入口、免计费边界、OAuth 凭据边界和测试命令，不记录账户 ID、积分、Token 或 CLI 日志内容。
