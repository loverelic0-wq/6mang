const viewport = document.querySelector("#viewport");
const grid = document.querySelector("#grid");
const world = document.querySelector("#world");
const edgeLayer = document.querySelector("#edgeLayer");
const nodeMenu = document.querySelector("#nodeMenu");
const chatInput = document.querySelector("#chatInput");
const autoExecute = document.querySelector("#autoExecute");
const processing = document.querySelector("#processing");
const processingText = document.querySelector("#processingText");
const zoomLabel = document.querySelector("#zoomLabel");
const saveStateLabel = document.querySelector("#saveState");
const settingsModal = document.querySelector("#settingsModal");
const apiBaseUrlInput = document.querySelector("#apiBaseUrl");
const apiKeyInput = document.querySelector("#apiKey");
const chatModelInput = document.querySelector("#chatModel");
const imageModelInput = document.querySelector("#imageModel");
const videoModelInput = document.querySelector("#videoModel");

const storageKey = "huobao-canvas-static:v1";
const apiConfigKey = "huobao-canvas-api-config:v1";
const defaultApiConfig = {
  baseUrl: "https://api.n1n.ai/v1",
  apiKey: "",
  chatModel: "gpt-4o",
  imageModel: "doubao-seedream-4-5-251128",
  videoModel: "veo3.1-fast",
};
const nodeSizes = {
  text: { width: 260, height: 210 },
  llmConfig: { width: 300, height: 230 },
  imageConfig: { width: 300, height: 260 },
  image: { width: 260, height: 350 },
  videoConfig: { width: 300, height: 250 },
  video: { width: 300, height: 250 },
};

let state = loadState();
let selectedNodeId = state.nodes[0]?.id ?? null;
let drag = null;
let pendingConnection = null;
let history = [];
let future = [];

function defaultState() {
  const textId = makeId();
  const imageConfigId = makeId();
  const imageId = makeId();
  const videoConfigId = makeId();
  const videoId = makeId();

  return {
    view: { x: 260, y: 130, zoom: 1 },
    theme: "light",
    nodes: [
      {
        id: textId,
        type: "text",
        position: { x: 80, y: 120 },
        data: { label: "提示词", content: "一只穿着雨衣的白色小猫，站在霓虹街角，电影感灯光，细节丰富。" },
      },
      {
        id: imageConfigId,
        type: "imageConfig",
        position: { x: 430, y: 110 },
        data: { label: "文生图", model: "doubao-seedream-4-5-251128", quality: "标准画质", size: "2048x2048", executed: true },
      },
      {
        id: imageId,
        type: "image",
        position: { x: 810, y: 80 },
        data: { label: "图像生成结果", model: "doubao-seedream-4-5-251128", url: true, public: true, gradient: "linear-gradient(135deg, #22d3ee, #6366f1 45%, #facc15)" },
      },
      {
        id: videoConfigId,
        type: "videoConfig",
        position: { x: 430, y: 430 },
        data: { label: "视频生成", model: "veo3.1-fast", ratio: "16:9", duration: 5, executed: true },
      },
      {
        id: videoId,
        type: "video",
        position: { x: 810, y: 430 },
        data: { label: "视频生成结果", model: "veo3.1-fast", url: true, gradient: "linear-gradient(135deg, #111827, #2563eb 55%, #f97316)" },
      },
    ],
    edges: [
      { id: makeId(), source: textId, target: imageConfigId, type: "promptOrder", data: { label: "提示词 1" } },
      { id: makeId(), source: imageConfigId, target: imageId, type: "output", data: { label: "输出" } },
      { id: makeId(), source: textId, target: videoConfigId, type: "promptOrder", data: { label: "提示词" } },
      { id: makeId(), source: imageId, target: videoConfigId, type: "imageRole", data: { label: "首帧" } },
      { id: makeId(), source: videoConfigId, target: videoId, type: "output", data: { label: "输出" } },
    ],
  };
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : defaultState();
  } catch {
    return defaultState();
  }
}

function loadApiConfig() {
  try {
    return { ...defaultApiConfig, ...(JSON.parse(localStorage.getItem(apiConfigKey)) || {}) };
  } catch {
    return { ...defaultApiConfig };
  }
}

function saveApiConfig(config) {
  localStorage.setItem(apiConfigKey, JSON.stringify({ ...defaultApiConfig, ...config }));
  syncApiSettingsForm();
}

function syncApiSettingsForm() {
  const config = loadApiConfig();
  apiBaseUrlInput.value = config.baseUrl;
  apiKeyInput.value = config.apiKey;
  chatModelInput.value = config.chatModel;
  imageModelInput.value = config.imageModel;
  videoModelInput.value = config.videoModel;
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  saveStateLabel.textContent = "本地已保存";
}

function snapshot() {
  return JSON.stringify({ nodes: state.nodes, edges: state.edges, view: state.view, theme: state.theme });
}

function commitHistory() {
  history.push(snapshot());
  if (history.length > 60) history.shift();
  future = [];
}

function restore(serialized) {
  const next = JSON.parse(serialized);
  state = { ...state, ...next };
  selectedNodeId = state.nodes[0]?.id ?? null;
  applyTheme();
  saveState();
  render();
}

function setView(nextView) {
  state.view = {
    x: nextView.x,
    y: nextView.y,
    zoom: clamp(nextView.zoom, 0.12, 2.2),
  };
  renderTransforms();
  saveState();
}

function render() {
  world.innerHTML = "";
  state.nodes.forEach((node) => world.append(renderNode(node)));
  renderTransforms();
  renderEdges();
  zoomLabel.textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function renderTransforms() {
  const { x, y, zoom } = state.view;
  const transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  world.style.transform = transform;
  edgeLayer.style.transform = transform;
  grid.style.transform = transform;
  grid.style.backgroundPosition = `${x}px ${y}px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function renderEdges() {
  edgeLayer.innerHTML = "";

  state.edges.forEach((edge) => {
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) return;

    const sourceSize = getRenderedNodeSize(source);
    const targetSize = getRenderedNodeSize(target);
    const sx = source.position.x + sourceSize.width + 0.5;
    const sy = source.position.y + sourceSize.height / 2;
    const tx = target.position.x + 0.5;
    const ty = target.position.y + targetSize.height / 2;
    const dx = Math.max(80, Math.abs(tx - sx) * 0.45);
    const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "edge-path");
    path.setAttribute("d", d);
    edgeLayer.append(path);
  });
}

function getRenderedNodeSize(node) {
  const element = [...world.querySelectorAll(".node")].find((item) => item.dataset.id === node.id);
  const card = element?.querySelector(".node-card");
  return {
    width: card?.offsetWidth || nodeSizes[node.type].width,
    height: card?.offsetHeight || nodeSizes[node.type].height,
  };
}

function renderNode(node) {
  const wrap = document.createElement("section");
  const size = nodeSizes[node.type];
  wrap.className = "node";
  wrap.dataset.id = node.id;
  wrap.dataset.type = node.type;
  wrap.style.setProperty("--x", `${node.position.x}px`);
  wrap.style.setProperty("--y", `${node.position.y}px`);
  wrap.style.setProperty("--node-width", `${size.width}px`);

  const card = document.createElement("div");
  card.className = "node-card";
  card.classList.toggle("selected", node.id === selectedNodeId);
  card.innerHTML = `
    <button class="node-port input" data-port="input" aria-label="输入连接点"></button>
    <div class="node-head">
      <span class="node-title">${escapeHtml(node.data.label || node.type)}</span>
      <div class="node-actions">
        <button class="node-action" data-node-action="duplicate" title="复制"><svg viewBox="0 0 24 24"><path d="M8 8h10v10H8z"/><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        <button class="node-action" data-node-action="delete" title="删除"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/></svg></button>
      </div>
    </div>
    <div class="node-body">${renderNodeBody(node)}</div>
    <button class="node-port output" data-port="output" aria-label="输出连接点"></button>
  `;

  wrap.append(card);
  return wrap;
}

function renderNodeBody(node) {
  if (node.type === "text") {
    return `<textarea data-field="content">${escapeHtml(node.data.content || "")}</textarea>`;
  }

  if (node.type === "llmConfig") {
    const output = node.data.output || "等待执行后输出优化后的提示词。";
    return `
      <div class="node-row"><span>模型</span><select data-field="model"><option>GPT-4o mini</option><option>Qwen Max</option><option>DeepSeek V3</option></select></div>
      <div class="node-tip">${escapeHtml(output)}</div>
      <button class="node-button" data-node-action="run-llm">生成文本</button>
    `;
  }

  if (node.type === "imageConfig") {
    const prompts = incomingNodes(node.id, ["text", "llmConfig"]).length;
    const refs = incomingNodes(node.id, ["image"]).length;
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${optionPairs([["doubao-seedream-4-5-251128", "Seedream 4.5"], ["gpt-image-1", "GPT Image"], ["flux-kontext", "Flux Kontext"]], node.data.model)}</select></div>
      <div class="node-row"><span>画质</span><select data-field="quality">${options(["标准画质", "高清画质", "4K"], node.data.quality)}</select></div>
      <div class="node-row"><span>尺寸</span><select data-field="size">${options(["1024x1024", "1536x1024", "2048x2048", "4096x2160"], node.data.size)}</select></div>
      <div class="node-indicators">
        <span class="indicator ${prompts ? "ready" : ""}">提示词 ${prompts || "○"}</span>
        <span class="indicator ${refs ? "ready" : ""}">参考图 ${refs || "○"}</span>
      </div>
      <div class="node-split">
        <button class="node-button" data-node-action="generate-image">新建生成</button>
        <button class="node-secondary-button" data-node-action="replace-image">替换</button>
      </div>
    `;
  }

  if (node.type === "image") {
    const media = node.data.loading
      ? `<div class="image-preview loading-card" style="--preview-bg:${node.data.gradient || ""}">创作中</div>`
      : node.data.url
        ? `<div class="image-preview" style="--preview-bg:${node.data.gradient || ""}">${typeof node.data.url === "string" ? `<img src="${escapeHtml(node.data.url)}" alt="${escapeHtml(node.data.label || "生成图片")}" loading="lazy">` : ""}</div>`
        : `<div class="empty-media">拖放图片<br />或输入图片地址</div>`;
    return `
      ${media}
      <div class="media-toolbar">
        <button data-node-action="image-to-image">图生图</button>
        <button data-node-action="image-to-video">生视频</button>
      </div>
      <div class="node-row"><span>公开引用</span><input type="checkbox" data-field="public" ${node.data.public ? "checked" : ""}></div>
    `;
  }

  if (node.type === "videoConfig") {
    const prompt = incomingNodes(node.id, ["text", "llmConfig"]).length;
    const firstFrame = incomingNodes(node.id, ["image"]).length;
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${optionPairs([["veo3.1-fast", "Veo 3.1 Fast"], ["veo3.1", "Veo 3.1"], ["kling-v2.5-turbo", "Kling 2.5"]], node.data.model)}</select></div>
      <div class="node-row"><span>比例</span><select data-field="ratio">${options(["16:9", "9:16", "1:1"], node.data.ratio)}</select></div>
      <div class="node-row"><span>时长</span><select data-field="duration">${options(["5", "8", "10"], String(node.data.duration || 5))}</select></div>
      <div class="node-indicators">
        <span class="indicator ${prompt ? "ready" : ""}">提示词 ${prompt ? "✓" : "○"}</span>
        <span class="indicator ${firstFrame ? "ready" : ""}">首帧 ${firstFrame ? "✓" : "○"}</span>
        <span class="indicator">尾帧 ○</span>
      </div>
      <button class="node-button" data-node-action="generate-video">生成视频</button>
    `;
  }

  if (node.type === "video") {
    const media = node.data.loading
      ? `<div class="video-preview loading-card" style="--preview-bg:${node.data.gradient || ""}">生成中</div>`
      : node.data.url
        ? `<div class="video-preview" style="--preview-bg:${node.data.gradient || ""}">${typeof node.data.url === "string" ? `<video src="${escapeHtml(node.data.url)}" controls></video>` : ""}</div>`
        : `<div class="empty-media">等待视频输出</div>`;
    return `
      ${media}
      <div class="node-tip">${node.data.taskId ? `Task: ${escapeHtml(node.data.taskId)}` : "模拟视频结果，可接入真实任务轮询。"}</div>
    `;
  }

  return "";
}

function options(values, current) {
  return values.map((value) => `<option ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function optionPairs(pairs, current) {
  return pairs.map(([value, label]) => {
    const selected = value === current || label === current ? "selected" : "";
    return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
  }).join("");
}

function getNode(id) {
  return state.nodes.find((node) => node.id === id);
}

function incomingNodes(targetId, types) {
  return state.edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => getNode(edge.source))
    .filter((node) => node && types.includes(node.type));
}

function updateNode(id, patch) {
  state.nodes = state.nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node));
  saveState();
  render();
}

function addNode(type, position = getViewportCenter(), data = {}) {
  commitHistory();
  const defaults = {
    text: { label: "文本节点", content: "" },
    llmConfig: { label: "LLM 文本生成", model: "GPT-4o mini" },
    imageConfig: { label: "文生图", model: loadApiConfig().imageModel, quality: "标准画质", size: "2048x2048" },
    image: { label: "图片节点", url: false, public: false },
    videoConfig: { label: "视频生成", model: loadApiConfig().videoModel, ratio: "16:9", duration: 5 },
    video: { label: "视频节点", url: false },
  };
  const node = {
    id: makeId(),
    type,
    position: { x: position.x, y: position.y },
    data: { ...defaults[type], ...data },
  };
  state.nodes = [...state.nodes, node];
  selectedNodeId = node.id;
  nodeMenu.hidden = true;
  saveState();
  render();
  return node.id;
}

function addEdge(source, target, type = "default", data = {}) {
  if (source === target || state.edges.some((edge) => edge.source === source && edge.target === target)) return;
  commitHistory();
  state.edges = [...state.edges, { id: makeId(), source, target, type, data }];
  saveState();
  render();
}

function removeNode(id) {
  commitHistory();
  state.nodes = state.nodes.filter((node) => node.id !== id);
  state.edges = state.edges.filter((edge) => edge.source !== id && edge.target !== id);
  selectedNodeId = state.nodes[0]?.id ?? null;
  saveState();
  render();
}

function duplicateNode(id) {
  const node = getNode(id);
  if (!node) return;
  return addNode(node.type, { x: node.position.x + 36, y: node.position.y + 36 }, { ...node.data, label: `${node.data.label} copy` });
}

function hasApiKey() {
  return Boolean(loadApiConfig().apiKey?.trim());
}

async function apiFetch(path, options = {}) {
  const config = loadApiConfig();
  if (!config.apiKey?.trim()) {
    throw new Error("请先在 API 设置里保存 Key");
  }

  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.raw || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function normalizeImageSize(size) {
  if (!size) return "2K";
  if (String(size).includes("4096")) return "4K";
  if (String(size).includes("2048")) return "2K";
  return String(size);
}

function getNodePrompt(targetId) {
  return incomingNodes(targetId, ["text", "llmConfig"])
    .map((node) => node.data.output || node.data.content || "")
    .filter(Boolean)
    .join("\n\n");
}

async function polishWithApi(text) {
  const config = loadApiConfig();
  const data = await apiFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: config.chatModel,
      messages: [
        {
          role: "system",
          content: "你是专业 AI 视觉创作提示词专家。把用户输入润色成适合图像和视频生成的中文提示词，只返回润色后的提示词。",
        },
        { role: "user", content: text },
      ],
      max_tokens: 800,
    }),
  });
  return data?.choices?.[0]?.message?.content?.trim() || text;
}

async function requestImageGeneration(configNode, prompt, refImages = []) {
  const config = loadApiConfig();
  const body = {
    model: config.imageModel || configNode.data.model || defaultApiConfig.imageModel,
    prompt,
    sequential_image_generation: "disabled",
    size: normalizeImageSize(configNode.data.size),
    watermark: false,
  };
  if (refImages.length) body.image = refImages;

  const data = await apiFetch("/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error("图像接口未返回图片 URL");
  return url;
}

async function requestVideoCreate(configNode, prompt, images = []) {
  const config = loadApiConfig();
  return apiFetch("/video/create", {
    method: "POST",
    body: JSON.stringify({
      enable_upsample: true,
      enhance_prompt: true,
      model: config.videoModel || configNode.data.model || defaultApiConfig.videoModel,
      prompt,
      aspect_ratio: configNode.data.ratio || "16:9",
      ...(images.length ? { images } : {}),
    }),
  });
}

async function requestVideoQuery(taskId) {
  return apiFetch(`/video/query?id=${encodeURIComponent(taskId)}`, { method: "GET" });
}

function generateGradient(seed = "") {
  const gradients = [
    "linear-gradient(135deg, #22d3ee, #6366f1 45%, #facc15)",
    "linear-gradient(135deg, #0f172a, #7c3aed 48%, #f97316)",
    "linear-gradient(135deg, #14b8a6, #84cc16 45%, #f59e0b)",
    "linear-gradient(135deg, #f472b6, #8b5cf6 48%, #38bdf8)",
  ];
  const index = Math.abs([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % gradients.length;
  return gradients[index];
}

async function generateImage(configId, replace = false) {
  const config = getNode(configId);
  if (!config) return;
  const prompt = getNodePrompt(configId) || "高质量 AI 生成图片";
  const refImages = incomingNodes(configId, ["image"])
    .map((node) => node.data.url)
    .filter((url) => typeof url === "string");
  const existing = state.edges.map((edge) => edge.source === configId && getNode(edge.target)).find((node) => node?.type === "image");

  let imageId = replace && existing ? existing.id : null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 390, y: config.position.y }, { label: "图像生成结果", loading: true, model: config.data.model });
    addEdge(configId, imageId, "output", { label: "输出" });
  } else {
    updateNode(imageId, { loading: true, url: false });
  }

  showProcessing(hasApiKey() ? "正在调用 n1n 图像接口..." : "未配置 API Key，使用本地模拟生成...");

  if (!hasApiKey()) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, public: true, model: config.data.model, gradient: generateGradient(prompt || config.data.model) });
      updateNode(configId, { executed: true });
      hideProcessing("图片生成成功（模拟）");
    }, 850);
    return;
  }

  try {
    const url = await requestImageGeneration(config, prompt, refImages);
    updateNode(imageId, { loading: false, url, public: true, model: config.data.model, gradient: generateGradient(prompt || config.data.model) });
    updateNode(configId, { executed: true });
    hideProcessing("图片生成成功");
  } catch (error) {
    updateNode(imageId, { loading: false, url: false, error: error.message });
    processing.hidden = true;
    showToast(`图片生成失败：${error.message}`);
  }
}

async function generateVideo(configId) {
  const config = getNode(configId);
  if (!config) return;
  const videoId = addNode("video", { x: config.position.x + 370, y: config.position.y }, { label: "视频生成中...", loading: true, model: config.data.model, taskId: `task_${Date.now()}` });
  addEdge(configId, videoId, "output", { label: "输出" });
  const prompt = getNodePrompt(configId) || "make animate";
  const images = incomingNodes(configId, ["image"])
    .map((node) => node.data.url)
    .filter((url) => typeof url === "string");

  showProcessing(hasApiKey() ? "正在创建 n1n 视频任务..." : "未配置 API Key，使用本地模拟生成...");

  if (!hasApiKey()) {
    setTimeout(() => {
      updateNode(videoId, { label: "视频生成结果", loading: false, url: true, gradient: generateGradient(config.data.model + config.data.ratio) });
      updateNode(configId, { executed: true });
      hideProcessing("视频任务已完成（模拟）");
    }, 1000);
    return;
  }

  try {
    const created = await requestVideoCreate(config, prompt, images);
    const taskId = created?.id;
    if (!taskId) throw new Error("视频接口未返回任务 ID");
    updateNode(videoId, { taskId, label: "视频生成中...", loading: true });
    await pollVideoTask(videoId, taskId);
    updateNode(configId, { executed: true });
    hideProcessing("视频任务已完成");
  } catch (error) {
    updateNode(videoId, { label: "生成失败", loading: false, error: error.message });
    processing.hidden = true;
    showToast(`视频生成失败：${error.message}`);
  }
}

async function pollVideoTask(videoId, taskId) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    processingText.textContent = `视频生成中，正在查询任务... ${attempt + 1}/24`;
    const result = await requestVideoQuery(taskId);
    if (result?.video_url) {
      updateNode(videoId, { label: "视频生成结果", loading: false, url: result.video_url, taskId, gradient: generateGradient(taskId) });
      return;
    }
    if (["failed", "error", "canceled"].includes(String(result?.status || "").toLowerCase())) {
      throw new Error(result?.error || `任务状态：${result.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  updateNode(videoId, { label: "视频生成中...", loading: true, taskId });
  throw new Error("任务仍在生成中，请稍后通过任务 ID 查询");
}

function createImageToImage(imageId) {
  const image = getNode(imageId);
  if (!image) return;
  const textId = addNode("text", { x: image.position.x + 320, y: image.position.y - 100 }, { label: "提示词", content: "保持主体一致，改成更强的电影光影。" });
  const configId = addNode("imageConfig", { x: image.position.x + 650, y: image.position.y }, { label: "图生图配置" });
  addEdge(imageId, configId, "imageOrder", { label: "参考图 1" });
  addEdge(textId, configId, "promptOrder", { label: "提示词 1" });
  showToast("已创建图生图工作流");
}

function createImageToVideo(imageId) {
  const image = getNode(imageId);
  if (!image) return;
  const textId = addNode("text", { x: image.position.x + 300, y: image.position.y - 100 }, { label: "提示词", content: "镜头缓慢推进，主体轻微动作，背景有空间纵深。" });
  const configId = addNode("videoConfig", { x: image.position.x + 620, y: image.position.y }, { label: "视频生成" });
  addEdge(imageId, configId, "imageRole", { label: "首帧" });
  addEdge(textId, configId, "promptOrder", { label: "提示词" });
  showToast("已创建视频生成工作流");
}

function sendMessage() {
  const content = chatInput.value.trim();
  if (!content) return;
  commitHistory();
  showProcessing(autoExecute.checked ? "正在分析并自动编排工作流..." : "正在创建节点...");
  const center = getViewportCenter();

  setTimeout(() => {
    if (autoExecute.checked) {
      createAutoWorkflow(content, center);
    } else {
      const textId = addNode("text", { x: center.x - 320, y: center.y - 120 }, { label: "提示词", content });
      const configId = addNode("imageConfig", { x: center.x + 20, y: center.y - 130 }, { label: "文生图" });
      addEdge(textId, configId, "promptOrder", { label: "提示词 1" });
    }
    chatInput.value = "";
    hideProcessing(autoExecute.checked ? "工作流已自动创建" : "节点已创建");
  }, 520);
}

function createAutoWorkflow(content, center) {
  const textId = addNode("text", { x: center.x - 460, y: center.y - 120 }, { label: "用户输入", content });
  const llmId = addNode("llmConfig", { x: center.x - 130, y: center.y - 140 }, { label: "AI 提示词润色", output: polishText(content) });
  const imageConfigId = addNode("imageConfig", { x: center.x + 240, y: center.y - 150 }, { label: "文生图配置" });
  const videoConfigId = addNode("videoConfig", { x: center.x + 240, y: center.y + 190 }, { label: "图生视频配置" });
  addEdge(textId, llmId, "promptOrder", { label: "输入" });
  addEdge(llmId, imageConfigId, "promptOrder", { label: "润色提示词" });
  addEdge(llmId, videoConfigId, "promptOrder", { label: "运动提示词" });
  generateImage(imageConfigId);
  setTimeout(() => {
    const imageEdge = state.edges.find((edge) => edge.source === imageConfigId);
    if (imageEdge) addEdge(imageEdge.target, videoConfigId, "imageRole", { label: "首帧" });
  }, 930);
}

function polishText(text) {
  return `${text}，高质量细节，清晰主体，统一风格，电影级光影，构图完整，适合 AI 图像/视频生成。`;
}

function getViewportCenter() {
  return {
    x: (viewport.clientWidth / 2 - state.view.x) / state.view.zoom,
    y: (viewport.clientHeight / 2 - state.view.y) / state.view.zoom,
  };
}

function fitView() {
  if (!state.nodes.length) return;
  const bounds = state.nodes.reduce((acc, node) => {
    const size = nodeSizes[node.type];
    return {
      minX: Math.min(acc.minX, node.position.x),
      minY: Math.min(acc.minY, node.position.y),
      maxX: Math.max(acc.maxX, node.position.x + size.width),
      maxY: Math.max(acc.maxY, node.position.y + size.height),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const zoom = clamp(Math.min((viewport.clientWidth - 180) / (bounds.maxX - bounds.minX), (viewport.clientHeight - 240) / (bounds.maxY - bounds.minY)), 0.25, 1.2);
  setView({
    zoom,
    x: viewport.clientWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom,
    y: viewport.clientHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom,
  });
}

function showProcessing(text) {
  processing.hidden = false;
  processingText.textContent = text;
}

function hideProcessing(text) {
  processing.hidden = true;
  showToast(text);
}

function showToast(text) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 1800);
}

function applyTheme() {
  document.body.classList.toggle("dark", state.theme === "dark");
}

function screenToWorld(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.x) / state.view.zoom,
    y: (clientY - rect.top - state.view.y) / state.view.zoom,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

viewport.addEventListener("pointerdown", (event) => {
  const interactive = event.target.closest("button, input, textarea, select");
  const nodeEl = event.target.closest(".node");

  if (nodeEl && !interactive) {
    const node = getNode(nodeEl.dataset.id);
    selectedNodeId = node.id;
    const start = screenToWorld(event.clientX, event.clientY);
    drag = { type: "node", id: node.id, startX: start.x, startY: start.y, nodeX: node.position.x, nodeY: node.position.y };
    nodeEl.setPointerCapture(event.pointerId);
    render();
    return;
  }

  if (!nodeEl) {
    selectedNodeId = null;
    drag = { type: "pan", startX: event.clientX, startY: event.clientY, viewX: state.view.x, viewY: state.view.y };
    viewport.classList.add("dragging");
    viewport.setPointerCapture(event.pointerId);
    render();
  }
});

viewport.addEventListener("pointermove", (event) => {
  if (!drag) return;
  if (drag.type === "pan") {
    setView({ ...state.view, x: drag.viewX + event.clientX - drag.startX, y: drag.viewY + event.clientY - drag.startY });
    return;
  }
  const point = screenToWorld(event.clientX, event.clientY);
  const node = getNode(drag.id);
  if (!node) return;
  node.position.x = drag.nodeX + point.x - drag.startX;
  node.position.y = drag.nodeY + point.y - drag.startY;
  saveState();
  render();
});

viewport.addEventListener("pointerup", (event) => {
  if (drag?.type === "node") commitHistory();
  drag = null;
  viewport.classList.remove("dragging");
  try { viewport.releasePointerCapture(event.pointerId); } catch {}
});

viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const point = screenToWorld(event.clientX, event.clientY);
    const rect = viewport.getBoundingClientRect();
    const zoom = clamp(state.view.zoom * Math.exp(-event.deltaY * 0.0012), 0.12, 2.2);
    setView({
      zoom,
      x: event.clientX - rect.left - point.x * zoom,
      y: event.clientY - rect.top - point.y * zoom,
    });
  } else {
    setView({ ...state.view, x: state.view.x - event.deltaX, y: state.view.y - event.deltaY });
  }
}, { passive: false });

document.addEventListener("click", async (event) => {
  const port = event.target.closest(".node-port");
  if (port) {
    const nodeId = port.closest(".node").dataset.id;
    if (port.dataset.port === "output") {
      pendingConnection = nodeId;
      document.querySelectorAll(".node-port").forEach((item) => item.classList.remove("active"));
      port.classList.add("active");
    } else if (pendingConnection) {
      addEdge(pendingConnection, nodeId, "default", { label: "连接" });
      pendingConnection = null;
      document.querySelectorAll(".node-port").forEach((item) => item.classList.remove("active"));
    }
    return;
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  const nodeAction = event.target.closest("[data-node-action]")?.dataset.nodeAction;
  const nodeEl = event.target.closest(".node");

  if (nodeAction && nodeEl) {
    const id = nodeEl.dataset.id;
    if (nodeAction === "delete") removeNode(id);
    if (nodeAction === "duplicate") duplicateNode(id);
    if (nodeAction === "generate-image") generateImage(id);
    if (nodeAction === "replace-image") generateImage(id, true);
    if (nodeAction === "generate-video") generateVideo(id);
    if (nodeAction === "image-to-image") createImageToImage(id);
    if (nodeAction === "image-to-video") createImageToVideo(id);
    if (nodeAction === "run-llm") {
      const source = incomingNodes(id, ["text"]).map((node) => node.data.content).join(" ") || chatInput.value || "创意提示词";
      showProcessing(hasApiKey() ? "正在调用 n1n 聊天接口..." : "未配置 API Key，使用本地润色...");
      try {
        const output = hasApiKey() ? await polishWithApi(source) : polishText(source);
        updateNode(id, { output });
        hideProcessing("文本生成完成");
      } catch (error) {
        processing.hidden = true;
        showToast(`文本生成失败：${error.message}`);
      }
    }
    return;
  }

  if (!action) return;
  if (action === "toggle-node-menu") nodeMenu.hidden = !nodeMenu.hidden;
  if (action === "add-text") addNode("text");
  if (action === "add-llm") addNode("llmConfig");
  if (action === "add-image") addNode("image");
  if (action === "add-video") addNode("video");
  if (action === "add-image-config") addNode("imageConfig");
  if (action === "add-video-config") addNode("videoConfig");
  if (action === "zoom-in") setView({ ...state.view, zoom: state.view.zoom * 1.18 });
  if (action === "zoom-out") setView({ ...state.view, zoom: state.view.zoom / 1.18 });
  if (action === "fit-view") fitView();
  if (action === "send") sendMessage();
  if (action === "polish") {
    const source = chatInput.value.trim() || "一个高质量 AI 创作提示词";
    showProcessing(hasApiKey() ? "正在调用 n1n 润色提示词..." : "未配置 API Key，使用本地润色...");
    try {
      chatInput.value = hasApiKey() ? await polishWithApi(source) : polishText(source);
      hideProcessing("提示词已润色");
    } catch (error) {
      processing.hidden = true;
      showToast(`润色失败：${error.message}`);
    }
  }
  if (action === "theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState();
  }
  if (action === "settings") {
    syncApiSettingsForm();
    settingsModal.showModal();
  }
  if (action === "save-settings") {
    saveApiConfig({
      baseUrl: apiBaseUrlInput.value.trim() || defaultApiConfig.baseUrl,
      apiKey: apiKeyInput.value.trim(),
      chatModel: chatModelInput.value.trim() || defaultApiConfig.chatModel,
      imageModel: imageModelInput.value.trim() || defaultApiConfig.imageModel,
      videoModel: videoModelInput.value.trim() || defaultApiConfig.videoModel,
    });
    showToast("API 设置已保存到本地浏览器");
  }
  if (action === "workflow-panel") {
    autoExecute.checked = true;
    chatInput.value = "生成多角度分镜，并把第一张图转成视频";
    showToast("已填入工作流模板");
  }
  if (action === "undo" && history.length) {
    future.push(snapshot());
    restore(history.pop());
  }
  if (action === "redo" && future.length) {
    history.push(snapshot());
    restore(future.pop());
  }
});

document.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  const nodeEl = event.target.closest(".node");
  if (!field || !nodeEl) return;
  const node = getNode(nodeEl.dataset.id);
  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  node.data[field] = value;
  saveState();
  if (field !== "content") render();
});

document.querySelectorAll("[data-suggestion]").forEach((button) => {
  button.addEventListener("click", () => {
    chatInput.value = button.dataset.suggestion;
    chatInput.focus();
  });
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (history.length) {
      future.push(snapshot());
      restore(history.pop());
    }
  }
});

applyTheme();
render();
