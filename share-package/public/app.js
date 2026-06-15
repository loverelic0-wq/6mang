const appShell = document.querySelector("#appShell");
const projectHome = document.querySelector("#projectHome");
const projectGrid = document.querySelector("#projectGrid");
const projectCount = document.querySelector("#projectCount");
const projectImportInput = document.querySelector("#projectImportInput");
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
const projectNameLabel = document.querySelector("#projectName");
const settingsModal = document.querySelector("#settingsModal");
const apiBaseUrlInput = document.querySelector("#apiBaseUrl");
const apiKeyStatusInput = document.querySelector("#apiKeyStatus");
const chatModelInput = document.querySelector("#chatModel");
const imageModelInput = document.querySelector("#imageModel");
const videoModelInput = document.querySelector("#videoModel");
const serviceSettingInputs = {
  chat: {
    baseUrl: document.querySelector("#chatApiBaseUrl"),
    apiKey: document.querySelector("#chatApiKey"),
    keyStatus: document.querySelector("#chatApiKeyStatus"),
    env: document.querySelector("#chatApiEnv"),
  },
  image: {
    baseUrl: document.querySelector("#imageApiBaseUrl"),
    apiKey: document.querySelector("#imageApiKey"),
    keyStatus: document.querySelector("#imageApiKeyStatus"),
    env: document.querySelector("#imageApiEnv"),
  },
  video: {
    baseUrl: document.querySelector("#videoApiBaseUrl"),
    apiKey: document.querySelector("#videoApiKey"),
    keyStatus: document.querySelector("#videoApiKeyStatus"),
    env: document.querySelector("#videoApiEnv"),
  },
};
const contextMenu = document.createElement("div");
contextMenu.className = "context-menu";
contextMenu.hidden = true;
document.body.append(contextMenu);
const marqueeSelection = document.createElement("div");
marqueeSelection.className = "marquee-selection";
marqueeSelection.hidden = true;
document.body.append(marqueeSelection);

const templatePanel = document.createElement("aside");
templatePanel.className = "template-panel";
templatePanel.hidden = true;
templatePanel.innerHTML = `
  <div class="template-panel-head">
    <div>
      <span class="template-eyebrow">模板库</span>
      <h2>工作流模板</h2>
    </div>
    <button class="icon-button template-close" data-action="close-template-panel" title="关闭" aria-label="关闭模板库">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
    </button>
  </div>
  <div class="template-panel-actions">
    <button class="primary-small" data-action="save-workflow-template">保存当前</button>
    <button class="ghost-small" data-action="export-workflow-json">导出 JSON</button>
  </div>
  <div class="template-drop-zone" id="templateDropZone">
    <strong>拖入 JSON</strong>
    <span>加载工作流</span>
  </div>
  <div class="template-section-title">
    <span>模板分组</span>
    <button data-action="add-template-category">新建分组</button>
  </div>
  <div class="template-categories" id="templateCategories"></div>
  <div class="template-section-title">
    <span id="templateListTitle">模板</span>
  </div>
  <div class="template-list" id="templateList"></div>
`;
document.querySelector(".canvas-area").append(templatePanel);

const templateCategories = templatePanel.querySelector("#templateCategories");
const templateList = templatePanel.querySelector("#templateList");
const templateListTitle = templatePanel.querySelector("#templateListTitle");

const dropOverlay = document.createElement("div");
dropOverlay.className = "drop-overlay";
dropOverlay.hidden = true;
dropOverlay.innerHTML = `<div>释放以导入工作流 JSON</div>`;
document.body.append(dropOverlay);

const mentionQueryPattern = /@[\u4e00-\u9fa5A-Za-z0-9_]*$/;

const imagePreviewDialog = document.createElement("dialog");
imagePreviewDialog.className = "image-preview-dialog";
imagePreviewDialog.innerHTML = `
  <div class="image-preview-shell">
    <div class="image-preview-head">
      <strong>图片预览</strong>
      <div>
        <button class="ghost-small" data-preview-action="save">保存图片</button>
        <button class="icon-button" data-preview-action="close" aria-label="关闭">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
    <div class="image-preview-stage">
      <img alt="图片预览">
    </div>
  </div>
`;
document.body.append(imagePreviewDialog);
const imagePreviewImg = imagePreviewDialog.querySelector("img");

const storageKey = "huobao-canvas-static:v1";
const templateStorageKey = "huobao-canvas-templates:v1";
const modelDefaultsStorageKey = "huobao-canvas-model-defaults:v1";
const projectStorageKey = "huobao-canvas-projects:v1";
const imageAssetPrefix = "idb-image:";
const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
let imageAssetDbPromise = null;
const imageAssetObjectUrls = new Map();
const backendConfig = {
  baseUrl: "https://api.n1n.ai/v1",
  configured: false,
  chatModel: "gpt-4o",
  imageModel: "doubao-seedream-4-5-251128",
  videoModel: "veo3.1-fast",
  services: {
    chat: { configured: false, baseUrl: "https://api.n1n.ai/v1", model: "gpt-4o", apiKeyEnv: "N1N_API_KEY", baseUrlEnv: "N1N_BASE_URL", modelEnv: "N1N_CHAT_MODEL" },
    image: { configured: false, baseUrl: "https://api.n1n.ai/v1", model: "doubao-seedream-4-5-251128", apiKeyEnv: "N1N_API_KEY", baseUrlEnv: "N1N_BASE_URL", modelEnv: "N1N_IMAGE_MODEL" },
    video: { configured: false, baseUrl: "https://api.n1n.ai/v1", model: "veo3.1-fast", apiKeyEnv: "N1N_API_KEY", baseUrlEnv: "N1N_BASE_URL", modelEnv: "N1N_VIDEO_MODEL" },
  },
};
const modelCatalog = {
  chat: [
    ["gpt-4o", "GPT-4o"],
    ["gpt-4o-mini", "GPT-4o mini"],
    ["qwen-max", "Qwen Max"],
    ["deepseek-v3", "DeepSeek V3"],
  ],
  image: [
    ["doubao-seedream-4-5-251128", "Seedream 4.5"],
    ["gpt-image-1", "GPT Image"],
    ["gemini-3-pro-image-preview", "nanobanana2"],
    ["flux-kontext", "Flux Kontext"],
  ],
  video: [
    ["veo3.1-fast", "Veo 3.1 Fast"],
    ["veo3.1", "Veo 3.1"],
    ["kling-v2.5-turbo", "Kling 2.5"],
  ],
};
const nodeSizes = {
  text: { width: 260, height: 210 },
  llmConfig: { width: 300, height: 230 },
  imageConfig: { width: 300, height: 260 },
  image: { width: 260, height: 350 },
  videoConfig: { width: 300, height: 250 },
  video: { width: 300, height: 250 },
};

let modelDefaults = loadModelDefaults();
let state = loadState();
let selectedNodeId = state.nodes[0]?.id ?? null;
let selectedNodeIds = new Set(selectedNodeId ? [selectedNodeId] : []);
let drag = null;
let marquee = null;
let pendingConnection = null;
let connectionDrag = null;
let connectionPreviewPoint = null;
let contextMenuState = null;
let history = [];
let future = [];
let templateLibrary = loadTemplateLibrary();
let projectLibrary = loadProjectLibrary();
let externalDragDepth = 0;
let previewImageSource = "";

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
        data: { label: "文生图", model: getDefaultModel("image"), quality: "标准画质", size: "2048x2048", executed: true },
      },
      {
        id: imageId,
        type: "image",
        position: { x: 810, y: 80 },
        data: { label: "图像生成结果", model: getDefaultModel("image"), url: true, gradient: "linear-gradient(135deg, #22d3ee, #6366f1 45%, #facc15)" },
      },
      {
        id: videoConfigId,
        type: "videoConfig",
        position: { x: 430, y: 430 },
        data: { label: "视频生成", model: getDefaultModel("video"), ratio: "16:9", duration: 5, executed: true },
      },
      {
        id: videoId,
        type: "video",
        position: { x: 810, y: 430 },
        data: { label: "视频生成结果", model: getDefaultModel("video"), url: true, gradient: "linear-gradient(135deg, #111827, #2563eb 55%, #f97316)" },
      },
    ],
    edges: [
      { id: makeId(), source: textId, target: imageConfigId, type: "promptOrder", data: { label: "提示词 1" } },
      { id: makeId(), source: imageConfigId, target: imageId, type: "output", data: { label: "输出" } },
      { id: makeId(), source: textId, target: videoConfigId, type: "promptOrder", data: { label: "提示词" } },
      { id: makeId(), source: imageId, target: videoConfigId, type: "imageRole", data: { label: "首帧" } },
      { id: makeId(), source: videoConfigId, target: videoId, type: "output", data: { label: "输出" } },
    ],
    groups: [],
  };
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    const next = saved ? JSON.parse(saved) : defaultState();
    return normalizeState(next);
  } catch {
    return defaultState();
  }
}

function normalizeState(next) {
  return {
    ...next,
    groups: Array.isArray(next.groups) ? next.groups : [],
  };
}

function loadModelDefaults() {
  try {
    const saved = JSON.parse(localStorage.getItem(modelDefaultsStorageKey) || "null");
    return {
      chat: normalizeModelValue("chat", saved?.chat),
      image: normalizeModelValue("image", saved?.image),
      video: normalizeModelValue("video", saved?.video),
    };
  } catch {
    return {};
  }
}

function saveModelDefaults() {
  safeLocalStorageSet(modelDefaultsStorageKey, JSON.stringify(modelDefaults));
}

function getDefaultModel(kind) {
  const backendKey = `${kind}Model`;
  return normalizeModelValue(kind, modelDefaults[kind] || backendConfig.services?.[kind]?.model || backendConfig[backendKey] || modelCatalog[kind]?.[0]?.[0]);
}

function normalizeModelValue(kind, value) {
  if (!value) return "";
  const current = String(value);
  const match = modelCatalog[kind]?.find(([modelValue, label]) => modelValue === current || label === current);
  return match?.[0] || current;
}

function modelOptions(kind, current) {
  const selected = normalizeModelValue(kind, current || getDefaultModel(kind));
  const pairs = [...(modelCatalog[kind] || [])];
  if (selected && !pairs.some(([value, label]) => value === selected || label === selected)) {
    pairs.unshift([selected, selected]);
  }
  return optionPairs(pairs, selected);
}

function setModelDefault(kind, value) {
  modelDefaults = {
    ...modelDefaults,
    [kind]: normalizeModelValue(kind, value),
  };
  saveModelDefaults();
  showToast("默认模型已更新");
}

async function loadBackendStatus() {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = await response.json();
    Object.assign(backendConfig, next);
    backendConfig.services = {
      ...backendConfig.services,
      ...(next.services || {}),
    };
  } catch {
    backendConfig.configured = false;
  }
}

function syncApiSettingsForm() {
  apiBaseUrlInput.value = backendConfig.baseUrl;
  apiKeyStatusInput.value = getServiceStatusSummary();
  chatModelInput.innerHTML = modelOptions("chat", getDefaultModel("chat"));
  imageModelInput.innerHTML = modelOptions("image", getDefaultModel("image"));
  videoModelInput.innerHTML = modelOptions("video", getDefaultModel("video"));
  syncAdvancedServiceSettings();
}

function getServiceStatusSummary() {
  const services = ["chat", "image", "video"].map((kind) => backendConfig.services?.[kind]).filter(Boolean);
  const readyCount = services.filter((service) => service.configured).length;
  if (readyCount === services.length) return "文本/图像/视频均已配置";
  if (readyCount > 0) return `已配置 ${readyCount}/${services.length} 个服务`;
  return "后端未配置 API Key";
}

function syncAdvancedServiceSettings() {
  Object.entries(serviceSettingInputs).forEach(([kind, controls]) => {
    const service = backendConfig.services?.[kind] || {};
    if (controls.baseUrl) controls.baseUrl.value = service.baseUrl || backendConfig.baseUrl || "";
    if (controls.apiKey) controls.apiKey.value = "";
    if (controls.keyStatus) controls.keyStatus.value = service.configured ? `已配置 ${service.apiKeyEnv || "API_KEY"}` : `未配置 ${service.apiKeyEnv || "API_KEY"}`;
    if (controls.env) controls.env.textContent = `${service.baseUrlEnv || "N1N_BASE_URL"} / ${service.apiKeyEnv || "N1N_API_KEY"} / ${service.modelEnv || ""}`;
  });
}

async function saveApiSettings() {
  const body = {
    baseUrl: apiBaseUrlInput.value.trim(),
    services: {},
  };

  Object.entries(serviceSettingInputs).forEach(([kind, controls]) => {
    body.services[kind] = {
      baseUrl: controls.baseUrl?.value.trim() || apiBaseUrlInput.value.trim(),
      apiKey: controls.apiKey?.value.trim() || undefined,
      model: getDefaultModel(kind),
    };
  });

  const response = await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  Object.assign(backendConfig, response);
  backendConfig.services = {
    ...backendConfig.services,
    ...(response.services || {}),
  };
  syncApiSettingsForm();
  settingsModal.close();
  showToast("API 设置已保存到后端");
}

function saveState() {
  const stateSaved = safeLocalStorageSet(storageKey, JSON.stringify(state));
  const projectSaved = saveActiveProjectState();
  saveStateLabel.textContent = stateSaved && projectSaved !== false ? "本地已保存" : "本地保存失败";
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to save ${key}`, error);
    return false;
  }
}

function snapshot() {
  return JSON.stringify({ nodes: state.nodes, edges: state.edges, groups: state.groups, view: state.view, theme: state.theme });
}

function commitHistory() {
  history.push(snapshot());
  if (history.length > 60) history.shift();
  future = [];
}

function restore(serialized) {
  const next = JSON.parse(serialized);
  state = { ...state, ...next };
  setSelectedNodes(state.nodes[0]?.id ? [state.nodes[0].id] : []);
  applyTheme();
  saveState();
  render();
}

function loadTemplateLibrary() {
  try {
    return normalizeTemplateLibrary(JSON.parse(localStorage.getItem(templateStorageKey) || "null"));
  } catch {
    return normalizeTemplateLibrary(null);
  }
}

function normalizeTemplateLibrary(next) {
  const fallbackId = "general";
  const categories = Array.isArray(next?.categories) && next.categories.length
    ? next.categories
    : [{ id: fallbackId, name: "通用模板" }];
  const normalizedCategories = categories.map((category) => ({
    id: category.id || makeId(),
    name: category.name || "未命名分组",
  }));
  const categoryIds = new Set(normalizedCategories.map((category) => category.id));
  const firstCategoryId = normalizedCategories[0].id;
  const templates = Array.isArray(next?.templates)
    ? next.templates
        .filter((template) => template?.workflow)
        .map((template) => ({
          id: template.id || makeId(),
          name: template.name || "未命名模板",
          categoryId: categoryIds.has(template.categoryId) ? template.categoryId : firstCategoryId,
          createdAt: template.createdAt || new Date().toISOString(),
          updatedAt: template.updatedAt || template.createdAt || new Date().toISOString(),
          workflow: sanitizeWorkflowState(template.workflow, { allowEmpty: true }),
        }))
    : [];

  return {
    activeCategoryId: categoryIds.has(next?.activeCategoryId) ? next.activeCategoryId : firstCategoryId,
    categories: normalizedCategories,
    templates,
  };
}

function saveTemplateLibrary() {
  return safeLocalStorageSet(templateStorageKey, JSON.stringify(templateLibrary));
}

function getActiveTemplateCategory() {
  return templateLibrary.categories.find((category) => category.id === templateLibrary.activeCategoryId) || templateLibrary.categories[0];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneWorkflowState() {
  return cloneJson({
    nodes: state.nodes,
    edges: state.edges,
    groups: state.groups,
    view: state.view,
    theme: state.theme,
  });
}

function sanitizeWorkflowState(workflow, options = {}) {
  const source = workflow || {};
  const nodes = Array.isArray(source.nodes)
    ? source.nodes
        .filter((node) => node?.id && nodeSizes[node.type])
        .map((node) => ({
          id: String(node.id),
          type: node.type,
          position: {
            x: Number.isFinite(Number(node.position?.x)) ? Number(node.position.x) : 80,
            y: Number.isFinite(Number(node.position?.y)) ? Number(node.position.y) : 80,
          },
          data: typeof node.data === "object" && node.data ? cloneJson(node.data) : {},
        }))
    : [];

  if (!nodes.length && !options.allowEmpty) throw new Error("JSON 中没有可加载的节点");

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(source.edges)
    ? source.edges
        .flatMap((edge) => {
          const sourceId = String(edge?.source || "");
          const targetId = String(edge?.target || "");
          if (!sourceId || !targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) return [];
          return [{
            id: edge.id || makeId(),
            source: sourceId,
            target: targetId,
            type: edge.type || "default",
            data: typeof edge.data === "object" && edge.data ? cloneJson(edge.data) : {},
          }];
        })
    : [];
  const groups = Array.isArray(source.groups)
    ? source.groups
        .map((group) => ({
          id: group.id || makeId(),
          label: group.label || "未命名群组",
          nodeIds: Array.isArray(group.nodeIds) ? group.nodeIds.map(String).filter((id) => nodeIds.has(id)) : [],
        }))
        .filter((group) => group.nodeIds.length > 1)
    : [];
  const view = source.view && Number.isFinite(Number(source.view.zoom))
    ? {
        x: Number(source.view.x) || 0,
        y: Number(source.view.y) || 0,
        zoom: clamp(Number(source.view.zoom), 0.12, 2.2),
      }
    : { x: 160, y: 120, zoom: 1 };

  return {
    nodes,
    edges,
    groups,
    view,
    theme: source.theme === "dark" ? "dark" : "light",
  };
}

function loadProjectLibrary() {
  try {
    return normalizeProjectLibrary(JSON.parse(localStorage.getItem(projectStorageKey) || "null"));
  } catch {
    return normalizeProjectLibrary(null);
  }
}

function normalizeProjectLibrary(next) {
  const projects = Array.isArray(next?.projects)
    ? next.projects
        .filter((project) => project?.workflow)
        .map((project) => ({
          id: project.id || makeId(),
          name: project.name || "未命名项目",
          createdAt: project.createdAt || new Date().toISOString(),
          updatedAt: project.updatedAt || project.createdAt || new Date().toISOString(),
          workflow: sanitizeWorkflowState(project.workflow, { allowEmpty: true }),
        }))
    : [];
  const activeProjectId = projects.some((project) => project.id === next?.activeProjectId)
    ? next.activeProjectId
    : projects[0]?.id || null;
  return { activeProjectId, projects };
}

function initializeProjectManager() {
  if (!projectLibrary.projects.length) {
    const now = new Date().toISOString();
    const project = {
      id: makeId(),
      name: projectNameLabel?.textContent?.trim() || "AI Canvas Demo",
      createdAt: now,
      updatedAt: now,
      workflow: cloneWorkflowState(),
    };
    projectLibrary = { activeProjectId: project.id, projects: [project] };
    saveProjectLibrary();
  } else {
    const active = getActiveProject();
    if (active?.workflow?.nodes?.length) {
      state = sanitizeWorkflowState(active.workflow);
      safeLocalStorageSet(storageKey, JSON.stringify(state));
    }
  }
  applyTheme();
  syncProjectName();
  renderProjectHome();
  showProjectHome({ persist: false });
}

function saveProjectLibrary() {
  return safeLocalStorageSet(projectStorageKey, JSON.stringify(projectLibrary));
}

function getProject(projectId) {
  return projectLibrary.projects.find((project) => project.id === projectId);
}

function getActiveProject() {
  return getProject(projectLibrary.activeProjectId);
}

function saveActiveProjectState() {
  if (!projectLibrary?.projects?.length || !projectLibrary.activeProjectId) return true;
  const now = new Date().toISOString();
  projectLibrary.projects = projectLibrary.projects.map((project) => (
    project.id === projectLibrary.activeProjectId
      ? { ...project, workflow: cloneWorkflowState(), updatedAt: now }
      : project
  ));
  return saveProjectLibrary();
}

function syncProjectName() {
  const project = getActiveProject();
  if (projectNameLabel) projectNameLabel.textContent = project?.name || "未命名项目";
}

function showProjectHome(options = {}) {
  if (options.persist !== false) saveActiveProjectState();
  hideContextMenu();
  nodeMenu.hidden = true;
  templatePanel.hidden = true;
  appShell.hidden = true;
  projectHome.hidden = false;
  renderProjectHome();
}

function showEditor() {
  projectHome.hidden = true;
  appShell.hidden = false;
  syncProjectName();
  applyTheme();
  render();
}

function openProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;
  saveActiveProjectState();
  projectLibrary.activeProjectId = project.id;
  state = sanitizeWorkflowState(project.workflow);
  history = [];
  future = [];
  setSelectedNodes(state.nodes[0]?.id ? [state.nodes[0].id] : []);
  safeLocalStorageSet(storageKey, JSON.stringify(state));
  saveProjectLibrary();
  showEditor();
}

function createProject() {
  const name = window.prompt("新建项目名称", "未命名项目");
  if (name === null) return;
  const projectName = name.trim();
  if (!projectName) return;
  const now = new Date().toISOString();
  const project = {
    id: makeId(),
    name: projectName,
    createdAt: now,
    updatedAt: now,
    workflow: sanitizeWorkflowState(defaultState()),
  };
  projectLibrary.projects = [project, ...projectLibrary.projects];
  saveProjectLibrary();
  openProject(project.id);
}

function renameProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;
  const name = window.prompt("重命名项目", project.name);
  if (name === null) return;
  const nextName = name.trim();
  if (!nextName) return;
  projectLibrary.projects = projectLibrary.projects.map((item) => (
    item.id === projectId ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item
  ));
  saveProjectLibrary();
  syncProjectName();
  renderProjectHome();
}

function duplicateProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;
  const now = new Date().toISOString();
  const copy = {
    id: makeId(),
    name: `${project.name} 副本`,
    createdAt: now,
    updatedAt: now,
    workflow: cloneJson(project.workflow),
  };
  projectLibrary.projects = [copy, ...projectLibrary.projects];
  saveProjectLibrary();
  renderProjectHome();
  showToast("项目已复制");
}

function deleteProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;
  if (!window.confirm(`删除项目「${project.name}」？此操作只会删除本地项目记录。`)) return;
  projectLibrary.projects = projectLibrary.projects.filter((item) => item.id !== projectId);
  if (projectLibrary.activeProjectId === projectId) {
    projectLibrary.activeProjectId = projectLibrary.projects[0]?.id || null;
    const nextActive = getActiveProject();
    state = nextActive?.workflow ? sanitizeWorkflowState(nextActive.workflow) : defaultState();
    safeLocalStorageSet(storageKey, JSON.stringify(state));
  }
  saveProjectLibrary();
  renderProjectHome();
  showToast("项目已删除");
}

function buildProjectExportPayload(project) {
  return {
    app: "huobao-canvas",
    schema: "canvas-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      workflow: project.workflow,
    },
  };
}

function exportProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;
  downloadJson(`${safeFileName(project.name)}.project.json`, buildProjectExportPayload(project));
  showToast("项目 JSON 已导出");
}

async function importProjectFile(file) {
  if (!file) {
    showToast("请选择 JSON 文件");
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const workflow = getWorkflowFromPayload(payload);
    const now = new Date().toISOString();
    const project = {
      id: makeId(),
      name: payload?.project?.name || payload?.template?.name || payload?.name || file.name.replace(/\.json$/i, ""),
      createdAt: now,
      updatedAt: now,
      workflow,
    };
    projectLibrary.projects = [project, ...projectLibrary.projects];
    saveProjectLibrary();
    openProject(project.id);
    showToast("项目已导入");
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  } finally {
    projectImportInput.value = "";
  }
}

function renderProjectHome() {
  const projects = projectLibrary.projects;
  projectCount.textContent = `${projects.length} 个项目`;
  projectGrid.innerHTML = projects.length
    ? projects.map(renderProjectCard).join("")
    : `<div class="project-empty">还没有项目</div>`;
}

function renderProjectCard(project) {
  const workflow = project.workflow || {};
  const nodeCount = workflow.nodes?.length || 0;
  const edgeCount = workflow.edges?.length || 0;
  const groupCount = workflow.groups?.length || 0;
  const active = project.id === projectLibrary.activeProjectId;
  return `
    <article class="project-card ${active ? "active" : ""}">
      <div class="project-card-main">
        <div>
          <h2>${escapeHtml(project.name)}</h2>
          <p>${formatDate(project.updatedAt)} 更新</p>
        </div>
        <span>${active ? "当前" : "项目"}</span>
      </div>
      <div class="project-card-stats">
        <strong>${nodeCount}<small>节点</small></strong>
        <strong>${edgeCount}<small>连线</small></strong>
        <strong>${groupCount}<small>群组</small></strong>
      </div>
      <div class="project-card-actions">
        <button data-project-action="open" data-project-id="${escapeHtml(project.id)}">打开</button>
        <button data-project-action="rename" data-project-id="${escapeHtml(project.id)}">重命名</button>
        <button data-project-action="duplicate" data-project-id="${escapeHtml(project.id)}">复制</button>
        <button data-project-action="export" data-project-id="${escapeHtml(project.id)}">导出</button>
        <button class="danger" data-project-action="delete" data-project-id="${escapeHtml(project.id)}">删除</button>
      </div>
    </article>
  `;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "刚刚";
  }
}

function handleProjectAction(action, projectId) {
  if (action === "open") openProject(projectId);
  if (action === "rename") renameProject(projectId);
  if (action === "duplicate") duplicateProject(projectId);
  if (action === "export") exportProject(projectId);
  if (action === "delete") deleteProject(projectId);
}

function getWorkflowFromPayload(payload) {
  const workflow = payload?.project?.workflow || payload?.template?.workflow || payload?.workflow || payload?.state || payload;
  return sanitizeWorkflowState(workflow);
}

function buildWorkflowExportPayload(name = "当前工作流") {
  return {
    app: "huobao-canvas",
    schema: "workflow",
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    workflow: cloneWorkflowState(),
  };
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  return String(name || "workflow").trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 64) || "workflow";
}

function exportCurrentWorkflowJson() {
  const name = document.querySelector("#projectName")?.textContent?.trim() || "workflow";
  downloadJson(`${safeFileName(name)}.workflow.json`, buildWorkflowExportPayload(name));
  showToast("已导出工作流 JSON");
}

function applyWorkflowState(workflow, toastText = "已加载工作流") {
  commitHistory();
  state = sanitizeWorkflowState(workflow);
  setSelectedNodes([]);
  applyTheme();
  saveState();
  render();
  showToast(toastText);
}

async function importWorkflowFile(file) {
  if (!file) {
    showToast("请拖入 JSON 文件");
    return;
  }
  if (!/\.json$/i.test(file.name) && !String(file.type).includes("json")) {
    showToast("请拖入 JSON 文件");
    return;
  }
  try {
    applyWorkflowState(getWorkflowFromPayload(JSON.parse(await file.text())), "已导入工作流");
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  }
}

function renderTemplateLibrary() {
  const activeCategory = getActiveTemplateCategory();
  templateCategories.innerHTML = templateLibrary.categories.map((category) => {
    const count = templateLibrary.templates.filter((template) => template.categoryId === category.id).length;
    return `
      <button class="${category.id === activeCategory.id ? "active" : ""}" data-template-category="${escapeHtml(category.id)}">
        <span>${escapeHtml(category.name)}</span>
        <strong>${count}</strong>
      </button>
    `;
  }).join("");

  templateListTitle.textContent = activeCategory?.name || "模板";
  const templates = templateLibrary.templates.filter((template) => template.categoryId === activeCategory?.id);
  templateList.innerHTML = templates.length
    ? templates.map(renderTemplateCard).join("")
    : `<div class="template-empty">暂无模板</div>`;
}

function renderTemplateCard(template) {
  const updatedAt = new Date(template.updatedAt || template.createdAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `
    <article class="template-card">
      <div class="template-card-main">
        <strong>${escapeHtml(template.name)}</strong>
        <span>${updatedAt}</span>
      </div>
      <div class="template-card-actions">
        <button data-template-action="load" data-template-id="${escapeHtml(template.id)}">加载</button>
        <button data-template-action="export" data-template-id="${escapeHtml(template.id)}">导出</button>
        <button class="danger" data-template-action="delete" data-template-id="${escapeHtml(template.id)}">删除</button>
      </div>
    </article>
  `;
}

function createTemplateCategory() {
  const name = window.prompt("新建模板分组", "文生图工作流");
  if (name === null) return;
  const nextName = name.trim();
  if (!nextName) return;
  const category = { id: makeId(), name: nextName };
  templateLibrary.categories = [...templateLibrary.categories, category];
  templateLibrary.activeCategoryId = category.id;
  saveTemplateLibrary();
  renderTemplateLibrary();
}

function setActiveTemplateCategory(categoryId) {
  if (!templateLibrary.categories.some((category) => category.id === categoryId)) return;
  templateLibrary.activeCategoryId = categoryId;
  saveTemplateLibrary();
  renderTemplateLibrary();
}

function saveCurrentWorkflowAsTemplate() {
  const category = getActiveTemplateCategory();
  const name = window.prompt("模板名称", `${category.name}模板`);
  if (name === null) return;
  const nextName = name.trim();
  if (!nextName) return;
  const now = new Date().toISOString();
  templateLibrary.templates = [
    {
      id: makeId(),
      name: nextName,
      categoryId: category.id,
      createdAt: now,
      updatedAt: now,
      workflow: cloneWorkflowState(),
    },
    ...templateLibrary.templates,
  ];
  saveTemplateLibrary();
  renderTemplateLibrary();
  showToast("已保存为模板");
}

function handleTemplateAction(action, templateId) {
  const template = templateLibrary.templates.find((item) => item.id === templateId);
  if (!template) return;
  if (action === "load") {
    applyWorkflowState(template.workflow, "已加载模板");
    return;
  }
  if (action === "export") {
    downloadJson(`${safeFileName(template.name)}.template.json`, {
      app: "huobao-canvas",
      schema: "workflow-template",
      version: 1,
      exportedAt: new Date().toISOString(),
      template,
    });
    showToast("已导出模板 JSON");
    return;
  }
  if (action === "delete" && window.confirm("删除这个模板？")) {
    templateLibrary.templates = templateLibrary.templates.filter((item) => item.id !== templateId);
    saveTemplateLibrary();
    renderTemplateLibrary();
    showToast("模板已删除");
  }
}

function hasExternalFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function showDropOverlay() {
  dropOverlay.firstElementChild.textContent = projectHome.hidden ? "释放以导入工作流 JSON" : "释放以导入项目 JSON";
  dropOverlay.hidden = false;
  templatePanel.classList.add("is-drop-target");
}

function hideDropOverlay() {
  externalDragDepth = 0;
  dropOverlay.hidden = true;
  templatePanel.classList.remove("is-drop-target");
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
  state.groups.forEach((group) => world.append(renderGroup(group)));
  state.nodes.forEach((node) => world.append(renderNode(node)));
  renderTransforms();
  renderEdges();
  hydrateAssetImages();
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
    appendInteractiveEdge(edge, sx, sy, tx, ty);
  });

  renderConnectionPreview();
}

function getRenderedNodeSize(node) {
  const element = [...world.querySelectorAll(".node")].find((item) => item.dataset.id === node.id);
  const card = element?.querySelector(".node-card");
  const stored = getNodeSize(node);
  return {
    width: card?.offsetWidth || stored.width,
    height: card?.offsetHeight || stored.height,
  };
}

function getEdgePathD(sx, sy, tx, ty) {
  const dx = Math.max(80, Math.abs(tx - sx) * 0.45);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

function createEdgePath(d, className) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  return path;
}

function appendInteractiveEdge(edge, sx, sy, tx, ty) {
  const d = getEdgePathD(sx, sy, tx, ty);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "edge-link");
  group.dataset.edgeId = edge.id;
  group.append(createEdgePath(d, "edge-path"));
  group.append(createEdgePath(d, "edge-hit"));
  edgeLayer.append(group);
}

function appendEdgePath(sx, sy, tx, ty, className = "edge-path") {
  const path = createEdgePath(getEdgePathD(sx, sy, tx, ty), className);
  edgeLayer.append(path);
}

function renderConnectionPreview() {
  if (!pendingConnection || !connectionPreviewPoint) return;
  const source = getNode(pendingConnection);
  if (!source) return;

  const sourceSize = getRenderedNodeSize(source);
  const sx = source.position.x + sourceSize.width + 0.5;
  const sy = source.position.y + sourceSize.height / 2;
  appendEdgePath(sx, sy, connectionPreviewPoint.x, connectionPreviewPoint.y, "edge-path edge-preview");
}

function renderGroup(group) {
  const bounds = getGroupBounds(group.nodeIds);
  const element = document.createElement("section");
  element.className = "node-group";
  element.dataset.groupId = group.id;
  if (!bounds) {
    element.hidden = true;
    return element;
  }

  element.style.setProperty("--x", `${bounds.x}px`);
  element.style.setProperty("--y", `${bounds.y}px`);
  element.style.setProperty("--w", `${bounds.width}px`);
  element.style.setProperty("--h", `${bounds.height}px`);
  element.innerHTML = `<div class="node-group-title">${escapeHtml(group.label || "未命名群组")}</div>`;
  return element;
}

function getGroupBounds(nodeIds = []) {
  const nodes = nodeIds.map(getNode).filter(Boolean);
  if (!nodes.length) return null;
  const padding = 26;
  const titleSpace = 84;
  const bounds = nodes.reduce((acc, node) => {
    const size = getNodeSize(node);
    return {
      minX: Math.min(acc.minX, node.position.x),
      minY: Math.min(acc.minY, node.position.y),
      maxX: Math.max(acc.maxX, node.position.x + size.width),
      maxY: Math.max(acc.maxY, node.position.y + size.height),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  return {
    x: bounds.minX - padding,
    y: bounds.minY - titleSpace,
    width: bounds.maxX - bounds.minX + padding * 2,
    height: bounds.maxY - bounds.minY + padding + titleSpace,
  };
}

function getGroupAtPoint(point) {
  return [...state.groups].reverse().find((group) => {
    const bounds = getGroupBounds(group.nodeIds);
    if (!bounds) return false;
    return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  });
}

function getNodeSize(node) {
  const fallback = nodeSizes[node?.type] || { width: 260, height: 220 };
  return {
    width: clamp(Number(node?.data?.width) || fallback.width, getMinNodeSize(node?.type).width, 900),
    height: clamp(Number(node?.data?.height) || fallback.height, getMinNodeSize(node?.type).height, 900),
  };
}

function getMinNodeSize(type) {
  const fallback = nodeSizes[type] || { width: 260, height: 220 };
  return {
    width: Math.min(fallback.width, 220),
    height: Math.min(fallback.height, 180),
  };
}

function renderNode(node) {
  const wrap = document.createElement("section");
  const size = getNodeSize(node);
  wrap.className = "node";
  wrap.dataset.id = node.id;
  wrap.dataset.type = node.type;
  wrap.style.setProperty("--x", `${node.position.x}px`);
  wrap.style.setProperty("--y", `${node.position.y}px`);
  wrap.style.setProperty("--node-width", `${size.width}px`);
  wrap.style.setProperty("--node-height", `${size.height}px`);

  const card = document.createElement("div");
  card.className = "node-card";
  card.classList.toggle("selected", selectedNodeIds.has(node.id));
  card.innerHTML = `
    <div class="node-head">
      <span class="node-title">${escapeHtml(node.data.label || node.type)}</span>
      <div class="node-actions">
        <button class="node-action" data-node-action="duplicate" title="复制"><svg viewBox="0 0 24 24"><path d="M8 8h10v10H8z"/><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        <button class="node-action" data-node-action="delete" title="删除"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/></svg></button>
      </div>
    </div>
    <div class="node-body">${renderNodeBody(node)}</div>
  `;

  const resizeHandle = document.createElement("button");
  resizeHandle.type = "button";
  resizeHandle.className = "node-resize-handle";
  resizeHandle.dataset.nodeResize = "true";
  resizeHandle.title = "拖拽调整节点尺寸";
  resizeHandle.setAttribute("aria-label", "调整节点尺寸");

  wrap.append(createNodePort("input"), card, createNodePort("output"), resizeHandle);
  return wrap;
}

function createNodePort(type) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `node-port ${type}`;
  button.dataset.port = type;
  button.setAttribute("aria-label", type === "input" ? "输入连接点" : "输出连接点");
  button.title = type === "input" ? "连接到这里" : "从这里连线";
  return button;
}

function renderNodeBody(node) {
  if (node.type === "text") {
    return `
      <div class="prompt-editor">
        <div class="prompt-highlight" aria-hidden="true">${renderPromptHighlight(node)}</div>
        <textarea data-field="content" spellcheck="false">${escapeHtml(node.data.content || "")}</textarea>
        <div class="prompt-mention-menu" hidden></div>
      </div>
    `;
  }

  if (node.type === "llmConfig") {
    const output = node.data.output || "等待执行后输出优化后的提示词。";
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptions("chat", node.data.model)}</select></div>
      <div class="node-tip">${escapeHtml(output)}</div>
      <button class="node-button" data-node-action="run-llm">生成文本</button>
    `;
  }

  if (node.type === "imageConfig") {
    const prompts = incomingNodes(node.id, ["text", "llmConfig"]).length;
    const refSlots = getImageReferenceSlots(node.id);
    const refIndicators = refSlots.length
      ? refSlots.map((ref) => `
        <button class="indicator ready ref-mention" data-node-action="insert-ref-mention" data-ref-token="${escapeHtml(ref.token)}" title="插入到提示词">
          ${escapeHtml(ref.token)}
        </button>
      `).join("")
      : `<span class="indicator">参考图 ○</span>`;
    const model = normalizeModelValue("image", node.data.model) || getDefaultModel("image");
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptions("image", node.data.model)}</select></div>
      <div class="node-row"><span>画质</span><select data-field="quality">${options(["标准画质", "高清画质", "4K"], node.data.quality)}</select></div>
      <div class="node-row"><span>尺寸</span><select data-field="size">${options(imageSizeOptions(model), getImageSizeValue(model, node.data.size))}</select></div>
      <div class="node-indicators">
        <span class="indicator ${prompts ? "ready" : ""}">提示词 ${prompts || "○"}</span>
        ${refIndicators}
      </div>
      <div class="node-split">
        <button class="node-button" data-node-action="generate-image">生成图片</button>
        <button class="node-secondary-button" data-node-action="replace-image">重新生成</button>
      </div>
    `;
  }

  if (node.type === "image") {
    return `
      ${renderImageMedia(node)}
      <div class="media-toolbar">
        <button data-node-action="image-to-image">图生图</button>
        <button data-node-action="image-to-video">生视频</button>
      </div>
    `;
  }

  if (node.type === "videoConfig") {
    const prompt = incomingNodes(node.id, ["text", "llmConfig"]).length;
    const firstFrame = incomingNodes(node.id, ["image"]).length;
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptions("video", node.data.model)}</select></div>
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

function renderImageMedia(node) {
  if (node.data.loading) {
    return `<div class="image-preview loading-card" style="--preview-bg:${node.data.gradient || ""}">创作中</div>`;
  }

  if (typeof node.data.url === "string" && node.data.url) {
    const source = node.data.url;
    const displaySource = imageDisplaySource(source);
    const url = escapeHtml(source);
    const displayUrl = escapeHtml(displaySource || transparentPixel);
    const originalLink = isIndexedImageSource(source)
      ? ""
      : `<a href="${url}" target="_blank" rel="noreferrer">打开原图</a>`;
    return `
      <div class="image-preview has-image" style="--preview-bg:${node.data.gradient || ""}">
        <img class="generated-image" src="${displayUrl}" data-asset-url="${escapeHtml(source)}" alt="${escapeHtml(node.data.label || "生成图片")}" loading="lazy" referrerpolicy="no-referrer">
        <div class="image-load-error">
          <strong>图片加载失败</strong>
          ${originalLink}
        </div>
      </div>
    `;
  }

  if (node.data.url) {
    return `<div class="image-preview simulated-preview" style="--preview-bg:${node.data.gradient || ""}"><span>模拟结果</span></div>`;
  }

  if (node.data.error) {
    return `<div class="empty-media error-media">${escapeHtml(node.data.error)}</div>`;
  }

  return `<div class="empty-media">等待图片输出</div>`;
}

function imageDisplaySource(source) {
  const assetId = getIndexedImageId(source);
  if (assetId) return imageAssetObjectUrls.get(assetId) || "";
  if (/^https?:\/\//i.test(source)) {
    return `/api/image-proxy?url=${encodeURIComponent(source)}`;
  }
  return source;
}

function isIndexedImageSource(source) {
  return Boolean(getIndexedImageId(source));
}

function getIndexedImageId(source) {
  const text = String(source || "");
  return text.startsWith(imageAssetPrefix) ? text.slice(imageAssetPrefix.length) : "";
}

function openImageAssetDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB unavailable"));
  if (imageAssetDbPromise) return imageAssetDbPromise;
  imageAssetDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("huobao-canvas-assets", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("images", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
  return imageAssetDbPromise;
}

async function putImageAsset(record) {
  const db = await openImageAssetDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
  });
}

async function getImageAsset(assetId) {
  const db = await openImageAssetDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("images", "readonly").objectStore("images").get(assetId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
  });
}

function shouldPersistImageSource(source) {
  return /^data:image\//i.test(String(source || "")) && String(source).length > 120000;
}

async function persistImageSource(source) {
  if (!shouldPersistImageSource(source)) return source;
  try {
    const blob = await (await fetch(source)).blob();
    const id = makeId();
    await putImageAsset({ id, blob, type: blob.type || "image/png", createdAt: new Date().toISOString() });
    imageAssetObjectUrls.set(id, URL.createObjectURL(blob));
    return `${imageAssetPrefix}${id}`;
  } catch (error) {
    console.warn("Failed to persist image asset", error);
    return source;
  }
}

async function loadImageAssetObjectUrl(assetId) {
  if (!assetId) return "";
  if (imageAssetObjectUrls.has(assetId)) return imageAssetObjectUrls.get(assetId);
  const record = await getImageAsset(assetId);
  if (!record?.blob) return "";
  const objectUrl = URL.createObjectURL(record.blob);
  imageAssetObjectUrls.set(assetId, objectUrl);
  return objectUrl;
}

async function resolveImageForApi(source) {
  const assetId = getIndexedImageId(source);
  if (!assetId) return typeof source === "string" ? source : "";
  const record = await getImageAsset(assetId);
  if (!record?.blob) return "";
  return blobToDataUrl(record.blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Blob read failed"));
    reader.readAsDataURL(blob);
  });
}

function hydrateAssetImages() {
  document.querySelectorAll(".generated-image[data-asset-url]").forEach((img) => {
    const assetId = getIndexedImageId(img.dataset.assetUrl);
    if (!assetId || img.dataset.assetLoading === "1") return;
    if (imageAssetObjectUrls.has(assetId)) {
      img.src = imageAssetObjectUrls.get(assetId);
      return;
    }
    img.dataset.assetLoading = "1";
    loadImageAssetObjectUrl(assetId)
      .then((objectUrl) => {
        if (objectUrl && img.isConnected) img.src = objectUrl;
      })
      .catch(() => img.closest(".image-preview")?.classList.add("image-load-failed"))
      .finally(() => {
        delete img.dataset.assetLoading;
      });
  });
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

function outgoingNodes(sourceId, types) {
  return state.edges
    .filter((edge) => edge.source === sourceId)
    .map((edge) => getNode(edge.target))
    .filter((node) => node && types.includes(node.type));
}

function getImageReferenceSlots(targetId) {
  return state.edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => ({ edge, node: getNode(edge.source) }))
    .filter(({ node }) => node?.type === "image")
    .map((item, index) => ({ ...item, number: index + 1, token: `@图片${index + 1}` }));
}

function getTextMentionOptions(textNodeId) {
  const options = outgoingNodes(textNodeId, ["imageConfig"])
    .flatMap((config) => getImageReferenceSlots(config.id).map((ref) => ({
      ...ref,
      configId: config.id,
      configLabel: config.data.label || "文生图",
    })));
  const seen = new Set();
  return options.filter((option) => {
    const key = `${option.configId}:${option.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderPromptHighlight(node) {
  const content = node.data.content || "";
  const validTokens = new Set(getTextMentionOptions(node.id).map((option) => option.token));
  if (!content) return "";
  const parts = [];
  const pattern = /@图片\s*\d+/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(content))) {
    parts.push(escapeHtml(content.slice(lastIndex, match.index)));
    const token = match[0].replace(/\s+/g, "");
    const text = escapeHtml(match[0]);
    parts.push(validTokens.has(token) ? `<mark>${text}</mark>` : text);
    lastIndex = match.index + match[0].length;
  }
  parts.push(escapeHtml(content.slice(lastIndex)));
  return parts.join("");
}

function getGroup(id) {
  return state.groups.find((group) => group.id === id);
}

function findGroupByNodeId(nodeId) {
  return state.groups.find((group) => group.nodeIds.includes(nodeId));
}

function addNodesToGroup(groupId, nodeIds = []) {
  const group = getGroup(groupId);
  if (!group) return false;
  const incomingIds = nodeIds.filter((id) => getNode(id) && !findGroupByNodeId(id) && !group.nodeIds.includes(id));
  if (!incomingIds.length) return false;
  state.groups = state.groups.map((item) => (
    item.id === groupId ? { ...item, nodeIds: [...item.nodeIds, ...incomingIds] } : item
  ));
  return true;
}

function removeNodeFromGroup(nodeId, groupId = findGroupByNodeId(nodeId)?.id) {
  if (!nodeId || !groupId) return false;
  const group = getGroup(groupId);
  if (!group?.nodeIds.includes(nodeId)) return false;
  commitHistory();
  state.groups = state.groups.map((item) => (
    item.id === groupId ? { ...item, nodeIds: item.nodeIds.filter((id) => id !== nodeId) } : item
  ));
  cleanGroups();
  setSelectedNodes([nodeId]);
  saveState();
  render();
  showToast("已移除群组");
  return true;
}

function findExactGroup(nodeIds) {
  const selected = [...nodeIds].sort().join("|");
  return state.groups.find((group) => group.nodeIds.length === nodeIds.length && [...group.nodeIds].sort().join("|") === selected);
}

function setSelectedNodes(ids = []) {
  const valid = ids.filter((id) => getNode(id));
  selectedNodeIds = new Set(valid);
  selectedNodeId = valid[0] || null;
  updateNodeSelectionClasses();
}

function updateNodeSelectionClasses() {
  document.querySelectorAll(".node").forEach((element) => {
    const selected = selectedNodeIds.has(element.dataset.id);
    element.querySelector(".node-card")?.classList.toggle("selected", selected);
  });
}

function cleanGroups() {
  const existingIds = new Set(state.nodes.map((node) => node.id));
  state.groups = state.groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((id) => existingIds.has(id)),
    }))
    .filter((group) => group.nodeIds.length > 1);
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
    llmConfig: { label: "LLM 文本生成", model: getDefaultModel("chat") },
    imageConfig: { label: "文生图", model: getDefaultModel("image"), quality: "标准画质", size: getImageSizeValue(getDefaultModel("image"), "2048x2048") },
    image: { label: "图片节点", url: false },
    videoConfig: { label: "视频生成", model: getDefaultModel("video"), ratio: "16:9", duration: 5 },
    video: { label: "视频节点", url: false },
  };
  const node = {
    id: makeId(),
    type,
    position: { x: position.x, y: position.y },
    data: { ...defaults[type], ...data },
  };
  state.nodes = [...state.nodes, node];
  setSelectedNodes([node.id]);
  nodeMenu.hidden = true;
  saveState();
  render();
  return node.id;
}

function addEdge(source, target, type = "default", data = {}) {
  if (source === target || state.edges.some((edge) => edge.source === source && edge.target === target)) return false;
  commitHistory();
  state.edges = [...state.edges, { id: makeId(), source, target, type, data }];
  saveState();
  render();
  return true;
}

function removeEdge(edgeId) {
  if (!state.edges.some((edge) => edge.id === edgeId)) return false;
  commitHistory();
  state.edges = state.edges.filter((edge) => edge.id !== edgeId);
  saveState();
  render();
  return true;
}

function removeNode(id) {
  removeNodes([id]);
}

function removeNodes(ids) {
  const targets = new Set(ids);
  if (!targets.size) return;
  commitHistory();
  state.nodes = state.nodes.filter((node) => !targets.has(node.id));
  state.edges = state.edges.filter((edge) => !targets.has(edge.source) && !targets.has(edge.target));
  cleanGroups();
  setSelectedNodes([]);
  saveState();
  render();
}

function duplicateNode(id) {
  const node = getNode(id);
  if (!node) return;
  return addNode(node.type, { x: node.position.x + 36, y: node.position.y + 36 }, { ...node.data, label: `${node.data.label} copy` });
}

function createGroupFromSelection() {
  const ids = [...selectedNodeIds].filter((id) => getNode(id));
  if (ids.length < 2) {
    showToast("至少选择两个节点才能群组化");
    return;
  }
  commitHistory();
  const id = makeId();
  state.groups = [
    ...state.groups.filter((group) => !ids.every((nodeId) => group.nodeIds.includes(nodeId))),
    { id, label: `群组 ${state.groups.length + 1}`, nodeIds: ids },
  ];
  saveState();
  render();
  showToast("已创建群组");
}

function renameGroup(groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  const label = window.prompt("重命名群组", group.label || "未命名群组");
  if (label === null) return;
  const nextLabel = label.trim();
  if (!nextLabel) return;
  commitHistory();
  state.groups = state.groups.map((item) => (item.id === groupId ? { ...item, label: nextLabel } : item));
  saveState();
  render();
}

function dissolveGroup(groupId) {
  if (!getGroup(groupId)) return;
  commitHistory();
  state.groups = state.groups.filter((group) => group.id !== groupId);
  saveState();
  render();
  showToast("群组已解散");
}

function refreshGroup(groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  group.nodeIds.forEach((id) => refreshNode(id));
}

function hasApiKey(kind = "chat") {
  if (backendConfig.services?.[kind]) return Boolean(backendConfig.services[kind].configured);
  return Boolean(backendConfig.configured);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
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

const seedreamImageSizes = ["1024x1024", "1536x1024", "2048x2048", "4096x2160"];
const gptImageSizes = ["1024x1024", "1024x1536", "1536x1024"];
const fluxImageRatios = ["1:1", "16:9", "9:16", "21:9", "3:2", "2:3"];

function isStandardImageModel(model) {
  return ["gpt-image-1", "gemini-3-pro-image-preview"].includes(normalizeModelValue("image", model));
}

function isFluxImageModel(model) {
  return normalizeModelValue("image", model).toLowerCase().includes("flux");
}

function imageSizeOptions(model) {
  if (isStandardImageModel(model)) return gptImageSizes;
  if (isFluxImageModel(model)) return fluxImageRatios;
  return seedreamImageSizes;
}

function getImageSizeValue(model, size) {
  const value = String(size || "");
  const choices = imageSizeOptions(model);
  if (choices.includes(value)) return value;
  if (isStandardImageModel(model)) return "1024x1024";
  if (isFluxImageModel(model)) return "1:1";
  return "2048x2048";
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

function normalizePromptReferenceMentions(prompt) {
  return String(prompt || "").replace(/@图片\s*(\d+)/g, "图片$1");
}

function insertReferenceMention(configId, token) {
  const textNode = incomingNodes(configId, ["text"])[0];
  if (!textNode) {
    showToast("先连接一个文本节点，再插入图片引用");
    return;
  }

  const content = textNode.data.content || "";
  const spacer = content && !/[\s\n]$/.test(content) ? " " : "";
  updateNode(textNode.id, { content: `${content}${spacer}${token}` });
  showToast(`已插入 ${token}`);
}

function syncPromptEditorVisuals(textarea) {
  const wrapper = textarea?.closest?.(".prompt-editor");
  const node = getNode(textarea?.closest?.(".node")?.dataset.id);
  const highlight = wrapper?.querySelector(".prompt-highlight");
  if (!wrapper || !node || !highlight) return;
  highlight.innerHTML = renderPromptHighlight(node);
  highlight.scrollTop = textarea.scrollTop;
  highlight.scrollLeft = textarea.scrollLeft;
}

function getActiveMention(textarea) {
  if (!textarea || textarea.selectionStart !== textarea.selectionEnd) return null;
  const beforeCaret = textarea.value.slice(0, textarea.selectionStart);
  const match = beforeCaret.match(mentionQueryPattern);
  if (!match) return null;
  return {
    start: textarea.selectionStart - match[0].length,
    end: textarea.selectionStart,
    query: match[0],
  };
}

function hidePromptMentionMenu(editor) {
  const menu = editor?.querySelector?.(".prompt-mention-menu");
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = "";
  }
}

function updatePromptMentionMenu(textarea) {
  const editor = textarea?.closest?.(".prompt-editor");
  const node = getNode(textarea?.closest?.(".node")?.dataset.id);
  const menu = editor?.querySelector(".prompt-mention-menu");
  if (!editor || !node || !menu) return;

  const active = getActiveMention(textarea);
  if (!active) {
    hidePromptMentionMenu(editor);
    return;
  }

  const query = active.query.replace(/\s+/g, "");
  const options = getTextMentionOptions(node.id).filter((option) => query === "@" || option.token.startsWith(query));
  if (!options.length) {
    menu.innerHTML = `<div class="prompt-mention-empty">暂无可引用图片</div>`;
    menu.hidden = false;
    return;
  }

  menu.innerHTML = options.map((option) => `
    <button type="button" data-mention-token="${escapeHtml(option.token)}">
      <span>${escapeHtml(option.token)}</span>
      <small>${escapeHtml(option.configLabel)}</small>
    </button>
  `).join("");
  menu.hidden = false;
}

function applyPromptMention(button) {
  const token = button?.dataset?.mentionToken;
  const editor = button?.closest?.(".prompt-editor");
  const textarea = editor?.querySelector("textarea[data-field='content']");
  const node = getNode(textarea?.closest?.(".node")?.dataset.id);
  const active = getActiveMention(textarea);
  if (!token || !textarea || !node || !active) return false;

  const value = textarea.value;
  const nextValue = `${value.slice(0, active.start)}${token}${value.slice(active.end)}`;
  textarea.value = nextValue;
  node.data.content = nextValue;
  saveState();
  textarea.focus();
  textarea.setSelectionRange(active.start + token.length, active.start + token.length);
  syncPromptEditorVisuals(textarea);
  hidePromptMentionMenu(editor);
  return true;
}

async function polishWithApi(text, model = getDefaultModel("chat")) {
  const data = await apiFetch("/api/chat/polish", {
    method: "POST",
    body: JSON.stringify({
      model: normalizeModelValue("chat", model) || getDefaultModel("chat"),
      text,
    }),
  });
  return data?.text || text;
}

async function requestImageGeneration(configNode, prompt, refImages = []) {
  const body = buildImageGenerationBody(configNode, prompt, refImages);

  const data = await apiFetch("/api/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const source = extractImageSource(data);
  if (!source) throw new Error("图像接口未返回可显示的图片地址或 base64 数据");
  return persistImageSource(source);
}

function buildImageGenerationBody(configNode, prompt, refImages = []) {
  const model = normalizeModelValue("image", configNode.data.model) || getDefaultModel("image");
  const size = getImageSizeValue(model, configNode.data.size);

  if (isStandardImageModel(model)) {
    return {
      model,
      prompt,
      size,
      n: 1,
    };
  }

  if (isFluxImageModel(model)) {
    return {
      model,
      prompt,
      aspect_ratio: size,
      n: 1,
    };
  }

  const body = {
    model,
    prompt,
    sequential_image_generation: "disabled",
    size: normalizeImageSize(size),
    watermark: false,
  };
  if (refImages.length) body.image = refImages;
  return body;
}

function extractImageSource(payload) {
  const visited = new Set();
  const preferredKeys = ["url", "image_url", "imageUrl", "output_url", "outputUrl", "b64_json", "base64", "image_base64"];
  const containerKeys = ["data", "images", "image", "output", "result", "results"];

  const scan = (value, hint = "") => {
    if (!value) return "";
    if (typeof value === "string") return normalizeImageSource(value, hint);
    if (typeof value !== "object") return "";
    if (visited.has(value)) return "";
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = scan(item, hint);
        if (found) return found;
      }
      return "";
    }

    for (const key of preferredKeys) {
      if (key in value) {
        const found = scan(value[key], key);
        if (found) return found;
      }
    }

    for (const key of containerKeys) {
      if (key in value) {
        const found = scan(value[key], key);
        if (found) return found;
      }
    }

    for (const item of Object.values(value)) {
      const found = scan(item, hint);
      if (found) return found;
    }
    return "";
  };

  return scan(payload);
}

function normalizeImageSource(value, hint = "") {
  const source = String(value || "").trim();
  if (!source) return "";
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(source)) return source;
  const looksBase64 = /^[A-Za-z0-9+/=\s]+$/.test(source) && (source.length > 200 || /b64|base64/i.test(hint));
  if (looksBase64) return `data:image/png;base64,${source.replace(/\s/g, "")}`;
  return "";
}

async function requestVideoCreate(configNode, prompt, images = []) {
  return apiFetch("/api/video/create", {
    method: "POST",
    body: JSON.stringify({
      enable_upsample: true,
      enhance_prompt: true,
      model: normalizeModelValue("video", configNode.data.model) || getDefaultModel("video"),
      prompt,
      aspect_ratio: configNode.data.ratio || "16:9",
      ...(images.length ? { images } : {}),
    }),
  });
}

async function requestVideoQuery(taskId) {
  return apiFetch(`/api/video/query?id=${encodeURIComponent(taskId)}`, { method: "GET" });
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

async function generateImage(configId) {
  const config = getNode(configId);
  if (!config) return;
  const prompt = normalizePromptReferenceMentions(getNodePrompt(configId) || "高质量 AI 生成图片");
  const refImageNodes = getImageReferenceSlots(configId).map((ref) => ref.node);
  const existing = findOutputImageNode(configId);

  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 390, y: config.position.y }, { label: "图像生成结果", loading: true, model: config.data.model });
    addEdge(configId, imageId, "output", { label: "输出" });
  } else {
    updateNode(imageId, { loading: true, url: false, error: "" });
  }

  showProcessing(hasApiKey("image") ? "正在调用图像 API..." : "未配置图像 API Key，使用本地模拟生成...");

  if (!hasApiKey("image")) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model: config.data.model, gradient: generateGradient(prompt || config.data.model), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("图片生成成功（模拟）");
    }, 850);
    return;
  }

  try {
    const refImages = (await Promise.all(refImageNodes.map((node) => resolveImageForApi(node.data.url)))).filter(Boolean);
    const url = await requestImageGeneration(config, prompt, refImages);
    updateNode(imageId, { loading: false, url, model: config.data.model, gradient: generateGradient(prompt || config.data.model), error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("图片生成成功");
  } catch (error) {
    updateNode(imageId, { loading: false, url: false, error: error.message });
    processing.hidden = true;
    showToast(`图片生成失败：${error.message}`);
  }
}

function findOutputImageNode(configId) {
  return state.edges
    .filter((edge) => edge.source === configId)
    .map((edge) => getNode(edge.target))
    .find((node) => node?.type === "image");
}

function startConnection(sourceId, sourcePort) {
  pendingConnection = sourceId;
  connectionPreviewPoint = getPortWorldPoint(sourcePort) || getNodeOutputPoint(sourceId);
  document.querySelectorAll(".node-port").forEach((item) => {
    item.classList.remove("active", "connect-target");
  });
  sourcePort?.classList.add("active");
  document.querySelectorAll(".node-port.input").forEach((item) => {
    const nodeId = item.closest(".node")?.dataset.id;
    if (nodeId && nodeId !== sourceId) item.classList.add("connect-target");
  });
  viewport.classList.add("connecting");
  renderEdges();
}

function clearPendingConnection() {
  pendingConnection = null;
  connectionDrag = null;
  connectionPreviewPoint = null;
  viewport.classList.remove("connecting");
  document.querySelectorAll(".node-port").forEach((item) => {
    item.classList.remove("active", "connect-target");
  });
  renderEdges();
}

function finishConnection(targetId) {
  if (!pendingConnection) return false;
  const sourceId = pendingConnection;
  const connection = inferConnection(sourceId, targetId);
  clearPendingConnection();
  const added = addEdge(sourceId, targetId, connection.type, { label: connection.label });
  showToast(added ? "已连接节点" : "这两个节点已经连接过了");
  return added;
}

function inferConnection(sourceId, targetId) {
  const source = getNode(sourceId);
  const target = getNode(targetId);
  if (source?.type === "imageConfig" && target?.type === "image") return { type: "output", label: "输出" };
  if (source?.type === "videoConfig" && target?.type === "video") return { type: "output", label: "输出" };
  if (target?.type === "imageConfig" && ["text", "llmConfig"].includes(source?.type)) return { type: "promptOrder", label: "提示词" };
  if (target?.type === "imageConfig" && source?.type === "image") return { type: "imageOrder", label: "参考图" };
  if (target?.type === "videoConfig" && ["text", "llmConfig"].includes(source?.type)) return { type: "promptOrder", label: "提示词" };
  if (target?.type === "videoConfig" && source?.type === "image") return { type: "imageRole", label: "首帧" };
  return { type: "default", label: "连接" };
}

async function refreshNode(id) {
  const node = getNode(id);
  if (!node) return;

  if (node.type === "llmConfig") {
    await runLlmNode(id);
    return;
  }
  if (node.type === "imageConfig") {
    generateImage(id);
    return;
  }
  if (node.type === "videoConfig") {
    generateVideo(id);
    return;
  }
  if (node.type === "image") {
    const config = incomingNodes(id, ["imageConfig"])[0];
    if (config) generateImage(config.id);
    else showToast("图片节点没有上游生成配置");
    return;
  }
  if (node.type === "video") {
    const config = incomingNodes(id, ["videoConfig"])[0];
    if (config) generateVideo(config.id);
    else showToast("视频节点没有上游生成配置");
    return;
  }

  showToast("文本节点无需刷新");
}

async function runLlmNode(id) {
  const node = getNode(id);
  const source = incomingNodes(id, ["text"]).map((node) => node.data.content).join(" ") || chatInput.value || "创意提示词";
  showProcessing(hasApiKey("chat") ? "正在调用文本 API..." : "未配置文本 API Key，使用本地润色...");
  try {
    const output = hasApiKey("chat") ? await polishWithApi(source, node?.data.model) : polishText(source);
    updateNode(id, { output });
    hideProcessing("文本生成完成");
  } catch (error) {
    processing.hidden = true;
    showToast(`文本生成失败：${error.message}`);
  }
}

function getPortWorldPoint(port) {
  if (!port) return null;
  const rect = port.getBoundingClientRect();
  return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function getNodeOutputPoint(nodeId) {
  const node = getNode(nodeId);
  if (!node) return null;
  const size = getRenderedNodeSize(node);
  return {
    x: node.position.x + size.width + 0.5,
    y: node.position.y + size.height / 2,
  };
}

function updateConnectionPreview(clientX, clientY) {
  if (!pendingConnection) return;
  connectionPreviewPoint = screenToWorld(clientX, clientY);
  renderEdges();
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

  showProcessing(hasApiKey("video") ? "正在创建视频 API 任务..." : "未配置视频 API Key，使用本地模拟生成...");

  if (!hasApiKey("video")) {
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

function showContextMenu(event) {
  if (!event.target.closest(".app-shell")) return;
  event.preventDefault();

  const inViewport = event.target.closest("#viewport");
  if (!inViewport || isTypingTarget(event.target)) {
    hideContextMenu();
    return;
  }

  clearPendingConnection();
  const nodeId = event.target.closest(".node")?.dataset.id || null;
  const node = nodeId ? getNode(nodeId) : null;
  const imageTarget = event.target.closest(".generated-image, .image-preview.has-image");
  const imageSource = node?.type === "image" && imageTarget && typeof node.data.url === "string" ? node.data.url : "";
  const worldPoint = screenToWorld(event.clientX, event.clientY);
  const targetGroupId = event.target.closest(".node-group")?.dataset.groupId || (!nodeId ? getGroupAtPoint(worldPoint)?.id : null);
  const selectionIds = [...selectedNodeIds].filter((id) => getNode(id));
  const nodeIsSelected = nodeId && selectedNodeIds.has(nodeId);
  let groupId = targetGroupId || null;
  let nodeGroupId = nodeId ? findGroupByNodeId(nodeId)?.id || null : null;
  let contextType = "blank";

  if (imageSource) {
    contextType = "imageMedia";
    setSelectedNodes([nodeId]);
  } else if (selectionIds.length > 1 && (!nodeId || nodeIsSelected)) {
    contextType = "selection";
    groupId = findExactGroup(selectionIds)?.id || null;
  } else if (groupId) {
    const group = getGroup(groupId);
    groupId = group?.id || null;
    contextType = group ? "group" : "node";
    if (group) setSelectedNodes(group.nodeIds);
  } else if (nodeId) {
    contextType = "node";
    setSelectedNodes([nodeId]);
  } else {
    setSelectedNodes([]);
  }

  contextMenuState = { contextType, nodeId, groupId, nodeGroupId, selectedIds: [...selectedNodeIds], worldPoint, imageSource };
  render();

  contextMenu.innerHTML = renderContextMenu();
  contextMenu.hidden = false;
  contextMenu.style.visibility = "hidden";
  contextMenu.style.left = "0px";
  contextMenu.style.top = "0px";

  const rect = contextMenu.getBoundingClientRect();
  const left = clamp(event.clientX, 8, window.innerWidth - rect.width - 8);
  const top = clamp(event.clientY, 8, window.innerHeight - rect.height - 8);
  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
  contextMenu.style.visibility = "";
}

function hideContextMenu() {
  contextMenu.hidden = true;
  contextMenuState = null;
}

function renderContextMenu() {
  const { contextType, nodeId, groupId, nodeGroupId, selectedIds = [] } = contextMenuState || {};
  const node = nodeId ? getNode(nodeId) : null;
  const group = groupId ? getGroup(groupId) : null;
  const items = [];

  if (contextType === "imageMedia" && node) {
    items.push({ kind: "title", label: node.data.label || "图片" });
    items.push({ action: "preview-image", label: "预览图片" });
    items.push({ action: "save-image", label: "保存图片" });
    items.push({ kind: "separator" });
    items.push({ action: "image-to-image", label: "创建图生图" });
    items.push({ action: "image-to-video", label: "创建生视频" });
    if (nodeGroupId) items.push({ action: "remove-node-from-group", label: "移除群组" });
    return items.map(renderContextMenuItem).join("");
  }

  if (contextType === "selection") {
    items.push({ kind: "title", label: group ? group.label : `已选 ${selectedIds.length} 个节点` });
    if (group) {
      items.push({ action: "refresh-group", label: "刷新群组节点" });
      items.push({ action: "rename-group", label: "重命名群组" });
      items.push({ action: "dissolve-group", label: "解散群组" });
    } else {
      items.push({ action: "group-selection", label: "群组化" });
    }
    items.push({ kind: "separator" });
    items.push({ action: "delete-selection", label: "删除所选节点", danger: true });
    items.push({ action: "clear-selection", label: "取消选择" });
    return items.map(renderContextMenuItem).join("");
  }

  if (contextType === "group" && group) {
    items.push({ kind: "title", label: group.label || "未命名群组" });
    items.push({ action: "refresh-group", label: "刷新群组节点" });
    items.push({ action: "rename-group", label: "重命名群组" });
    items.push({ action: "dissolve-group", label: "解散群组" });
    items.push({ kind: "separator" });
    items.push({ action: "delete-selection", label: "删除群组节点", danger: true });
    return items.map(renderContextMenuItem).join("");
  }

  if (node) {
    items.push({ kind: "title", label: node.data.label || node.type });
    items.push({ action: "refresh-node", label: "刷新节点" });
    items.push({ action: "duplicate-node", label: "复制节点" });
    if (node.type === "image") {
      items.push({ action: "image-to-image", label: "创建图生图" });
      items.push({ action: "image-to-video", label: "创建生视频" });
    }
    if (nodeGroupId) items.push({ action: "remove-node-from-group", label: "移除群组" });
    items.push({ kind: "separator" });
    items.push({ action: "delete-node", label: "删除节点", danger: true });
    items.push({ kind: "separator" });
  } else {
    items.push({ kind: "title", label: "新建节点" });
  }

  items.push({ action: "add-text", label: "文本节点" });
  items.push({ action: "add-llm", label: "LLM 文本生成" });
  items.push({ action: "add-image-config", label: "文生图配置" });
  items.push({ action: "add-video-config", label: "视频生成配置" });
  items.push({ action: "add-image", label: "图片节点" });
  items.push({ action: "add-video", label: "视频节点" });
  items.push({ kind: "separator" });
  items.push({ action: "fit-view", label: "适配视图" });

  return items.map(renderContextMenuItem).join("");
}

function renderContextMenuItem(item) {
  if (item.kind === "title") return `<div class="context-menu-title">${escapeHtml(item.label)}</div>`;
  if (item.kind === "separator") return `<div class="context-menu-separator"></div>`;
  return `<button class="${item.danger ? "danger" : ""}" data-context-action="${escapeHtml(item.action)}">${escapeHtml(item.label)}</button>`;
}

function handleContextAction(action) {
  const menuState = contextMenuState;
  if (!menuState) return;
  hideContextMenu();

  const { nodeId, groupId, nodeGroupId, selectedIds = [], worldPoint, imageSource } = menuState;
  if (action === "refresh-node" && nodeId) refreshNode(nodeId);
  if (action === "duplicate-node" && nodeId) duplicateNode(nodeId);
  if (action === "delete-node" && nodeId) removeNode(nodeId);
  if (action === "image-to-image" && nodeId) createImageToImage(nodeId);
  if (action === "image-to-video" && nodeId) createImageToVideo(nodeId);
  if (action === "preview-image" && imageSource) openImagePreview(imageSource);
  if (action === "save-image" && imageSource) saveImageSource(imageSource);
  if (action === "group-selection") createGroupFromSelection();
  if (action === "remove-node-from-group" && nodeId && nodeGroupId) removeNodeFromGroup(nodeId, nodeGroupId);
  if (action === "rename-group" && groupId) renameGroup(groupId);
  if (action === "dissolve-group" && groupId) dissolveGroup(groupId);
  if (action === "refresh-group" && groupId) refreshGroup(groupId);
  if (action === "delete-selection") removeNodes(selectedIds);
  if (action === "clear-selection") {
    setSelectedNodes([]);
    render();
  }
  if (action === "fit-view") fitView();

  const typeByAction = {
    "add-text": "text",
    "add-llm": "llmConfig",
    "add-image-config": "imageConfig",
    "add-video-config": "videoConfig",
    "add-image": "image",
    "add-video": "video",
  };
  if (typeByAction[action]) addNode(typeByAction[action], worldPoint);
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

async function getDisplayImageUrl(source) {
  const assetId = getIndexedImageId(source);
  if (assetId) return loadImageAssetObjectUrl(assetId);
  return imageDisplaySource(source);
}

async function openImagePreview(source) {
  const displayUrl = await getDisplayImageUrl(source);
  if (!displayUrl) {
    showToast("图片资源不可用");
    return;
  }
  previewImageSource = source;
  imagePreviewImg.src = displayUrl;
  if (!imagePreviewDialog.open) imagePreviewDialog.showModal();
}

async function saveImageSource(source) {
  try {
    let href = "";
    if (getIndexedImageId(source)) {
      href = await loadImageAssetObjectUrl(getIndexedImageId(source));
    } else if (/^https?:\/\//i.test(source)) {
      const response = await fetch(imageDisplaySource(source));
      if (!response.ok) throw new Error("图片下载失败");
      href = URL.createObjectURL(await response.blob());
    } else {
      href = source;
    }
    if (!href) throw new Error("图片资源不可用");
    const link = document.createElement("a");
    link.href = href;
    link.download = `huobao-image-${Date.now()}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    if (href.startsWith("blob:") && ![...imageAssetObjectUrls.values()].includes(href)) {
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
  } catch (error) {
    showToast(error.message || "保存图片失败");
  }
}

function beginMarqueeSelection(event) {
  hideContextMenu();
  clearPendingConnection();
  marquee = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
  };
  setSelectedNodes([]);
  updateMarqueeSelection(event.clientX, event.clientY);
  marqueeSelection.hidden = false;
  viewport.classList.add("selecting");
  try { viewport.setPointerCapture(event.pointerId); } catch {}
}

function cancelMarqueeSelection(event) {
  if (!marquee) return;
  marquee = null;
  marqueeSelection.hidden = true;
  viewport.classList.remove("selecting");
  try { viewport.releasePointerCapture(event?.pointerId); } catch {}
  render();
}

function updateMarqueeSelection(clientX, clientY) {
  if (!marquee) return;
  marquee.currentX = clientX;
  marquee.currentY = clientY;
  const rect = getMarqueeRect();
  marqueeSelection.style.left = `${rect.left}px`;
  marqueeSelection.style.top = `${rect.top}px`;
  marqueeSelection.style.width = `${rect.width}px`;
  marqueeSelection.style.height = `${rect.height}px`;

  const selected = [...document.querySelectorAll(".node")]
    .filter((element) => intersects(rect, element.getBoundingClientRect()))
    .map((element) => element.dataset.id);
  setSelectedNodes(selected);
}

function finishMarqueeSelection(event) {
  if (!marquee) return;
  updateMarqueeSelection(event.clientX, event.clientY);
  marquee = null;
  marqueeSelection.hidden = true;
  viewport.classList.remove("selecting");
  try { viewport.releasePointerCapture(event.pointerId); } catch {}
  render();
}

function finishCanvasDrag(event) {
  if (!drag) return;
  if (event?.pointerId !== undefined && drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
  if (drag.type === "node") {
    const targetGroup = event ? getGroupAtPoint(screenToWorld(event.clientX, event.clientY)) : null;
    if (targetGroup && addNodesToGroup(targetGroup.id, drag.ids)) {
      showToast("已添加到群组");
    }
  }
  if (drag.type === "node" || drag.type === "group") commitHistory();
  drag = null;
  viewport.classList.remove("dragging");
  viewport.classList.remove("resizing");
  try { viewport.releasePointerCapture(event?.pointerId); } catch {}
}

function cancelCanvasDrag(event) {
  if (!drag) return;
  if (event?.pointerId !== undefined && drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
  drag = null;
  viewport.classList.remove("dragging");
  viewport.classList.remove("resizing");
  try { viewport.releasePointerCapture(event?.pointerId); } catch {}
}

function primaryButtonReleased(event) {
  return event.pointerType === "mouse" && (event.buttons & 1) === 0;
}

function getMarqueeRect() {
  const left = Math.min(marquee.startX, marquee.currentX);
  const top = Math.min(marquee.startY, marquee.currentY);
  return {
    left,
    top,
    right: Math.max(marquee.startX, marquee.currentX),
    bottom: Math.max(marquee.startY, marquee.currentY),
    width: Math.abs(marquee.currentX - marquee.startX),
    height: Math.abs(marquee.currentY - marquee.startY),
  };
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;

  const interactive = event.target.closest("button, input, textarea, select, a");
  const resizeHandle = event.target.closest(".node-resize-handle");
  if (resizeHandle) {
    event.preventDefault();
    const nodeEl = resizeHandle.closest(".node");
    const node = getNode(nodeEl?.dataset.id);
    if (!node) return;
    commitHistory();
    setSelectedNodes([node.id]);
    const size = getNodeSize(node);
    drag = {
      type: "resize",
      pointerId: event.pointerId,
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      width: size.width,
      height: size.height,
    };
    viewport.classList.add("resizing");
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    render();
    return;
  }
  if (event.target.closest(".edge-link")) {
    event.preventDefault();
    return;
  }
  const imageMedia = event.target.closest(".image-preview.has-image, .generated-image");
  const imageNode = imageMedia?.closest(".node");
  if (imageNode && getNode(imageNode.dataset.id)?.type === "image") {
    event.preventDefault();
    return;
  }
  if (event.ctrlKey && !interactive) {
    event.preventDefault();
    beginMarqueeSelection(event);
    return;
  }

  const port = event.target.closest(".node-port");
  if (port) {
    event.preventDefault();
    const nodeId = port.closest(".node")?.dataset.id;
    if (nodeId && port.dataset.port === "output") {
      startConnection(nodeId, port);
      connectionDrag = {
        source: nodeId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      try { viewport.setPointerCapture(event.pointerId); } catch {}
    }
    return;
  }

  const nodeEl = event.target.closest(".node");
  const groupEl = event.target.closest(".node-group");

  if (nodeEl && !interactive) {
    event.preventDefault();
    const node = getNode(nodeEl.dataset.id);
    if (!selectedNodeIds.has(node.id)) setSelectedNodes([node.id]);
    const start = screenToWorld(event.clientX, event.clientY);
    const ids = selectedNodeIds.has(node.id) ? [...selectedNodeIds] : [node.id];
    drag = {
      type: "node",
      pointerId: event.pointerId,
      ids,
      startX: start.x,
      startY: start.y,
      positions: Object.fromEntries(ids.map((id) => {
        const item = getNode(id);
        return [id, { x: item.position.x, y: item.position.y }];
      })),
    };
    viewport.classList.add("dragging");
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    render();
    return;
  }

  if (groupEl && event.target.closest(".node-group-title")) {
    const group = getGroup(groupEl.dataset.groupId);
    if (group) {
      event.preventDefault();
      setSelectedNodes(group.nodeIds);
      const start = screenToWorld(event.clientX, event.clientY);
      const ids = group.nodeIds.filter((id) => getNode(id));
      drag = {
        type: "group",
        pointerId: event.pointerId,
        groupId: group.id,
        ids,
        startX: start.x,
        startY: start.y,
        positions: Object.fromEntries(ids.map((id) => {
          const item = getNode(id);
          return [id, { x: item.position.x, y: item.position.y }];
        })),
      };
      viewport.classList.add("dragging");
      try { viewport.setPointerCapture(event.pointerId); } catch {}
      render();
      return;
    }
  }

  if (!nodeEl && !groupEl) {
    event.preventDefault();
    setSelectedNodes([]);
    drag = { type: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewX: state.view.x, viewY: state.view.y };
    viewport.classList.add("dragging");
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    render();
  }
});

viewport.addEventListener("pointermove", (event) => {
  if (marquee) {
    if (primaryButtonReleased(event)) {
      cancelMarqueeSelection(event);
      return;
    }
    updateMarqueeSelection(event.clientX, event.clientY);
    return;
  }

  if (pendingConnection) {
    return;
  }

  if (!drag) return;
  if (primaryButtonReleased(event)) {
    finishCanvasDrag(event);
    return;
  }

  if (drag.type === "pan") {
    setView({ ...state.view, x: drag.viewX + event.clientX - drag.startX, y: drag.viewY + event.clientY - drag.startY });
    return;
  }
  if (drag.type === "resize") {
    const node = getNode(drag.id);
    if (!node) return;
    const min = getMinNodeSize(node.type);
    node.data.width = Math.round(clamp(drag.width + (event.clientX - drag.startX) / state.view.zoom, min.width, 900));
    node.data.height = Math.round(clamp(drag.height + (event.clientY - drag.startY) / state.view.zoom, min.height, 900));
    saveState();
    render();
    return;
  }
  const point = screenToWorld(event.clientX, event.clientY);
  drag.ids.forEach((id) => {
    const node = getNode(id);
    const origin = drag.positions[id];
    if (!node || !origin) return;
    node.position.x = origin.x + point.x - drag.startX;
    node.position.y = origin.y + point.y - drag.startY;
  });
  saveState();
  render();
});

viewport.addEventListener("pointerup", (event) => {
  if (marquee) {
    finishMarqueeSelection(event);
    return;
  }

  finishCanvasDrag(event);
});

viewport.addEventListener("pointercancel", cancelCanvasDrag);
viewport.addEventListener("lostpointercapture", (event) => {
  if (drag?.pointerId === event.pointerId) cancelCanvasDrag(event);
});

viewport.addEventListener("dragstart", (event) => {
  event.preventDefault();
});

edgeLayer.addEventListener("dblclick", (event) => {
  const edgeEl = event.target.closest(".edge-link");
  if (!edgeEl) return;
  event.preventDefault();
  event.stopPropagation();
  clearPendingConnection();
  if (removeEdge(edgeEl.dataset.edgeId)) showToast("连线已断开");
});

viewport.addEventListener("click", (event) => {
  const imageMedia = event.target.closest(".image-preview.has-image, .generated-image");
  const node = getNode(imageMedia?.closest(".node")?.dataset.id);
  if (!imageMedia || node?.type !== "image" || typeof node.data.url !== "string") return;
  event.preventDefault();
  openImagePreview(node.data.url);
});

document.addEventListener("pointerup", (event) => {
  if (!connectionDrag) return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".node-port.input");
  const targetId = target?.closest(".node")?.dataset.id;
  const shouldClear = connectionDrag.moved;
  try { viewport.releasePointerCapture(event.pointerId); } catch {}

  if (targetId) {
    finishConnection(targetId);
    return;
  }

  if (shouldClear) clearPendingConnection();
  else connectionDrag = null;
});

document.addEventListener("pointermove", (event) => {
  if (!pendingConnection) return;
  if (connectionDrag) {
    const dx = event.clientX - connectionDrag.startX;
    const dy = event.clientY - connectionDrag.startY;
    if (Math.hypot(dx, dy) > 4) connectionDrag.moved = true;
  }
  updateConnectionPreview(event.clientX, event.clientY);
});

viewport.addEventListener("wheel", (event) => {
  hideContextMenu();
  event.preventDefault();
  const point = screenToWorld(event.clientX, event.clientY);
  const rect = viewport.getBoundingClientRect();
  const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
  const zoom = clamp(state.view.zoom * Math.exp(-delta * 0.0012), 0.12, 2.2);
  setView({
    zoom,
    x: event.clientX - rect.left - point.x * zoom,
    y: event.clientY - rect.top - point.y * zoom,
  });
}, { passive: false });

document.addEventListener("dragenter", (event) => {
  if (!hasExternalFiles(event)) return;
  event.preventDefault();
  externalDragDepth += 1;
  showDropOverlay();
});

document.addEventListener("dragover", (event) => {
  if (!hasExternalFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  showDropOverlay();
});

document.addEventListener("dragleave", (event) => {
  if (!hasExternalFiles(event)) return;
  externalDragDepth = Math.max(0, externalDragDepth - 1);
  if (!externalDragDepth || event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
    hideDropOverlay();
  }
});

document.addEventListener("drop", async (event) => {
  if (!hasExternalFiles(event)) return;
  event.preventDefault();
  const file = [...event.dataTransfer.files].find((item) => /\.json$/i.test(item.name) || String(item.type).includes("json"));
  hideDropOverlay();
  if (projectHome.hidden) await importWorkflowFile(file);
  else await importProjectFile(file);
});

document.addEventListener("contextmenu", showContextMenu);

contextMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-context-action]");
  if (!button) return;
  event.stopPropagation();
  handleContextAction(button.dataset.contextAction);
});

imagePreviewDialog.addEventListener("click", (event) => {
  const action = event.target.closest("[data-preview-action]")?.dataset.previewAction;
  if (action === "close") imagePreviewDialog.close();
  if (action === "save" && previewImageSource) saveImageSource(previewImageSource);
  if (event.target === imagePreviewDialog) imagePreviewDialog.close();
});

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || contextMenu.hidden || contextMenu.contains(event.target)) return;
  hideContextMenu();
}, true);

document.addEventListener("click", async (event) => {
  const port = event.target.closest(".node-port");
  if (port) {
    const nodeId = port.closest(".node").dataset.id;
    event.preventDefault();
    if (port.dataset.port === "output") {
      startConnection(nodeId, port);
    } else if (pendingConnection) {
      finishConnection(nodeId);
    }
    return;
  }

  if (pendingConnection && !event.target.closest(".node")) {
    clearPendingConnection();
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  const nodeAction = event.target.closest("[data-node-action]")?.dataset.nodeAction;
  const mentionButton = event.target.closest("[data-mention-token]");
  if (mentionButton) {
    event.preventDefault();
    applyPromptMention(mentionButton);
    return;
  }
  const nodeEl = event.target.closest(".node");

  if (nodeAction && nodeEl) {
    const id = nodeEl.dataset.id;
    if (nodeAction === "delete") removeNode(id);
    if (nodeAction === "duplicate") duplicateNode(id);
    if (nodeAction === "generate-image") generateImage(id);
    if (nodeAction === "replace-image") generateImage(id);
    if (nodeAction === "generate-video") generateVideo(id);
    if (nodeAction === "image-to-image") createImageToImage(id);
    if (nodeAction === "image-to-video") createImageToVideo(id);
    if (nodeAction === "insert-ref-mention") {
      insertReferenceMention(id, event.target.closest("[data-ref-token]")?.dataset.refToken || "");
    }
    if (nodeAction === "run-llm") {
      await runLlmNode(id);
    }
    return;
  }

  const projectAction = event.target.closest("[data-project-action]");
  if (projectAction) {
    handleProjectAction(projectAction.dataset.projectAction, projectAction.dataset.projectId);
    return;
  }

  const templateCategory = event.target.closest("[data-template-category]");
  if (templateCategory) {
    setActiveTemplateCategory(templateCategory.dataset.templateCategory);
    return;
  }

  const templateAction = event.target.closest("[data-template-action]");
  if (templateAction) {
    handleTemplateAction(templateAction.dataset.templateAction, templateAction.dataset.templateId);
    return;
  }

  if (!action) return;
  if (action === "home") {
    showProjectHome();
    return;
  }
  if (action === "new-project") {
    createProject();
    return;
  }
  if (action === "import-project") {
    projectImportInput.click();
    return;
  }
  if (action === "project-menu") {
    const project = getActiveProject();
    if (project) renameProject(project.id);
    return;
  }
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
    showProcessing(hasApiKey("chat") ? "正在调用文本 API 润色提示词..." : "未配置文本 API Key，使用本地润色...");
    try {
      chatInput.value = hasApiKey("chat") ? await polishWithApi(source) : polishText(source);
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
    await loadBackendStatus();
    syncApiSettingsForm();
    settingsModal.showModal();
  }
  if (action === "save-api-settings") {
    try {
      await saveApiSettings();
    } catch (error) {
      showToast(`保存失败：${error.message}`);
    }
  }
  if (action === "workflow-panel") {
    templatePanel.hidden = !templatePanel.hidden;
    renderTemplateLibrary();
  }
  if (action === "close-template-panel") templatePanel.hidden = true;
  if (action === "save-workflow-template") saveCurrentWorkflowAsTemplate();
  if (action === "export-workflow-json" || action === "download") exportCurrentWorkflowJson();
  if (action === "add-template-category") {
    templatePanel.hidden = false;
    createTemplateCategory();
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

document.addEventListener("error", (event) => {
  if (!event.target?.classList?.contains("generated-image")) return;
  event.target.closest(".image-preview")?.classList.add("image-load-failed");
}, true);

function syncNodeFieldControl(control) {
  const field = control?.dataset?.field;
  const nodeEl = control?.closest?.(".node");
  if (!field || !nodeEl) return false;
  const node = getNode(nodeEl.dataset.id);
  if (!node) return false;
  const value = control.type === "checkbox" ? control.checked : control.value;
  node.data[field] = field === "model" ? normalizeNodeModelValue(node.type, value) : value;
  if (field === "model" && node.type === "imageConfig") {
    node.data.size = getImageSizeValue(node.data.model, node.data.size);
  }
  saveState();
  if (field === "content") {
    syncPromptEditorVisuals(control);
    updatePromptMentionMenu(control);
  }
  if (field !== "content") render();
  return true;
}

function normalizeNodeModelValue(nodeType, value) {
  if (nodeType === "llmConfig") return normalizeModelValue("chat", value);
  if (nodeType === "imageConfig") return normalizeModelValue("image", value);
  if (nodeType === "videoConfig") return normalizeModelValue("video", value);
  return value;
}

function handleSettingsModelChange(control) {
  const kindById = {
    chatModel: "chat",
    imageModel: "image",
    videoModel: "video",
  };
  const kind = kindById[control?.id];
  if (!kind) return false;
  setModelDefault(kind, control.value);
  syncApiSettingsForm();
  return true;
}

document.addEventListener("input", (event) => {
  if (event.target.matches("select")) return;
  syncNodeFieldControl(event.target);
});

document.addEventListener("scroll", (event) => {
  if (!event.target.matches?.(".prompt-editor textarea")) return;
  syncPromptEditorVisuals(event.target);
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !event.target.matches?.(".prompt-editor textarea")) return;
  hidePromptMentionMenu(event.target.closest(".prompt-editor"));
});

document.addEventListener("keyup", (event) => {
  if (!event.target.matches?.(".prompt-editor textarea")) return;
  updatePromptMentionMenu(event.target);
});

document.addEventListener("focusin", (event) => {
  if (!event.target.matches?.(".prompt-editor textarea")) return;
  syncPromptEditorVisuals(event.target);
  updatePromptMentionMenu(event.target);
});

document.addEventListener("focusout", (event) => {
  if (!event.target.matches?.(".prompt-editor textarea")) return;
  setTimeout(() => hidePromptMentionMenu(event.target.closest(".prompt-editor")), 240);
});

document.addEventListener("pointerdown", (event) => {
  const mentionButton = event.target.closest?.("[data-mention-token]");
  if (!mentionButton) return;
  event.preventDefault();
  applyPromptMention(mentionButton);
});

document.addEventListener("change", (event) => {
  if (handleSettingsModelChange(event.target)) return;
  syncNodeFieldControl(event.target);
});

apiBaseUrlInput.addEventListener("input", () => {
  Object.values(serviceSettingInputs).forEach((controls) => {
    if (controls.baseUrl) controls.baseUrl.value = apiBaseUrlInput.value;
  });
});

document.querySelectorAll("[data-suggestion]").forEach((button) => {
  button.addEventListener("click", () => {
    chatInput.value = button.dataset.suggestion;
    chatInput.focus();
  });
});

projectImportInput.addEventListener("change", async () => {
  await importProjectFile(projectImportInput.files?.[0]);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !contextMenu.hidden) {
    event.preventDefault();
    hideContextMenu();
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeIds.size && !isTypingTarget(event.target)) {
    event.preventDefault();
    removeNodes([...selectedNodeIds]);
    return;
  }

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

window.addEventListener("blur", () => {
  cancelCanvasDrag();
  cancelMarqueeSelection();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelCanvasDrag();
    cancelMarqueeSelection();
  }
});

function isTypingTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], dialog"));
}

renderTemplateLibrary();
applyTheme();
initializeProjectManager();
loadBackendStatus().finally(() => {
  if (!appShell.hidden) render();
});
