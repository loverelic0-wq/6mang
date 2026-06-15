const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rootDir = path.resolve(__dirname, "..");
loadDotEnv(path.join(rootDir, ".env"));

const db = require("./db");

const publicDir = path.join(rootDir, "public");
const runtimeSettingsPath = path.join(rootDir, ".huobao-settings.json");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const adminToken = process.env.ADMIN_TOKEN || "";

const modelCostRules = {
  chat: { default: 1 },
  image: {
    "gpt-image-2": 15,
    "gemini-3-pro-image-preview": 10,
    "gemini-3.1-flash-image-preview": 6,
    "midjourney": 15,
    "niji-journey": 15,
    default: 8,
  },
  video: {
    // 火山 Seedance（计费可按分辨率/时长再调整）
    "doubao-seedance-2-0-260128": 60,
    "doubao-seedance-2-0-fast-260128": 40,
    default: 60,
  },
};

function costFor(serviceName, model) {
  const table = modelCostRules[serviceName] || { default: 1 };
  if (model && table[model]) return table[model];
  return table.default;
}

const PROMPT_OPTIMIZER_SYSTEM = `你是顶级的中文 AI 绘画提示词专家，专为即梦 AI 等中文文生图/文生视频模型服务。

你的任务：把用户的原始创意，按下面 6 个维度展开为高质量、具备空间感与叙事感的中文提示词。

输出严格要求 JSON 对象，字段如下，不要 Markdown 代码块标记，不要解释文字：
{
  "subject":     "主体：核心人物/产品/物体，含身份、姿态、状态",
  "structure":   "结构/动作：主体的结构关系、动作、层级、模块、连接方式",
  "material":    "材质：表面材质、纹理、质感、工艺细节",
  "lighting":    "光影：主光/补光方向、强度、色温、体积光、阴影",
  "style":       "风格：摄影/写实/插画/电影感/工业设计等明确风格定位",
  "composition": "构图：镜头语言、视角、景别、画面比例、空间纵深、环境氛围"
}

硬性规则：
- 全中文。不要任何英文单词、英文参数、--raw / --stylize 等 MJ 参数。
- 每个字段用自然中文短语或一句话，不要关键词堆砌，不要罗列星标符号。
- 必须包含：主体、细节、材质、光影、环境、氛围、风格；场景需具备空间感与叙事感。
- 总字数控制在 600 字以内，优先级：主体 > 结构 > 材质 > 光影 > 风格 > 构图。
- 禁止编造原始输入中不存在的关键事实（人物身份、品牌、地点），可补充氛围/材质/光影等通用视觉细节。
- 只返回 JSON，禁止任何额外文字。`;

function parseOptimizedPrompt(raw) {
  const empty = { subject: "", structure: "", material: "", lighting: "", style: "", composition: "" };
  if (!raw) return empty;
  let text = String(raw).trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    const candidate = text.slice(braceStart, braceEnd + 1);
    try {
      const obj = JSON.parse(candidate);
      const pick = (key) => (typeof obj?.[key] === "string" ? obj[key].trim() : "");
      return {
        subject: pick("subject"),
        structure: pick("structure"),
        material: pick("material"),
        lighting: pick("lighting"),
        style: pick("style"),
        composition: pick("composition"),
      };
    } catch {}
  }
  return { ...empty, subject: text };
}

if (!db.userCount()) {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin1234";
  const admin = db.createUser({ username: "admin", password: adminPassword, isAdmin: true, initialBalance: 100000 });
  console.log(`[bootstrap] created default admin (username=admin, password=${adminPassword}) balance=${admin.balance}`);
}

const KIND_LABELS = { chat: "聊天", image: "图片", video: "视频" };

const DEFAULT_PROVIDERS = {
  chat: {
    default: "default",
    items: {
      default: {
        label: "默认聊天上游",
        baseUrl: "https://147ai.com/v1",
        apiKey: "",
        defaultModel: "gpt-5-chat-latest",
        models: [
          { id: "gpt-5-chat-latest", label: "GPT-5 Chat" },
          { id: "gpt-4o", label: "GPT-4o" },
          { id: "gpt-4o-mini", label: "GPT-4o mini" },
        ],
      },
    },
  },
  image: {
    default: "default",
    items: {
      default: {
        label: "默认图片上游",
        baseUrl: "https://147ai.com/v1",
        apiKey: "",
        defaultModel: "gpt-image-2",
        models: [
          { id: "gpt-image-2", label: "GPT Image 2" },
        ],
      },
    },
  },
  video: {
    default: "default",
    items: {
      default: {
        label: "默认视频上游",
        baseUrl: "https://147ai.com/v1",
        apiKey: "",
        defaultModel: "sora-2-pro",
        models: [
          { id: "sora-2-pro", label: "Sora 2 Pro" },
          { id: "veo3.1-fast", label: "Veo 3.1 Fast" },
        ],
      },
    },
  },
};

const API_KEY_KEEP_SENTINEL = "__keep__";

let runtimeSettings = loadRuntimeSettings();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    console.error(`[api error] ${req.method} ${req.url} -> ${error.statusCode || 500}: ${error.message}`);
    if (error.stack) console.error(error.stack);
    sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`6mang running at http://${host}:${port}`);
});

function cloneDefaultProviders() {
  return JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
}

function loadRuntimeSettings() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(runtimeSettingsPath, "utf8"));
  } catch {
    return { providers: cloneDefaultProviders() };
  }
  if (raw && raw.providers) {
    return { providers: normalizeProviders(raw.providers) };
  }
  const migrated = migrateLegacySettings(raw);
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(runtimeSettingsPath, `${runtimeSettingsPath}.bak.${ts}`);
    fs.writeFileSync(runtimeSettingsPath, JSON.stringify({ providers: migrated }, null, 2));
    console.log(`[migrate] runtime settings migrated to providers schema; backup at .huobao-settings.json.bak.${ts}`);
  } catch (error) {
    console.error(`[migrate] backup/save failed: ${error.message}`);
  }
  return { providers: migrated };
}

function migrateLegacySettings(raw) {
  const providers = cloneDefaultProviders();
  const services = raw?.services || {};
  const map = [
    { kind: "chat", from: "chat", id: "default" },
    { kind: "image", from: "image", id: "default" },
    { kind: "image", from: "imageBanana", id: "banana" },
    { kind: "video", from: "video", id: "default" },
  ];
  for (const { kind, from, id } of map) {
    const old = services[from];
    if (!old) continue;
    const existing = providers[kind].items[id];
    const item = existing || {
      label: `${KIND_LABELS[kind] || kind} · ${id}`,
      baseUrl: "",
      apiKey: "",
      defaultModel: "",
      models: [],
    };
    if (old.baseUrl) item.baseUrl = String(old.baseUrl);
    if (old.apiKey) item.apiKey = String(old.apiKey);
    if (old.model) {
      item.defaultModel = String(old.model);
      if (!item.models.some((m) => m.id === old.model)) {
        item.models.unshift({ id: String(old.model), label: String(old.model) });
      }
    }
    if (id === "banana") {
      if (!existing) item.label = "nano banana";
      const extras = [
        { id: "gemini-3-pro-image-preview", label: "nano banana pro" },
        { id: "gemini-3.1-flash-image-preview", label: "nano banana 2" },
      ];
      for (const m of extras) {
        if (!item.models.some((x) => x.id === m.id)) item.models.push(m);
      }
    }
    providers[kind].items[id] = item;
  }
  return providers;
}

function normalizeProviders(input) {
  const out = {};
  for (const kind of ["chat", "image", "video"]) {
    const incoming = input?.[kind];
    if (!incoming || typeof incoming !== "object" || !incoming.items) {
      out[kind] = cloneDefaultProviders()[kind];
      continue;
    }
    const items = {};
    for (const [pid, pdef] of Object.entries(incoming.items)) {
      if (!pdef || typeof pdef !== "object") continue;
      items[String(pid)] = normalizeProviderItem(pdef);
    }
    if (!Object.keys(items).length) {
      out[kind] = cloneDefaultProviders()[kind];
      continue;
    }
    const def = incoming.default && items[incoming.default] ? incoming.default : Object.keys(items)[0];
    out[kind] = { default: def, items };
  }
  return out;
}

function normalizeProviderItem(pdef) {
  return {
    label: String(pdef.label || ""),
    baseUrl: String(pdef.baseUrl || ""),
    apiKey: String(pdef.apiKey || ""),
    defaultModel: String(pdef.defaultModel || ""),
    models: Array.isArray(pdef.models)
      ? pdef.models
          .filter((m) => m && typeof m === "object" && m.id)
          .map((m) => ({ id: String(m.id), label: String(m.label || m.id) }))
      : [],
  };
}

function getProvider(kind, providerId) {
  const group = runtimeSettings.providers?.[kind];
  if (!group) {
    const error = new Error(`Unknown service kind: ${kind}`);
    error.statusCode = 500;
    throw error;
  }
  const id = providerId && group.items[providerId] ? providerId : group.default;
  const item = group.items[id];
  if (!item) {
    const error = new Error(`Provider "${id}" not found under ${kind}`);
    error.statusCode = 400;
    throw error;
  }
  return { kind, id, ...item };
}

function publicProvidersStatus() {
  const out = {};
  for (const kind of ["chat", "image", "video"]) {
    const group = runtimeSettings.providers?.[kind] || { default: "", items: {} };
    const items = {};
    for (const [id, item] of Object.entries(group.items || {})) {
      items[id] = {
        label: item.label,
        baseUrl: item.baseUrl,
        defaultModel: item.defaultModel,
        models: item.models,
        configured: Boolean(item.apiKey),
        apiKeyMasked: maskApiKey(item.apiKey),
      };
    }
    out[kind] = { default: group.default, items };
  }
  return out;
}

function maskApiKey(key) {
  const value = String(key || "");
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function saveRuntimeSettings() {
  fs.writeFileSync(runtimeSettingsPath, JSON.stringify(runtimeSettings, null, 2));
}

function applyProvidersUpdate(incoming) {
  if (!incoming || typeof incoming !== "object") {
    const error = new Error("Missing providers");
    error.statusCode = 400;
    throw error;
  }
  const next = {};
  for (const kind of ["chat", "image", "video"]) {
    const incomingKind = incoming[kind];
    const existingKind = runtimeSettings.providers?.[kind] || cloneDefaultProviders()[kind];
    if (!incomingKind || typeof incomingKind !== "object") {
      next[kind] = existingKind;
      continue;
    }
    const incomingItems = incomingKind.items || {};
    const items = {};
    for (const [pid, pdef] of Object.entries(incomingItems)) {
      if (!pdef || typeof pdef !== "object") continue;
      const id = String(pid);
      const previous = existingKind.items?.[id];
      const merged = normalizeProviderItem(pdef);
      if (pdef.apiKey === API_KEY_KEEP_SENTINEL) {
        merged.apiKey = previous?.apiKey || "";
      }
      if (merged.baseUrl) merged.baseUrl = normalizeBaseUrl(merged.baseUrl);
      items[id] = merged;
    }
    if (!Object.keys(items).length) {
      next[kind] = existingKind;
      continue;
    }
    const def = incomingKind.default && items[incomingKind.default] ? incomingKind.default : Object.keys(items)[0];
    next[kind] = { default: def, items };
  }
  runtimeSettings = { providers: next };
  saveRuntimeSettings();
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    const error = new Error("Invalid API Base URL");
    error.statusCode = 400;
    throw error;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error("API Base URL must start with http:// or https://");
    error.statusCode = 400;
    throw error;
  }
  return parsed.href.replace(/\/$/, "");
}

const SESSION_COOKIE = "huobao_session";

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return [part.trim(), ""];
      return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
    })
  );
}

function setSessionCookie(res, token, maxAgeSec) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function getRequestUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const found = db.lookupSession(token);
  return found || null;
}

function requireUser(req) {
  const found = getRequestUser(req);
  if (!found) {
    const error = new Error("未登录");
    error.statusCode = 401;
    throw error;
  }
  return found;
}

function requireAdmin(req) {
  const found = getRequestUser(req);
  if (found?.user?.is_admin) return true;
  const supplied = (req.headers["x-admin-token"] || "").toString();
  if (adminToken && supplied === adminToken) return true;
  return false;
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/auth/register" && req.method === "POST") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    try {
      const user = db.createUser({ username, password, initialBalance: 0 });
      const { token } = db.createSession(user.id);
      setSessionCookie(res, token, 60 * 60 * 24 * 30);
      sendJson(res, 200, { user: db.publicUser(user) });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    const user = db.authenticate(String(body.username || "").trim(), String(body.password || ""));
    if (!user) {
      sendJson(res, 401, { error: "用户名或密码错误" });
      return;
    }
    const { token } = db.createSession(user.id);
    setSessionCookie(res, token, 60 * 60 * 24 * 30);
    sendJson(res, 200, { user: db.publicUser(user) });
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const cookies = parseCookies(req.headers.cookie);
    db.destroySession(cookies[SESSION_COOKIE]);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const found = getRequestUser(req);
    if (!found) {
      sendJson(res, 200, { user: null });
      return;
    }
    sendJson(res, 200, { user: db.publicUser(found.user) });
    return;
  }

  if (url.pathname === "/api/billing/transactions" && req.method === "GET") {
    const found = requireUser(req);
    const limit = Number(url.searchParams.get("limit")) || 50;
    sendJson(res, 200, { transactions: db.listTransactions(found.user.id, limit) });
    return;
  }

  if (url.pathname === "/api/billing/usage" && req.method === "GET") {
    const found = requireUser(req);
    const limit = Number(url.searchParams.get("limit")) || 50;
    sendJson(res, 200, { usage: db.listApiUsage(found.user.id, limit) });
    return;
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (!requireAdmin(req)) {
      sendJson(res, 403, { error: "需要管理员权限" });
      return;
    }
  }

  if (url.pathname === "/api/admin/users" && req.method === "GET") {
    sendJson(res, 200, { users: db.listAllUsers() });
    return;
  }

  if (url.pathname.match(/^\/api\/admin\/users\/\d+\/transactions$/) && req.method === "GET") {
    const userId = Number(url.pathname.split("/")[4]);
    const limit = Number(url.searchParams.get("limit")) || 100;
    sendJson(res, 200, { transactions: db.listTransactions(userId, limit) });
    return;
  }

  if (url.pathname.match(/^\/api\/admin\/users\/\d+\/usage$/) && req.method === "GET") {
    const userId = Number(url.pathname.split("/")[4]);
    const limit = Number(url.searchParams.get("limit")) || 100;
    sendJson(res, 200, { usage: db.listApiUsage(userId, limit) });
    return;
  }

  if (url.pathname === "/api/admin/credit" && req.method === "POST") {
    const body = await readJson(req);
    const target = db.getUserByUsername(String(body.username || "").trim());
    if (!target) {
      sendJson(res, 404, { error: "用户不存在" });
      return;
    }
    const amount = Math.round(Number(body.amount) || 0);
    if (!amount) {
      sendJson(res, 400, { error: "amount 必须非零" });
      return;
    }
    try {
      const next = db.adjustBalance({
        userId: target.id,
        delta: amount,
        type: amount > 0 ? "admin_credit" : "admin_debit",
        description: String(body.note || "管理员调整"),
      });
      sendJson(res, 200, { username: target.username, balance: next });
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    sendJson(res, 200, { providers: publicProvidersStatus() });
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "POST") {
    if (!requireAdmin(req)) {
      sendJson(res, 403, { error: "需要管理员权限" });
      return;
    }
    const body = await readJson(req);
    applyProvidersUpdate(body.providers);
    sendJson(res, 200, { providers: publicProvidersStatus() });
    return;
  }

  if (url.pathname === "/api/image-proxy" && req.method === "GET") {
    await proxyImage(url, res);
    return;
  }

  if (url.pathname === "/api/chat/polish" && req.method === "POST") {
    const found = requireUser(req);
    const body = await readJson(req);
    const provider = getProvider("chat", body.providerId);
    const model = body.model || provider.defaultModel;
    const cost = costFor("chat", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `chat ${model}` });
    try {
      const data = await n1nFetch(provider, "/chat/completions", {
        method: "POST",
        body: {
          model,
          messages: [
            {
              role: "system",
              content: "你是专业 AI 视觉创作提示词专家。把用户输入润色成适合图像和视频生成的中文提示词，只返回润色后的提示词。",
            },
            { role: "user", content: body.text || "" },
          ],
          max_tokens: 2000,
        },
      });
      db.recordApiUsage({ userId: found.user.id, route: "chat/polish", model, cost, status: "ok" });
      sendJson(res, 200, { text: data?.choices?.[0]?.message?.content?.trim() || body.text || "" });
    } catch (error) {
      db.adjustBalance({ userId: found.user.id, delta: cost, type: "refund", description: `refund chat ${model}: ${error.message}` });
      db.recordApiUsage({ userId: found.user.id, route: "chat/polish", model, cost: 0, status: `error: ${error.message}` });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/chat/optimize-prompt" && req.method === "POST") {
    const found = requireUser(req);
    const body = await readJson(req);
    const provider = getProvider("chat", body.providerId);
    const model = body.model || provider.defaultModel;
    const cost = costFor("chat", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `prompt-optimize ${model}` });
    try {
      const data = await n1nFetch(provider, "/chat/completions", {
        method: "POST",
        body: {
          model,
          messages: [
            { role: "system", content: PROMPT_OPTIMIZER_SYSTEM },
            { role: "user", content: body.text || "" },
          ],
          max_tokens: 2000,
        },
      });
      const raw = data?.choices?.[0]?.message?.content?.trim() || "";
      const parsed = parseOptimizedPrompt(raw);
      db.recordApiUsage({ userId: found.user.id, route: "chat/optimize-prompt", model, cost, status: "ok" });
      sendJson(res, 200, { ...parsed, raw });
    } catch (error) {
      db.adjustBalance({ userId: found.user.id, delta: cost, type: "refund", description: `refund prompt-optimize ${model}: ${error.message}` });
      db.recordApiUsage({ userId: found.user.id, route: "chat/optimize-prompt", model, cost: 0, status: `error: ${error.message}` });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/images/generations" && req.method === "POST") {
    const found = requireUser(req);
    const body = await readJson(req);
    const provider = getProvider("image", body.providerId);
    const model = String(body.model || provider.defaultModel);
    const cost = costFor("image", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `image ${model}` });
    try {
      let data;
      const refImages = Array.isArray(body.image) ? body.image.filter(Boolean) : [];
      if (isChatImageModel(model)) {
        // gemini 香蕉系（如 147ai.com）不走 images 端点，改用 /chat/completions 对话生图
        data = await chatImageGenerate(provider, model, refImages, body);
      } else if (refImages.length) {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", String(body.prompt || ""));
        if (body.size) form.append("size", String(body.size));
        if (body.quality) form.append("quality", String(body.quality));
        if (body.n !== undefined) form.append("n", String(body.n));
        if (body.input_fidelity) form.append("input_fidelity", String(body.input_fidelity));
        if (body.output_format) form.append("output_format", String(body.output_format));
        if (body.background) form.append("background", String(body.background));

        let appended = 0;
        for (const source of refImages) {
          const blob = await imageSourceToBlob(source);
          if (blob) {
            const field = refImages.length > 1 ? "image[]" : "image";
            form.append(field, blob, blob.filename || "ref.png");
            appended += 1;
          }
        }
        if (!appended) {
          const error = new Error("参考图解析失败，无法发送到图像编辑接口");
          error.statusCode = 400;
          throw error;
        }
        data = await n1nFetchForm(provider, "/images/edits", form);
      } else {
        const payload = compactPayload({
          ...body,
          model,
          prompt: body.prompt,
        });
        delete payload.providerId;
        data = await n1nFetch(provider, "/images/generations", {
          method: "POST",
          body: payload,
        });
      }
      db.recordApiUsage({ userId: found.user.id, route: "images/generations", model, cost, status: "ok" });
      sendJson(res, 200, data);
    } catch (error) {
      db.adjustBalance({ userId: found.user.id, delta: cost, type: "refund", description: `refund image ${model}: ${error.message}` });
      db.recordApiUsage({ userId: found.user.id, route: "images/generations", model, cost: 0, status: `error: ${error.message}` });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/images/mj/create" && req.method === "POST") {
    const found = requireUser(req);
    const body = await readJson(req);
    const provider = getProvider("image", body.providerId);
    const model = String(body.model || "midjourney");
    const cost = costFor("image", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `mj ${model}` });
    try {
      const base64Array = await Promise.all(
        (Array.isArray(body.images) ? body.images.filter(Boolean) : []).map(imageSourceToBase64),
      );
      const data = await n1nFetch(provider, "/mj/submit/imagine", {
        method: "POST",
        body: {
          botType: /^niji/i.test(model) ? "NIJI_JOURNEY" : "MID_JOURNEY",
          prompt: String(body.prompt || ""),
          base64Array: base64Array.filter(Boolean),
          notifyHook: "",
          state: "",
        },
      });
      const code = Number(data?.code);
      if (code !== 1 && code !== 22) {
        const message = data?.description || `mj submit failed (code ${data?.code})`;
        const error = new Error(message);
        error.statusCode = code === 24 ? 402 : 502;
        throw error;
      }
      db.recordApiUsage({ userId: found.user.id, route: "images/mj/create", model, cost, status: "ok" });
      sendJson(res, 200, { id: String(data.result), code, description: data.description || "" });
    } catch (error) {
      db.adjustBalance({ userId: found.user.id, delta: cost, type: "refund", description: `refund mj ${model}: ${error.message}` });
      db.recordApiUsage({ userId: found.user.id, route: "images/mj/create", model, cost: 0, status: `error: ${error.message}` });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/images/mj/query" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const provider = getProvider("image", url.searchParams.get("providerId"));
    const data = await n1nFetch(provider, `/mj/task/${encodeURIComponent(id)}/fetch`, { method: "GET" });
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === "/api/video/create" && req.method === "POST") {
    const found = requireUser(req);
    const body = await readJson(req);
    const provider = getProvider("video", body.providerId);
    const model = body.model || provider.defaultModel;
    const cost = costFor("video", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `video ${model}` });
    try {
      // 参考视频是本地 data URL 时先传 COS 换公网外链（Ark 只认 http 地址）
      if (isVolcArkProvider(provider) && Array.isArray(body.videos) && body.videos.length) {
        body.videos = await Promise.all(body.videos.map((v) => ensurePublicMediaUrl(v, "video")));
      }
      const data = isVolcArkProvider(provider)
        ? await n1nFetch(provider, "/contents/generations/tasks", {
            method: "POST",
            body: volcVideoCreatePayload(model, body),
          })
        : await n1nFetch(provider, "/video/create", {
            method: "POST",
            body: buildVideoCreatePayload(model, body),
          });
      db.recordApiUsage({ userId: found.user.id, route: "video/create", model, cost, status: "ok" });
      sendJson(res, 200, data);
    } catch (error) {
      const vids = Array.isArray(body.videos) ? body.videos : [];
      const dataUrlVids = vids.filter((v) => /^data:/i.test(String(v))).length;
      const diag = {
        time: new Date().toISOString(),
        model,
        videoMode: body.videoMode,
        ark: isVolcArkProvider(provider),
        images: Array.isArray(body.images) ? body.images.length : 0,
        videos: vids.length,
        videosAsDataUrl: dataUrlVids,
        videoSample: vids[0] ? String(vids[0]).slice(0, 120) : "",
        upstream: error.message,
      };
      console.error("[video/create] 失败:", diag);
      try { fs.appendFileSync(path.join(rootDir, "data", "video-error.log"), JSON.stringify(diag) + "\n"); } catch {}
      db.adjustBalance({ userId: found.user.id, delta: cost, type: "refund", description: `refund video ${model}: ${error.message}` });
      db.recordApiUsage({ userId: found.user.id, route: "video/create", model, cost: 0, status: `error: ${error.message}` });
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/history/save" && req.method === "POST") {
    const body = await readJson(req);
    const result = await saveHistoryFile(body);
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/video/query" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const provider = getProvider("video", url.searchParams.get("providerId"));
    let data;
    if (isVolcArkProvider(provider)) {
      const raw = await n1nFetch(provider, `/contents/generations/tasks/${encodeURIComponent(id)}`, { method: "GET" });
      const st = String(raw?.status || "").toLowerCase();
      // 翻译成前端契约：succeeded 时给 video_url；cancelled/expired 归一成 failed
      data = {
        status: st === "cancelled" || st === "expired" ? "failed" : st,
        video_url: raw?.content?.video_url || "",
        error: raw?.error?.message || raw?.error?.code || "",
      };
    } else {
      data = await n1nFetch(provider, `/video/query?id=${encodeURIComponent(id)}`, { method: "GET" });
    }
    sendJson(res, 200, data);
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

async function proxyImage(url, res) {
  const source = url.searchParams.get("url");
  if (!source) {
    sendText(res, 400, "Missing image url");
    return;
  }

  let imageUrl;
  try {
    imageUrl = new URL(source);
  } catch {
    sendText(res, 400, "Invalid image url");
    return;
  }

  if (!["http:", "https:"].includes(imageUrl.protocol) || isBlockedHost(imageUrl.hostname)) {
    sendText(res, 400, "Unsupported image url");
    return;
  }

  const response = await fetch(imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "6mang/0.1",
    },
  });

  if (!response.ok) {
    sendText(res, response.status, `Image fetch failed: ${response.status}`);
    return;
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    sendText(res, 415, "Remote url is not an image");
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
  });
  res.end(buffer);
}

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
  if (/^127\./.test(host) || /^169\.254\./.test(host)) return true;

  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;

  const [a, b] = parts;
  if (a === 10 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return a === 192 && b === 168;
}

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function isSoraModel(model) {
  return /^sora/i.test(String(model || ""));
}

function buildVideoCreatePayload(model, body) {
  const prompt = body.prompt;
  const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];

  if (isSoraModel(model)) {
    const size = String(body.size || "1280x720");
    const seconds = Number(body.seconds) || 8;
    return compactPayload({
      model,
      prompt,
      size,
      seconds,
      input_reference: images[0],
    });
  }

  const aspect_ratio = body.aspect_ratio || sizeToAspectRatio(body.size) || "16:9";
  return compactPayload({
    enable_upsample: body.enable_upsample ?? true,
    enhance_prompt: body.enhance_prompt ?? true,
    images: images.length ? images : undefined,
    model,
    prompt,
    aspect_ratio,
    duration: body.duration ?? body.seconds,
  });
}

// ============ 腾讯云 COS 直传（零依赖，自己用 crypto 签名）============
// 火山 Ark 的参考视频只认公网 http(s) 地址，本地载入的视频是 data URL，
// 必须先传到对象存储拿到外链再喂给上游。凭 .env 的 COS_* 配置。
const COS_BUCKET = process.env.COS_BUCKET || "";       // 形如 unityshop-1342713514（已含 APPID）
const COS_REGION = process.env.COS_REGION || "";       // 形如 ap-guangzhou
const COS_SECRET_ID = process.env.COS_SECRET_ID || "";
const COS_SECRET_KEY = process.env.COS_SECRET_KEY || "";

function cosConfigured() {
  return Boolean(COS_BUCKET && COS_REGION && COS_SECRET_ID && COS_SECRET_KEY);
}

// COS 签名用的 url 编码（rfc3986，! ' ( ) * 也要编码，hex 大写）
function camSafeEncode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// 生成 COS PUT 请求的 Authorization（签名算法见 https://cloud.tencent.com/document/product/436/7778）
function cosAuthorization(method, pathname, signHeaders, durationSec = 900) {
  const now = Math.floor(Date.now() / 1000) - 60;
  const keyTime = `${now};${now + durationSec}`;
  const signKey = crypto.createHmac("sha1", COS_SECRET_KEY).update(keyTime).digest("hex");
  const pairs = Object.keys(signHeaders)
    .map((k) => [k.toLowerCase(), signHeaders[k]])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const headerList = pairs.map(([k]) => k).join(";");
  const httpHeaders = pairs.map(([k, v]) => `${camSafeEncode(k)}=${camSafeEncode(v)}`).join("&");
  const httpString = `${method.toLowerCase()}\n${pathname}\n\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${keyTime}\n${crypto.createHash("sha1").update(httpString).digest("hex")}\n`;
  const signature = crypto.createHmac("sha1", signKey).update(stringToSign).digest("hex");
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${COS_SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
}

function mimeToExt(mime) {
  const map = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
  return map[String(mime || "").toLowerCase()] || "";
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const contentType = m[1] || "application/octet-stream";
  const buffer = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  return { contentType, buffer };
}

async function uploadBufferToCos(buffer, key, contentType) {
  const hostName = `${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`;
  const pathname = `/${key}`;
  const authorization = cosAuthorization("PUT", pathname, { host: hostName, "content-type": contentType });
  const response = await fetch(`https://${hostName}${pathname}`, {
    method: "PUT",
    headers: {
      Host: hostName,
      "Content-Type": contentType,
      Authorization: authorization,
    },
    body: buffer,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`COS 上传失败 HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  // 桶非公开读，返回带签名的临时外链（2 小时有效，够上游下载用）
  const getAuth = cosAuthorization("GET", pathname, { host: hostName }, 7200);
  return `https://${hostName}${pathname}?${getAuth}`;
}

// data URL → 上传 COS 拿外链；已是 http(s) 直接返回；没配 COS 又是本地素材则报错。
async function ensurePublicMediaUrl(src, kindHint = "video") {
  const s = String(src || "");
  if (/^https?:\/\//i.test(s)) return s;
  if (!/^data:/i.test(s)) return s;
  if (!cosConfigured()) {
    throw new Error("本地视频需先上传对象存储，但服务器未配置 COS_*（见 .env.example）");
  }
  const parsed = parseDataUrl(s);
  if (!parsed) throw new Error("无法解析素材 data URL");
  const ext = mimeToExt(parsed.contentType) || (kindHint === "video" ? "mp4" : "bin");
  const folder = parsed.contentType.startsWith("video") ? "video" : "image";
  const key = `huobao/${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  return uploadBufferToCos(parsed.buffer, key, parsed.contentType);
}

// 火山方舟（Ark）走自己的异步任务协议，不是 OpenAI 兼容的 /video/create。
// 凭 provider 的 baseUrl 识别（不按模型名嗅探），baseUrl 配成 ark...volces.com 即走此分支。
function isVolcArkProvider(provider) {
  return /volces\.com|bytepluses\.com/i.test(String(provider?.baseUrl || ""));
}

// 像素尺寸 → 火山的 resolution 档位（480p/720p/1080p，按短边吸附）。
function volcResolution(size) {
  const m = String(size || "").match(/(\d+)\s*[x×]\s*(\d+)/i);
  const short = m ? Math.min(Number(m[1]), Number(m[2])) : 0;
  if (short >= 1080) return "1080p";
  if (short > 0 && short < 720) return "480p";
  return "720p";
}

// 把前端 {prompt, ratio, seconds, images, videoMode} 转成火山 Ark 创建任务的 body。
function volcVideoCreatePayload(model, body) {
  const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
  const videos = Array.isArray(body.videos) ? body.videos.filter(Boolean) : [];
  const content = [{ type: "text", text: String(body.prompt || "") }];
  const img = (src) => ({ type: "image_url", image_url: { url: String(src) } });
  const vid = (src) => ({ type: "video_url", video_url: { url: String(src) } });
  if (body.videoMode === "first_last") {
    // 首尾帧：图1=首帧，图2=尾帧（多余的忽略），提示词描述中间过渡
    if (images[0]) content.push({ ...img(images[0]), role: "first_frame" });
    if (images[1]) content.push({ ...img(images[1]), role: "last_frame" });
  } else {
    // 全能参考：图片作 reference_image、视频作 reference_video（Seedance 2.0 最多 9 个素材），
    // 用途由提示词 @图片N / @视频N 指定
    images.slice(0, 9).forEach((src) => content.push({ ...img(src), role: "reference_image" }));
    videos.slice(0, 9).forEach((src) => content.push({ ...vid(src), role: "reference_video" }));
  }
  const seconds = Number(body.duration ?? body.seconds) || 5;
  return compactPayload({
    model,
    content,
    resolution: volcResolution(body.size),
    // 前端直接传宽高比（含 adaptive=跟随参考图）；旧 body 兜底
    ratio: body.ratio || body.aspect_ratio || sizeToAspectRatio(body.size) || "16:9",
    duration: Math.max(4, Math.min(15, seconds)),
  });
}

const historyRootDir = path.join(rootDir, "output");

function sanitizeProjectFolder(name, id) {
  const safeName = String(name || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const safeId = String(id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16);
  const base = safeName || "未命名项目";
  return safeId ? `${base}_${safeId}` : base;
}

function mimeToExtFromMime(mime) {
  const value = String(mime || "").toLowerCase();
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("webp")) return "webp";
  if (value.includes("gif")) return "gif";
  if (value.includes("mp4")) return "mp4";
  if (value.includes("webm")) return "webm";
  if (value.includes("png")) return "png";
  return "bin";
}

async function saveHistoryFile(body) {
  const projectName = String(body?.projectName || "").trim();
  const projectId = String(body?.projectId || "").trim();
  if (!projectName && !projectId) {
    const error = new Error("Missing project info");
    error.statusCode = 400;
    throw error;
  }
  const folder = sanitizeProjectFolder(projectName, projectId);
  const projectDir = path.join(historyRootDir, folder);
  fs.mkdirSync(projectDir, { recursive: true });

  const type = body?.type === "video" ? "video" : "image";
  const createdAt = String(body?.createdAt || new Date().toISOString());
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const historyId = String(body?.historyId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "x";

  let filename = "";
  if (body?.dataBase64) {
    const dataUrlMatch = String(body.dataBase64).match(/^data:([^;,]+);base64,(.+)$/);
    const b64 = dataUrlMatch ? dataUrlMatch[2] : body.dataBase64;
    const mime = dataUrlMatch ? dataUrlMatch[1] : (body.mime || "image/png");
    const ext = mimeToExtFromMime(mime);
    filename = `${timestamp}_${type}_${historyId}.${ext}`;
    fs.writeFileSync(path.join(projectDir, filename), Buffer.from(b64, "base64"));
  } else if (body?.remoteUrl && /^https?:\/\//i.test(body.remoteUrl)) {
    try {
      const parsed = new URL(body.remoteUrl);
      if (isBlockedHost(parsed.hostname)) {
        return { ok: false, error: "blocked host" };
      }
      const response = await fetch(body.remoteUrl);
      if (!response.ok) return { ok: false, error: `fetch ${response.status}` };
      const buffer = Buffer.from(await response.arrayBuffer());
      const mime = response.headers.get("content-type") || (type === "video" ? "video/mp4" : "image/png");
      const ext = mimeToExtFromMime(mime);
      filename = `${timestamp}_${type}_${historyId}.${ext}`;
      fs.writeFileSync(path.join(projectDir, filename), buffer);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  } else {
    return { ok: false, error: "no media payload" };
  }

  const manifestPath = path.join(projectDir, "manifest.json");
  let manifest = { projectId, projectName, items: [] };
  try {
    const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (existing && Array.isArray(existing.items)) {
      manifest = { ...existing, projectId: existing.projectId || projectId, projectName: existing.projectName || projectName };
    }
  } catch {}
  manifest.items.unshift({
    id: historyId,
    type,
    filename,
    prompt: String(body?.prompt || "").slice(0, 4000),
    model: String(body?.model || ""),
    createdAt,
  });
  if (manifest.items.length > 500) manifest.items.length = 500;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { ok: true, folder, filename };
}

function sizeToAspectRatio(size) {
  if (!size) return null;
  const value = String(size).trim();
  if (/^\d+:\d+$/.test(value)) return value;
  const m = value.match(/^(\d+)x(\d+)$/i);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!w || !h) return null;
  const ratio = w / h;
  const known = [
    [1, 1], [16, 9], [9, 16], [4, 3], [3, 4], [3, 2], [2, 3], [21, 9], [9, 21], [3, 1], [1, 3],
  ];
  for (const [a, b] of known) {
    if (Math.abs(ratio - a / b) < 0.05) return `${a}:${b}`;
  }
  const gcd = (x, y) => y ? gcd(y, x % y) : x;
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

async function imageSourceToBase64(source) {
  const blob = await imageSourceToBlob(source);
  if (!blob) return "";
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function imageSourceToBlob(source) {
  if (typeof source !== "string" || !source) return null;

  const dataUrlMatch = source.match(/^data:([^;,]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const [, mime, b64] = dataUrlMatch;
    try {
      const buffer = Buffer.from(b64, "base64");
      const blob = new Blob([buffer], { type: mime || "image/png" });
      blob.filename = `ref.${mimeToExt(mime)}`;
      return blob;
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);
      if (isBlockedHost(parsed.hostname)) return null;
      const response = await fetch(source);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      const mime = response.headers.get("content-type") || "image/png";
      const blob = new Blob([buffer], { type: mime });
      blob.filename = `ref.${mimeToExt(mime)}`;
      return blob;
    } catch {
      return null;
    }
  }

  return null;
}

function mimeToExt(mime) {
  const value = String(mime || "").toLowerCase();
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("webp")) return "webp";
  return "png";
}

function ensureProvider(provider) {
  if (!provider?.apiKey) {
    const error = new Error(`Missing API key for ${provider?.kind || "?"} provider "${provider?.id || "?"}"`);
    error.statusCode = 401;
    throw error;
  }
  if (!provider?.baseUrl) {
    const error = new Error(`Missing Base URL for ${provider?.kind || "?"} provider "${provider?.id || "?"}"`);
    error.statusCode = 500;
    throw error;
  }
}

// 部分上游（如 147ai.com）把 gemini 香蕉系图像模型挂在对话接口而非图像端点，
// 这类模型必须走 /chat/completions，从返回的 markdown / data URL 里取图。
function isChatImageModel(model) {
  return /gemini.*image/i.test(String(model || ""));
}

// gemini 香蕉系常用宽高比（用来把任意像素尺寸吸附到最接近的标准比例）。
const GEMINI_ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

// 把 "2048x2048" / "1280x720" / "16:9" 吸附成最接近的标准比例标签；解析不出返回 ""。
// 香蕉 chat 接口忽略 size/aspect_ratio 字段，只认 prompt 里的文字描述，故需要这个标签。
function aspectLabelFromSize(size) {
  const s = String(size || "");
  const m = s.match(/^\s*(\d+(?:\.\d+)?)\s*[x×:]\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!m) return "";
  const ar = Number(m[1]) / Number(m[2]);
  if (!isFinite(ar) || ar <= 0) return "";
  let best = "";
  let bestD = Infinity;
  for (const label of GEMINI_ASPECTS) {
    const [a, b] = label.split(":").map(Number);
    const d = Math.abs(Math.log(a / b / ar));
    if (d < bestD) { bestD = d; best = label; }
  }
  return best;
}

// 从 chat.completions 响应里提取一张图片（base64 data URL 或 http URL）。
function extractImageFromChatMessage(data) {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return "";
  // 1) 部分上游返回 message.images: [{image_url:{url}}] / [{url}] / ["data:..."]
  if (Array.isArray(msg.images)) {
    for (const it of msg.images) {
      const u = it?.image_url?.url || it?.url || (typeof it === "string" ? it : "");
      if (u) return u;
    }
  }
  // 2) 从 content（字符串或分块数组）里抠 data URL / markdown 图片 / 图片链接
  const content = typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((p) => (typeof p === "string" ? p : p?.text || p?.image_url?.url || "")).join("\n")
      : "";
  const md = content.match(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)\s]+)\)/i);
  if (md) return md[1];
  const dataUrl = content.match(/data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUrl) return dataUrl[0];
  const httpUrl = content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i);
  if (httpUrl) return httpUrl[0];
  return "";
}

// 用对话接口生成图片：prompt 作 text，参考图作 image_url 一并发出。
async function chatImageGenerate(provider, model, refImages, body) {
  // chat 接口不认 size 字段，把宽高比写进 prompt 文字才有效（实测香蕉只跟随文字描述）
  let promptText = String(body?.prompt || "");
  const ratio = aspectLabelFromSize(body?.size);
  if (ratio) promptText += `\n\nGenerate the image with a ${ratio} aspect ratio.`;
  const content = [{ type: "text", text: promptText }];
  for (const source of Array.isArray(refImages) ? refImages.filter(Boolean) : []) {
    content.push({ type: "image_url", image_url: { url: String(source) } });
  }
  const data = await n1nFetch(provider, "/chat/completions", {
    method: "POST",
    body: { model, messages: [{ role: "user", content }], stream: false },
  });
  const url = extractImageFromChatMessage(data);
  if (!url) {
    const error = new Error("对话接口未返回可用的图片数据");
    error.statusCode = 502;
    throw error;
  }
  // 包装成与 /images/generations 一致的结构，前端 extractImageSource 即可识别
  return { data: [{ url }] };
}

async function n1nFetchForm(provider, route, form) {
  ensureProvider(provider);

  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}${route}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: form,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || data?.raw || `upstream HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

async function n1nFetch(provider, route, options = {}) {
  ensureProvider(provider);

  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}${route}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || data?.raw || `upstream HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function serveStatic(pathname, res) {
  const safePath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const resolved = path.resolve(publicDir, safePath);
  if (!resolved.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  const filePath = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
    ? path.join(resolved, "index.html")
    : resolved;

  if (!fs.existsSync(filePath)) {
    if (!path.extname(safePath)) {
      sendStaticFile(path.join(publicDir, "index.html"), res);
      return;
    }
    sendText(res, 404, "Not found");
    return;
  }

  sendStaticFile(filePath, res);
}

function sendStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

function readJson(req) {
  const maxBytes = 64 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
