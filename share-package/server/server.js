const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
loadDotEnv(path.join(rootDir, ".env"));

const publicDir = path.join(rootDir, "public");
const runtimeSettingsPath = path.join(rootDir, ".huobao-settings.json");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";

const sharedBaseUrl = process.env.N1N_BASE_URL || "https://api.n1n.ai/v1";
const sharedApiKey = process.env.N1N_API_KEY || "";
let runtimeSettings = loadRuntimeSettings();
const config = { services: buildServiceConfigs() };

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
    sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Huobao Canvas prototype running at http://${host}:${port}`);
});

function buildServiceConfigs() {
  return {
    chat: createServiceConfig("chat", "CHAT", "gpt-4o"),
    image: createServiceConfig("image", "IMAGE", "doubao-seedream-4-5-251128"),
    video: createServiceConfig("video", "VIDEO", "veo3.1-fast"),
  };
}

function refreshServiceConfigs() {
  config.services = buildServiceConfigs();
}

function createServiceConfig(serviceName, kind, fallbackModel) {
  const baseUrlEnv = `N1N_${kind}_BASE_URL`;
  const apiKeyEnv = `N1N_${kind}_API_KEY`;
  const modelEnv = `N1N_${kind}_MODEL`;
  const sharedSettings = runtimeSettings.shared || {};
  const serviceSettings = runtimeSettings.services?.[serviceName] || {};
  return {
    baseUrl: serviceSettings.baseUrl || process.env[baseUrlEnv] || sharedSettings.baseUrl || sharedBaseUrl,
    apiKey: serviceSettings.apiKey || process.env[apiKeyEnv] || sharedSettings.apiKey || sharedApiKey,
    model: serviceSettings.model || process.env[modelEnv] || fallbackModel,
    baseUrlEnv,
    apiKeyEnv,
    modelEnv,
    usingRuntimeBaseUrl: Boolean(serviceSettings.baseUrl),
    usingRuntimeApiKey: Boolean(serviceSettings.apiKey),
    usingSharedBaseUrl: !serviceSettings.baseUrl && !process.env[baseUrlEnv],
    usingSharedApiKey: !serviceSettings.apiKey && !process.env[apiKeyEnv],
  };
}

function publicServiceStatus(service) {
  return {
    configured: Boolean(service.apiKey),
    baseUrl: service.baseUrl,
    model: service.model,
    baseUrlEnv: service.usingRuntimeBaseUrl ? ".huobao-settings.json" : service.usingSharedBaseUrl ? "N1N_BASE_URL" : service.baseUrlEnv,
    apiKeyEnv: service.usingRuntimeApiKey ? ".huobao-settings.json" : service.usingSharedApiKey ? "N1N_API_KEY" : service.apiKeyEnv,
    modelEnv: service.modelEnv,
  };
}

function loadRuntimeSettings() {
  try {
    return JSON.parse(fs.readFileSync(runtimeSettingsPath, "utf8"));
  } catch {
    return { shared: {}, services: {} };
  }
}

function saveRuntimeSettings() {
  fs.writeFileSync(runtimeSettingsPath, JSON.stringify(runtimeSettings, null, 2));
}

function updateRuntimeSettings(body = {}) {
  const next = {
    shared: { ...(runtimeSettings.shared || {}) },
    services: { ...(runtimeSettings.services || {}) },
  };

  if (body.baseUrl !== undefined) {
    const baseUrl = normalizeBaseUrl(body.baseUrl);
    if (baseUrl) next.shared.baseUrl = baseUrl;
  }

  for (const kind of ["chat", "image", "video"]) {
    const service = body.services?.[kind];
    if (!service) continue;
    const current = { ...(next.services[kind] || {}) };

    if (service.baseUrl !== undefined) {
      const baseUrl = normalizeBaseUrl(service.baseUrl);
      if (baseUrl) current.baseUrl = baseUrl;
    }
    if (service.model !== undefined) {
      const model = String(service.model || "").trim();
      if (model) current.model = model;
    }
    if (service.apiKey !== undefined) {
      const apiKey = String(service.apiKey || "").trim();
      if (apiKey) current.apiKey = apiKey;
    }

    next.services[kind] = current;
  }

  runtimeSettings = next;
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

async function handleApi(req, res, url) {
  if (url.pathname === "/api/status" && req.method === "GET") {
    const services = {
      chat: publicServiceStatus(config.services.chat),
      image: publicServiceStatus(config.services.image),
      video: publicServiceStatus(config.services.video),
    };
    sendJson(res, 200, {
      configured: Object.values(services).some((service) => service.configured),
      baseUrl: runtimeSettings.shared?.baseUrl || sharedBaseUrl,
      chatModel: services.chat.model,
      imageModel: services.image.model,
      videoModel: services.video.model,
      services,
    });
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "POST") {
    const body = await readJson(req);
    updateRuntimeSettings(body);
    refreshServiceConfigs();
    const services = {
      chat: publicServiceStatus(config.services.chat),
      image: publicServiceStatus(config.services.image),
      video: publicServiceStatus(config.services.video),
    };
    sendJson(res, 200, {
      configured: Object.values(services).some((service) => service.configured),
      baseUrl: runtimeSettings.shared?.baseUrl || sharedBaseUrl,
      chatModel: services.chat.model,
      imageModel: services.image.model,
      videoModel: services.video.model,
      services,
    });
    return;
  }

  if (url.pathname === "/api/image-proxy" && req.method === "GET") {
    await proxyImage(url, res);
    return;
  }

  if (url.pathname === "/api/chat/polish" && req.method === "POST") {
    const body = await readJson(req);
    const data = await n1nFetch("chat", "/chat/completions", {
      method: "POST",
      body: {
        model: body.model || config.services.chat.model,
        messages: [
          {
            role: "system",
            content: "你是专业 AI 视觉创作提示词专家。把用户输入润色成适合图像和视频生成的中文提示词，只返回润色后的提示词。",
          },
          { role: "user", content: body.text || "" },
        ],
        max_tokens: 800,
      },
    });
    sendJson(res, 200, { text: data?.choices?.[0]?.message?.content?.trim() || body.text || "" });
    return;
  }

  if (url.pathname === "/api/images/generations" && req.method === "POST") {
    const body = await readJson(req);
    const payload = compactPayload({
      ...body,
      model: body.model || config.services.image.model,
      prompt: body.prompt,
    });
    const data = await n1nFetch("image", "/images/generations", {
      method: "POST",
      body: payload,
    });
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === "/api/video/create" && req.method === "POST") {
    const body = await readJson(req);
    const data = await n1nFetch("video", "/video/create", {
      method: "POST",
      body: {
        enable_upsample: body.enable_upsample ?? true,
        enhance_prompt: body.enhance_prompt ?? true,
        images: body.images,
        model: body.model || config.services.video.model,
        prompt: body.prompt,
        aspect_ratio: body.aspect_ratio || "16:9",
      },
    });
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === "/api/video/query" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const data = await n1nFetch("video", `/video/query?id=${encodeURIComponent(id)}`, { method: "GET" });
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
      "User-Agent": "HuobaoCanvas/0.1",
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

async function n1nFetch(serviceName, route, options = {}) {
  const service = config.services[serviceName];
  if (!service?.apiKey) {
    const error = new Error(`Missing ${service?.apiKeyEnv || "N1N_API_KEY"} on the backend`);
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch(`${service.baseUrl.replace(/\/$/, "")}${route}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${service.apiKey}`,
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
    const error = new Error(data?.error?.message || data?.message || data?.raw || `n1n HTTP ${response.status}`);
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
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
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
