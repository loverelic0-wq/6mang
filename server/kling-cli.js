const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const GENERATION_TOOLS = ["text_to_image", "image_to_image", "text_to_video", "image_to_video"];

function isBlockedMediaHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
  if (/^127\./.test(host) || /^169\.254\./.test(host)) return true;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function downloadRemoteImage(source, fetchImpl = fetch) {
  let current;
  try {
    current = new URL(String(source || ""));
  } catch {
    throw new Error("可灵参考图地址无效");
  }
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (!["http:", "https:"].includes(current.protocol) || isBlockedMediaHost(current.hostname)) {
      throw new Error("可灵参考图不允许访问本地或内网地址");
    }
    const response = await fetchImpl(current, {
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8", "User-Agent": "6mang/0.1" },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) throw new Error("可灵参考图重定向次数过多");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`可灵参考图下载失败：HTTP ${response.status}`);
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(?:png|jpeg|jpg|webp|gif)$/.test(contentType)) throw new Error("可灵参考图地址返回的不是受支持图片");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) throw new Error("可灵参考图超过 30MB 限制");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error("可灵参考图超过 30MB 限制");
    return { buffer, contentType };
  }
  throw new Error("可灵参考图下载失败");
}

function findCliScript(explicitPath = "") {
  const candidates = [
    explicitPath,
    process.env.KLING_CLI_JS,
    process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "@klingai", "cli-cn", "dist", "cli.js"),
    process.env.PREFIX && path.join(process.env.PREFIX, "lib", "node_modules", "@klingai", "cli-cn", "dist", "cli.js"),
    "/usr/local/lib/node_modules/@klingai/cli-cn/dist/cli.js",
    "/usr/lib/node_modules/@klingai/cli-cn/dist/cli.js",
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      return fs.statSync(path.resolve(candidate)).isFile();
    } catch {
      return false;
    }
  }) || "";
}

function parseQuietJson(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {}
  }
  const error = new Error("可灵 CLI 未返回有效 JSON");
  error.statusCode = 502;
  throw error;
}

function summarizeCliStderr(stderr, exitCode) {
  const lines = String(stderr || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const primary = lines.filter((line) => /(?:submit failed|提交失败)/i.test(line)).at(-1);
  if (primary) return primary;
  const contextIndex = lines.findIndex((line) => /(?:Check the parameters and inputs|请对照该模型的 who_am_i)/i.test(line));
  const meaningful = contextIndex >= 0 ? lines.slice(0, contextIndex) : lines;
  return meaningful.slice(-3).join("；") || lines.slice(-3).join("；") || `退出码 ${exitCode}`;
}

function unwrapBody(value) {
  if (value && typeof value === "object" && value.body && typeof value.body === "object") return value.body;
  return value && typeof value === "object" ? value : {};
}

function normalizeSpec(model) {
  const args = Array.isArray(model?.arguments) ? model.arguments.map((arg) => ({
    name: String(arg?.name || ""),
    required: Boolean(arg?.required),
    ...(arg?.default !== undefined ? { default: String(arg.default) } : {}),
    allowedValues: Array.isArray(arg?.allowedValues)
      ? arg.allowedValues.map(String)
      : Array.isArray(arg?.allowed_values) ? arg.allowed_values.map(String) : [],
    description: String(arg?.description || ""),
  })).filter((arg) => arg.name) : [];
  const inputs = Array.isArray(model?.inputs) ? model.inputs.map((input) => ({
    name: String(input?.name || ""),
    required: Boolean(input?.required),
    description: String(input?.description || ""),
  })).filter((input) => input.name) : [];
  return { arguments: args, inputs };
}

function normalizeCapabilities(value) {
  const body = unwrapBody(value);
  const available = body.availableModels && typeof body.availableModels === "object" ? body.availableModels : {};
  const providers = {
    image: { models: [] },
    video: { models: [] },
  };
  const byKind = { image: new Map(), video: new Map() };
  for (const tool of GENERATION_TOOLS) {
    const kind = tool.endsWith("_image") ? "image" : "video";
    const models = Array.isArray(available?.[tool]?.models) ? available[tool].models : [];
    for (const raw of models) {
      const id = String(raw?.model || "").trim();
      if (!id) continue;
      let item = byKind[kind].get(id);
      if (!item) {
        const alias = String(raw?.alias || "").split(",")[0].trim();
        item = { id, label: alias || id, description: String(raw?.description || ""), tools: [], specs: {} };
        byKind[kind].set(id, item);
        providers[kind].models.push(item);
      }
      item.tools.push(tool);
      item.specs[tool] = normalizeSpec(raw);
    }
  }
  return {
    user: body.user && typeof body.user === "object" ? body.user : null,
    providers,
    raw: body,
  };
}

function buildGenerationArgs(request) {
  const tool = String(request?.tool || "");
  if (!GENERATION_TOOLS.includes(tool)) throw new Error(`不支持的可灵生成工具：${tool || "空"}`);
  const model = String(request?.model || "").trim();
  const prompt = String(request?.prompt || "").trim();
  if (!model) throw new Error("可灵生成缺少模型");
  if (!prompt) throw new Error("可灵生成缺少提示词");
  const args = [tool, "--model", model];
  for (const [name, value] of Object.entries(request?.params || {})) {
    if (["prompt", "model", "poll", "quiet", "image", "tailImage"].includes(name)) continue;
    if (value === undefined || value === null || String(value) === "") continue;
    args.push(`--${name}`, String(value));
  }
  const images = Array.isArray(request?.images) ? request.images.filter(Boolean).map(String) : [];
  const inputNames = Array.isArray(request?.inputNames) ? request.inputNames.map(String) : [];
  images.forEach((image, index) => {
    const inputName = inputNames[index] || "";
    args.push(inputName === "tail_image" ? "--tailImage" : "--image", image);
  });
  if (request?.rationale) args.push("--rationale", String(request.rationale));
  args.push(prompt);
  return args;
}

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();
  if (["succeed", "succeeded", "success", "completed", "partial_completed"].includes(status)) return "succeeded";
  if (["failed", "error", "canceled", "cancelled", "expired", "timeout"].includes(status)) return "failed";
  return "processing";
}

function extractError(body) {
  const candidates = [body?.error?.message, body?.error?.code, body?.message, body?.failReason, body?.failure_reason];
  return String(candidates.find((value) => typeof value === "string" && value.trim()) || "");
}

function collectMediaUrls(body) {
  const preferred = [];
  const normal = [];
  const covers = [];
  const seenObjects = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && /^https?:\/\//i.test(child)) {
        if (/urlWithoutWatermark/i.test(key)) preferred.push(child);
        else if (/cover|thumbnail|poster/i.test(key)) covers.push(child);
        else if (/(^|_)(url|video_url|image_url)$/i.test(key) || /^(videoUrl|imageUrl)$/i.test(key)) normal.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(body);
  const ordered = preferred.length ? [...preferred, ...normal, ...covers] : [...normal, ...covers];
  return [...new Set(ordered)];
}

function normalizeTask(value, generationId = "") {
  const body = unwrapBody(value);
  const urls = collectMediaUrls(body);
  return {
    adapter: "kling-cli",
    id: String(generationId || body.generationId || body.generation_id || ""),
    status: normalizeStatus(body.status),
    urls,
    video_url: urls[0] || "",
    error: extractError(body),
    raw: body,
  };
}

function isKlingProvider(provider) {
  return provider?.adapter === "kling-cli";
}

function usesCanvasBilling(provider) {
  return !isKlingProvider(provider);
}

function createKlingCli(options = {}) {
  const cliScriptPath = findCliScript(options.cliScriptPath);
  const cwd = options.rootDir || path.resolve(__dirname, "..");
  const baseEnv = { ...process.env, ...(options.env || {}) };
  const fetchImage = typeof options.fetchImage === "function" ? options.fetchImage : downloadRemoteImage;
  const errorLogPath = options.errorLogPath ? path.resolve(options.errorLogPath) : "";
  const cacheTtlMs = Math.max(1000, Number(options.cacheTtlMs) || 5 * 60 * 1000);
  let cachedCapabilities = null;
  let capabilitiesCachedAt = 0;
  let loginChild = null;
  let loginTimer = null;
  let loginStdout = "";
  let loginStderr = "";
  const loginState = { status: "idle", startedAt: "", finishedAt: "", error: "" };

  function availability() {
    let version = "";
    if (cliScriptPath) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(cliScriptPath, "..", "..", "package.json"), "utf8"));
        version = String(pkg.version || "");
      } catch {}
    }
    return {
      installed: Boolean(cliScriptPath),
      version,
    };
  }

  function run(args, runOptions = {}) {
    if (!cliScriptPath) {
      const error = new Error("未找到可灵 CLI，请先运行 npm install -g @klingai/cli-cn，或设置 KLING_CLI_JS");
      error.statusCode = 503;
      return Promise.reject(error);
    }
    const timeoutMs = Math.max(1, Number(runOptions.timeoutMs) || 30000);
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      const child = spawn(process.execPath, [cliScriptPath, ...args.map(String), "--quiet"], {
        cwd,
        env: { ...baseEnv, KLING_NONINTERACTIVE: "1", ...(runOptions.env || {}) },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      const append = (current, chunk) => {
        const next = current + chunk.toString("utf8");
        if (Buffer.byteLength(next, "utf8") > MAX_OUTPUT_BYTES) {
          child.kill();
          const error = new Error("可灵 CLI 输出过大，已停止读取");
          error.statusCode = 502;
          finish(error);
          return current;
        }
        return next;
      };
      child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
      child.on("error", (cause) => {
        const error = new Error(`无法启动可灵 CLI：${cause.message}`);
        error.statusCode = 503;
        finish(error);
      });
      child.on("close", (code) => {
        if (settled) return;
        if (timedOut) {
          const error = new Error(`可灵 CLI 执行超时（${timeoutMs}ms）`);
          error.statusCode = 504;
          finish(error);
          return;
        }
        if (code !== 0) {
          const detail = summarizeCliStderr(stderr, code);
          if (errorLogPath) {
            try {
              fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
              fs.appendFileSync(errorLogPath, `${JSON.stringify({
                time: new Date().toISOString(),
                command: String(args[0] || ""),
                exitCode: code,
                error: detail,
              })}\n`);
            } catch {}
          }
          const error = new Error(`可灵 CLI 执行失败：${detail}`);
          error.statusCode = 502;
          finish(error);
          return;
        }
        try {
          finish(null, parseQuietJson(stdout));
        } catch (error) {
          finish(error);
        }
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
    });
  }

  async function capabilities({ force = false } = {}) {
    if (!force && cachedCapabilities && Date.now() - capabilitiesCachedAt < cacheTtlMs) return cachedCapabilities;
    const result = await run(["who_am_i"], { timeoutMs: 30000 });
    cachedCapabilities = normalizeCapabilities(result);
    capabilitiesCachedAt = Date.now();
    return cachedCapabilities;
  }

  async function account() {
    return unwrapBody(await run(["account"], { timeoutMs: 30000 }));
  }

  async function tools() {
    return unwrapBody(await run(["tool_list"], { timeoutMs: 30000 }));
  }

  function findModelSpec(caps, tool, model) {
    const kind = tool.endsWith("_image") ? "image" : "video";
    const item = caps.providers[kind].models.find((entry) => entry.id === model && entry.tools.includes(tool));
    if (!item) {
      const error = new Error(`当前可灵账号的 ${tool} 未声明模型 ${model}`);
      error.statusCode = 400;
      throw error;
    }
    return item.specs[tool];
  }

  function validateGeneration(request, spec) {
    const params = request.params && typeof request.params === "object" ? request.params : {};
    const declarations = new Map(spec.arguments.map((arg) => [arg.name, arg]));
    for (const [name, value] of Object.entries(params)) {
      const declaration = declarations.get(name);
      if (!declaration || name === "prompt") {
        const error = new Error(`模型 ${request.model} 未声明参数 ${name}`);
        error.statusCode = 400;
        throw error;
      }
      const text = String(value);
      if (declaration.allowedValues.length && !declaration.allowedValues.includes(text)) {
        const error = new Error(`参数 ${name} 的值 ${text} 无效，可选值：${declaration.allowedValues.join("、")}`);
        error.statusCode = 400;
        throw error;
      }
    }
    for (const declaration of spec.arguments) {
      if (declaration.name === "prompt") continue;
      if (declaration.required && declaration.default === undefined && !String(params[declaration.name] ?? "").trim()) {
        const error = new Error(`模型 ${request.model} 缺少必填参数 ${declaration.name}`);
        error.statusCode = 400;
        throw error;
      }
    }
    const images = Array.isArray(request.images) ? request.images.filter(Boolean) : [];
    const requiredInputs = spec.inputs.filter((input) => input.required).length;
    if (images.length < requiredInputs) {
      const names = spec.inputs.filter((input) => input.required).map((input) => input.name).join("、");
      const error = new Error(`模型 ${request.model} 缺少必填素材：${names}`);
      error.statusCode = 400;
      throw error;
    }
    if (images.length > spec.inputs.length && spec.inputs.length) {
      const error = new Error(`模型 ${request.model} 最多接收 ${spec.inputs.length} 个图片素材`);
      error.statusCode = 400;
      throw error;
    }
  }

  async function materializeImages(images, inputSpecs = []) {
    let tempDir = "";
    const values = [];
    for (let index = 0; index < images.length; index += 1) {
      const source = images[index];
      const value = String(source || "");
      const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
      const requiresUpload = /file_upload/i.test(String(inputSpecs[index]?.description || ""));
      let buffer;
      let contentType = "";
      if (match) {
        contentType = match[1].toLowerCase();
        buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
      } else if (requiresUpload && /^https?:\/\//i.test(value)) {
        if (!fetchImage) {
          const error = new Error(`第 ${index + 1} 张可灵参考图需要先通过 file_upload 上传`);
          error.statusCode = 502;
          throw error;
        }
        const fetched = await fetchImage(value);
        buffer = Buffer.isBuffer(fetched?.buffer) ? fetched.buffer : Buffer.from(fetched?.buffer || []);
        contentType = String(fetched?.contentType || "image/png").toLowerCase();
      } else {
        values.push(value);
        continue;
      }
      if (buffer.length > MAX_IMAGE_BYTES) {
        const error = new Error(`第 ${index + 1} 张图片超过可灵 30MB 限制`);
        error.statusCode = 413;
        throw error;
      }
      if (!tempDir) tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kling-canvas-"));
      const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "png";
      const filePath = path.join(tempDir, `input-${index + 1}.${ext}`);
      fs.writeFileSync(filePath, buffer);
      values.push(filePath);
    }
    return {
      values,
      cleanup() {
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      },
    };
  }

  async function submit(request) {
    const caps = await capabilities();
    const spec = findModelSpec(caps, request.tool, request.model);
    validateGeneration(request, spec);
    const materialized = await materializeImages(
      Array.isArray(request.images) ? request.images.filter(Boolean) : [],
      spec.inputs,
    );
    try {
      const args = buildGenerationArgs({
        ...request,
        images: materialized.values,
        inputNames: spec.inputs.slice(0, materialized.values.length).map((input) => input.name),
        rationale: request.rationale || `6mang 画布使用 ${request.model} 执行 ${request.tool}`,
      });
      const result = await run(args, { timeoutMs: 2 * 60 * 1000 });
      const body = unwrapBody(result);
      const id = String(body.generationId || body.generation_id || "");
      if (!id) {
        const error = new Error("可灵 CLI 未返回 generation_id");
        error.statusCode = 502;
        throw error;
      }
      return { adapter: "kling-cli", id, status: "submitted" };
    } finally {
      materialized.cleanup();
    }
  }

  async function queryTask(generationId) {
    const id = String(generationId || "").trim();
    if (!id) {
      const error = new Error("缺少可灵 generation_id");
      error.statusCode = 400;
      throw error;
    }
    return normalizeTask(await run(["query_tasks", id], { timeoutMs: 30000 }), id);
  }

  function loginSnapshot() {
    return { ...loginState };
  }

  function finishLogin(status, error = "") {
    if (loginTimer) clearTimeout(loginTimer);
    loginTimer = null;
    loginChild = null;
    loginState.status = status;
    loginState.finishedAt = new Date().toISOString();
    loginState.error = error;
    if (status === "succeeded") {
      cachedCapabilities = null;
      capabilitiesCachedAt = 0;
    }
  }

  function startLogin() {
    if (loginChild) return loginSnapshot();
    if (!cliScriptPath) {
      loginState.status = "failed";
      loginState.error = "未找到可灵 CLI";
      loginState.finishedAt = new Date().toISOString();
      return loginSnapshot();
    }
    loginStdout = "";
    loginStderr = "";
    loginState.status = "waiting";
    loginState.startedAt = new Date().toISOString();
    loginState.finishedAt = "";
    loginState.error = "";
    loginChild = spawn(process.execPath, [cliScriptPath, "login", "--quiet"], {
      cwd,
      env: baseEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    loginChild.stdout.on("data", (chunk) => { loginStdout += chunk.toString("utf8"); });
    loginChild.stderr.on("data", (chunk) => { loginStderr += chunk.toString("utf8"); });
    loginChild.on("error", (error) => finishLogin("failed", `无法启动可灵登录：${error.message}`));
    loginChild.on("close", (code) => {
      if (!loginChild) return;
      if (code !== 0) {
        finishLogin("failed", loginStderr.trim().split(/\r?\n/).filter(Boolean).slice(-3).join("；") || `退出码 ${code}`);
        return;
      }
      try {
        const result = parseQuietJson(loginStdout);
        finishLogin(result?.ok === false ? "failed" : "succeeded", result?.ok === false ? String(result?.error || "登录失败") : "");
      } catch (error) {
        finishLogin("failed", error.message);
      }
    });
    loginTimer = setTimeout(() => {
      if (!loginChild) return;
      loginChild.kill();
      finishLogin("failed", "可灵 OAuth 登录等待超过 5 分钟");
    }, 5 * 60 * 1000);
    return loginSnapshot();
  }

  async function logout() {
    const result = unwrapBody(await run(["logout"], { timeoutMs: 30000 }));
    cachedCapabilities = null;
    capabilitiesCachedAt = 0;
    loginState.status = "idle";
    loginState.startedAt = "";
    loginState.finishedAt = new Date().toISOString();
    loginState.error = "";
    return result;
  }

  async function status({ refresh = false } = {}) {
    const base = { ...availability(), authenticated: false, user: null, login: loginSnapshot(), capabilitiesUpdatedAt: capabilitiesCachedAt ? new Date(capabilitiesCachedAt).toISOString() : "" };
    if (!base.installed || loginState.status === "waiting") return base;
    try {
      const caps = await capabilities({ force: refresh });
      return { ...base, authenticated: true, user: caps.user, capabilitiesUpdatedAt: new Date(capabilitiesCachedAt).toISOString() };
    } catch (error) {
      return { ...base, authError: error.message };
    }
  }

  return {
    account,
    availability,
    capabilities,
    loginSnapshot,
    logout,
    queryTask,
    run,
    startLogin,
    status,
    submit,
    tools,
    close() {
      if (loginChild) loginChild.kill();
      if (loginTimer) clearTimeout(loginTimer);
      loginChild = null;
      loginTimer = null;
    },
  };
}

module.exports = {
  buildGenerationArgs,
  createKlingCli,
  downloadRemoteImage,
  findCliScript,
  isKlingProvider,
  normalizeCapabilities,
  normalizeTask,
  parseQuietJson,
  summarizeCliStderr,
  usesCanvasBilling,
};
