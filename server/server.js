const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rootDir = path.resolve(__dirname, "..");
loadDotEnv(path.join(rootDir, ".env"));

const db = require("./db");
const { createKlingCli, isKlingProvider } = require("./kling-cli");
const { isCprtProvider, buildCprtCreatePayload, normalizeCprtTask } = require("./cprt-provider");
const { imageReferences, isGptImage2Model, selectImageUpstreamRequest } = require("./image-routing");
const { requestText } = require("./upstream-http");

const kling = createKlingCli({ rootDir, errorLogPath: path.join(rootDir, "data", "kling-error.log") });

const publicDir = path.join(rootDir, "public");
const runtimeSettingsPath = path.join(rootDir, ".huobao-settings.json");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const adminToken = process.env.ADMIN_TOKEN || "";
const GPT_IMAGE_2_TIMEOUT_MS = 15 * 60 * 1000;

const modelCostRules = {
  chat: { default: 1 },
  image: {
    "gpt-image-2": 15,
    "gemini-3-pro-image-preview": 10,
    "gemini-3.1-flash-image-preview": 6,
    "doubao-seedream-5-0-pro-260628": 8,
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

const STORYBOARD_ASSISTANT_SYSTEM = `你是一位专业的影视分镜导演助手，兼具电影导演、分镜设计师、镜头语言顾问、AI视觉提示词专家的能力。

你的任务不是简单罗列镜头，而是根据用户提供的故事、剧本、广告概念、情绪主题或已有关键画面，设计出具有叙事逻辑、情绪推进、空间调度、镜头节奏与AI生成可执行性的分镜方案。

你必须遵循以下原则：

1. 优先理解剧情目标
- 先判断场景的核心事件、情绪阶段、信息重点、主观视角
- 明确这一场戏是交代、推进、转折、爆发还是收束

2. 分镜必须具备镜头语言逻辑
- 合理使用远景、全景、中景、近景、特写
- 明确机位、角度、视线关系、空间关系
- 尽量保证镜头组接自然，符合剪辑逻辑
- 涉及对话场景时，注意180度法则、正反打逻辑和视线匹配
- 涉及动作场景时，注意动作起承转合与连接镜头
- 适当加入环境镜头、空镜、反应镜头、细节镜头来增强节奏与氛围

3. 必须服务于AI影视生成
- 输出的镜头描述应适合图像模型和视频模型理解
- 避免过度抽象、无法具象化的描述
- 角色、场景、服装、道具、时间、天气、光线要尽量保持一致
- 对容易导致角色漂移或场景不一致的镜头，主动进行拆分和约束
- 能区分关键画面镜头、补镜、转场镜头、氛围镜头

4. 输出要结构化、可执行
默认输出包含以下字段：
- 镜头编号
- 镜头类型 / 景别
- 画面内容
- 机位 / 运镜
- 情绪 / 叙事作用
- 时长建议
- AI生成建议
必要时追加：
- Midjourney提示词
- 视频生成提示词
- 转场建议
- 音效 / 配乐建议
- 剪辑节奏建议

5. 当用户输入较模糊时
- 先自动补足合理的影视化设定
- 不要停留在空泛描述
- 直接给出可用方案，并标明关键假设
- 如果用户输入已经包含具体人物、地点、事件、时间、天气、道具或情绪，必须保留这些事实，不能改写成无关的通用场景

6. 输出风格要求
- 语言专业但清晰
- 注重镜头背后的叙事目的
- 避免堆砌华丽词藻
- 优先可拍、可生成、可剪辑

工作流程规则：

当用户给出故事或场景时，按以下顺序工作：

第一步：先提炼场景目标
- 这场戏讲什么
- 观众要接收到什么
- 情绪如何变化

第二步：设计镜头结构
- 先给出镜头组思路
- 再展开成逐镜分镜

第三步：判断哪些镜头是关键画面
- 哪些适合先生成静帧
- 哪些适合后续补动态

第四步：如用户需要，继续输出：
- AI绘图提示词
- 视频提示词
- 剪辑节奏建议
- 配音文案
- 配乐方向

优先识别最值得先生成的关键镜头，帮助用户先建立视觉锚点，再补充过渡镜头与连接镜头。
在连续镜头中，主动维护角色外观、服装、场景材质、光线氛围、镜头语言风格的一致性，避免AI生成中的视觉漂移。`;

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
      volc: {
        label: "火山 Seedream",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiKey: "",
        defaultModel: "doubao-seedream-5-0-pro-260628",
        models: [
          { id: "doubao-seedream-5-0-pro-260628", label: "豆包 Seedream 5.0 Pro（火山引擎）" },
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
  return ensureManagedProviders(JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)));
}

function managedKlingProvider() {
  return {
    label: "可灵 CLI",
    adapter: "kling-cli",
    managed: true,
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
    models: [],
  };
}

function ensureManagedProviders(providers) {
  for (const kind of ["image", "video"]) {
    if (!providers[kind]) providers[kind] = { default: "kling-cli", items: {} };
    if (!providers[kind].items) providers[kind].items = {};
    providers[kind].items["kling-cli"] = managedKlingProvider();
    if (!providers[kind].default) providers[kind].default = "kling-cli";
  }
  return providers;
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
  return ensureManagedProviders(out);
}

function normalizeProviderItem(pdef) {
  return {
    label: String(pdef.label || ""),
    adapter: pdef.adapter === "kling-cli" ? "kling-cli" : "http",
    managed: Boolean(pdef.managed || pdef.adapter === "kling-cli"),
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
  return { kind, id, ...item, apiKey: resolveProviderApiKey(kind, id, item) };
}

function resolveProviderApiKey(kind, id, item) {
  if (item.apiKey) return item.apiKey;
  if (kind === "image" && id === "volc") {
    return runtimeSettings.providers?.video?.items?.volc?.apiKey || "";
  }
  return "";
}

async function publicProvidersStatus() {
  const klingStatus = await kling.status();
  let klingCapabilities = null;
  if (klingStatus.authenticated) {
    try { klingCapabilities = await kling.capabilities(); } catch {}
  }
  const out = {};
  for (const kind of ["chat", "image", "video"]) {
    const group = runtimeSettings.providers?.[kind] || { default: "", items: {} };
    const items = {};
    for (const [id, item] of Object.entries(group.items || {})) {
      if (isKlingProvider(item)) {
        const models = klingCapabilities?.providers?.[kind]?.models || [];
        items[id] = {
          label: item.label,
          adapter: "kling-cli",
          managed: true,
          baseUrl: "",
          defaultModel: models.some((model) => model.id === item.defaultModel) ? item.defaultModel : models[0]?.id || "",
          models,
          configured: Boolean(klingStatus.installed && klingStatus.authenticated),
          installed: Boolean(klingStatus.installed),
          authenticated: Boolean(klingStatus.authenticated),
          apiKeyMasked: "",
        };
        continue;
      }
      items[id] = {
        label: item.label,
        adapter: item.adapter || "http",
        managed: false,
        baseUrl: item.baseUrl,
        defaultModel: item.defaultModel,
        models: item.models,
        configured: Boolean(resolveProviderApiKey(kind, id, item)),
        apiKeyMasked: maskApiKey(resolveProviderApiKey(kind, id, item)),
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
      if (id === "kling-cli" && ["image", "video"].includes(kind)) {
        items[id] = managedKlingProvider();
        continue;
      }
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
    if (["image", "video"].includes(kind)) items["kling-cli"] = managedKlingProvider();
    const def = incomingKind.default && items[incomingKind.default] ? incomingKind.default : Object.keys(items)[0];
    next[kind] = { default: def, items };
  }
  runtimeSettings = { providers: ensureManagedProviders(next) };
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

function requireAdminOrThrow(req) {
  if (requireAdmin(req)) return;
  const error = new Error("需要管理员权限");
  error.statusCode = 403;
  throw error;
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

  if (url.pathname === "/api/kling/status" && req.method === "GET") {
    requireAdminOrThrow(req);
    const refresh = url.searchParams.get("refresh") === "1";
    sendJson(res, 200, await kling.status({ refresh }));
    return;
  }

  if (url.pathname === "/api/kling/login" && req.method === "POST") {
    requireAdminOrThrow(req);
    sendJson(res, 202, kling.startLogin());
    return;
  }

  if (url.pathname === "/api/kling/logout" && req.method === "POST") {
    requireAdminOrThrow(req);
    sendJson(res, 200, await kling.logout());
    return;
  }

  if (url.pathname === "/api/kling/refresh" && req.method === "POST") {
    requireAdminOrThrow(req);
    const status = await kling.status({ refresh: true });
    const account = status.authenticated ? await kling.account() : null;
    sendJson(res, 200, { ...status, account });
    return;
  }

  if (url.pathname === "/api/kling/account" && req.method === "GET") {
    requireAdminOrThrow(req);
    sendJson(res, 200, await kling.account());
    return;
  }

  if (url.pathname === "/api/kling/tools" && req.method === "GET") {
    requireAdminOrThrow(req);
    sendJson(res, 200, await kling.tools());
    return;
  }

  const klingTaskMatch = /^\/api\/kling\/tasks\/([^/]+)$/.exec(url.pathname);
  if (klingTaskMatch && req.method === "GET") {
    requireUser(req);
    sendJson(res, 200, await kling.queryTask(decodeURIComponent(klingTaskMatch[1])));
    return;
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    sendJson(res, 200, { providers: await publicProvidersStatus() });
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "POST") {
    if (!requireAdmin(req)) {
      sendJson(res, 403, { error: "需要管理员权限" });
      return;
    }
    const body = await readJson(req);
    applyProvidersUpdate(body.providers);
    sendJson(res, 200, { providers: await publicProvidersStatus() });
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

  if (url.pathname === "/api/chat/storyboard-assistant" && req.method === "POST") {
    const found = requireUser(req);
    const body = await readJson(req);
    const provider = getProvider("chat", body.providerId);
    const model = body.model || provider.defaultModel;
    const cost = costFor("chat", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `storyboard-assistant ${model}` });
    try {
      const userText = [
        body.text ? `用户故事/场景（必须围绕以下内容设计，不得替换成无关场景）：\n${body.text}` : "",
        body.requirements ? `补充要求：\n${body.requirements}` : "",
      ].filter(Boolean).join("\n\n");
      const data = await n1nFetch(provider, "/chat/completions", {
        method: "POST",
        body: {
          model,
          messages: [
            { role: "system", content: STORYBOARD_ASSISTANT_SYSTEM },
            { role: "user", content: userText || "请根据一个较模糊的影视场景创意，自动补足合理设定并输出可执行分镜方案。" },
          ],
          max_tokens: 4000,
        },
      });
      db.recordApiUsage({ userId: found.user.id, route: "chat/storyboard-assistant", model, cost, status: "ok" });
      sendJson(res, 200, { text: data?.choices?.[0]?.message?.content?.trim() || "" });
    } catch (error) {
      db.adjustBalance({ userId: found.user.id, delta: cost, type: "refund", description: `refund storyboard-assistant ${model}: ${error.message}` });
      db.recordApiUsage({ userId: found.user.id, route: "chat/storyboard-assistant", model, cost: 0, status: `error: ${error.message}` });
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
    const refImages = imageReferences(body);
    if (isKlingProvider(provider)) {
      const data = await kling.submit({
        tool: refImages.length ? "image_to_image" : "text_to_image",
        model,
        prompt: String(body.prompt || ""),
        params: body.dynamicParams,
        images: refImages,
        rationale: body.rationale,
      });
      sendJson(res, 200, data);
      return;
    }
    const upstreamRequest = isChatImageModel(model) ? null : selectImageUpstreamRequest(provider, body);
    const cost = costFor("image", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `image ${model}` });
    try {
      let data;
      if (isChatImageModel(model)) {
        // gemini 香蕉系（如 147ai.com）不走 images 端点，改用 /chat/completions 对话生图
        data = await chatImageGenerate(provider, model, refImages, body);
      } else if (upstreamRequest.mode === "multipart") {
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
        data = await n1nFetchForm(provider, upstreamRequest.route, form, {
          timeoutMs: isGptImage2Model(model) ? GPT_IMAGE_2_TIMEOUT_MS : 0,
        });
      } else {
        data = await n1nFetch(provider, upstreamRequest.route, {
          method: "POST",
          body: upstreamRequest.payload,
          timeoutMs: isGptImage2Model(model) ? GPT_IMAGE_2_TIMEOUT_MS : 0,
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
    if (isKlingProvider(provider)) {
      const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
      const videos = Array.isArray(body.videos) ? body.videos.filter(Boolean) : [];
      if (videos.length) {
        const error = new Error("可灵 CLI 当前未声明参考视频输入，请改用图片参考或切换其他视频渠道");
        error.statusCode = 400;
        throw error;
      }
      const data = await kling.submit({
        tool: images.length ? "image_to_video" : "text_to_video",
        model,
        prompt: String(body.prompt || ""),
        params: body.dynamicParams,
        images,
        rationale: body.rationale,
      });
      sendJson(res, 200, data);
      return;
    }
    const cost = costFor("video", model);
    db.adjustBalance({ userId: found.user.id, delta: -cost, type: "spend", description: `video ${model}` });
    try {
      // Ark 与 CPRT 都只接受公网素材；本地 data URL 先传 COS 换公网外链。
      if ((isVolcArkProvider(provider) || isCprtProvider(provider)) && Array.isArray(body.videos) && body.videos.length) {
        body.videos = await Promise.all(body.videos.map((v) => ensurePublicMediaUrl(v, "video")));
      }
      if (isCprtProvider(provider) && Array.isArray(body.images) && body.images.length) {
        body.images = await Promise.all(body.images.map((v) => ensurePublicMediaUrl(v, "image")));
      }
      const data = isCprtProvider(provider)
        ? await n1nFetch(provider, "/chat/asyncTask", {
            method: "POST",
            body: buildCprtCreatePayload(model, body),
          })
        : isVolcArkProvider(provider)
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
        cprt: isCprtProvider(provider),
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

  if (url.pathname === "/api/history/file" && req.method === "GET") {
    serveHistoryFile(req, url, res);
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
    if (isKlingProvider(provider)) {
      data = await kling.queryTask(id);
    } else if (isCprtProvider(provider)) {
      const raw = await n1nFetch(provider, `/chat/asyncTask/${encodeURIComponent(id)}`, { method: "GET" });
      data = normalizeCprtTask(raw, id);
    } else if (isVolcArkProvider(provider)) {
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
    const mediaLabel = kindHint === "video" ? "视频" : "图片";
    throw new Error(`本地${mediaLabel}需先上传对象存储，但服务器未配置 COS_*（见 .env.example）`);
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

  const fileUrl = `/api/history/file?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(filename)}`;
  return { ok: true, folder, filename, historyId, fileUrl };
}

// 把已落盘的历史素材（output/<folder>/<filename>）回流给前端播放/预览。
// 上游视频地址是临时签名链接，刷新后必失效；本地文件才是持久来源。
function serveHistoryFile(req, url, res) {
  let folder = String(url.searchParams.get("folder") || "");
  let name = String(url.searchParams.get("name") || "");
  // 旧历史记录只存了 historyId，没有 folder/name —— 用 projectId/projectName 反推目录、查 manifest 拿文件名。
  if (!folder) {
    folder = sanitizeProjectFolder(url.searchParams.get("projectName") || "", url.searchParams.get("projectId") || "");
  }
  if (!name) {
    const historyId = String(url.searchParams.get("historyId") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16);
    if (historyId && folder && !/[\\/]/.test(folder) && !folder.includes("..")) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(historyRootDir, folder, "manifest.json"), "utf8"));
        const hit = (manifest.items || []).find((it) => String(it.id) === historyId && it.filename);
        if (hit) name = hit.filename;
      } catch {}
    }
  }
  // folder / name 都不允许出现路径分隔符，杜绝目录穿越。
  if (!folder || !name || /[\\/]/.test(folder) || /[\\/]/.test(name) || name.includes("..") || folder.includes("..")) {
    sendText(res, 400, "Invalid history file ref");
    return;
  }
  const resolved = path.resolve(historyRootDir, folder, name);
  if (!resolved.startsWith(historyRootDir + path.sep)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    sendText(res, 404, "History file not found");
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = historyFileMime[ext] || "application/octet-stream";
  const stat = fs.statSync(resolved);
  const range = req.headers.range;
  // 支持 Range，让 <video> 能拖动进度条/边下边播。
  const rangeMatch = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (rangeMatch) {
    let start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
    let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Cache-Control": "private, max-age=86400",
    });
    fs.createReadStream(resolved, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": stat.size,
    "Cache-Control": "private, max-age=86400",
  });
  fs.createReadStream(resolved).pipe(res);
}

const historyFileMime = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

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

function wrapUpstreamNetworkError(provider, error, timeoutMs) {
  const code = String(error?.code || error?.cause?.code || "");
  const label = provider?.label || provider?.id || "图片上游";
  let message;
  if (code === "UPSTREAM_TIMEOUT") {
    message = `上游「${label}」等待超过 ${Math.round(timeoutMs / 60000)} 分钟，生成已中止`;
  } else if (code === "ECONNREFUSED") {
    message = `无法连接上游「${label}」（连接被拒绝）`;
  } else if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    message = `无法解析上游「${label}」的网络地址`;
  } else {
    message = `上游「${label}」网络连接失败${code ? `（${code}）` : ""}`;
  }
  const wrapped = new Error(message);
  wrapped.statusCode = code === "UPSTREAM_TIMEOUT" ? 504 : 502;
  wrapped.cause = error;
  return wrapped;
}

async function n1nFetchForm(provider, route, form, options = {}) {
  ensureProvider(provider);

  let response;
  let text;
  if (options.timeoutMs) {
    const encoded = new Response(form);
    const body = Buffer.from(await encoded.arrayBuffer());
    try {
      response = await requestText(`${provider.baseUrl.replace(/\/$/, "")}${route}`, {
        method: "POST",
        timeoutMs: options.timeoutMs,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": encoded.headers.get("content-type"),
        },
        body,
      });
      text = response.text;
    } catch (error) {
      throw wrapUpstreamNetworkError(provider, error, options.timeoutMs);
    }
  } else {
    response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}${route}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: form,
    });
    text = await response.text();
  }
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

  const requestBody = options.body ? JSON.stringify(options.body) : undefined;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
  };
  let response;
  let text;
  if (options.timeoutMs) {
    try {
      response = await requestText(`${provider.baseUrl.replace(/\/$/, "")}${route}`, {
        method: options.method || "GET",
        headers,
        body: requestBody,
        timeoutMs: options.timeoutMs,
      });
      text = response.text;
    } catch (error) {
      throw wrapUpstreamNetworkError(provider, error, options.timeoutMs);
    }
  } else {
    response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}${route}`, {
      method: options.method || "GET",
      headers,
      body: requestBody,
    });
    text = await response.text();
  }
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
