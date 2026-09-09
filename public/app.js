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
const processing = document.querySelector("#processing");
const processingText = document.querySelector("#processingText");
const zoomLabel = document.querySelector("#zoomLabel");
const saveStateLabel = document.querySelector("#saveState");
const projectNameLabel = document.querySelector("#projectName");
const settingsModal = document.querySelector("#settingsModal");
const contextMenu = document.createElement("div");
contextMenu.className = "context-menu";
contextMenu.hidden = true;
document.body.append(contextMenu);
const connectionDropMenu = document.createElement("div");
connectionDropMenu.className = "context-menu connection-drop-menu";
connectionDropMenu.hidden = true;
document.body.append(connectionDropMenu);
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

const historyPanel = document.createElement("aside");
historyPanel.className = "template-panel history-panel";
historyPanel.hidden = true;
historyPanel.innerHTML = `
  <div class="template-panel-head">
    <div>
      <span class="template-eyebrow">本项目</span>
      <h2>生成历史</h2>
    </div>
    <button class="icon-button" data-action="close-history-panel" title="关闭" aria-label="关闭历史">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
    </button>
  </div>
  <div class="history-list" id="historyList"></div>
`;
document.querySelector(".canvas-area").append(historyPanel);
const historyListEl = historyPanel.querySelector("#historyList");

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
imagePreviewImg.draggable = false;
const imagePreviewStage = imagePreviewDialog.querySelector(".image-preview-stage");
const imagePreviewView = { scale: 1, x: 0, y: 0 };
let imagePreviewDragging = null;

function applyImagePreviewTransform() {
  imagePreviewImg.style.transform = `translate(${imagePreviewView.x}px, ${imagePreviewView.y}px) scale(${imagePreviewView.scale})`;
}

function fitImagePreviewDialog() {
  const nw = imagePreviewImg.naturalWidth;
  const nh = imagePreviewImg.naturalHeight;
  if (!nw || !nh) return;
  const headerH = 58;
  const stagePadding = 32;
  const viewportMargin = 36;
  const maxStageW = window.innerWidth - viewportMargin - stagePadding;
  const maxStageH = window.innerHeight - viewportMargin - stagePadding - headerH;
  if (maxStageW <= 0 || maxStageH <= 0) return;

  const ratio = nw / nh;
  let displayW = Math.min(nw, maxStageW);
  let displayH = displayW / ratio;
  if (displayH > maxStageH) {
    displayH = maxStageH;
    displayW = displayH * ratio;
  }
  imagePreviewDialog.style.width = `${Math.round(displayW + stagePadding)}px`;
  imagePreviewDialog.style.height = `${Math.round(displayH + stagePadding + headerH)}px`;
}

imagePreviewImg.addEventListener("load", fitImagePreviewDialog);
window.addEventListener("resize", () => {
  if (imagePreviewDialog.open) fitImagePreviewDialog();
});

function resetImagePreviewView() {
  imagePreviewView.scale = 1;
  imagePreviewView.x = 0;
  imagePreviewView.y = 0;
  applyImagePreviewTransform();
}

imagePreviewStage.addEventListener("wheel", (event) => {
  event.preventDefault();
  const stageRect = imagePreviewStage.getBoundingClientRect();
  const mx = event.clientX - stageRect.left - stageRect.width / 2;
  const my = event.clientY - stageRect.top - stageRect.height / 2;
  const oldScale = imagePreviewView.scale;
  const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
  const newScale = Math.min(8, Math.max(0.2, oldScale * Math.exp(-delta * 0.0015)));
  if (newScale === oldScale) return;
  const ratio = newScale / oldScale;
  imagePreviewView.x = mx - (mx - imagePreviewView.x) * ratio;
  imagePreviewView.y = my - (my - imagePreviewView.y) * ratio;
  imagePreviewView.scale = newScale;
  applyImagePreviewTransform();
}, { passive: false });

imagePreviewStage.addEventListener("dragstart", (event) => event.preventDefault());

imagePreviewStage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target.closest("[data-preview-action]")) return;
  event.preventDefault();
  imagePreviewDragging = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: imagePreviewView.x,
    originY: imagePreviewView.y,
  };
  imagePreviewStage.classList.add("dragging");
});

document.addEventListener("pointermove", (event) => {
  if (!imagePreviewDragging || event.pointerId !== imagePreviewDragging.pointerId) return;
  imagePreviewView.x = imagePreviewDragging.originX + (event.clientX - imagePreviewDragging.startX);
  imagePreviewView.y = imagePreviewDragging.originY + (event.clientY - imagePreviewDragging.startY);
  applyImagePreviewTransform();
});

document.addEventListener("pointerup", (event) => {
  if (!imagePreviewDragging || event.pointerId !== imagePreviewDragging.pointerId) return;
  imagePreviewDragging = null;
  imagePreviewStage.classList.remove("dragging");
});

document.addEventListener("pointercancel", () => {
  imagePreviewDragging = null;
  imagePreviewStage.classList.remove("dragging");
});

imagePreviewStage.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-preview-action]")) return;
  resetImagePreviewView();
});

imagePreviewDialog.addEventListener("close", () => {
  resetImagePreviewView();
  imagePreviewDialog.style.width = "";
  imagePreviewDialog.style.height = "";
});

const imageEditorDialog = document.createElement("dialog");
imageEditorDialog.className = "image-editor-dialog";
imageEditorDialog.innerHTML = `
  <div class="image-editor-shell">
    <div class="image-editor-head">
      <strong>图片编辑</strong>
      <div class="image-editor-head-actions">
        <button class="ghost-small" data-editor-action="save">保存并替换</button>
        <button class="icon-button" data-editor-action="close" aria-label="关闭">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
    <div class="image-editor-toolbar">
      <div class="image-editor-tool-group">
        <button data-editor-tool="brush" class="active">笔刷</button>
        <button data-editor-tool="eraser">橡皮</button>
        <button data-editor-tool="crop">裁切</button>
      </div>
      <label class="image-editor-input"><span>颜色</span><input type="color" data-editor-color value="#ff3b30"></label>
      <label class="image-editor-input"><span>粗细</span><input type="range" data-editor-size min="1" max="80" value="8"><span data-editor-size-label>8</span></label>
      <div class="image-editor-tool-group">
        <button data-editor-action="undo">撤销</button>
        <button data-editor-action="reset">重置</button>
        <button data-editor-action="apply-crop" hidden>应用裁切</button>
      </div>
    </div>
    <div class="image-editor-stage">
      <canvas></canvas>
      <div class="image-editor-crop-rect" hidden></div>
    </div>
  </div>
`;
document.body.append(imageEditorDialog);

const imageEditorState = {
  nodeId: null,
  tool: "brush",
  color: "#ff3b30",
  size: 8,
  drawing: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  history: [],
  cropping: null,
};
const imageEditorCanvas = imageEditorDialog.querySelector("canvas");
const imageEditorCtx = imageEditorCanvas.getContext("2d");
const imageEditorBaseCanvas = document.createElement("canvas");
const imageEditorBaseCtx = imageEditorBaseCanvas.getContext("2d");
const imageEditorOverlayCanvas = document.createElement("canvas");
const imageEditorOverlayCtx = imageEditorOverlayCanvas.getContext("2d");
let imageEditorOriginalImage = null;
const imageEditorStage = imageEditorDialog.querySelector(".image-editor-stage");
const imageEditorCropRect = imageEditorDialog.querySelector(".image-editor-crop-rect");
const imageEditorColorInput = imageEditorDialog.querySelector("[data-editor-color]");
const imageEditorSizeInput = imageEditorDialog.querySelector("[data-editor-size]");
const imageEditorSizeLabel = imageEditorDialog.querySelector("[data-editor-size-label]");
const imageEditorApplyCropBtn = imageEditorDialog.querySelector("[data-editor-action='apply-crop']");
const imageEditorToolbarEl = imageEditorDialog.querySelector(".image-editor-toolbar");

function fitImageEditorDialog() {
  const nw = imageEditorCanvas.width;
  const nh = imageEditorCanvas.height;
  if (!nw || !nh) return;
  const headerH = 58;
  const toolbarH = imageEditorToolbarEl?.offsetHeight || 64;
  const stagePadding = 32;
  const viewportMargin = 36;
  const maxStageW = window.innerWidth - viewportMargin - stagePadding;
  const maxStageH = window.innerHeight - viewportMargin - stagePadding - headerH - toolbarH;
  if (maxStageW <= 0 || maxStageH <= 0) return;

  const ratio = nw / nh;
  let displayW = Math.min(nw, maxStageW);
  let displayH = displayW / ratio;
  if (displayH > maxStageH) {
    displayH = maxStageH;
    displayW = displayH * ratio;
  }
  imageEditorDialog.style.width = `${Math.round(displayW + stagePadding)}px`;
  imageEditorDialog.style.height = `${Math.round(displayH + stagePadding + headerH + toolbarH)}px`;
}

window.addEventListener("resize", () => {
  if (imageEditorDialog.open) {
    fitImageEditorDialog();
    updateImageEditorCursor();
  }
});

async function openImageEditor(nodeId) {
  const node = getNode(nodeId);
  if (!node || node.type !== "image") return;
  const source = await getDisplayImageUrl(node.data.url);
  if (!source) {
    showToast("图片资源不可用");
    return;
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = source;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("图片加载失败"));
  }).catch((error) => {
    showToast(error.message);
    throw error;
  });
  imageEditorOriginalImage = image;
  imageEditorBaseCanvas.width = image.naturalWidth;
  imageEditorBaseCanvas.height = image.naturalHeight;
  imageEditorBaseCtx.drawImage(image, 0, 0);
  imageEditorOverlayCanvas.width = image.naturalWidth;
  imageEditorOverlayCanvas.height = image.naturalHeight;
  imageEditorOverlayCtx.clearRect(0, 0, imageEditorOverlayCanvas.width, imageEditorOverlayCanvas.height);
  imageEditorCanvas.width = image.naturalWidth;
  imageEditorCanvas.height = image.naturalHeight;
  composeImageEditorCanvas();
  imageEditorState.nodeId = nodeId;
  imageEditorState.history = [];
  imageEditorState.tool = "brush";
  imageEditorState.cropping = null;
  imageEditorCropRect.hidden = true;
  imageEditorApplyCropBtn.hidden = true;
  setImageEditorTool("brush");
  pushImageEditorHistory();
  if (!imageEditorDialog.open) imageEditorDialog.showModal();
  requestAnimationFrame(() => {
    fitImageEditorDialog();
    updateImageEditorCursor();
  });
}

function composeImageEditorCanvas() {
  imageEditorCtx.clearRect(0, 0, imageEditorCanvas.width, imageEditorCanvas.height);
  imageEditorCtx.drawImage(imageEditorBaseCanvas, 0, 0);
  imageEditorCtx.drawImage(imageEditorOverlayCanvas, 0, 0);
}

function setImageEditorTool(tool) {
  imageEditorState.tool = tool;
  imageEditorDialog.querySelectorAll("[data-editor-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.editorTool === tool);
  });
  imageEditorApplyCropBtn.hidden = tool !== "crop";
  if (tool !== "crop") {
    imageEditorCropRect.hidden = true;
    imageEditorState.cropping = null;
  }
  updateImageEditorCursor();
}

function updateImageEditorCursor() {
  if (imageEditorState.tool === "crop") {
    imageEditorCanvas.style.cursor = "crosshair";
    return;
  }
  const rect = imageEditorCanvas.getBoundingClientRect();
  const scale = imageEditorCanvas.width > 0 && rect.width > 0 ? rect.width / imageEditorCanvas.width : 1;
  const displaySize = Math.max(4, imageEditorState.size * scale);
  const r = Math.max(2, Math.min(120, displaySize / 2));
  const svgSize = Math.ceil(r * 2 + 6);
  const c = svgSize / 2;
  const stroke = imageEditorState.tool === "eraser" ? "#222" : imageEditorState.color;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${svgSize}' height='${svgSize}'><circle cx='${c}' cy='${c}' r='${r}' fill='none' stroke='${stroke}' stroke-width='2'/><circle cx='${c}' cy='${c}' r='${r}' fill='none' stroke='white' stroke-width='1'/></svg>`;
  imageEditorCanvas.style.cursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}

function pushImageEditorHistory() {
  try {
    const snapshot = imageEditorOverlayCtx.getImageData(0, 0, imageEditorOverlayCanvas.width, imageEditorOverlayCanvas.height);
    imageEditorState.history.push(snapshot);
    if (imageEditorState.history.length > 20) imageEditorState.history.shift();
  } catch {}
}

function popImageEditorHistory() {
  if (imageEditorState.history.length <= 1) return;
  imageEditorState.history.pop();
  const last = imageEditorState.history[imageEditorState.history.length - 1];
  if (last.width !== imageEditorOverlayCanvas.width || last.height !== imageEditorOverlayCanvas.height) return;
  imageEditorOverlayCtx.clearRect(0, 0, imageEditorOverlayCanvas.width, imageEditorOverlayCanvas.height);
  imageEditorOverlayCtx.putImageData(last, 0, 0);
  composeImageEditorCanvas();
}

function resetImageEditor() {
  if (!imageEditorOriginalImage) return;
  const orig = imageEditorOriginalImage;
  imageEditorBaseCanvas.width = orig.naturalWidth;
  imageEditorBaseCanvas.height = orig.naturalHeight;
  imageEditorBaseCtx.clearRect(0, 0, imageEditorBaseCanvas.width, imageEditorBaseCanvas.height);
  imageEditorBaseCtx.drawImage(orig, 0, 0);
  imageEditorOverlayCanvas.width = orig.naturalWidth;
  imageEditorOverlayCanvas.height = orig.naturalHeight;
  imageEditorOverlayCtx.clearRect(0, 0, imageEditorOverlayCanvas.width, imageEditorOverlayCanvas.height);
  imageEditorCanvas.width = orig.naturalWidth;
  imageEditorCanvas.height = orig.naturalHeight;
  composeImageEditorCanvas();
  imageEditorState.history = [];
  pushImageEditorHistory();
  fitImageEditorDialog();
  updateImageEditorCursor();
}

function imageEditorClientToCanvas(clientX, clientY) {
  const rect = imageEditorCanvas.getBoundingClientRect();
  const scaleX = imageEditorCanvas.width / rect.width;
  const scaleY = imageEditorCanvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
    relX: clientX - rect.left,
    relY: clientY - rect.top,
  };
}

imageEditorCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  const point = imageEditorClientToCanvas(event.clientX, event.clientY);
  imageEditorState.drawing = true;
  imageEditorState.pointerId = event.pointerId;
  imageEditorState.lastX = point.x;
  imageEditorState.lastY = point.y;
  try { imageEditorCanvas.setPointerCapture(event.pointerId); } catch {}

  if (imageEditorState.tool === "crop") {
    imageEditorState.cropping = { startX: point.relX, startY: point.relY, endX: point.relX, endY: point.relY };
    updateImageEditorCropRect();
    return;
  }

  imageEditorOverlayCtx.save();
  imageEditorOverlayCtx.lineCap = "round";
  imageEditorOverlayCtx.lineJoin = "round";
  imageEditorOverlayCtx.lineWidth = imageEditorState.size;
  if (imageEditorState.tool === "eraser") {
    imageEditorOverlayCtx.globalCompositeOperation = "destination-out";
    imageEditorOverlayCtx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    imageEditorOverlayCtx.globalCompositeOperation = "source-over";
    imageEditorOverlayCtx.strokeStyle = imageEditorState.color;
  }
  imageEditorOverlayCtx.beginPath();
  imageEditorOverlayCtx.moveTo(point.x, point.y);
  imageEditorOverlayCtx.lineTo(point.x + 0.01, point.y + 0.01);
  imageEditorOverlayCtx.stroke();
  composeImageEditorCanvas();
});

imageEditorCanvas.addEventListener("pointermove", (event) => {
  if (!imageEditorState.drawing || event.pointerId !== imageEditorState.pointerId) return;
  const point = imageEditorClientToCanvas(event.clientX, event.clientY);

  if (imageEditorState.tool === "crop") {
    if (imageEditorState.cropping) {
      imageEditorState.cropping.endX = point.relX;
      imageEditorState.cropping.endY = point.relY;
      updateImageEditorCropRect();
    }
    return;
  }

  imageEditorOverlayCtx.beginPath();
  imageEditorOverlayCtx.moveTo(imageEditorState.lastX, imageEditorState.lastY);
  imageEditorOverlayCtx.lineTo(point.x, point.y);
  imageEditorOverlayCtx.stroke();
  composeImageEditorCanvas();
  imageEditorState.lastX = point.x;
  imageEditorState.lastY = point.y;
});

imageEditorCanvas.addEventListener("pointerup", (event) => {
  if (!imageEditorState.drawing || event.pointerId !== imageEditorState.pointerId) return;
  imageEditorState.drawing = false;
  imageEditorState.pointerId = null;
  try { imageEditorCanvas.releasePointerCapture(event.pointerId); } catch {}
  if (imageEditorState.tool === "crop") return;
  imageEditorOverlayCtx.restore();
  pushImageEditorHistory();
});

imageEditorCanvas.addEventListener("pointercancel", () => {
  imageEditorState.drawing = false;
  imageEditorState.pointerId = null;
});

function updateImageEditorCropRect() {
  const crop = imageEditorState.cropping;
  if (!crop) return;
  const rect = imageEditorCanvas.getBoundingClientRect();
  const stageRect = imageEditorStage.getBoundingClientRect();
  const offsetX = rect.left - stageRect.left;
  const offsetY = rect.top - stageRect.top;
  const left = Math.min(crop.startX, crop.endX);
  const top = Math.min(crop.startY, crop.endY);
  const width = Math.abs(crop.endX - crop.startX);
  const height = Math.abs(crop.endY - crop.startY);
  imageEditorCropRect.style.left = `${offsetX + left}px`;
  imageEditorCropRect.style.top = `${offsetY + top}px`;
  imageEditorCropRect.style.width = `${width}px`;
  imageEditorCropRect.style.height = `${height}px`;
  imageEditorCropRect.hidden = width < 2 || height < 2;
}

function applyImageEditorCrop() {
  const crop = imageEditorState.cropping;
  if (!crop) return;
  const rect = imageEditorCanvas.getBoundingClientRect();
  const scaleX = imageEditorCanvas.width / rect.width;
  const scaleY = imageEditorCanvas.height / rect.height;
  const left = Math.min(crop.startX, crop.endX) * scaleX;
  const top = Math.min(crop.startY, crop.endY) * scaleY;
  const width = Math.abs(crop.endX - crop.startX) * scaleX;
  const height = Math.abs(crop.endY - crop.startY) * scaleY;
  if (width < 4 || height < 4) {
    showToast("裁切区域太小");
    return;
  }
  const newW = Math.round(width);
  const newH = Math.round(height);

  const baseBuffer = document.createElement("canvas");
  baseBuffer.width = newW;
  baseBuffer.height = newH;
  baseBuffer.getContext("2d").drawImage(imageEditorBaseCanvas, left, top, width, height, 0, 0, newW, newH);
  imageEditorBaseCanvas.width = newW;
  imageEditorBaseCanvas.height = newH;
  imageEditorBaseCtx.drawImage(baseBuffer, 0, 0);

  const overlayBuffer = document.createElement("canvas");
  overlayBuffer.width = newW;
  overlayBuffer.height = newH;
  overlayBuffer.getContext("2d").drawImage(imageEditorOverlayCanvas, left, top, width, height, 0, 0, newW, newH);
  imageEditorOverlayCanvas.width = newW;
  imageEditorOverlayCanvas.height = newH;
  imageEditorOverlayCtx.drawImage(overlayBuffer, 0, 0);

  imageEditorCanvas.width = newW;
  imageEditorCanvas.height = newH;
  composeImageEditorCanvas();

  imageEditorState.cropping = null;
  imageEditorCropRect.hidden = true;
  imageEditorState.history = [];
  pushImageEditorHistory();
  fitImageEditorDialog();
  updateImageEditorCursor();
}

imageEditorDialog.addEventListener("click", (event) => {
  const tool = event.target.closest("[data-editor-tool]")?.dataset.editorTool;
  if (tool) {
    setImageEditorTool(tool);
    return;
  }
  const action = event.target.closest("[data-editor-action]")?.dataset.editorAction;
  if (action === "save") void saveImageEditorResult();
  else if (action === "close") imageEditorDialog.close();
  else if (action === "undo") popImageEditorHistory();
  else if (action === "reset") resetImageEditor();
  else if (action === "apply-crop") applyImageEditorCrop();
});

imageEditorColorInput.addEventListener("input", (event) => {
  imageEditorState.color = event.target.value;
  updateImageEditorCursor();
});

imageEditorSizeInput.addEventListener("input", (event) => {
  imageEditorState.size = Number(event.target.value) || 1;
  imageEditorSizeLabel.textContent = String(imageEditorState.size);
  updateImageEditorCursor();
});

async function saveImageEditorResult() {
  const nodeId = imageEditorState.nodeId;
  if (!nodeId) return;
  const blob = await new Promise((resolve) => imageEditorCanvas.toBlob(resolve, "image/png"));
  if (!blob) {
    showToast("导出图片失败");
    return;
  }
  try {
    const sentinel = await persistImageBlob(blob);
    commitHistory();
    updateNode(nodeId, { url: sentinel, error: "", gradient: "" });
    showToast("已替换为编辑后的图片");
    imageEditorDialog.close();
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  }
}

imageEditorDialog.addEventListener("close", () => {
  imageEditorState.nodeId = null;
  imageEditorState.history = [];
  imageEditorState.cropping = null;
  imageEditorDialog.style.width = "";
  imageEditorDialog.style.height = "";
});

const storageKey = "huobao-canvas-static:v1";
const templateStorageKey = "huobao-canvas-templates:v1";
const modelDefaultsStorageKey = "huobao-canvas-model-defaults:v1";
const projectStorageKey = "huobao-canvas-projects:v1";
const contextMenuFavoritesStorageKey = "huobao-canvas-context-menu-favorites:v1";
const contextMenuModel = window.ContextMenuModel;
const themeStyles = window.ThemeStyles;
let contextMenuFavorites = [...contextMenuModel.defaultFavorites];
try {
  contextMenuFavorites = contextMenuModel.parseStoredFavorites(localStorage.getItem(contextMenuFavoritesStorageKey));
} catch {}
const imageAssetPrefix = "idb-image:";
const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
let imageAssetDbPromise = null;
const imageAssetObjectUrls = new Map();
const backendConfig = {
  providers: {
    chat:  { default: "default", items: {} },
    image: { default: "default", items: {} },
    video: { default: "default", items: {} },
  },
};

const MODEL_KEY_SEPARATOR = "::";

function makeModelKey(providerId, modelId) {
  return `${providerId || ""}${MODEL_KEY_SEPARATOR}${modelId || ""}`;
}

function parseModelKey(value) {
  const raw = String(value || "");
  const idx = raw.indexOf(MODEL_KEY_SEPARATOR);
  if (idx < 0) return { providerId: "", model: raw };
  return { providerId: raw.slice(0, idx), model: raw.slice(idx + MODEL_KEY_SEPARATOR.length) };
}

function getProviderGroup(kind) {
  return backendConfig.providers?.[kind] || { default: "", items: {} };
}

function getProviderItem(kind, providerId = "") {
  const group = getProviderGroup(kind);
  const pid = providerId && group.items?.[providerId] ? providerId : group.default;
  return group.items?.[pid] || null;
}

function isKlingProviderItem(item) {
  return item?.adapter === "kling-cli";
}

function getDefaultProviderAndModel(kind) {
  const group = getProviderGroup(kind);
  const providerId = group.default && group.items[group.default] ? group.default : Object.keys(group.items)[0] || "";
  const item = group.items[providerId];
  return { providerId, model: item?.defaultModel || item?.models?.[0]?.id || "" };
}

function findProviderForModel(kind, modelId) {
  const group = getProviderGroup(kind);
  for (const [providerId, item] of Object.entries(group.items)) {
    if (item.models?.some((m) => m.id === modelId)) return { providerId, item };
  }
  return null;
}

function ensureNodeProvider(node) {
  const kindMap = { llmConfig: "chat", storyboardAssistant: "chat", promptOptimizer: "chat", imageConfig: "image", storyboardConfig: "image", templateImageConfig: "image", imageExpand: "image", styleTransferConfig: "image", materialTransferConfig: "image", productBackgroundConfig: "image", faceSwapConfig: "image", seedreamEdit: "image", layerSeparation: "image", videoConfig: "video" };
  const kind = kindMap[node.type];
  if (!kind) return;
  if (node.type === "seedreamEdit" || node.type === "layerSeparation") {
    node.data.providerId = "volc";
    node.data.model = "doubao-seedream-5-0-pro-260628";
    return;
  }
  const group = getProviderGroup(kind);
  if (!Object.keys(group.items).length) return;
  const existing = node.data.providerId && group.items[node.data.providerId] ? node.data.providerId : null;
  if (kind === "image") {
    const provider = existing
      ? group.items[existing]
      : (findProviderForModel(kind, node.data.model)?.item || group.items[group.default]);
    node.data.model = window.GptImageModels.resolveModel(provider, node.data.model);
  }
  if (existing) {
    const selected = group.items[existing];
    if (!node.data.model || selected.models?.some((model) => model.id === node.data.model)) return;
    const found = findProviderForModel(kind, node.data.model);
    if (found) node.data.providerId = found.providerId;
    return;
  }
  if (node.data.model) {
    const found = findProviderForModel(kind, node.data.model);
    if (found) { node.data.providerId = found.providerId; return; }
  }
  const def = getDefaultProviderAndModel(kind);
  node.data.providerId = def.providerId;
  if (!node.data.model) node.data.model = def.model;
}

const mjAspectOptions = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3"];
const mjVersionOptions = {
  midjourney: ["7", "6.1", "6", "5.2"],
  "niji-journey": ["6", "5"],
};
const mjSpeedOptions = ["fast", "relax", "turbo"];

function isMjImageModel(model) {
  return /^(midjourney|niji-journey|niji)/i.test(String(model || ""));
}

function mjVersionsFor(model) {
  return /^niji/i.test(String(model || "")) ? mjVersionOptions["niji-journey"] : mjVersionOptions.midjourney;
}

function getMjVersion(model, version) {
  const choices = mjVersionsFor(model);
  if (version && choices.includes(String(version))) return String(version);
  return choices[0];
}

function buildMjPromptSuffix(data) {
  const parts = [];
  if (data.mjAr) parts.push(`--ar ${data.mjAr}`);
  const version = getMjVersion(data.model, data.mjVersion);
  if (version) parts.push(/^niji/i.test(String(data.model)) ? `--niji ${version}` : `--v ${version}`);
  if (data.mjSpeed) parts.push(`--${data.mjSpeed}`);
  return parts.join(" ");
}

const videoSizeCatalog = {
  "sora-2": ["720x1280", "1280x720"],
  "sora-2-pro": ["720x1280", "1280x720", "1024x1792", "1792x1024"],
};
const videoSizeDefault = "1280x720";
const videoSecondsOptions = ["4", "8", "12"];
const videoSecondsMin = 4;
const videoSecondsMax = 15;
// 火山 Seedance 支持的宽高比（adaptive = 跟随参考图）
const videoAspectOptions = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"];
const videoResolutionOptions = ["480p", "720p", "1080p"];
// 输入模式：首尾帧 / 全能参考（智能多帧需视频输入做长视频拼接，暂未支持）
const videoModeOptions = [["first_last", "首尾帧"], ["reference", "智能多参（全能参考）"]];

// 取当前宽高比：node.data.ratio 优先；旧画布只有像素 size 时按比例吸附；默认 16:9
function getVideoRatioValue(data) {
  const ratio = String(data?.ratio || "");
  if (videoAspectOptions.includes(ratio)) return ratio;
  const m = String(data?.size || "").match(/(\d+)\s*[x×]\s*(\d+)/);
  if (m) return nearestByAspect(videoAspectOptions.filter((a) => a !== "adaptive"), Number(m[1]) / Number(m[2]));
  return "16:9";
}

function getVideoMode(data) {
  const mode = String(data?.videoMode || "");
  return videoModeOptions.some(([k]) => k === mode) ? mode : "reference";
}

function getVideoResolutionValue(data) {
  const resolution = String(data?.resolution || "").trim().toLowerCase();
  if (videoResolutionOptions.includes(resolution)) return resolution;
  const match = String(data?.size || "").match(/(\d+)\s*[x×]\s*(\d+)/);
  const shortEdge = match ? Math.min(Number(match[1]), Number(match[2])) : 0;
  if (shortEdge >= 1080) return "1080p";
  if (shortEdge > 0 && shortEdge < 720) return "480p";
  return "720p";
}

// 宽高比 → CSS aspect-ratio（adaptive 等无法解析的回退 16/9）
function ratioToCss(ratio) {
  const m = String(ratio || "").match(/^(\d+):(\d+)$/);
  return m ? `${m[1]} / ${m[2]}` : "16 / 9";
}

function isSoraVideoModel(model) {
  return /^sora/i.test(String(model || ""));
}

function videoSizeOptionsFor(model) {
  if (isSoraVideoModel(model)) return videoSizeCatalog[model] || videoSizeCatalog["sora-2-pro"];
  return videoSizeCatalog["sora-2-pro"];
}

function getVideoSizeValue(model, size) {
  const choices = videoSizeOptionsFor(model);
  if (size && choices.includes(String(size))) return String(size);
  return choices[0] || videoSizeDefault;
}
const nodeSizes = {
  text: { width: 260, height: 210 },
  llmConfig: { width: 300, height: 230 },
  storyboardAssistant: { width: 360, height: 390 },
  promptOptimizer: { width: 320, height: 280 },
  imageConfig: { width: 300, height: 260 },
  image: { width: 260, height: 350 },
  videoConfig: { width: 300, height: 280 },
  video: { width: 300, height: 250 },
  storyboardConfig: { width: 360, height: 520 },
  templateImageConfig: { width: 320, height: 360 },
  imageCompare: { width: 320, height: 320 },
  imageExpand: { width: 320, height: 400 },
  styleTransferConfig: { width: 320, height: 310 },
  materialTransferConfig: { width: 330, height: 350 },
  productBackgroundConfig: { width: 340, height: 380 },
  faceSwapConfig: { width: 300, height: 250 },
  seedreamEdit: { width: 330, height: 420 },
  layerSeparation: { width: 320, height: 330 },
  layerGroup: { width: 340, height: 430 },
  model3dPreview: { width: 280, height: 330 },
};

let modelDefaults = loadModelDefaults();
let state = loadState();
let selectedNodeId = state.nodes[0]?.id ?? null;
let selectedNodeIds = new Set(selectedNodeId ? [selectedNodeId] : []);
let drag = null;
let marquee = null;
let pendingConnection = null;
let connectionDrag = null;
let lastTitleDownTime = 0;
let lastTitleDownNode = null;
let lastGroupTitleDownTime = 0;
let lastGroupTitleDownGroup = null;
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
        data: { label: "图片生成", model: getDefaultModel("image"), quality: "标准画质", size: "2048x2048", executed: true },
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
        data: { label: "视频生成", model: getDefaultModel("video"), videoMode: "reference", ratio: "16:9", resolution: "720p", seconds: 8, executed: true },
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
  const nodes = Array.isArray(next.nodes) ? next.nodes.map(migrateVideoConfigNode) : next.nodes;
  return {
    ...next,
    nodes,
    groups: Array.isArray(next.groups) ? next.groups : [],
  };
}

function migrateVideoConfigNode(node) {
  if (!node || node.type !== "videoConfig" || !node.data) return node;
  const data = node.data;
  if (data.size && data.seconds !== undefined) return node;
  const ratioToSize = { "16:9": "1280x720", "9:16": "720x1280", "1:1": "1280x720" };
  const durationToSeconds = { 5: 4, 8: 8, 10: 12 };
  const nextData = { ...data };
  if (!nextData.size) {
    nextData.size = ratioToSize[String(data.ratio || "")] || videoSizeDefault;
  }
  if (nextData.seconds === undefined) {
    const fromDuration = durationToSeconds[Number(data.duration)];
    nextData.seconds = fromDuration || 8;
  }
  delete nextData.ratio;
  delete nextData.duration;
  return { ...node, data: nextData };
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
  const saved = modelDefaults[kind];
  if (saved) {
    const found = findProviderForModel(kind, saved);
    if (found) return saved;
  }
  return getDefaultProviderAndModel(kind).model;
}

function normalizeModelValue(kind, value) {
  if (!value) return "";
  return String(value);
}

function modelOptionsForNode(kind, providerId, model, activeTool = "") {
  const group = getProviderGroup(kind);
  const items = Object.entries(group.items);
  if (!items.length) {
    return `<option value="${escapeHtmlAttr(makeModelKey("", model))}" selected>⚠ 后端未配置子类</option>`;
  }
  const selectedKey = makeModelKey(providerId || "", model || "");
  let foundMatch = false;
  const groups = items.map(([pid, item]) => {
    const providerModels = activeTool && isKlingProviderItem(item) && window.KlingProvider
      ? window.KlingProvider.modelsForTool(item, activeTool)
      : (item.models || []);
    const opts = providerModels.map((m) => {
      const key = makeModelKey(pid, m.id);
      const isSelected = key === selectedKey;
      if (isSelected) foundMatch = true;
      return `<option value="${escapeHtmlAttr(key)}"${isSelected ? " selected" : ""}>${escapeHtml(m.label || m.id)}</option>`;
    }).join("");
    const empty = !opts && isKlingProviderItem(item)
      ? `<option value="" disabled>${item.authenticated ? "当前模式暂无可用模型" : "请先在设置中登录"}</option>`
      : "";
    return `<optgroup label="${escapeHtmlAttr(item.label || pid)}">${opts || empty}</optgroup>`;
  }).join("");
  if (model && !foundMatch) {
    const warn = `<option value="${escapeHtmlAttr(selectedKey)}" selected>⚠ 未配置: ${escapeHtml(model)}</option>`;
    return warn + groups;
  }
  return groups;
}

function klingToolForNode(node, kind) {
  if (!window.KlingProvider || !node) return "";
  const hasImages = getImageReferenceSlots(node.id).length > 0;
  return window.KlingProvider.toolFor(kind, hasImages);
}

function klingStoredParams(node, model = node?.data?.model) {
  return node?.data?.dynamicParams?.["kling-cli"]?.[model] || {};
}

function klingContextForNode(node, kind) {
  const provider = getProviderItem(kind, node?.data?.providerId);
  if (!isKlingProviderItem(provider) || !window.KlingProvider) return null;
  const tool = klingToolForNode(node, kind);
  const models = window.KlingProvider.modelsForTool(provider, tool);
  const model = models.find((entry) => entry.id === node.data.model);
  const spec = model?.specs?.[tool] || null;
  return { provider, tool, models, model, spec };
}

function getKlingRequestParams(node, kind, connectedImages) {
  const context = klingContextForNode(node, kind);
  if (!context) return null;
  if (!context.model || !context.spec) throw new Error(`当前模式 ${context.tool} 不支持模型 ${node.data.model || "（未选择）"}`);
  window.KlingProvider.validateInputs(context.spec, connectedImages);
  return window.KlingProvider.serializeParams(context.spec, klingStoredParams(node));
}

function renderKlingDynamicParams(node, kind) {
  const context = klingContextForNode(node, kind);
  if (!context) return "";
  if (!context.model || !context.spec) {
    return `<div class="kling-node-panel"><div class="storyboard-warn">当前输入模式没有匹配模型，请重新选择模型。</div></div>`;
  }
  const stored = klingStoredParams(node);
  const fields = window.KlingProvider.fieldsForSpec(context.spec, stored);
  const hasAspectRatio = fields.some((field) => field.name === "aspect_ratio");
  const derivedVideoRatio = kind === "video" && !hasAspectRatio
    ? `<div class="node-row kling-param-row"><span>比例</span><b>${getImageReferenceSlots(node.id).length ? "跟随首图" : "跟随实际视频"}</b></div>`
    : "";
  const fieldLabels = {
    aspect_ratio: "比例",
    duration: "时长",
    resolution: "分辨率",
    imageCount: "生成数量",
    prefer_multi_shots: "多镜头",
    enable_audio: "音频",
  };
  const inputNames = (context.spec.inputs || []).map((input) => `${input.name}${input.required ? "*" : ""}`).join(" · ");
  const toolLabels = {
    text_to_image: "文生图",
    image_to_image: "参考图生图",
    text_to_video: "文生视频",
    image_to_video: "图生视频",
  };
  const rows = fields.map((field) => {
    const title = field.description ? ` title="${escapeHtmlAttr(field.description)}"` : "";
    let control;
    if (field.options.length) {
      control = `<select data-kling-param="${escapeHtmlAttr(field.name)}">${field.options.map((value) => {
        const label = field.kind === "boolean" ? (value === "true" ? "开启" : "关闭") : value;
        return `<option value="${escapeHtmlAttr(value)}"${value === field.value ? " selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("")}</select>`;
    } else {
      control = `<input type="text" data-kling-param="${escapeHtmlAttr(field.name)}" value="${escapeHtmlAttr(field.value)}" placeholder="${escapeHtmlAttr(field.defaultValue ? `默认 ${field.defaultValue}` : field.required ? "必填" : "可选")}">`;
    }
    return `<div class="node-row kling-param-row"${title}><span>${escapeHtml(fieldLabels[field.name] || field.name)}${field.required ? " *" : ""}</span>${control}</div>`;
  }).join("");
  return `
    <div class="kling-node-panel">
      <div class="kling-node-head"><span>可灵 CLI · ${escapeHtml(toolLabels[context.tool] || context.tool)}</span><small>动态参数</small></div>
      ${derivedVideoRatio}
      ${rows || '<div class="node-tip">此模型没有额外参数，使用服务端默认值。</div>'}
      ${inputNames ? `<div class="node-tip">素材槽位：${escapeHtml(inputNames)}</div>` : ""}
    </div>
  `;
}

function escapeHtmlAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    if (next?.providers) {
      backendConfig.providers = {
        chat:  next.providers.chat  || { default: "default", items: {} },
        image: next.providers.image || { default: "default", items: {} },
        video: next.providers.video || { default: "default", items: {} },
      };
    }
  } catch (error) {
    console.warn("loadBackendStatus failed:", error?.message);
  }
}

const KIND_TAB_LABELS = { chat: "聊天模型", image: "图片模型", video: "视频模型" };
const API_KEY_KEEP_SENTINEL_CLIENT = "__keep__";

let settingsDraft = null;
let settingsActiveKind = "chat";
let settingsActiveProviderId = "";
let klingUiState = { installed: false, authenticated: false, login: { status: "idle" }, account: null, loading: false, error: "" };
let klingLoginPollTimer = null;

function stopKlingLoginPolling() {
  if (klingLoginPollTimer) clearInterval(klingLoginPollTimer);
  klingLoginPollTimer = null;
}

async function refreshKlingUi({ refresh = false, includeAccount = true, rerender = true } = {}) {
  klingUiState = { ...klingUiState, loading: true, error: "" };
  if (rerender && settingsDraft) renderSettingsModal();
  try {
    const status = await apiFetch(`/api/kling/status${refresh ? "?refresh=1" : ""}`, { method: "GET" });
    let account = klingUiState.account;
    if (includeAccount && status.authenticated) account = await apiFetch("/api/kling/account", { method: "GET" });
    if (!status.authenticated) account = null;
    klingUiState = { ...status, account, loading: false, error: "" };
  } catch (error) {
    klingUiState = { ...klingUiState, loading: false, error: error.message };
  }
  if (rerender && settingsDraft) renderSettingsModal();
  return klingUiState;
}

function syncManagedProvidersIntoDraft() {
  if (!settingsDraft) return;
  for (const kind of ["image", "video"]) {
    const live = backendConfig.providers?.[kind]?.items?.["kling-cli"];
    if (live && settingsDraft[kind]?.items) settingsDraft[kind].items["kling-cli"] = JSON.parse(JSON.stringify(live));
  }
}

async function startKlingOAuth() {
  try {
    const login = await apiFetch("/api/kling/login", { method: "POST" });
    klingUiState = { ...klingUiState, login, error: "" };
    renderSettingsModal();
    stopKlingLoginPolling();
    klingLoginPollTimer = setInterval(async () => {
      const status = await refreshKlingUi({ includeAccount: false, rerender: false });
      if (status.login?.status === "waiting") {
        renderSettingsModal();
        return;
      }
      stopKlingLoginPolling();
      await loadBackendStatus();
      await refreshKlingUi({ includeAccount: true, rerender: false });
      syncManagedProvidersIntoDraft();
      renderSettingsModal();
      showToast(status.login?.status === "succeeded" ? "可灵 OAuth 登录成功" : `可灵登录失败：${status.login?.error || status.authError || "未知错误"}`);
    }, 1500);
  } catch (error) {
    showToast(`启动可灵登录失败：${error.message}`);
  }
}

async function logoutKlingOAuth() {
  try {
    await apiFetch("/api/kling/logout", { method: "POST" });
    stopKlingLoginPolling();
    await loadBackendStatus();
    await refreshKlingUi({ includeAccount: false, rerender: false });
    syncManagedProvidersIntoDraft();
    renderSettingsModal();
    showToast("已退出可灵 CLI");
  } catch (error) {
    showToast(`退出可灵失败：${error.message}`);
  }
}

async function forceRefreshKling() {
  try {
    const next = await apiFetch("/api/kling/refresh", { method: "POST" });
    klingUiState = { ...next, account: next.account || null, loading: false, error: "" };
    await loadBackendStatus();
    syncManagedProvidersIntoDraft();
    renderSettingsModal();
    showToast("可灵模型与账户信息已刷新");
  } catch (error) {
    klingUiState = { ...klingUiState, loading: false, error: error.message };
    renderSettingsModal();
    showToast(`刷新可灵失败：${error.message}`);
  }
}

async function openSettingsModal() {
  try {
    await loadBackendStatus();
    await refreshKlingUi({ includeAccount: true, rerender: false });
    settingsDraft = JSON.parse(JSON.stringify(backendConfig.providers));
    for (const kind of ["chat", "image", "video"]) {
      const group = settingsDraft[kind] || { default: "", items: {} };
      for (const item of Object.values(group.items || {})) {
        if (!item.managed) item.apiKey = API_KEY_KEEP_SENTINEL_CLIENT;
      }
    }
    settingsActiveKind = "chat";
    const firstId = Object.keys(settingsDraft.chat?.items || {})[0] || "";
    settingsActiveProviderId = settingsDraft.chat?.default || firstId;
    renderSettingsModal();
    settingsModal.showModal();
  } catch (error) {
    showToast(`打开设置失败：${error.message}`);
  }
}

function renderSettingsModal() {
  if (!settingsDraft) return;
  settingsModal.innerHTML = "";
  const form = document.createElement("form");
  form.method = "dialog";
  form.className = "settings-form";

  form.append(buildSettingsHead());
  form.append(buildSettingsTabs());
  form.append(buildSettingsBody());
  form.append(buildSettingsActions());

  settingsModal.append(form);
}

function buildSettingsHead() {
  const head = document.createElement("div");
  head.className = "modal-head";
  head.innerHTML = `
    <h2>API 设置</h2>
    <button type="button" class="icon-button" data-settings-action="cancel" aria-label="关闭">
      <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  return head;
}

function buildSettingsTabs() {
  const tabs = document.createElement("div");
  tabs.className = "settings-tabs";
  for (const kind of ["chat", "image", "video"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-tab" + (kind === settingsActiveKind ? " active" : "");
    btn.dataset.settingsTab = kind;
    btn.textContent = KIND_TAB_LABELS[kind];
    tabs.append(btn);
  }
  return tabs;
}

function buildSettingsBody() {
  const body = document.createElement("div");
  body.className = "settings-body";
  body.append(buildSettingsProviderList());
  body.append(buildSettingsProviderEditor());
  return body;
}

function buildSettingsProviderList() {
  const wrap = document.createElement("div");
  wrap.className = "settings-provider-list";

  const head = document.createElement("div");
  head.className = "settings-list-head";
  head.innerHTML = `
    <span class="settings-list-title">子类</span>
    <button type="button" class="ghost-button settings-list-add" data-settings-action="add-provider">+ 新增子类</button>
  `;
  wrap.append(head);

  const list = document.createElement("ul");
  list.className = "settings-list";
  const group = settingsDraft[settingsActiveKind] || { default: "", items: {} };
  const entries = Object.entries(group.items);
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "settings-list-empty";
    empty.textContent = "还没有子类，点上方「+ 新增子类」开始。";
    list.append(empty);
  } else {
    for (const [pid, item] of entries) {
      const li = document.createElement("li");
      li.className = "settings-list-item" + (pid === settingsActiveProviderId ? " active" : "");
      li.dataset.settingsProvider = pid;
      const isDefault = group.default === pid;
      const meta = item.managed || isKlingProviderItem(item)
        ? (item.authenticated ? `${item.models?.length || 0} 个动态模型` : "OAuth 未连接")
        : (item.defaultModel || "—");
      li.innerHTML = `
        <button type="button" class="settings-list-pick" data-settings-action="pick-provider" data-pid="${escapeHtmlAttr(pid)}">
          <span class="settings-list-name">${escapeHtml(item.label || pid)}${isDefault ? ' <span class="settings-default-tag">默认</span>' : ""}</span>
          <span class="settings-list-meta">${escapeHtml(meta)}</span>
        </button>
      `;
      list.append(li);
    }
  }
  wrap.append(list);
  return wrap;
}

function buildSettingsProviderEditor() {
  const wrap = document.createElement("div");
  wrap.className = "settings-provider-editor";
  const group = settingsDraft[settingsActiveKind];
  const item = group?.items?.[settingsActiveProviderId];
  if (!item) {
    wrap.innerHTML = `<div class="settings-editor-empty">请在左侧选择或新增一个子类。</div>`;
    return wrap;
  }

  const isDefault = group.default === settingsActiveProviderId;
  if (item.managed || isKlingProviderItem(item)) {
    return buildKlingSettingsEditor(wrap, item, isDefault);
  }
  const keyEditing = item.apiKey !== API_KEY_KEEP_SENTINEL_CLIENT;
  const keyPlaceholder = keyEditing ? "" : "（保留现有 key，留空不变）";

  wrap.innerHTML = `
    <div class="settings-editor-head">
      <h3>编辑：${escapeHtml(item.label || settingsActiveProviderId)}</h3>
      <div class="settings-editor-actions">
        ${isDefault ? '<span class="settings-default-tag">默认子类</span>' : '<button type="button" class="ghost-button" data-settings-action="set-default">设为默认</button>'}
        <button type="button" class="ghost-button danger" data-settings-action="delete-provider">删除此子类</button>
      </div>
    </div>
    <label>
      <span>显示名</span>
      <input type="text" data-settings-field="label" value="${escapeHtmlAttr(item.label)}" />
    </label>
    <label>
      <span>Base URL</span>
      <input type="text" data-settings-field="baseUrl" value="${escapeHtmlAttr(item.baseUrl)}" placeholder="https://example.com/v1" />
    </label>
    <label>
      <span>API Key</span>
      <div class="settings-key-row">
        <input type="password" data-settings-field="apiKey" value="${keyEditing ? escapeHtmlAttr(item.apiKey) : ""}" placeholder="${keyPlaceholder}" autocomplete="off" />
        <button type="button" class="ghost-button" data-settings-action="toggle-key">${keyEditing ? "保留原值" : "修改"}</button>
      </div>
    </label>
    <label>
      <span>默认模型</span>
      <select data-settings-field="defaultModel">${(item.models || []).map((m) => `<option value="${escapeHtmlAttr(m.id)}"${m.id === item.defaultModel ? " selected" : ""}>${escapeHtml(m.label || m.id)}</option>`).join("")}</select>
    </label>
    <div class="settings-models">
      <div class="settings-models-head">
        <span>模型池（${item.models.length}）</span>
        <button type="button" class="ghost-button" data-settings-action="add-model">+ 添加模型</button>
      </div>
      <table class="settings-models-table">
        <thead><tr><th>模型 ID</th><th>显示名</th><th></th></tr></thead>
        <tbody>
          ${item.models.map((m, idx) => `
            <tr>
              <td><input type="text" data-settings-model-field="id" data-idx="${idx}" value="${escapeHtmlAttr(m.id)}" /></td>
              <td><input type="text" data-settings-model-field="label" data-idx="${idx}" value="${escapeHtmlAttr(m.label)}" /></td>
              <td><button type="button" class="icon-button danger" data-settings-action="delete-model" data-idx="${idx}" title="删除">×</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${item.models.length === 0 ? '<div class="settings-models-empty">还没有模型，点「+ 添加模型」开始。</div>' : ""}
    </div>
  `;
  return wrap;
}

function buildKlingSettingsEditor(wrap, item, isDefault) {
  const loginStatus = klingUiState.login?.status || "idle";
  const waiting = loginStatus === "waiting";
  const authenticated = Boolean(klingUiState.authenticated);
  const account = klingUiState.account || {};
  const membership = account.membershipTypeDescription || account.membershipType || "—";
  const credits = account.availableRemainCredits ?? account.availableCredits ?? "—";
  const stateLabel = !klingUiState.installed
    ? "未安装 CLI"
    : waiting ? "等待浏览器授权"
      : authenticated ? "OAuth 已连接" : "尚未登录";
  const error = klingUiState.error || klingUiState.authError || klingUiState.login?.error || "";
  const models = Array.isArray(item.models) ? item.models : [];
  wrap.classList.add("kling-settings-editor");
  wrap.innerHTML = `
    <div class="settings-editor-head">
      <h3>可灵 CLI</h3>
      <div class="settings-editor-actions">
        ${isDefault ? '<span class="settings-default-tag">默认子类</span>' : '<button type="button" class="ghost-button" data-settings-action="set-default">设为默认</button>'}
      </div>
    </div>
    <div class="kling-status-card ${authenticated ? "connected" : ""}">
      <div class="kling-status-line"><span class="kling-status-dot"></span><strong>${escapeHtml(stateLabel)}</strong></div>
      <div class="kling-status-meta">
        <span>CLI ${escapeHtml(klingUiState.version || "—")}</span>
        <span>${escapeHtml(settingsActiveKind === "image" ? "图片" : "视频")}模型 ${models.length}</span>
        ${authenticated ? `<span>会员 ${escapeHtml(membership)}</span><span>灵感值 ${escapeHtml(credits)}</span>` : ""}
      </div>
      ${waiting ? '<div class="node-tip">授权页面已在系统浏览器打开，请完成登录；此处会自动更新。</div>' : ""}
      ${error ? `<div class="kling-settings-error">${escapeHtml(error)}</div>` : ""}
    </div>
    <div class="kling-settings-actions">
      <button type="button" class="send-button" data-settings-action="kling-login" ${waiting || klingUiState.loading ? "disabled" : ""}>${authenticated ? "重新登录" : "登录可灵"}</button>
      ${authenticated ? '<button type="button" class="ghost-button" data-settings-action="kling-logout">退出登录</button>' : ""}
      <button type="button" class="ghost-button" data-settings-action="kling-refresh" ${waiting || klingUiState.loading ? "disabled" : ""}>刷新能力</button>
    </div>
    <div class="settings-models">
      <div class="settings-models-head"><span>动态模型（${models.length}）</span><small>来自 who_am_i</small></div>
      <div class="kling-model-list">
        ${models.map((model) => `<div><strong>${escapeHtml(model.label || model.id)}</strong><code>${escapeHtml(model.id)}</code><span>${escapeHtml((model.tools || []).join(" · "))}</span></div>`).join("") || '<div class="settings-models-empty">登录后自动读取当前账号可用模型。</div>'}
      </div>
    </div>
    <div class="node-tip">OAuth 凭据只保存在本机 ~/.kling/.credentials；画布不会读取或保存 Token。可灵生成不使用画布积分。</div>
  `;
  return wrap;
}

function buildSettingsActions() {
  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.innerHTML = `
    <button type="button" class="ghost-button" data-settings-action="cancel">取消</button>
    <button type="button" class="send-button" data-settings-action="save">保存设置</button>
  `;
  return actions;
}

settingsModal.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-settings-action]");
  if (!target) return;
  if (target.tagName === "BUTTON") event.preventDefault();
  const action = target.dataset.settingsAction;
  const pid = target.dataset.pid;
  const idx = target.dataset.idx !== undefined ? Number(target.dataset.idx) : null;

  if (!settingsDraft) return;
  const group = settingsDraft[settingsActiveKind];

  if (action === "cancel") {
    stopKlingLoginPolling();
    settingsDraft = null;
    settingsModal.close();
    return;
  }
  if (action === "kling-login") {
    await startKlingOAuth();
    return;
  }
  if (action === "kling-logout") {
    await logoutKlingOAuth();
    return;
  }
  if (action === "kling-refresh") {
    await forceRefreshKling();
    return;
  }
  if (action === "pick-provider") {
    settingsActiveProviderId = pid;
    renderSettingsModal();
    return;
  }
  if (action === "add-provider") {
    const newId = `provider_${Date.now().toString(36)}`;
    group.items[newId] = {
      label: `新${KIND_LABELS_CLIENT[settingsActiveKind] || settingsActiveKind}子类`,
      baseUrl: "",
      apiKey: "",
      defaultModel: "",
      models: [],
    };
    if (!group.default) group.default = newId;
    settingsActiveProviderId = newId;
    renderSettingsModal();
    return;
  }
  if (action === "set-default") {
    group.default = settingsActiveProviderId;
    renderSettingsModal();
    return;
  }
  if (action === "delete-provider") {
    if (group.items[settingsActiveProviderId]?.managed) return;
    if (!confirm(`确认删除子类「${group.items[settingsActiveProviderId]?.label || settingsActiveProviderId}」？`)) return;
    delete group.items[settingsActiveProviderId];
    const remaining = Object.keys(group.items);
    if (group.default === settingsActiveProviderId) group.default = remaining[0] || "";
    settingsActiveProviderId = remaining[0] || "";
    renderSettingsModal();
    return;
  }
  if (action === "toggle-key") {
    const item = group.items[settingsActiveProviderId];
    if (item.managed) return;
    item.apiKey = item.apiKey === API_KEY_KEEP_SENTINEL_CLIENT ? "" : API_KEY_KEEP_SENTINEL_CLIENT;
    renderSettingsModal();
    return;
  }
  if (action === "add-model") {
    const item = group.items[settingsActiveProviderId];
    if (item.managed) return;
    item.models.push({ id: "", label: "" });
    renderSettingsModal();
    return;
  }
  if (action === "delete-model") {
    const item = group.items[settingsActiveProviderId];
    if (item.managed) return;
    const removed = item.models[idx]?.id;
    item.models.splice(idx, 1);
    if (item.defaultModel === removed) item.defaultModel = item.models[0]?.id || "";
    renderSettingsModal();
    return;
  }
  if (action === "save") {
    await saveSettingsDraft();
    return;
  }
});

settingsModal.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-settings-tab]");
  if (!tab) return;
  settingsActiveKind = tab.dataset.settingsTab;
  const group = settingsDraft[settingsActiveKind] || { default: "", items: {} };
  settingsActiveProviderId = group.default || Object.keys(group.items)[0] || "";
  renderSettingsModal();
});

settingsModal.addEventListener("input", (event) => {
  if (!settingsDraft) return;
  const t = event.target;
  const item = settingsDraft[settingsActiveKind]?.items?.[settingsActiveProviderId];
  if (!item) return;
  if (item.managed || isKlingProviderItem(item)) return;
  const field = t.dataset.settingsField;
  if (field) {
    item[field] = t.value;
    return;
  }
  const modelField = t.dataset.settingsModelField;
  if (modelField) {
    const idx = Number(t.dataset.idx);
    if (Number.isInteger(idx) && item.models[idx]) {
      item.models[idx][modelField] = t.value;
    }
  }
});

const KIND_LABELS_CLIENT = { chat: "聊天", image: "图片", video: "视频" };

async function saveSettingsDraft() {
  try {
    for (const kind of ["chat", "image", "video"]) {
      const group = settingsDraft[kind];
      if (!group) continue;
      for (const [pid, item] of Object.entries(group.items)) {
        if (item.managed || isKlingProviderItem(item)) continue;
        item.models = item.models.filter((m) => m.id && m.id.trim());
        item.models.forEach((m) => { m.id = m.id.trim(); m.label = (m.label || "").trim() || m.id; });
        if (item.defaultModel && !item.models.some((m) => m.id === item.defaultModel)) {
          item.defaultModel = item.models[0]?.id || "";
        }
      }
    }
    const response = await apiFetch("/api/settings", {
      method: "POST",
      body: JSON.stringify({ providers: settingsDraft }),
    });
    if (response?.providers) {
      backendConfig.providers = {
        chat:  response.providers.chat  || backendConfig.providers.chat,
        image: response.providers.image || backendConfig.providers.image,
        video: response.providers.video || backendConfig.providers.video,
      };
    }
    stopKlingLoginPolling();
    settingsDraft = null;
    settingsModal.close();
    render();
    showToast("API 设置已保存");
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  }
}

// ===== 快速切换 API 平台 =====
const NODE_KIND_MAP_CLIENT = {
  llmConfig: "chat", storyboardAssistant: "chat", promptOptimizer: "chat",
  imageConfig: "image", storyboardConfig: "image", templateImageConfig: "image", imageExpand: "image", styleTransferConfig: "image", materialTransferConfig: "image", productBackgroundConfig: "image", faceSwapConfig: "image", seedreamEdit: "image", layerSeparation: "image",
  videoConfig: "video",
};

// 从前端脱敏镜像构建全量提交 payload：apiKey 一律用 __keep__ 哨兵，后端保留原值。
function buildProvidersKeepPayload() {
  const out = {};
  for (const kind of ["chat", "image", "video"]) {
    const g = backendConfig.providers?.[kind] || { default: "", items: {} };
    const items = {};
    for (const [pid, it] of Object.entries(g.items || {})) {
      items[pid] = {
        label: it.label || "",
        adapter: it.adapter || "http",
        managed: Boolean(it.managed),
        baseUrl: it.baseUrl || "",
        apiKey: API_KEY_KEEP_SENTINEL_CLIENT,
        defaultModel: it.defaultModel || "",
        models: Array.isArray(it.models) ? it.models : [],
      };
    }
    out[kind] = { default: g.default, items };
  }
  return out;
}

async function openProviderSwitch() {
  try {
    await loadBackendStatus();
  } catch (error) {
    showToast(`读取配置失败：${error.message}`);
    return;
  }
  const providers = backendConfig.providers || {};
  const kinds = [["chat", "聊天 / 文本"], ["image", "图片"], ["video", "视频"]];
  const overlay = document.createElement("div");
  overlay.className = "provider-switch-overlay";
  overlay.innerHTML = `
    <div class="provider-switch-card">
      <header class="provider-switch-head">
        <span>切换 API 平台</span>
        <button class="model3d-close" data-ps="close" title="关闭">✕</button>
      </header>
      <div class="provider-switch-body">
        ${kinds.map(([k, label]) => {
          const g = providers[k] || { default: "", items: {} };
          const items = Object.entries(g.items || {});
          if (!items.length) return `<div class="ps-row"><span>${label}</span><em class="ps-empty">未配置子类</em></div>`;
          const opts = items.map(([pid, it]) => `<option value="${escapeHtmlAttr(pid)}" ${pid === g.default ? "selected" : ""}>${escapeHtml(it.label || pid)}</option>`).join("");
          return `<div class="ps-row"><span>${label}</span><select data-ps-kind="${k}">${opts}</select></div>`;
        }).join("")}
      </div>
      <footer class="provider-switch-foot">
        <span class="ps-hint">选择即切换，并应用到画布上现有同类节点</span>
        <button class="send-button" data-ps="close">完成</button>
      </footer>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("click", (e) => { if (e.target.closest('[data-ps="close"]')) close(); });
  overlay.addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-ps-kind]");
    if (sel) await switchKindProvider(sel.dataset.psKind, sel.value);
  });
}

async function switchKindProvider(kind, providerId) {
  const group = backendConfig.providers?.[kind];
  if (!group || !group.items?.[providerId]) return;
  group.default = providerId; // 改本地镜像的 default
  const np = group.items[providerId];
  const models = np.models || [];
  let migrated = 0;
  state.nodes.forEach((node) => {
    if (NODE_KIND_MAP_CLIENT[node.type] !== kind) return;
    if (node.type === "seedreamEdit" || node.type === "layerSeparation") return;
    node.data.providerId = providerId;
    // model 映射：新平台有同名 model 就保留，否则用新平台默认 model。
    if (node.data.model && !models.some((m) => m.id === node.data.model)) {
      node.data.model = np.defaultModel || models[0]?.id || node.data.model;
    }
    migrated += 1;
  });
  try {
    const response = await apiFetch("/api/settings", {
      method: "POST",
      body: JSON.stringify({ providers: buildProvidersKeepPayload() }),
    });
    if (response?.providers) backendConfig.providers = response.providers;
  } catch (error) {
    showToast(`切换保存失败：${error.message}`);
    return;
  }
  saveState();
  render();
  const kindLabel = { chat: "聊天", image: "图片", video: "视频" }[kind] || kind;
  showToast(`${kindLabel}平台已切到「${np.label || providerId}」${migrated ? `（${migrated} 个节点已切换）` : ""}`);
}

function saveState() {
  let serialized;
  try {
    serialized = JSON.stringify(state);
  } catch (error) {
    console.error("saveState: state 无法序列化（可能某个节点 data 含脏值）", error);
    if (saveStateLabel) saveStateLabel.textContent = "本地保存失败";
    return;
  }
  const stateSaved = safeLocalStorageSet(storageKey, serialized);
  const projectSaved = saveActiveProjectState();
  const ok = stateSaved && projectSaved !== false;
  saveStateLabel.textContent = ok ? "本地已保存" : "本地保存失败";
  if (!ok && !lastSaveFailed) showToast("本地存储写入失败（可能已满）——请导出备份或清理项目");
  lastSaveFailed = !ok;
}
let lastSaveFailed = false;

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

// 克隆节点 data；遇到无法序列化的脏值不抛错，逐字段丢弃坏字段，保住节点本身。
function safeCloneNodeData(data) {
  if (typeof data !== "object" || !data) return {};
  try {
    return cloneJson(data);
  } catch (error) {
    console.error("节点 data 含无法序列化的值，已逐字段清洗", error, data);
    const out = {};
    for (const key of Object.keys(data)) {
      try {
        out[key] = cloneJson(data[key]);
      } catch {
        console.warn(`丢弃无法序列化的字段 data.${key}`);
      }
    }
    return out;
  }
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
          data: safeCloneNodeData(node.data),
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
    theme: themeStyles.normalizeTheme(source.theme),
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
          history: Array.isArray(project.history) ? project.history.slice(0, 200) : [],
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

async function recordProjectHistory(entry) {
  const project = getActiveProject();
  if (!project) return null;
  const item = {
    id: makeId(),
    type: entry.type,
    url: entry.url,
    prompt: entry.prompt || "",
    model: entry.model || "",
    createdAt: new Date().toISOString(),
  };
  const history = [item, ...(project.history || [])].slice(0, 200);
  projectLibrary.projects = projectLibrary.projects.map((p) => (
    p.id === project.id ? { ...p, history } : p
  ));
  saveProjectLibrary();
  if (!historyPanel.hidden) renderHistoryPanel();

  let saveResult = null;
  try {
    const payload = {
      projectId: project.id,
      projectName: project.name,
      historyId: item.id,
      type: entry.type,
      prompt: item.prompt,
      model: item.model,
      createdAt: item.createdAt,
    };
    if (entry.type === "image") {
      const displayUrl = await getDisplayImageUrl(entry.url);
      if (displayUrl) {
        const response = await fetch(displayUrl);
        const blob = await response.blob();
        payload.mime = blob.type || "image/png";
        payload.dataBase64 = await blobToDataUrl(blob);
      }
    } else if (entry.type === "video" && /^https?:\/\//.test(entry.url)) {
      payload.remoteUrl = entry.url;
    }
    const response = await fetch("/api/history/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    saveResult = await response.json().catch(() => null);
  } catch (error) {
    console.warn("history backend sync failed", error);
  }

  // 视频上游链接是临时签名，刷新即失效；落盘成功后把历史记录的 url 换成持久的本地回流地址。
  if (entry.type === "video" && saveResult?.ok && saveResult.fileUrl) {
    item.url = saveResult.fileUrl;
    saveProjectLibrary();
    if (!historyPanel.hidden) renderHistoryPanel();
    return { historyId: item.id, fileUrl: saveResult.fileUrl };
  }
  return { historyId: item.id, fileUrl: "" };
}

// 视频历史的持久播放地址：新记录已是本地回流地址直接用；旧记录只有过期上游链接，用 historyId 回查本地落盘文件。
function historyVideoSrc(project, item) {
  if (typeof item.url === "string" && item.url.startsWith("/api/history/file")) return item.url;
  return `/api/history/file?projectId=${encodeURIComponent(project.id)}&projectName=${encodeURIComponent(project.name || "")}&historyId=${encodeURIComponent(item.id)}`;
}

function renderHistoryPanel() {
  const project = getActiveProject();
  const items = project?.history || [];
  if (!items.length) {
    historyListEl.innerHTML = `<div class="history-empty">还没有生成记录</div>`;
    return;
  }
  historyListEl.innerHTML = items.map((item) => {
    const time = new Date(item.createdAt).toLocaleString();
    const isVideo = item.type === "video";
    const media = isVideo
      ? `<video src="${escapeHtml(historyVideoSrc(project, item))}" muted preload="metadata" playsinline></video>`
      : `<img data-history-asset="${escapeHtml(item.url)}" alt="" loading="lazy">`;
    return `
      <div class="history-card" data-history-id="${escapeHtml(item.id)}">
        <div class="history-thumb ${isVideo ? "is-video" : ""}">${media}</div>
        <div class="history-meta">
          <div class="history-meta-row">
            <span class="history-type">${isVideo ? "视频" : "图片"}</span>
            <span class="history-time">${escapeHtml(time)}</span>
          </div>
          ${item.model ? `<div class="history-model">${escapeHtml(item.model)}</div>` : ""}
          ${item.prompt ? `<div class="history-prompt" title="${escapeHtml(item.prompt)}">${escapeHtml(item.prompt)}</div>` : ""}
          <div class="history-actions">
            <button class="ghost-small" data-history-action="preview">预览</button>
            <button class="ghost-small" data-history-action="add-to-canvas">放入画布</button>
            <button class="ghost-small danger" data-history-action="delete">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  historyListEl.querySelectorAll("img[data-history-asset]").forEach(async (img) => {
    const source = img.dataset.historyAsset;
    const url = await getDisplayImageUrl(source);
    if (url && img.isConnected) img.src = url;
  });
}

function deleteHistoryEntry(itemId) {
  const project = getActiveProject();
  if (!project) return;
  const history = (project.history || []).filter((item) => item.id !== itemId);
  projectLibrary.projects = projectLibrary.projects.map((p) => (
    p.id === project.id ? { ...p, history } : p
  ));
  saveProjectLibrary();
  renderHistoryPanel();
}

async function addHistoryEntryToCanvas(itemId) {
  const project = getActiveProject();
  const item = project?.history?.find((entry) => entry.id === itemId);
  if (!item) return;
  const center = getViewportCenter();
  const size = nodeSizes[item.type === "video" ? "video" : "image"];
  const position = { x: center.x - size.width / 2, y: center.y - size.height / 2 };
  if (item.type === "video") {
    // 用持久的本地回流地址，避免放进画布后又是过期上游链接。
    addNode("video", position, { label: "历史视频", url: historyVideoSrc(project, item), model: item.model });
  } else {
    addNode("image", position, { label: "历史图片", url: item.url, model: item.model });
  }
  showToast("已放入画布");
}

historyListEl.addEventListener("click", (event) => {
  const card = event.target.closest(".history-card");
  if (!card) return;
  const itemId = card.dataset.historyId;
  const action = event.target.closest("[data-history-action]")?.dataset.historyAction;
  if (!action) return;
  const item = getActiveProject()?.history?.find((entry) => entry.id === itemId);
  if (!item) return;
  if (action === "preview") {
    if (item.type === "image") {
      openImagePreview(item.url);
    } else {
      const project = getActiveProject();
      window.open(project ? historyVideoSrc(project, item) : item.url, "_blank", "noopener");
    }
  } else if (action === "add-to-canvas") {
    void addHistoryEntryToCanvas(itemId);
  } else if (action === "delete") {
    if (window.confirm("删除这条历史记录？（本地后端文件不会删除）")) deleteHistoryEntry(itemId);
  }
});

function saveActiveProjectState() {
  if (!projectLibrary?.projects?.length || !projectLibrary.activeProjectId) return true;
  let workflow;
  try {
    workflow = cloneWorkflowState();
  } catch (error) {
    console.error("saveActiveProjectState: workflow 无法序列化", error);
    return false;
  }
  const now = new Date().toISOString();
  projectLibrary.projects = projectLibrary.projects.map((project) => (
    project.id === projectLibrary.activeProjectId
      ? { ...project, workflow, updatedAt: now }
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
  const name = window.prompt("新建模板分组", "图片生成工作流");
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
  dropOverlay.firstElementChild.textContent = projectHome.hidden ? "释放以载入图片 / 视频或工作流 JSON" : "释放以导入项目 JSON";
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
  state.nodes.forEach((node) => {
    try {
      world.append(renderNode(node));
    } catch (error) {
      console.error("renderNode 失败，已跳过该节点", node?.id, node?.type, error);
    }
  });
  state.groups.forEach((group) => world.append(renderGroup(group)));
  renderTransforms();
  renderEdges();
  hydrateAssetImages();
  setupExpandStages();
  setupCompareStages();
  observeNodeResizesForGroups();
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

  const titleEl = element.querySelector(".node-group-title");
  if (titleEl) {
    titleEl.title = "双击重命名";
    titleEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (titleEl.dataset.editing === "1") {
        event.stopPropagation();
        return;
      }
      const now = Date.now();
      if (now - lastGroupTitleDownTime < 350 && lastGroupTitleDownGroup === group.id) {
        event.preventDefault();
        event.stopPropagation();
        lastGroupTitleDownTime = 0;
        lastGroupTitleDownGroup = null;
        cancelCanvasDrag(event);
        const latest = getGroup(group.id);
        if (latest) {
          const liveTitleEl = document.querySelector(`.node-group[data-group-id="${CSS.escape(group.id)}"] .node-group-title`);
          if (liveTitleEl) beginGroupTitleEdit(liveTitleEl, latest);
        }
        return;
      }
      lastGroupTitleDownTime = now;
      lastGroupTitleDownGroup = group.id;
    });
  }
  return element;
}

function beginGroupTitleEdit(titleEl, group) {
  if (titleEl.dataset.editing === "1") return;
  const original = group.label || "未命名群组";
  titleEl.dataset.editing = "1";
  titleEl.setAttribute("contenteditable", "true");
  titleEl.spellcheck = false;
  titleEl.classList.add("editing");
  titleEl.textContent = original;

  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  titleEl.focus();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    titleEl.removeEventListener("keydown", onKeyDown);
    titleEl.removeEventListener("blur", onBlur);
    titleEl.removeAttribute("contenteditable");
    titleEl.classList.remove("editing");
    delete titleEl.dataset.editing;
    if (save) {
      const next = titleEl.textContent.replace(/\s+/g, " ").trim();
      const label = next || "未命名群组";
      if (label !== group.label) {
        commitHistory();
        state.groups = state.groups.map((item) => (item.id === group.id ? { ...item, label } : item));
        saveState();
        render();
        return;
      }
    }
    titleEl.textContent = original;
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      titleEl.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      titleEl.blur();
    }
  };
  const onBlur = () => finish(true);

  titleEl.addEventListener("keydown", onKeyDown);
  titleEl.addEventListener("blur", onBlur);
}

function getGroupBounds(nodeIds = []) {
  const nodes = nodeIds.map(getNode).filter(Boolean);
  if (!nodes.length) return null;
  const padding = 26;
  const titleSpace = 84;
  const bounds = nodes.reduce((acc, node) => {
    const size = getRenderedNodeSize(node);
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

function relayoutGroups() {
  state.groups.forEach((group) => {
    const bounds = getGroupBounds(group.nodeIds);
    const element = world.querySelector(`.node-group[data-group-id="${group.id}"]`);
    if (!element || !bounds) return;
    element.style.setProperty("--x", `${bounds.x}px`);
    element.style.setProperty("--y", `${bounds.y}px`);
    element.style.setProperty("--w", `${bounds.width}px`);
    element.style.setProperty("--h", `${bounds.height}px`);
  });
}

let nodeResizeObserver = null;
function observeNodeResizesForGroups() {
  if (typeof ResizeObserver === "undefined") return;
  if (nodeResizeObserver) nodeResizeObserver.disconnect();
  let scheduled = false;
  nodeResizeObserver = new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      relayoutGroups();
      renderEdges();
    });
  });
  world.querySelectorAll(".node .node-card").forEach((el) => nodeResizeObserver.observe(el));
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
  const stored = node?.type === "layerGroup"
    ? window.SeedreamTools.layerGroupLayout(node.data, fallback)
    : { nodeWidth: node?.data?.width, nodeHeight: node?.data?.height };
  return {
    width: clamp(Number(stored.nodeWidth) || fallback.width, getMinNodeSize(node?.type).width, 900),
    height: clamp(Number(stored.nodeHeight) || fallback.height, getMinNodeSize(node?.type).height, 900),
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
  ensureNodeProvider(node);
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

  const titleEl = card.querySelector(".node-title");
  if (titleEl) {
    titleEl.title = "双击重命名";
    titleEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (titleEl.dataset.editing === "1") {
        event.stopPropagation();
        return;
      }
      const now = Date.now();
      if (now - lastTitleDownTime < 350 && lastTitleDownNode === node.id) {
        event.preventDefault();
        event.stopPropagation();
        lastTitleDownTime = 0;
        lastTitleDownNode = null;
        cancelCanvasDrag(event);
        const latest = getNode(node.id);
        if (latest) {
          const liveTitleEl = document.querySelector(`.node[data-id="${CSS.escape(node.id)}"] .node-title`);
          if (liveTitleEl) beginNodeTitleEdit(liveTitleEl, latest);
        }
        return;
      }
      lastTitleDownTime = now;
      lastTitleDownNode = node.id;
    });
  }

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
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("chat", node.data.providerId, node.data.model)}</select></div>
      <div class="node-tip">${escapeHtml(output)}</div>
      <button class="node-button" data-node-action="run-llm">生成文本</button>
    `;
  }

  if (node.type === "storyboardAssistant") {
    const inputs = incomingNodes(node.id, ["text", "llmConfig", "promptOptimizer"]).length;
    const output = node.data.output || "连接故事/剧本/概念文本后，生成结构化分镜方案。";
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("chat", node.data.providerId, node.data.model)}</select></div>
      <div class="node-indicators">
        <span class="indicator ${inputs ? "ready" : ""}">输入 ${inputs || "○"}</span>
        <span class="indicator ${node.data.output ? "ready" : ""}">分镜 ${node.data.output ? "✓" : "○"}</span>
      </div>
      <div class="node-row node-row-col">
        <span>补充要求</span>
        <textarea data-field="requirements" spellcheck="false" placeholder="可空。例：广告片、悬疑情绪、需要 Midjourney 和视频提示词">${escapeHtml(node.data.requirements || "")}</textarea>
      </div>
      <div class="storyboard-assistant-output">${escapeHtml(output)}</div>
      <button class="node-button" data-node-action="run-storyboard-assistant">生成分镜方案</button>
    `;
  }

  if (node.type === "promptOptimizer") {
    const f = node.data.fields || {};
    const inputs = incomingNodes(node.id, ["text"]).length;
    const hasOutput = Object.values(f).some((v) => v);
    const row = (label, value) => value
      ? `<div class="optimizer-row"><span class="optimizer-label">${label}</span><span class="optimizer-value">${escapeHtml(value)}</span></div>`
      : "";
    const body = hasOutput
      ? `<div class="optimizer-fields">
          ${row("主体", f.subject)}
          ${row("结构", f.structure)}
          ${row("材质", f.material)}
          ${row("光影", f.lighting)}
          ${row("风格", f.style)}
          ${row("构图", f.composition)}
        </div>`
      : `<div class="node-tip">把上游文本节点的创意展开为「主体 / 结构 / 材质 / 光影 / 风格 / 构图」结构化中文提示词。</div>`;
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("chat", node.data.providerId, node.data.model)}</select></div>
      <div class="node-indicators">
        <span class="indicator ${inputs ? "ready" : ""}">输入 ${inputs || "○"}</span>
        <span class="indicator ${hasOutput ? "ready" : ""}">结构化 ${hasOutput ? "✓" : "○"}</span>
      </div>
      ${body}
      <button class="node-button" data-node-action="run-prompt-optimizer">生成提示词</button>
    `;
  }

  if (node.type === "imageConfig") {
    const prompts = incomingNodes(node.id, ["text", "llmConfig", "storyboardAssistant", "promptOptimizer"]).length;
    const refSlots = getImageReferenceSlots(node.id);
    const refIndicators = refSlots.length
      ? refSlots.map((ref) => `
        <button class="indicator ready ref-mention" data-node-action="insert-ref-mention" data-ref-token="${escapeHtml(ref.token)}" title="插入到提示词">
          ${escapeHtml(ref.token)}
        </button>
      `).join("")
      : `<span class="indicator">参考图 ○</span>`;
    const model = normalizeModelValue("image", node.data.model) || getDefaultModel("image");
    const klingTool = window.KlingProvider?.toolFor("image", refSlots.length > 0) || "";
    const klingParamRows = renderKlingDynamicParams(node, "image");
    const seedreamProRows = isSeedream5ProImageModel(model) ? `
      <div class="node-row"><span>尺寸</span><select data-field="size">${optionPairs(imageSizeOptions(model), getImageSizeValue(model, node.data.size))}</select></div>
      <div class="node-row"><span>格式</span><select data-field="outputFormat">${optionPairs([["png", "PNG · 透明/无损"], ["jpeg", "JPEG · 更小文件"]], node.data.outputFormat || "png")}</select></div>
      <div class="node-row"><span>提示词优化</span><select data-field="promptOptimization">${optionPairs([["standard", "标准 · 质量优先"], ["fast", "快速 · 速度优先"]], node.data.promptOptimization || "standard")}</select></div>` : "";
    const paramRows = klingParamRows || (isMjImageModel(model)
      ? `
      <div class="node-row"><span>比例</span><select data-field="mjAr">${options(mjAspectOptions, node.data.mjAr || "1:1")}</select></div>
      <div class="node-row"><span>版本</span><select data-field="mjVersion">${options(mjVersionsFor(model), getMjVersion(model, node.data.mjVersion))}</select></div>
      <div class="node-row"><span>速度</span><select data-field="mjSpeed">${options(mjSpeedOptions, node.data.mjSpeed || "fast")}</select></div>`
      : seedreamProRows
        ? seedreamProRows
      : `
      <div class="node-row"><span>画质</span><select data-field="quality">${options(imageQualityOptions(model), getImageQualityValue(model, node.data.quality))}</select></div>
      ${renderImageSizeControl(model, node.data)}`);
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", node.data.providerId, node.data.model, klingTool)}</select></div>
      ${paramRows}
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

  if (node.type === "faceSwapConfig") {
    const slots = getImageReferenceSlots(node.id);
    const baseConnected = slots.length >= 1;
    const faceConnected = slots.length >= 2;
    const ready = baseConnected && faceConnected;
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", node.data.providerId, node.data.model, "image_to_image")}</select></div>
      <div class="node-row"><span>额外要求</span><input type="text" data-field="extra" placeholder="可留空。例：让表情更自然微笑" value="${escapeHtml(node.data.extra || "")}"></div>
      <div class="node-indicators faceswap-slots">
        <span class="indicator ${baseConnected ? "ready" : ""}">①底图 ${baseConnected ? "✓" : "○"}</span>
        <span class="indicator ${faceConnected ? "ready" : ""}">②脸源 ${faceConnected ? "✓" : "○"}</span>
      </div>
      <div class="node-tip">第1张连入=底图（保留构图/光影），第2张=脸源（取这张的脸）</div>
      <button class="node-button" data-node-action="generate-faceswap" ${ready ? "" : "disabled"}>换脸</button>
    `;
  }

  if (node.type === "styleTransferConfig") {
    const slots = getImageReferenceSlots(node.id);
    const contentConnected = Boolean(slots[0]?.node?.data?.url);
    const styleConnected = Boolean(slots[1]?.node?.data?.url);
    const ready = slots.length === 2 && contentConnected && styleConnected;
    const inputError = slots.length > 2 ? "只接受两张图片，请删除多余的参考图连线。" : "";
    const strength = window.StyleTransfer.normalizeStrength(node.data.strength);
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", node.data.providerId, node.data.model, "image_to_image")}</select></div>
      <div class="node-row"><span>迁移强度</span><select data-field="strength">${optionPairs(window.StyleTransfer.strengthOptions, strength)}</select></div>
      <div class="node-row"><span>额外要求</span><input type="text" data-field="extra" placeholder="可留空。例：背景保持纯白" value="${escapeHtml(node.data.extra || "")}"></div>
      <div class="node-indicators style-transfer-slots">
        <span class="indicator ${contentConnected ? "ready" : ""}">①内容图 ${contentConnected ? "✓" : "○"}</span>
        <span class="indicator ${styleConnected ? "ready" : ""}">②风格参考 ${styleConnected ? "✓" : "○"}</span>
      </div>
      <div class="node-tip">第1张决定主体与构图，第2张只提供画风；输出比例自动跟随第1张。</div>
      ${inputError ? `<div class="node-inline-error">${escapeHtml(inputError)}</div>` : ""}
      <button class="node-button" data-node-action="generate-style-transfer" ${ready ? "" : "disabled"}>迁移风格</button>
    `;
  }

  if (node.type === "materialTransferConfig") {
    const slots = getImageReferenceSlots(node.id);
    const structureConnected = Boolean(slots[0]?.node?.data?.url);
    const materialConnected = Boolean(slots[1]?.node?.data?.url);
    const ready = slots.length === 2 && structureConnected && materialConnected;
    const inputError = slots.length > 2 ? "只接受两张图片，请删除多余的参考图连线。" : "";
    const strength = window.MaterialTransfer.normalizeStrength(node.data.strength);
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", node.data.providerId, node.data.model, "image_to_image")}</select></div>
      <div class="node-row"><span>迁移强度</span><select data-field="strength">${optionPairs(window.MaterialTransfer.strengthOptions, strength)}</select></div>
      <div class="node-row"><span>材质说明</span><input type="text" data-field="materialHint" placeholder="可留空自动识别。例：温润半透明白玉" value="${escapeHtml(node.data.materialHint || "")}"></div>
      <div class="node-row"><span>额外要求</span><input type="text" data-field="extra" placeholder="可留空。例：只替换盔甲，皮肤不变" value="${escapeHtml(node.data.extra || "")}"></div>
      <div class="node-indicators material-transfer-slots">
        <span class="indicator ${structureConnected ? "ready" : ""}">①主体 / 结构 ${structureConnected ? "✓" : "○"}</span>
        <span class="indicator ${materialConnected ? "ready" : ""}">②材质参考 ${materialConnected ? "✓" : "○"}</span>
      </div>
      <div class="node-tip">第1张锁定主体、视角和细节，第2张只提供材质；输出比例跟随第1张。</div>
      ${inputError ? `<div class="node-inline-error">${escapeHtml(inputError)}</div>` : ""}
      <button class="node-button" data-node-action="generate-material-transfer" ${ready ? "" : "disabled"}>迁移材质</button>
    `;
  }

  if (node.type === "productBackgroundConfig") {
    const slots = getImageReferenceSlots(node.id);
    const { product, background, extras } = window.ProductBackground.assignInputs(slots);
    let inputError = "";
    let ready = false;
    try { window.ProductBackground.validateInputs(slots); ready = true; } catch (error) { if (extras.length) inputError = error.message; }
    const busy = activeProductBackgroundRuns.has(node.id);
    const renderSlot = (slot, role, label) => {
      const source = slot?.node?.data?.url;
      const loaded = typeof source === "string" && source && !slot.node.data.loading;
      return `<button class="product-background-slot ${loaded ? "ready" : ""}" data-node-action="upload-product-background-${role}" ${busy ? "disabled" : ""} title="上传或替换${label}">
        ${loaded ? `<img src="${escapeHtml(imageDisplaySource(source))}" data-asset-url="${escapeHtml(source)}" alt="${label}">` : `<span class="product-background-slot-icon">＋</span>`}
        <span>${label}${loaded ? " ✓" : " · 上传"}</span>
      </button>`;
    };
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", node.data.providerId, node.data.model, "image_to_image")}</select></div>
      <div class="product-background-slots">
        ${renderSlot(product, "product", "①产品图")}
        ${renderSlot(background, "background", "②背景图")}
      </div>
      <div class="node-row"><span>输出比例</span><select data-field="aspectSource">${optionPairs([["product", "跟随产品图"], ["background", "跟随背景图"]], window.ProductBackground.normalizeAspectSource(node.data.aspectSource))}</select></div>
      <div class="node-row"><span>补充要求</span><input type="text" data-field="extra" placeholder="可留空。例：产品放在桌面中央" value="${escapeHtml(node.data.extra || "")}"></div>
      <div class="node-tip">也可连入两张图片：①产品，②背景。一次编辑完成换背景与光影统一，尽量保留外观、文字和材质细节。</div>
      ${inputError ? `<div class="node-inline-error">${escapeHtml(inputError)}</div>` : ""}
      <button class="node-button" data-node-action="generate-product-background" ${ready && !busy ? "" : "disabled"}>${busy ? "正在换背景…" : "更换背景"}</button>
    `;
  }

  if (node.type === "seedreamEdit") {
    const slots = getImageReferenceSlots(node.id);
    const hasBase = Boolean(slots[0]?.node?.data?.url);
    const marks = Array.isArray(node.data.annotation?.marks) ? node.data.annotation.marks : [];
    const model = normalizeModelValue("image", node.data.model) || "doubao-seedream-5-0-pro-260628";
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", node.data.providerId, model, "image_to_image")}</select></div>
      <div class="node-row"><span>尺寸</span><select data-field="size">${optionPairs(imageSizeOptions(model), getImageSizeValue(model, node.data.size))}</select></div>
      <div class="node-row"><span>格式</span><select data-field="outputFormat">${optionPairs([["png", "PNG"], ["jpeg", "JPEG"]], node.data.outputFormat || "png")}</select></div>
      <div class="node-row"><span>优化</span><select data-field="promptOptimization">${optionPairs([["standard", "标准"], ["fast", "快速"]], node.data.promptOptimization || "standard")}</select></div>
      <div class="node-row node-row-col"><span>编辑要求</span><textarea data-field="prompt" placeholder="例：把框选区域的沙发改成墨绿色天鹅绒">${escapeHtml(node.data.prompt || "")}</textarea></div>
      <div class="node-indicators">
        <span class="indicator ${hasBase ? "ready" : ""}">待编辑原图 ${hasBase ? "✓" : "○"}</span>
        <span class="indicator ${marks.length ? "ready" : ""}">空间标记 ${marks.length || "○"}</span>
        ${slots.length > 1 ? `<span class="indicator ready">额外参考 ${slots.length - 1}</span>` : ""}
      </div>
      <div class="node-split">
        <button class="node-secondary-button" data-node-action="open-seedream-editor" ${hasBase ? "" : "disabled"}>标记区域</button>
        <button class="node-button" data-node-action="generate-seedream-edit" ${hasBase ? "" : "disabled"}>生成编辑结果</button>
      </div>
    `;
  }

  if (node.type === "layerSeparation") {
    const slots = getImageReferenceSlots(node.id);
    const ready = slots.length === 1 && Boolean(slots[0]?.node?.data?.url);
    const hasPendingImport = Boolean(node.data.pendingLayerResponse);
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", node.data.providerId, node.data.model, "image_to_image")}</select></div>
      <div class="node-row"><span>分层尺寸</span><select data-field="size">${optionPairs([["auto", "自动"], ["1K", "1K"], ["1.5K", "1.5K"], ["2K", "2K"]], node.data.size || "auto")}</select></div>
      <div class="node-row"><span>优化</span><select data-field="promptOptimization">${optionPairs([["standard", "标准"], ["fast", "快速"]], node.data.promptOptimization || "standard")}</select></div>
      <div class="node-row"><span>随机种子</span><input type="number" min="0" max="2147483647" step="1" data-field="seed" value="${escapeHtml(node.data.seed ?? 0)}"></div>
      <div class="node-row node-row-col"><span>拆分说明（可空）</span><textarea data-field="prompt" placeholder="自动识别主要元素；或指定：人物、标题、商品、装饰、背景">${escapeHtml(node.data.prompt || "")}</textarea></div>
      <div class="node-indicators">
        <span class="indicator ${ready ? "ready" : ""}">单张原图 ${ready ? "✓" : slots.length ? `${slots.length} 张` : "○"}</span>
        <span class="indicator">透明 PNG · 最多 16 层</span>
      </div>
      ${node.data.error ? `<div class="node-inline-error">${escapeHtml(node.data.error)}</div>` : ""}
      <button class="node-button" data-node-action="generate-layer-separation" ${ready ? "" : "disabled"}>${hasPendingImport ? "重试导入已生成图层" : "分离为可编辑图层"}</button>
    `;
  }

  if (node.type === "layerGroup") {
    const layers = Array.isArray(node.data.layers) ? [...node.data.layers].sort((a, b) => b.zIndex - a.zIndex) : [];
    const layout = window.SeedreamTools.layerGroupLayout(node.data, nodeSizes.layerGroup);
    const source = node.data.url || (node.data.compositeAssetId ? `${imageAssetPrefix}${node.data.compositeAssetId}` : "");
    const displaySource = source ? imageDisplaySource(source) : "";
    const preview = source
      ? `<div class="image-preview has-image layer-group-preview" style="aspect-ratio:${layout.aspectRatio}"><img class="generated-image" src="${escapeHtml(displaySource)}" data-asset-url="${escapeHtml(source)}" alt="图层组合预览"></div>`
      : `<div class="empty-media">等待图层数据</div>`;
    const layerRows = layers.slice(0, 6).map((layer) => `
      <div class="layer-group-row ${layer.visible === false ? "muted" : ""}">
        <span>${layer.role === "background" ? "▣" : "◇"}</span>
        <b>${escapeHtml(layer.name || "未命名图层")}</b>
        <small>${Math.round((Number(layer.opacity) || 0) * 100)}%</small>
      </div>`).join("");
    return `
      ${preview}
      <div class="layer-group-summary"><span>${layers.length} 个图层</span><span>${layout.documentWidth}×${layout.documentHeight}</span></div>
      <div class="layer-group-list">${layerRows || `<div class="layer-group-empty">暂无图层</div>`}${layers.length > 6 ? `<small>另有 ${layers.length - 6} 层…</small>` : ""}</div>
      <div class="node-split">
        <button class="node-secondary-button" data-node-action="layer-group-to-image" ${source ? "" : "disabled"}>合成为图片</button>
        <button class="node-button" data-node-action="open-layer-editor" ${layers.length ? "" : "disabled"}>编辑图层</button>
      </div>
    `;
  }

  if (node.type === "image") {
    const hasImage = typeof node.data.url === "string" && node.data.url;
    const toolbar = hasImage
      ? `
      <div class="media-toolbar">
        <button data-node-action="upload-image">重新载入</button>
        <button data-node-action="edit-image">编辑</button>
        <button data-node-action="image-to-image">图生图</button>
        <button data-node-action="image-to-video">生视频</button>
      </div>`
      : `
      <div class="media-toolbar">
        <button data-node-action="upload-image">载入图像</button>
      </div>`;
    return `
      ${renderImageMedia(node)}
      ${toolbar}
    `;
  }

  if (node.type === "model3dPreview") {
    const director = Boolean(node.data.director);
    const hasModel = Boolean(node.data.modelAssetId);
    const hasShot = typeof node.data.url === "string" && node.data.url;
    const modeLabel = { material: "原始材质", clay: "素模", depth: "深度图", normal: "法线图", wireframe: "线框" }[node.data.renderMode] || "素模";
    const preview = hasShot
      ? `<div class="image-preview has-image">
           <img class="generated-image" src="${escapeHtml(imageDisplaySource(node.data.url) || transparentPixel)}" data-asset-url="${escapeHtml(node.data.url)}" alt="3D 取景" loading="lazy" referrerpolicy="no-referrer">
           <div class="image-load-error"><strong>预览加载失败</strong></div>
         </div>`
      : `<div class="empty-media model3d-empty" data-node-action="${hasModel || director ? "model3d-open" : "model3d-upload"}">
           <div>
             <strong>${director ? "进入 3D 导演台" : hasModel ? "点击「调整视角」取景" : "载入 3D 模型"}</strong>
             <div class="image-drop-hint">${director ? "布置场景 · 保存机位 · 运镜排练" : "glb · gltf · obj · fbx · stl"}</div>
           </div>
         </div>`;
    const meta = hasModel
      ? `<div class="node-row model3d-meta"><span>${escapeHtml(node.data.modelName || "模型")}</span><b>${escapeHtml(modeLabel)}</b></div>`
      : "";
    const toolbar = director
      ? `<div class="node-row model3d-meta"><span>${node.data.directorData?.shots?.length || 0} 个机位</span><b>3D 导演台</b></div><div class="media-toolbar"><button data-node-action="model3d-open">打开导演台</button></div>`
      : hasModel
      ? `<div class="media-toolbar">
           <button data-node-action="model3d-open">调整视角</button>
           <button data-node-action="model3d-upload">更换模型</button>
         </div>`
      : `<div class="media-toolbar">
           <button data-node-action="model3d-upload">载入模型</button>
         </div>`;
    return `${preview}${meta}${toolbar}`;
  }

  if (node.type === "videoConfig") {
    const prompt = incomingNodes(node.id, ["text", "llmConfig", "storyboardAssistant", "promptOptimizer"]).length;
    const imageSlots = getImageReferenceSlots(node.id);
    const refSlots = getReferenceMaterialSlots(node.id);
    const mode = getVideoMode(node.data);
    const modeSelect = `<select data-field="videoMode">${
      videoModeOptions.map(([k, l]) => `<option value="${k}" ${k === mode ? "selected" : ""}>${l}</option>`).join("")
    }<option value="multi_frame" disabled>智能多帧（即将支持）</option></select>`;
    const ratioValue = getVideoRatioValue(node.data);
    const resolution = getVideoResolutionValue(node.data);
    const seconds = clamp(Number(node.data.seconds) || 8, videoSecondsMin, videoSecondsMax);
    const refIndicators = mode === "first_last"
      ? `
        <span class="indicator ${imageSlots[0] ? "ready" : ""}">首帧 ${imageSlots[0] ? "✓" : "○"}</span>
        <span class="indicator ${imageSlots[1] ? "ready" : ""}">尾帧 ${imageSlots[1] ? "✓" : "○"}</span>`
      : (refSlots.length
          ? refSlots.map((ref) => `
            <button class="indicator ready ref-mention" data-node-action="insert-ref-mention" data-ref-token="${escapeHtml(ref.token)}" title="插入到提示词">
              ${escapeHtml(ref.token)}
            </button>`).join("")
          : `<span class="indicator">参考图 ○</span>`);
    const modeTip = mode === "first_last"
      ? "图1=首帧，图2=尾帧，提示词描述中间过渡"
      : "提示词里用 @图片N / @视频N 指定每张素材的用途";
    const klingTool = window.KlingProvider?.toolFor("video", imageSlots.length > 0) || "";
    const klingParams = renderKlingDynamicParams(node, "video");
    const legacyParams = `
      <div class="node-row"><span>模式</span>${modeSelect}</div>
      <div class="node-row"><span>比例</span><select data-field="ratio">${options(videoAspectOptions, ratioValue)}</select></div>
      <div class="node-row"><span>分辨率</span><select data-field="resolution">${options(videoResolutionOptions, resolution)}</select></div>
      <div class="node-row"><span>时长</span><input type="range" class="node-range" data-field="seconds" min="${videoSecondsMin}" max="${videoSecondsMax}" step="1" value="${seconds}"><b data-range-label="seconds">${seconds}s</b></div>
      <div class="node-tip">${modeTip}</div>`;
    return `
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("video", node.data.providerId, node.data.model, klingTool)}</select></div>
      ${klingParams || legacyParams}
      <div class="node-indicators">
        <span class="indicator ${prompt ? "ready" : ""}">提示词 ${prompt ? "✓" : "○"}</span>
        ${refIndicators}
      </div>
      <button class="node-button" data-node-action="generate-video">生成视频</button>
    `;
  }

  if (node.type === "storyboardConfig") {
    const d = node.data;
    const genres = (storyboardBlacklist && Object.entries(storyboardBlacklist).filter(([k]) => !k.startsWith("_"))) || [];
    const genreOptions = genres.map(([k, v]) => `<option value="${escapeHtml(k)}" ${k === d.genre ? "selected" : ""}>${escapeHtml(v.label || k)}${v.pending ? " ⚠️" : ""}</option>`).join("");
    const pathways = [
      ["temporal-dense-meta", "时序·密集元数据（MrLarus 派）"],
    ];
    const pathwayOptions = pathways.map(([k, label]) => `<option value="${k}" ${k === d.pathway ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
    const pendingWarn = storyboardBlacklist?.[d.genre]?.pending
      ? `<div class="storyboard-warn">⚠️ 该题材暂无实证案例，仅用默认通用黑名单</div>`
      : "";
    const lintCharacter = !d.characterFace
      ? `<div class="storyboard-warn">⚠️ 未填角色"脸"——跨格崩脸是 16 宫格最常见失败模式</div>`
      : "";
    return `
      <div class="storyboard-section">
        <div class="storyboard-section-title">路径与题材</div>
        <div class="node-row"><span>路径</span><select data-field="pathway">${pathwayOptions}</select></div>
        <div class="node-row"><span>题材</span><select data-field="genre">${genreOptions}</select></div>
        <div class="node-row"><span>主题</span><input type="text" data-field="subject" placeholder="洛神水舞 / 街舞跳绳..." value="${escapeHtml(d.subject || "")}"></div>
        ${pendingWarn}
      </div>
      <div class="storyboard-section">
        <div class="storyboard-section-title">强约束（必填）</div>
        ${lintCharacter}
        <div class="node-row"><span>脸</span><input type="text" data-field="characterFace" placeholder="同一张脸，清冷柔美" value="${escapeHtml(d.characterFace || "")}"></div>
        <div class="node-row"><span>服装</span><input type="text" data-field="characterOutfit" placeholder="月白/浅青/雾蓝水袖飘带" value="${escapeHtml(d.characterOutfit || "")}"></div>
        <div class="node-row"><span>气质</span><input type="text" data-field="characterTemperament" placeholder="清冷柔美灵动优雅" value="${escapeHtml(d.characterTemperament || "")}"></div>
        <div class="node-row"><span>视角</span><select data-field="perspective">${options(["eye-level", "low-angle", "isometric-top-down", "fish-eye"], d.perspective)}</select></div>
        <div class="node-row"><span>色系</span><input type="text" data-field="paletteCommitment" placeholder="月白/浅青/雾蓝/银白" value="${escapeHtml(d.paletteCommitment || "")}"></div>
        <div class="node-row"><span>美学向</span><select data-field="aestheticDirection">${options(["dreamy", "realistic", "manga", "ink-wash"], d.aestheticDirection)}</select></div>
        <div class="node-row"><span>物理向</span><select data-field="physicsDirection">${options(["realistic", "exaggerated", "gravity-defying"], d.physicsDirection)}</select></div>
      </div>
      <div class="storyboard-section">
        <div class="storyboard-section-title">时序参数</div>
        <div class="node-row"><span>格数</span><select data-field="cellCount">${options(["9", "12", "16", "25"], String(d.cellCount || 16))}</select></div>
        <div class="node-row"><span>布局</span><select data-field="gridLayout">${options(["3x3", "3x4", "4x4", "5x5"], d.gridLayout)}</select></div>
        <div class="node-row"><span>叙事弧</span><input type="text" data-field="narrativeArc" placeholder="起承转合，每格一句话（可空，由模型自填）" value="${escapeHtml(d.narrativeArc || "")}"></div>
      </div>
      <details class="storyboard-section">
        <summary class="storyboard-section-title">弱约束（折叠）</summary>
        <div class="node-row"><span>氛围</span><input type="text" data-field="sceneAtmosphere" placeholder="傍晚月色初起 轻雾" value="${escapeHtml(d.sceneAtmosphere || "")}"></div>
        <div class="node-row"><span>装饰</span><input type="text" data-field="decorativeDetails" placeholder="荷叶 岸边草木 亭阁灯影" value="${escapeHtml(d.decorativeDetails || "")}"></div>
        <div class="node-row"><span>镜头</span><input type="text" data-field="cameraLanguage" placeholder="slow-push-in, orbit-full-body" value="${escapeHtml(d.cameraLanguage || "")}"></div>
        <div class="node-row"><span>追加反向</span><input type="text" data-field="extraReverseConstraints" placeholder="不要 X / 不要 Y（自定义）" value="${escapeHtml(d.extraReverseConstraints || "")}"></div>
      </details>
      <div class="storyboard-section">
        <div class="storyboard-section-title">下游</div>
        <div class="node-row"><span>图模型</span><select data-field="model">${modelOptionsForNode("image", d.providerId, d.model, "text_to_image")}</select></div>
        ${renderImageSizeControl(d.model, d)}
      </div>
      <button class="node-button" data-node-action="generate-storyboard">生成故事板</button>
    `;
  }

  if (node.type === "templateImageConfig") {
    const d = node.data;
    const templates = (typeof window !== "undefined" && window.IMAGE_TEMPLATES) || {};
    const keys = Object.keys(templates);
    const activeKey = d.template && templates[d.template] ? d.template : keys[0];
    const tpl = templates[activeKey] || { fields: [], label: "" };
    const templateOptions = keys
      .map((k) => `<option value="${escapeHtml(k)}" ${k === activeKey ? "selected" : ""}>${escapeHtml(templates[k].label || k)}</option>`)
      .join("");
    const refSlots = getImageReferenceSlots(node.id);
    const hasRef = refSlots.length > 0;
    const allFields = tpl.fields || [];
    const mainRows = allFields.filter((f) => !f.optional).map((f) => renderTemplateField(f, d, hasRef)).join("");
    const optFields = allFields.filter((f) => f.optional);
    const optRows = optFields.length
      ? `<details class="storyboard-section" ${d._optOpen ? "open" : ""}><summary class="storyboard-section-title">更多选项（可选）</summary>${optFields.map((f) => renderTemplateField(f, d, hasRef)).join("")}</details>`
      : "";
    const refHint = hasRef
      ? `<div class="storyboard-warn">${escapeHtml(tpl.referenceActiveHint || "已接参考图 → 以产品实物为准，配色/外观跟随真实产品")}</div>`
      : `<span class="indicator">${escapeHtml(tpl.referenceHint || "参考图 ○（接「载入图像」可放入真实产品图）")}</span>`;
    const model = normalizeModelValue("image", d.model) || getDefaultModel("image");
    return `
      <div class="storyboard-section">
        <div class="node-row"><span>模板</span><select data-field="template">${templateOptions}</select></div>
      </div>
      <div class="storyboard-section">
        ${mainRows}
      </div>
      ${optRows}
      <div class="node-indicators">${refHint}</div>
      <div class="storyboard-section">
        <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", d.providerId, d.model, hasRef ? "image_to_image" : "text_to_image")}</select></div>
        ${renderImageSizeControl(model, d)}
      </div>
      <div class="node-split">
        <button class="node-button" data-node-action="generate-template-image">生成图片</button>
        <button class="node-secondary-button" data-node-action="generate-template-image">重新生成</button>
      </div>
    `;
  }

  if (node.type === "imageCompare") {
    const slots = getImageReferenceSlots(node.id);
    const srcOf = (n) => (typeof n?.data?.url === "string" && n.data.url ? n.data.url : "");
    const aSrc = srcOf(slots[0]?.node);
    const bSrc = srcOf(slots[1]?.node);
    if (!aSrc || !bSrc) {
      return `
        <div class="compare-empty">
          <strong>图片对比</strong>
          <div class="compare-hint">从两个「图片」节点各连一条线进来（先连的是 A，后连的是 B）</div>
          <div class="node-indicators">
            <span class="indicator ${aSrc ? "ready" : ""}">图片A ${aSrc ? "✓" : "○"}</span>
            <span class="indicator ${bSrc ? "ready" : ""}">图片B ${bSrc ? "✓" : "○"}</span>
          </div>
        </div>
      `;
    }
    const split = clamp(Number(node.data.split ?? 50), 0, 100);
    const imgTag = (src) => `<img class="generated-image compare-img" data-asset-url="${escapeHtml(src)}" src="${escapeHtml(imageDisplaySource(src) || transparentPixel)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">`;
    // 舞台比例跟随 A 图（第一张连入的图）的自然比例——已知时直接定死 aspect-ratio，
    // 让横屏输入得到横屏对比框；未知时回落到 CSS 的方形 min-height，加载后由 setupCompareStages 补上。
    const cw = Number(node.data._imgW) || 0, ch = Number(node.data._imgH) || 0;
    const stageStyle = cw > 2 && ch > 2 ? ` style="aspect-ratio:${cw} / ${ch}; min-height:0"` : "";
    return `
      <div class="compare-stage"${stageStyle}>
        ${imgTag(bSrc)}
        <div class="compare-clip" style="clip-path: inset(0 ${100 - split}% 0 0)">
          ${imgTag(aSrc)}
        </div>
        <span class="compare-label compare-label-a">A</span>
        <span class="compare-label compare-label-b">B</span>
        <div class="compare-divider" style="left:${split}%"><span class="compare-handle"></span></div>
      </div>
    `;
  }

  if (node.type === "imageExpand") {
    const slots = getImageReferenceSlots(node.id);
    const src = typeof slots[0]?.node?.data?.url === "string" && slots[0].node.data.url ? slots[0].node.data.url : "";
    if (!src) {
      return `
        <div class="compare-empty">
          <strong>图片扩展</strong>
          <div class="compare-hint">从一个「图片」节点连一条线进来作为原图</div>
          <div class="node-indicators"><span class="indicator">原图 ○</span></div>
        </div>
      `;
    }
    const d = node.data;
    const expandTarget = expandTargetSize(node);
    return `
      <div class="expand-stage" data-expand-src="${escapeHtml(src)}">
        <div class="expand-frame">
          <img class="generated-image expand-img" data-asset-url="${escapeHtml(src)}" src="${escapeHtml(imageDisplaySource(src) || transparentPixel)}" alt="" draggable="false">
          <span class="expand-handle" data-expand-side="top" title="向上扩展"></span>
          <span class="expand-handle" data-expand-side="right" title="向右扩展"></span>
          <span class="expand-handle" data-expand-side="bottom" title="向下扩展"></span>
          <span class="expand-handle" data-expand-side="left" title="向左扩展"></span>
        </div>
      </div>
      <div class="node-row"><span>锁原始比例</span><input type="checkbox" data-field="lockRatio" ${d.lockRatio ? "checked" : ""}></div>
      <div class="node-row"><span>填充提示</span><input type="text" data-field="prompt" placeholder="可留空。例：自然延展海边风景" value="${escapeHtml(d.prompt || "")}"></div>
      <div class="node-row"><span>模型</span><select data-field="model">${modelOptionsForNode("image", d.providerId, d.model, "image_to_image")}</select></div>
      <div class="node-row"><span>目标尺寸</span><span class="expand-size">${escapeHtml(computeExpandTargetLabel(node))}</span></div>
      <div class="node-inline-error expand-size-error" ${expandTarget?.error ? "" : "hidden"}>${escapeHtml(expandTarget?.error || "")}</div>
      <button class="node-button" data-node-action="generate-expand">生成扩展</button>
    `;
  }

  if (node.type === "video") {
    const aspect = ratioToCss(node.data.ratio);
    let media;
    if (node.data.loading) {
      media = `<div class="video-preview loading-card" style="aspect-ratio:${aspect};--preview-bg:${node.data.gradient || ""}">生成中</div>`;
    } else if (typeof node.data.url === "string" && node.data.url) {
      const source = node.data.url;
      const indexed = isIndexedImageSource(source);
      const displaySource = indexed ? imageAssetObjectUrls.get(getIndexedImageId(source)) || "" : source;
      const url = escapeHtml(source);
      const openLink = indexed
        ? ""
        : `<a class="video-ctrl video-open" href="${url}" target="_blank" rel="noreferrer" title="新标签打开">↗</a>`;
      media = `
        <div class="video-preview has-video" style="aspect-ratio:${aspect}">
          <video class="result-video" ${displaySource ? `src="${escapeHtml(displaySource)}"` : ""} data-asset-url="${url}" playsinline preload="metadata" loop muted></video>
          <div class="video-controls">
            <button class="video-ctrl" data-node-action="video-toggle-play" title="播放 / 暂停">▶</button>
            <button class="video-ctrl" data-node-action="video-toggle-mute" title="开关声音">🔇</button>
            ${openLink}
          </div>
        </div>`;
    } else if (node.data.url) {
      media = `<div class="video-preview" style="aspect-ratio:${aspect};--preview-bg:${node.data.gradient || ""}"></div>`;
    } else if (node.data.taskId) {
      const detail = node.data.error || "任务已经创建，可以继续查询生成状态";
      media = `
        <div class="empty-media error-media">
          <div>
            <strong>${node.data.error ? "查询暂时中断" : "任务待查询"}</strong>
            <div class="image-drop-hint">${escapeHtml(detail)}</div>
            <button class="node-secondary-button" data-node-action="resume-video-task">继续查询</button>
          </div>
        </div>`;
    } else {
      media = `
        <div class="empty-media image-drop-target" data-node-action="upload-video">
          <div>
            <strong>载入视频</strong>
            <div class="image-drop-hint">点击 · 拖入视频</div>
          </div>
        </div>`;
    }
    return `
      ${media}
      <div class="node-tip">${node.data.taskId ? `Task: ${escapeHtml(node.data.taskId)}` : "视频结果"}</div>
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

  return `
    <div class="empty-media image-drop-target" data-node-action="upload-image">
      <div>
        <strong>载入图像</strong>
        <div class="image-drop-hint">点击 · 拖入图片 · 粘贴 Ctrl+V</div>
      </div>
    </div>
  `;
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

async function persistImageBlob(blob) {
  if (!blob) throw new Error("空文件");
  if (!String(blob.type || "").startsWith("image/")) throw new Error("仅支持图片文件");
  const id = makeId();
  await putImageAsset({ id, blob, type: blob.type || "image/png", createdAt: new Date().toISOString() });
  imageAssetObjectUrls.set(id, URL.createObjectURL(blob));
  return `${imageAssetPrefix}${id}`;
}

async function probeImageDimensions(source) {
  const display = await getDisplayImageUrl(source);
  if (!display) return { width: 0, height: 0 };
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = display;
  });
}

async function persistLayerImageSource(source) {
  const existingId = getIndexedImageId(source);
  if (existingId) {
    const dimensions = await probeImageDimensions(source);
    return { assetId: existingId, ...dimensions };
  }
  const response = await fetch(imageDisplaySource(source));
  if (!response.ok) throw new Error(`图层下载失败（HTTP ${response.status}）`);
  const blob = await response.blob();
  if (!String(blob.type || "").startsWith("image/")) throw new Error("图层接口返回了非图片文件");
  const sentinel = await persistImageBlob(blob);
  const dimensions = await probeImageDimensions(sentinel);
  return { assetId: getIndexedImageId(sentinel), ...dimensions };
}

async function persistCanvasDataUrl(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return persistImageBlob(blob);
}

async function loadCanvasImage(source) {
  const display = await getDisplayImageUrl(source);
  if (!display) throw new Error("图层图片资源不可用");
  const image = new Image();
  image.src = display;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("图层图片加载失败"));
  });
  return image;
}

async function composeLayerGroupDataUrl(groupData) {
  const width = Math.max(1, Math.round(Number(groupData?.width) || 1));
  const height = Math.max(1, Math.round(Number(groupData?.height) || 1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const plan = window.SeedreamTools.layerRenderPlan(groupData?.layers);
  for (const layer of plan) {
    const image = await loadCanvasImage(`${imageAssetPrefix}${layer.assetId}`);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(image, Number(layer.x) || 0, Number(layer.y) || 0, Number(layer.width) || image.naturalWidth, Number(layer.height) || image.naturalHeight);
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL("image/png");
}

async function loadImageFileIntoNode(file, nodeId) {
  const node = getNode(nodeId);
  if (!node || node.type !== "image") return false;
  try {
    const sentinel = await persistImageBlob(file);
    commitHistory();
    updateNode(nodeId, { url: sentinel, loading: false, error: "", gradient: "" });
    showToast("已载入图像");
    return true;
  } catch (error) {
    showToast(`载入失败：${error.message}`);
    return false;
  }
}

function triggerImageUpload(nodeId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file) await loadImageFileIntoNode(file, nodeId);
  });
  input.click();
}

async function createUploadedImageNode(file, position) {
  const id = addNode("image", position || getViewportCenter(), { label: "载入图像", url: false });
  if (file) await loadImageFileIntoNode(file, id);
  else triggerImageUpload(id);
  return id;
}

function drawSeedreamAnnotationMarks(ctx, marks, width, height) {
  const color = "#8b5cf6";
  const lineWidth = Math.max(4, Math.min(width, height) * 0.006);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const mark of Array.isArray(marks) ? marks : []) {
    if (mark.type === "point") {
      const x = mark.x * width;
      const y = mark.y * height;
      const radius = lineWidth * 2.2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - radius * 1.5, y);
      ctx.lineTo(x + radius * 1.5, y);
      ctx.moveTo(x, y - radius * 1.5);
      ctx.lineTo(x, y + radius * 1.5);
      ctx.stroke();
    } else if (mark.type === "box") {
      const x = Math.min(mark.x1, mark.x2) * width;
      const y = Math.min(mark.y1, mark.y2) * height;
      ctx.strokeRect(x, y, Math.abs(mark.x2 - mark.x1) * width, Math.abs(mark.y2 - mark.y1) * height);
    } else if (mark.type === "arrow") {
      const x1 = mark.x1 * width;
      const y1 = mark.y1 * height;
      const x2 = mark.x2 * width;
      const y2 = mark.y2 * height;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = lineWidth * 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(angle - Math.PI / 6) * head, y2 - Math.sin(angle - Math.PI / 6) * head);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(angle + Math.PI / 6) * head, y2 - Math.sin(angle + Math.PI / 6) * head);
      ctx.stroke();
    } else if (mark.type === "brush" && Array.isArray(mark.points) && mark.points.length) {
      ctx.beginPath();
      ctx.moveTo(mark.points[0].x * width, mark.points[0].y * height);
      for (const point of mark.points.slice(1)) ctx.lineTo(point.x * width, point.y * height);
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function renderAnnotatedImage(source, annotation) {
  const displaySource = await getDisplayImageUrl(source);
  if (!displaySource) throw new Error("待编辑原图不可用");
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = displaySource;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("待编辑原图加载失败"));
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  drawSeedreamAnnotationMarks(ctx, annotation?.marks, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

let activeSeedreamAnnotationEditor = null;

async function openSeedreamAnnotationEditor(nodeId) {
  const node = getNode(nodeId);
  const baseNode = getImageReferenceSlots(nodeId)[0]?.node;
  if (!node || node.type !== "seedreamEdit" || !baseNode?.data?.url) {
    showToast("先连接一张待编辑原图");
    return;
  }
  activeSeedreamAnnotationEditor?.();
  const displaySource = await getDisplayImageUrl(baseNode.data.url);
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = displaySource;
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("待编辑原图加载失败"));
    });
  } catch (error) {
    showToast(error.message);
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "seedream-editor-overlay";
  overlay.innerHTML = `
    <div class="seedream-editor-dialog">
      <header class="seedream-editor-head">
        <div><strong>Seedream 精确编辑</strong><small>紫色标记只用于告诉模型修改位置</small></div>
        <button type="button" data-seedream-editor-action="close" aria-label="关闭">×</button>
      </header>
      <div class="seedream-editor-body">
        <aside class="seedream-editor-tools" aria-label="标注工具">
          <button type="button" class="active" data-seedream-tool="point">点</button>
          <button type="button" data-seedream-tool="box">框</button>
          <button type="button" data-seedream-tool="arrow">箭头</button>
          <button type="button" data-seedream-tool="brush">画笔</button>
          <button type="button" data-seedream-tool="eraser">橡皮</button>
          <span></span>
          <button type="button" data-seedream-editor-action="undo">撤销</button>
          <button type="button" data-seedream-editor-action="clear">清空</button>
        </aside>
        <div class="seedream-editor-stage"><canvas></canvas></div>
      </div>
      <footer class="seedream-editor-foot">
        <span data-seedream-mark-count></span>
        <span class="seedream-editor-tip">点/框/箭头适合精确定位，画笔适合不规则区域</span>
        <button type="button" class="node-secondary-button" data-seedream-editor-action="close">取消</button>
        <button type="button" class="node-button" data-seedream-editor-action="apply">应用标注</button>
      </footer>
    </div>`;
  document.body.append(overlay);

  const canvas = overlay.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  let tool = "point";
  let pointerId = null;
  let activeMark = null;
  let draft = JSON.parse(JSON.stringify(node.data.annotation || { version: 1, marks: [] }));
  draft.version = 1;
  draft.width = image.naturalWidth;
  draft.height = image.naturalHeight;
  draft.marks = Array.isArray(draft.marks) ? draft.marks : [];
  const undoStack = [];

  const cloneMarks = () => JSON.parse(JSON.stringify(draft.marks));
  const remember = () => {
    undoStack.push(cloneMarks());
    if (undoStack.length > 30) undoStack.shift();
  };
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    drawSeedreamAnnotationMarks(ctx, draft.marks, canvas.width, canvas.height);
    overlay.querySelector("[data-seedream-mark-count]").textContent = `已标记 ${draft.marks.length} 处`;
  };
  const pointFromEvent = (event) => {
    const rect = canvas.getBoundingClientRect();
    return window.SeedreamTools.clampNormalizedPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  };
  const cleanup = () => {
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    if (activeSeedreamAnnotationEditor === cleanup) activeSeedreamAnnotationEditor = null;
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") cleanup();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (undoStack.length) {
        draft.marks = undoStack.pop();
        draw();
      }
    }
  };
  activeSeedreamAnnotationEditor = cleanup;
  document.addEventListener("keydown", onKeydown);

  overlay.addEventListener("click", (event) => {
    const toolButton = event.target.closest("[data-seedream-tool]");
    if (toolButton) {
      tool = toolButton.dataset.seedreamTool;
      overlay.querySelectorAll("[data-seedream-tool]").forEach((button) => button.classList.toggle("active", button === toolButton));
      return;
    }
    const action = event.target.closest("[data-seedream-editor-action]")?.dataset.seedreamEditorAction;
    if (action === "close") cleanup();
    if (action === "undo" && undoStack.length) {
      draft.marks = undoStack.pop();
      draw();
    }
    if (action === "clear" && draft.marks.length) {
      remember();
      draft.marks = [];
      draw();
    }
    if (action === "apply") {
      commitHistory();
      updateNode(nodeId, { annotation: draft });
      cleanup();
      showToast(`已保存 ${draft.marks.length} 处空间标记`);
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      const rect = canvas.getBoundingClientRect();
      const tolerance = 14 / Math.max(1, Math.min(rect.width, rect.height));
      const index = window.SeedreamTools.findAnnotationMarkAt(draft.marks, point, tolerance);
      if (index >= 0) {
        remember();
        draft.marks.splice(index, 1);
        draw();
      }
      return;
    }
    remember();
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    if (tool === "point") {
      draft.marks.push({ type: "point", ...point });
      pointerId = null;
    } else if (tool === "box" || tool === "arrow") {
      activeMark = { type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
      draft.marks.push(activeMark);
    } else if (tool === "brush") {
      activeMark = { type: "brush", points: [point] };
      draft.marks.push(activeMark);
    }
    draw();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId || !activeMark) return;
    const point = pointFromEvent(event);
    if (activeMark.type === "box" || activeMark.type === "arrow") {
      activeMark.x2 = point.x;
      activeMark.y2 = point.y;
    } else if (activeMark.type === "brush") {
      activeMark.points.push(point);
    }
    draw();
  });

  const finishPointer = (event) => {
    if (pointerId !== event.pointerId) return;
    if (activeMark?.type === "brush") activeMark.points = window.SeedreamTools.simplifyNormalizedPath(activeMark.points);
    pointerId = null;
    activeMark = null;
    draw();
  };
  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);
  draw();
}

function pickImageFile(fileList) {
  return Array.from(fileList || []).find((file) => String(file.type || "").startsWith("image/"));
}

// ============ 载入视频（复用图片那套 IndexedDB blob 存储） ============
function pickVideoFile(fileList) {
  return Array.from(fileList || []).find((file) => String(file.type || "").startsWith("video/"));
}

async function persistVideoBlob(blob) {
  if (!blob) throw new Error("空文件");
  if (!String(blob.type || "").startsWith("video/")) throw new Error("仅支持视频文件");
  const id = makeId();
  await putImageAsset({ id, blob, type: blob.type || "video/mp4", createdAt: new Date().toISOString() });
  imageAssetObjectUrls.set(id, URL.createObjectURL(blob));
  return `${imageAssetPrefix}${id}`;
}

function ratioFromDimensions(width, height) {
  return window.KlingProvider?.videoMetadataRatio({ source: "metadata", width, height, currentRatio: "" }) || "";
}

function probeVideoRatio(src) {
  return new Promise((resolve) => {
    if (!src) return resolve("");
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    probe.onloadedmetadata = () => resolve(ratioFromDimensions(probe.videoWidth, probe.videoHeight));
    probe.onerror = () => resolve("");
    probe.src = src;
  });
}

async function loadVideoFileIntoNode(file, nodeId) {
  const node = getNode(nodeId);
  if (!node || node.type !== "video") return false;
  try {
    const sentinel = await persistVideoBlob(file);
    const ratio = await probeVideoRatio(imageAssetObjectUrls.get(getIndexedImageId(sentinel)));
    commitHistory();
    updateNode(nodeId, { url: sentinel, loading: false, error: "", gradient: "", taskId: "", ...(ratio ? { ratio } : {}) });
    showToast("已载入视频");
    return true;
  } catch (error) {
    showToast(`载入失败：${error.message}`);
    return false;
  }
}

function triggerVideoUpload(nodeId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file) await loadVideoFileIntoNode(file, nodeId);
  });
  input.click();
}

async function createUploadedVideoNode(file, position) {
  const id = addNode("video", position || getViewportCenter(), { label: "载入视频", url: false });
  if (file) await loadVideoFileIntoNode(file, id);
  else triggerVideoUpload(id);
  return id;
}

// ============ 3D 模型预览节点 ============
const model3dFormats = ["glb", "gltf", "obj", "fbx", "stl"];

function addDirector3dNode(position) {
  const id = addNode("model3dPreview", position || getViewportCenter(), {
    label: "3D 导演台", director: true, renderMode: "material", view: window.Director3D.initialView(), directorData: window.Director3D.normalize(),
  });
  nodeMenu.hidden = true;
  openModel3dEditor(id);
  return id;
}

function detectModelFormat(filename) {
  const ext = String(filename || "").split(".").pop().toLowerCase();
  return model3dFormats.includes(ext) ? ext : "";
}

// 模型文件直接复用图片那套 IndexedDB（images store 本质是通用 blob 存储）。
async function persistModelBlob(blob, name) {
  const id = makeId();
  await putImageAsset({ id, blob, type: blob.type || "model", name: name || "", createdAt: new Date().toISOString() });
  return id;
}

async function getModelBlob(assetId) {
  if (!assetId) return null;
  const record = await getImageAsset(assetId);
  return record?.blob || null;
}

function triggerModelUpload(nodeId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".glb,.gltf,.obj,.fbx,.stl";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const format = detectModelFormat(file.name);
    if (!format) {
      showToast("仅支持 glb / gltf / obj / fbx / stl");
      return;
    }
    try {
      const assetId = await persistModelBlob(file, file.name);
      if (activeModel3dEditor?.nodeId === nodeId) activeModel3dEditor.close();
      commitHistory();
      // 换模型时清掉旧截图与视角，避免对不上。
      updateNode(nodeId, { modelAssetId: assetId, modelName: file.name, modelFormat: format, url: false, view: getNode(nodeId)?.data.director ? getNode(nodeId).data.view : null });
      showToast("已载入模型，点击「调整视角」取景");
      openModel3dEditor(nodeId);
    } catch (error) {
      showToast(`载入失败：${error.message}`);
    }
  });
  input.click();
}

let activeModel3dEditor = null;

async function openModel3dEditor(nodeId) {
  const node = getNode(nodeId);
  if (!node || node.type !== "model3dPreview") return;
  const isDirector = Boolean(node.data.director);
  if (!node.data.modelAssetId && !isDirector) {
    triggerModelUpload(nodeId);
    return;
  }
  if (!window.Model3D || !window.Model3D.available) {
    showToast("3D 模块未就绪（WebGL 或 three.js 加载失败）");
    return;
  }
  if (activeModel3dEditor) activeModel3dEditor.close();

  const modeOptions = [
    ["material", "原始材质"],
    ["clay", "素模"],
    ["depth", "深度图"],
    ["normal", "法线图"],
    ["wireframe", "线框"],
  ];
  const initialMode = node.data.renderMode || "clay";
  const initialFov = node.data.view?.shot?.fov || node.data.view?.fov || 35;
  const savedView = node.data.view || {};
  // 比例优先跟连接的文生图同步；没连就用上次保存的，再没有用 1:1。
  let selectedRatio = aspectLabelFromImageConfigs(nodeId) || savedView.aspect || "1:1";
  let maskAlpha = typeof savedView.maskAlpha === "number" ? savedView.maskAlpha : 0.6;
  let showGrid = Boolean(savedView.showGrid);
  let envBg = Boolean(savedView.envBackground);
  const initialEnv = typeof savedView.envIntensity === "number" ? savedView.envIntensity : 1;
  let shadowOn = savedView.shadow !== false; // 默认开
  let aoOn = Boolean(savedView.ao);
  const initialAoRadius = typeof savedView.aoRadius === "number" ? savedView.aoRadius : 0.5;

  const overlay = document.createElement("div");
  overlay.className = `model3d-overlay${isDirector ? " director3d-overlay" : ""}`;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", isDirector ? "3D 导演台" : "3D 取景");
  overlay.innerHTML = `
    <div class="model3d-dialog">
      <header class="model3d-head">
        <span class="model3d-title">${isDirector ? "3D 导演台" : "3D 取景"} · ${escapeHtml(node.data.modelName || (isDirector ? "场景排练" : "模型"))}</span>
        <span class="model3d-head-actions">
          <button class="model3d-close" data-m3d="fullscreen" title="全屏 / 还原">⛶</button>
          <button class="model3d-close" data-m3d="cancel" title="关闭">✕</button>
        </span>
      </header>
      <div class="model3d-body">
        <div class="model3d-stage" data-m3d="stage">
        <div class="model3d-mask" data-m3d="mask"><div class="model3d-mask-window" data-m3d="maskwin"></div></div>
        <div class="model3d-loading" data-m3d="loading">正在准备场景…</div>
        <div class="model3d-tools" data-m3d="tools">
          <span class="m3d-tools-title">添加</span>
          <button data-m3d="add" data-kind="box" title="立方体">▢</button>
          <button data-m3d="add" data-kind="sphere" title="球体">◯</button>
          <button data-m3d="add" data-kind="cone" title="圆锥">△</button>
          <button data-m3d="add" data-kind="cylinder" title="圆柱">⬭</button>
          <button data-m3d="add" data-kind="plane" title="平面">▭</button>
          <button data-m3d="add" data-kind="torus" title="圆环">◎</button>
          <span class="m3d-tools-title">灯光</span>
          <button data-m3d="addlight" data-kind="directional" title="平行光">☀</button>
          <button data-m3d="addlight" data-kind="point" title="点光">●</button>
          <button data-m3d="addlight" data-kind="spot" title="聚光">◗</button>
        </div>
        <div class="model3d-gizmo" data-m3d="gizmobar">
          <button data-m3d="gmode" data-mode="translate" class="active" title="移动 (W)">移动</button>
          <button data-m3d="gmode" data-mode="rotate" title="旋转 (E)">旋转</button>
          <button data-m3d="gmode" data-mode="scale" title="缩放 (R)">缩放</button>
          <span class="m3d-sep"></span>
          <button data-m3d="gspace" title="世界 / 本地坐标系">世界</button>
          <button data-m3d="gdel" title="删除选中 (Del)">删除</button>
          <span class="m3d-sep"></span>
          <button data-m3d="grid" title="地面网格显示/隐藏">地面</button>
          <button data-m3d="bg" title="HDR 背景显示/隐藏">背景</button>
          <span class="m3d-sep"></span>
          <button data-m3d="shadow" title="投影显示/隐藏">投影</button>
          <button data-m3d="ao" title="环境光遮蔽 AO 开关">AO</button>
        </div>
        </div>
        <aside class="model3d-side">
          <div class="model3d-side-title">场景对象</div>
          <div class="model3d-outliner" data-m3d="outliner"></div>
          <div class="model3d-props" data-m3d="props">未选中对象</div>
        </aside>
      </div>
      <footer class="model3d-foot">
        <label class="model3d-ctl">渲染
          <select data-m3d="mode">${modeOptions.map(([v, l]) => `<option value="${v}" ${v === initialMode ? "selected" : ""}>${l}</option>`).join("")}</select>
        </label>
        <label class="model3d-ctl model3d-fov">焦段
          <input type="range" min="10" max="90" step="1" value="${initialFov}" data-m3d="fov">
          <span data-m3d="fovlabel"></span>
        </label>
        <label class="model3d-ctl">比例
          <select data-m3d="ratio">${model3dRatios.map(([l]) => `<option value="${l}" ${l === selectedRatio ? "selected" : ""}>${l}</option>`).join("")}</select>
        </label>
        <label class="model3d-ctl model3d-maskctl">遮罩
          <input type="range" min="0" max="90" step="5" value="${Math.round(maskAlpha * 100)}" data-m3d="maskalpha">
        </label>
        <label class="model3d-ctl model3d-maskctl">环境
          <input type="range" min="0" max="300" step="5" value="${Math.round(initialEnv * 100)}" data-m3d="env">
        </label>
        <label class="model3d-ctl">环境色
          <input type="color" data-m3d="bgcolor" value="${savedView.background || "#f0f1f5"}">
        </label>
        <label class="model3d-ctl model3d-maskctl">AO宽
          <input type="range" min="0" max="100" step="5" value="${Math.round(initialAoRadius * 100)}" data-m3d="aorad">
        </label>
        <button class="node-button model3d-viewbtn" data-m3d="viewmode" title="在取景相机与自由观察视角之间切换">视角：摄像机</button>
        <button class="node-secondary-button model3d-panbtn" data-m3d="panmode" aria-pressed="false">操作：旋转</button>
        <button class="node-secondary-button" data-m3d="reset" title="回到标准机位">重置视角</button>
        <span class="model3d-hint" data-m3d="hint">左键旋转 · 右键/方向键平移 · 滚轮缩放</span>
        <div class="model3d-actions">
          <button class="node-secondary-button" data-m3d="cancel">保存并关闭</button>
          <button class="node-button" data-m3d="capture">${isDirector ? "输出当前参考帧" : "截取并应用"}</button>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(overlay);

  const dialogEl = overlay.querySelector(".model3d-dialog");
  const stage = overlay.querySelector('[data-m3d="stage"]');
  const loadingEl = overlay.querySelector('[data-m3d="loading"]');
  const fovInput = overlay.querySelector('[data-m3d="fov"]');
  const fovLabel = overlay.querySelector('[data-m3d="fovlabel"]');
  const modeSelect = overlay.querySelector('[data-m3d="mode"]');
  const ratioSelect = overlay.querySelector('[data-m3d="ratio"]');
  const maskEl = overlay.querySelector('[data-m3d="mask"]');
  const maskWin = overlay.querySelector('[data-m3d="maskwin"]');
  const outliner = overlay.querySelector('[data-m3d="outliner"]');
  const props = overlay.querySelector('[data-m3d="props"]');

  const fovToMm = (fov) => Math.round(12 / Math.tan((Number(fov) * Math.PI) / 360));
  const updateFovLabel = () => { fovLabel.textContent = `≈${fovToMm(fovInput.value)}mm`; };
  updateFovLabel();

  // 黑边遮罩：只在取景视角显示，按所选比例在画面中心留出取景窗，四周半透明黑。
  const updateMask = () => {
    const inShot = !controller || controller.getViewMode() === "shot";
    maskEl.style.display = inShot ? "block" : "none";
    if (!inShot) return;
    const cw = stage.clientWidth || 1;
    const ch = stage.clientHeight || 1;
    const ar = ratioNumOf(selectedRatio);
    let w;
    let h;
    if (cw / ch > ar) { h = ch; w = ch * ar; } else { w = cw; h = cw / ar; }
    maskWin.style.width = `${Math.round(w)}px`;
    maskWin.style.height = `${Math.round(h)}px`;
    maskWin.style.boxShadow = `0 0 0 9999px rgba(0,0,0,${maskAlpha})`;
  };

  // 对象列表（Outliner）：列出场景对象，点选高亮。
  const objIcon = { model: "◈", primitive: "▢", light: "☀" };
  const lightTypeLabel = { directional: "平行光", point: "点光", spot: "聚光" };
  const primTypeLabel = { box: "立方体", sphere: "球体", cone: "圆锥", cylinder: "圆柱", plane: "平面", torus: "圆环", actor: "站姿角色", seatedActor: "坐姿角色" };
  function buildOutliner() {
    if (!controller) { outliner.innerHTML = ""; return; }
    const objs = controller.getObjects();
    if (!objs.length) { outliner.innerHTML = `<div class="m3d-insp-note" style="padding:8px">场景为空</div>`; return; }
    outliner.innerHTML = objs.map((o) =>
      `<button class="m3d-obj ${o.selected ? "active" : ""}" data-obj="${o.id}"><span class="m3d-obj-ico">${objIcon[o.kind] || "•"}</span>${escapeHtml(o.label)}</button>`,
    ).join("");
  }
  // 属性区（Outliner 下方）：按选中对象显示灯参数 / 材质通道。
  function buildProps(info) {
    if (!info || !info.kind) {
      // 未选中对象 → 显示取景相机的对焦/裁剪（C4D 式）。
      const clip = controller ? controller.getCameraClip() : null;
      if (!clip) { props.innerHTML = `<div class="m3d-insp-note">未选中对象</div>`; return; }
      const u = clip.unit;
      const f = (n) => Number(n).toFixed(3);
      const sliders = clip.enabled
        ? `<label>对焦 <input type="range" data-cam="focus" min="${f(u * 0.1)}" max="${f(u * 10)}" step="${f(u * 0.02)}" value="${clip.focus}"></label>
           <label>前景 <input type="range" data-cam="front" min="0" max="${f(u * 8)}" step="${f(u * 0.02)}" value="${clip.front}"></label>
           <label>背景 <input type="range" data-cam="back" min="${f(u * 0.1)}" max="${f(u * 30)}" step="${f(u * 0.05)}" value="${clip.back}"></label>
           <div class="m3d-insp-note">自由视角可见对焦平面 + 裁剪视锥</div>`
        : `<div class="m3d-insp-note">开启后可调对焦点与前/后景裁剪，限制取景框视锥长度</div>`;
      props.innerHTML = `
        <div class="m3d-insp-title">取景相机</div>
        <label class="m3d-toggle"><input type="checkbox" data-cam-enabled ${clip.enabled ? "checked" : ""}> 对焦裁剪</label>
        ${sliders}`;
      props.querySelector("[data-cam-enabled]").addEventListener("change", (ev) => {
        controller.setClipEnabled(ev.target.checked);
        buildProps(controller.getSelectionInfo());
      });
      props.querySelectorAll('input[type="range"][data-cam]').forEach((inp) => {
        inp.addEventListener("input", () => controller.setCameraClip({ [inp.dataset.cam]: Number(inp.value) }));
      });
      return;
    }
    if (info.kind === "primitive") {
      props.innerHTML = `
        <div class="m3d-insp-title">零件 · ${primTypeLabel[info.primKind] || info.primKind}</div>
        <label>颜色 <input type="color" data-prim="color" value="${info.color || "#bcbcc4"}"></label>
        <div class="m3d-insp-note">移动/旋转/缩放 (W/E/R) · Del 删除 · 颜色仅原始材质模式可见</div>`;
      props.querySelector('[data-prim="color"]').addEventListener("input", (ev) => controller.setPrimitiveColor(ev.target.value));
      return;
    }
    if (info.kind === "light") {
      props.innerHTML = `
        <div class="m3d-insp-title">灯光 · ${lightTypeLabel[info.lightType] || info.lightType}</div>
        <label>强度 <input type="range" data-insp="intensity" min="0" max="10" step="0.1" value="${info.intensity}"><b data-insp="intensityval">${(+info.intensity).toFixed(1)}</b></label>
        <label>颜色 <input type="color" data-insp="color" value="${info.color}"></label>
        <div class="m3d-insp-note">Del 删除此灯</div>`;
      props.querySelector('[data-insp="intensity"]').addEventListener("input", (ev) => {
        controller.setLightParam("intensity", ev.target.value);
        props.querySelector('[data-insp="intensityval"]').textContent = (+ev.target.value).toFixed(1);
      });
      props.querySelector('[data-insp="color"]').addEventListener("input", (ev) => controller.setLightParam("color", ev.target.value));
      return;
    }
    if (info.kind === "model") {
      const c = info.channels;
      if (!c) { props.innerHTML = `<div class="m3d-insp-title">材质</div><div class="m3d-insp-note">该模型无可调标准材质</div>`; return; }
      props.innerHTML = `
        <div class="m3d-insp-title">材质（全模型）</div>
        <label>金属度 <input type="range" data-insp="metalness" min="0" max="1" step="0.01" value="${c.metalness}"></label>
        <label>粗糙度 <input type="range" data-insp="roughness" min="0" max="1" step="0.01" value="${c.roughness}"></label>
        <label>反射 <input type="range" data-insp="envMapIntensity" min="0" max="3" step="0.05" value="${c.envMapIntensity}"></label>
        <label>自发光 <input type="range" data-insp="emissiveIntensity" min="0" max="3" step="0.05" value="${c.emissiveIntensity}"></label>
        <label>基础色 <input type="color" data-insp="color" value="${c.color}"></label>
        <div class="m3d-insp-note">仅「原始材质」模式可见</div>`;
      props.querySelectorAll("input[data-insp]").forEach((inp) => {
        inp.addEventListener("input", () => controller.setMaterialChannel(inp.dataset.insp, inp.value));
      });
    }
  }
  function refreshPanel() {
    buildOutliner();
    buildProps(controller ? controller.getSelectionInfo() : null);
    if (isDirector && controller?.hasSelection()) {
      const transform = controller.getSelectedTransform();
      const panel = document.createElement("div");
      panel.className = "director-transform";
      panel.innerHTML = `<label>名称 <input aria-label="对象名称" data-transform-name value="${escapeHtml(transform.name || "")}" maxlength="80"></label>${[["position", "位置"], ["rotation", "旋转°"], ["scale", "缩放"]].map(([key, label]) => `<div><span>${label}</span>${transform[key].map((v, i) => `<input aria-label="${label}${["X", "Y", "Z"][i]}" type="number" step="${key === "rotation" ? 5 : 0.1}" value="${Number(v.toFixed(2))}" data-transform="${key}" data-axis="${i}">`).join("")}</div>`).join("")}`;
      panel.querySelector("[data-transform-name]").addEventListener("input", (event) => {
        controller.renameSelected(event.target.value, false); buildOutliner(); scheduleSceneSave();
      });
      panel.querySelectorAll("[data-transform]").forEach((input) => input.addEventListener("input", () => {
        if (input.value === "" || !input.validity.valid) return;
        controller.setSelectedTransform(input.dataset.transform, Number(input.dataset.axis), Number(input.value)); scheduleSceneSave();
      }));
      props.prepend(panel);
    }
  }

  let controller = null;
  let directorUI = null;
  let loaded = false;
  let closed = false;
  let captureBusy = false;
  let sceneSaveTimer = null;
  const focusBeforeOpen = document.activeElement;
  const saveScene = (directorData = directorUI?.getData()) => {
    if (!controller || !loaded || closed) return;
    const st = controller.getState();
    Object.assign(st, { aspect: selectedRatio, maskAlpha, showGrid });
    updateNode(nodeId, { view: st, renderMode: st.renderMode, ...(directorData ? { directorData } : {}) });
  };
  const scheduleSceneSave = () => {
    if (!isDirector || closed) return;
    clearTimeout(sceneSaveTimer);
    sceneSaveTimer = setTimeout(() => saveScene(), 250);
  };
  const onPageHide = () => saveScene();
  const syncCamera = () => {
    fovInput.value = Math.round(controller.getFov()); updateFovLabel(); updateMask();
    const inShot = controller.getViewMode() === "shot";
    overlay.querySelector('[data-m3d="viewmode"]').textContent = inShot ? "视角：摄像机" : "视角：自由";
    overlay.querySelector('[data-m3d="viewmode"]').classList.toggle("free", !inShot);
  };
  const exportDirectorFrames = async (frames, motion = null) => {
    const projectId = projectLibrary.activeProjectId;
    const sources = await Promise.all(frames.map(async (frame) => persistImageBlob(await (await fetch(frame.url)).blob())));
    if (projectLibrary.activeProjectId !== projectId || !getNode(nodeId)) throw new Error("项目已切换，请回到原项目重新输出");
    commitHistory();
    const source = getNode(nodeId);
    const startX = source.position.x + 370;
    const startY = source.position.y + state.nodes.filter((n) => n.data.directorSource === nodeId).length * 45;
    frames.forEach((frame, index) => {
      const outputId = addNode("image", { x: startX + index * 335, y: startY }, {
        label: frame.label, url: sources[index], directorSource: nodeId, directorCamera: frame.camera, directorMotion: motion,
      });
      addEdge(nodeId, outputId, "output", { label: frame.label });
    });
    updateNode(nodeId, { url: sources[0] });
    saveScene();
  };
  const onResize = () => { if (controller) controller.resize(); updateMask(); };
  const syncGizmoButtons = () => {
    const m = controller?.getGizmoMode?.() || "translate";
    overlay.querySelectorAll('[data-m3d="gmode"]').forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  };

  const cleanup = () => {
    if (closed) return;
    clearTimeout(sceneSaveTimer);
    directorUI?.stop();
    saveScene();
    closed = true;
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("pagehide", onPageHide);
    // 关闭即保存场景（零件 + 视角），无论取消还是截取——摆场景和出图是两件事。
    directorUI?.dispose();
    if (controller) {
      try { controller.dispose(); } catch (_) {}
    }
    controller = null;
    overlay.remove();
    activeModel3dEditor = null;
    if (focusBeforeOpen?.isConnected) focusBeforeOpen.focus();
  };
  const onKey = (e) => {
    if (e.key === "Tab") {
      const items = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), canvas')].filter((el) => el.getClientRects().length);
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      if (e.key === "Escape") cleanup();
      return;
    }
    if (e.key === "Escape") {
      if (controller?.hasSelection()) controller.deselect();
      else cleanup();
      return;
    }
    if (!controller) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "c" || e.key === "C") { e.preventDefault(); controller.copySelected(); }
      else if (e.key === "v" || e.key === "V") { e.preventDefault(); controller.pasteClipboard(); }
      return; // 带修饰键时不触发下面的单键快捷键
    }
    if (e.key === "w" || e.key === "W") { controller.setGizmoMode("translate"); syncGizmoButtons(); }
    else if (e.key === "e" || e.key === "E") { controller.setGizmoMode("rotate"); syncGizmoButtons(); }
    else if (e.key === "r" || e.key === "R") { controller.setGizmoMode("scale"); syncGizmoButtons(); }
    else if (e.key === "Delete" || e.key === "Backspace") { controller.deleteSelected(); }
  };

  activeModel3dEditor = { nodeId, close: cleanup };

  let panMode = false;
  overlay.addEventListener("click", async (e) => {
    const objBtn = e.target.closest("[data-obj]");
    if (objBtn) { if (controller) controller.selectById(objBtn.dataset.obj); return; }
    const act = e.target.closest("[data-m3d]")?.dataset.m3d;
    if (act === "cancel") { cleanup(); return; }
    if (act === "viewmode") {
      if (!controller) return;
      const mode = controller.toggleViewMode();
      const btn = overlay.querySelector('[data-m3d="viewmode"]');
      const hint = overlay.querySelector('[data-m3d="hint"]');
      const inShot = mode === "shot";
      btn.textContent = inShot ? "视角：摄像机" : "视角：自由";
      btn.classList.toggle("free", !inShot);
      hint.textContent = inShot
        ? "取景视角 · 黑框内即截图所得"
        : "自由观察 · 框内是取景相机拍的范围 · 截图仍截取景相机";
      updateMask();
      return;
    }
    if (act === "fullscreen") {
      dialogEl.classList.toggle("fullscreen");
      requestAnimationFrame(() => { if (controller) controller.resize(); updateMask(); });
      return;
    }
    if (act === "grid") {
      if (!controller) return;
      showGrid = !showGrid;
      controller.setGrid(showGrid);
      e.target.closest("[data-m3d='grid']").classList.toggle("active", showGrid);
      return;
    }
    if (act === "bg") {
      if (!controller) return;
      envBg = !envBg;
      controller.setEnvBackground(envBg);
      e.target.closest("[data-m3d='bg']").classList.toggle("active", envBg);
      return;
    }
    if (act === "shadow") {
      if (!controller) return;
      shadowOn = !shadowOn;
      controller.setShadow(shadowOn);
      e.target.closest("[data-m3d='shadow']").classList.toggle("active", shadowOn);
      return;
    }
    if (act === "ao") {
      if (!controller) return;
      aoOn = !aoOn;
      controller.setAO(aoOn);
      e.target.closest("[data-m3d='ao']").classList.toggle("active", aoOn);
      return;
    }
    if (act === "reset") {
      if (controller) { controller.resetView(); fovInput.value = Math.round(controller.getFov()); updateFovLabel(); }
      return;
    }
    if (act === "panmode") {
      if (!controller) return;
      panMode = !panMode;
      controller.setPanMode(panMode);
      const btn = overlay.querySelector('[data-m3d="panmode"]');
      btn.textContent = panMode ? "操作：平移" : "操作：旋转";
      btn.setAttribute("aria-pressed", String(panMode));
      btn.classList.toggle("active", panMode);
      return;
    }
    if (act === "add") {
      if (controller) controller.addPrimitive(e.target.closest("[data-kind]")?.dataset.kind);
      return;
    }
    if (act === "addlight") {
      if (controller) controller.addLight(e.target.closest("[data-kind]")?.dataset.kind);
      return;
    }
    if (act === "gmode") {
      if (controller) { controller.setGizmoMode(e.target.closest("[data-mode]")?.dataset.mode); syncGizmoButtons(); }
      return;
    }
    if (act === "gspace") {
      if (controller) {
        const sp = controller.getGizmoSpace() === "local" ? "world" : "local";
        controller.setGizmoSpace(sp);
        const b = overlay.querySelector('[data-m3d="gspace"]');
        b.textContent = sp === "local" ? "本地" : "世界";
        b.classList.toggle("active", sp === "local");
      }
      return;
    }
    if (act === "gdel") {
      if (controller) controller.deleteSelected();
      return;
    }
    if (act === "capture") {
      if (!controller || !loaded || captureBusy) return;
      captureBusy = true;
      directorUI?.stop();
      try {
        const dataUrl = controller.capture("image/png", ratioNumOf(selectedRatio));
        if (isDirector) {
          await exportDirectorFrames([{ label: "导演台参考帧", url: dataUrl, camera: controller.getShot() }]);
          showToast("参考帧已输出到画布");
          return;
        }
        // 始终写 IndexedDB（不走 persistImageSource 的 120KB 阈值），避免 base64 进 localStorage 撑爆配额。
        const blob = await (await fetch(dataUrl)).blob();
        const sentinel = await persistImageBlob(blob);
        commitHistory();
        const st = controller.getState();
        st.aspect = selectedRatio;
        st.maskAlpha = maskAlpha;
        st.showGrid = showGrid;
        updateNode(nodeId, { url: sentinel, view: st, renderMode: st.renderMode });
        showToast("已截取当前比例画面，可连线到图片生成节点作参考");
        cleanup();
      } catch (error) {
        showToast(`截取失败：${error.message}`);
      } finally {
        captureBusy = false;
      }
    }
  });
  // 浮层背景点击关闭
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) cleanup();
    else if (!e.target.closest(".director-timeline")) directorUI?.stop();
  });
  overlay.addEventListener("change", scheduleSceneSave);
  overlay.addEventListener("click", scheduleSceneSave);

  try {
    controller = window.Model3D.mount(stage, { renderMode: initialMode, director: isDirector, onSelectionChange: refreshPanel, onChange: scheduleSceneSave });
    fovInput.addEventListener("input", () => { controller.setFov(fovInput.value); updateFovLabel(); });
    modeSelect.addEventListener("change", () => controller.setRenderMode(modeSelect.value));
    ratioSelect.addEventListener("change", () => {
      selectedRatio = ratioSelect.value;
      updateMask();
      const n = applyAspectToImageConfigs(nodeId, ratioNumOf(selectedRatio));
      if (n) showToast(`已把比例 ${selectedRatio} 同步到 ${n} 个图片生成节点`);
    });
    const maskAlphaInput = overlay.querySelector('[data-m3d="maskalpha"]');
    maskAlphaInput.addEventListener("input", () => { maskAlpha = Number(maskAlphaInput.value) / 100; updateMask(); });
    const envInput = overlay.querySelector('[data-m3d="env"]');
    envInput.addEventListener("input", () => controller.setEnvIntensity(Number(envInput.value) / 100));
    const bgColorInput = overlay.querySelector('[data-m3d="bgcolor"]');
    bgColorInput.addEventListener("input", () => controller.setBackground(bgColorInput.value));
    const aoRadInput = overlay.querySelector('[data-m3d="aorad"]');
    aoRadInput.addEventListener("input", () => controller.setAORadius(Number(aoRadInput.value) / 100));
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", onPageHide);

    if (node.data.modelAssetId) {
      const blob = await getModelBlob(node.data.modelAssetId);
      if (closed) return;
      if (!blob) throw new Error("模型文件丢失，请重新载入");
      await controller.loadModel(blob, node.data.modelFormat);
      if (closed) return;
    }
    // 还原上次视角与场景零件（若有），否则用 loadModel 的自动取景。
    if (node.data.view) controller.setState(node.data.view);
    controller.setFov(fovInput.value);
    controller.setGrid(showGrid);
    controller.setShadow(shadowOn);
    controller.setAO(aoOn);
    controller.setAORadius(initialAoRadius);
    overlay.querySelector("[data-m3d='grid']").classList.toggle("active", showGrid);
    overlay.querySelector("[data-m3d='bg']").classList.toggle("active", envBg);
    overlay.querySelector("[data-m3d='shadow']").classList.toggle("active", shadowOn);
    overlay.querySelector("[data-m3d='ao']").classList.toggle("active", aoOn);
    syncGizmoButtons();
    updateMask();
    refreshPanel();
    loaded = true;
    loadingEl.remove();
    if (isDirector) {
      directorUI = window.Director3D.mountUI({
        overlay, controller, data: node.data.directorData,
        getAspect: () => selectedRatio,
        applyAspect: (value) => { selectedRatio = value; ratioSelect.value = value; updateMask(); },
        syncCamera, save: saveScene, exportFrames: exportDirectorFrames, notice: showToast,
        importModel: () => triggerModelUpload(nodeId), escapeHtml,
      });
      controller.resize(); updateMask();
    }
    overlay.querySelector('[data-m3d="fullscreen"]').focus();
  } catch (error) {
    if (closed) return;
    if (loadingEl) loadingEl.textContent = `加载失败：${error.message}`;
    showToast(`3D 加载失败：${error.message}`);
  }
}

function findNodeAtClient(clientX, clientY, type) {
  const target = document.elementFromPoint(clientX, clientY);
  const el = target?.closest?.(".node");
  if (!el) return null;
  const node = getNode(el.dataset.id);
  return node?.type === type ? node : null;
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
  document.querySelectorAll(".generated-image[data-asset-url], .product-background-slot img[data-asset-url], video.result-video[data-asset-url]").forEach((el) => {
    const assetId = getIndexedImageId(el.dataset.assetUrl);
    if (!assetId || el.dataset.assetLoading === "1") return;
    if (imageAssetObjectUrls.has(assetId)) {
      const cached = imageAssetObjectUrls.get(assetId);
      if (el.getAttribute("src") !== cached) el.src = cached;
      return;
    }
    el.dataset.assetLoading = "1";
    loadImageAssetObjectUrl(assetId)
      .then((objectUrl) => {
        if (objectUrl && el.isConnected) el.src = objectUrl;
      })
      .catch(() => el.closest(".image-preview, .video-preview")?.classList.add("image-load-failed"))
      .finally(() => {
        delete el.dataset.assetLoading;
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

// 全部参考素材槽位：图片（含 3D 截图）走 @图片N，视频走 @视频N，两类各自独立编号。
function getReferenceMaterialSlots(targetId) {
  const items = state.edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => ({ edge, node: getNode(edge.source) }))
    .filter(({ node }) =>
      node?.type === "image" ||
      (node?.type === "layerGroup" && node.data?.url) ||
      node?.type === "video" ||
      (node?.type === "model3dPreview" && node.data?.url));
  let imageN = 0;
  let videoN = 0;
  return items.map((item) => {
    if (item.node.type === "video") {
      videoN += 1;
      return { ...item, kind: "video", number: videoN, token: `@视频${videoN}` };
    }
    imageN += 1;
    return { ...item, kind: "image", number: imageN, token: `@图片${imageN}` };
  });
}

// 仅图片槽位（文生图 / MJ / 图生图用）：从素材槽位里挑出图片并重新连续编号。
function getImageReferenceSlots(targetId) {
  return getReferenceMaterialSlots(targetId)
    .filter((slot) => slot.kind === "image")
    .map((slot, index) => ({ ...slot, number: index + 1, token: `@图片${index + 1}` }));
}

function getTextMentionOptions(textNodeId) {
  const options = outgoingNodes(textNodeId, ["imageConfig", "videoConfig"])
    .flatMap((config) => {
      // 视频配置可引用图片和视频素材，图片配置只引用图片。
      const slots = config.type === "videoConfig"
        ? getReferenceMaterialSlots(config.id)
        : getImageReferenceSlots(config.id);
      return slots.map((ref) => ({
        ...ref,
        configId: config.id,
        configLabel: config.data.label || (config.type === "videoConfig" ? "视频生成" : "图片生成"),
      }));
    });
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
  const pattern = /@(?:图片|视频)\s*\d+/g;
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
    storyboardAssistant: { label: "分镜助手", model: getDefaultModel("chat"), requirements: "", output: "" },
    promptOptimizer: {
      label: "提示词优化",
      model: getDefaultModel("chat"),
      fields: { subject: "", structure: "", material: "", lighting: "", style: "", composition: "" },
    },
    imageConfig: {
      label: "图片生成",
      model: getDefaultModel("image"),
      quality: "标准画质",
      size: getImageSizeValue(getDefaultModel("image"), "2048x2048"),
      outputFormat: "png",
      promptOptimization: "standard",
    },
    image: { label: "图片节点", url: false },
    imageCompare: { label: "图片对比", split: 50 },
    imageExpand: { label: "图片扩展", padL: 0, padR: 0, padT: 0, padB: 0, lockRatio: false, prompt: "", model: getDefaultModel("image") },
    styleTransferConfig: {
      label: "风格迁移",
      model: getDefaultModel("image"),
      size: getImageSizeValue(getDefaultModel("image"), "2048x2048"),
      quality: "高清画质",
      outputFormat: "png",
      promptOptimization: "standard",
      strength: "balanced",
      extra: "",
    },
    materialTransferConfig: {
      label: "材质迁移",
      model: getDefaultModel("image"),
      size: getImageSizeValue(getDefaultModel("image"), "2048x2048"),
      quality: "高清画质",
      outputFormat: "png",
      promptOptimization: "standard",
      strength: "balanced",
      materialHint: "",
      extra: "",
    },
    productBackgroundConfig: {
      label: "产品换背景",
      model: getDefaultModel("image"),
      size: getImageSizeValue(getDefaultModel("image"), "2048x2048"),
      quality: "高清画质",
      outputFormat: "png",
      promptOptimization: "standard",
      aspectSource: "product",
      extra: "",
    },
    faceSwapConfig: { label: "换脸", model: getDefaultModel("image"), size: getImageSizeValue(getDefaultModel("image"), "2048x2048"), quality: "高清画质", extra: "" },
    seedreamEdit: {
      label: "精确图片编辑",
      providerId: "volc",
      model: "doubao-seedream-5-0-pro-260628",
      size: "2048x2048",
      outputFormat: "png",
      promptOptimization: "standard",
      prompt: "",
      annotation: { version: 1, width: 0, height: 0, marks: [] },
    },
    layerSeparation: {
      label: "智能图层分离",
      providerId: "volc",
      model: "doubao-seedream-5-0-pro-260628",
      prompt: "",
      size: "auto",
      promptOptimization: "standard",
      seed: 0,
      error: "",
      pendingLayerResponse: null,
      pendingLayerSourceRevision: "",
    },
    layerGroup: {
      label: "图层组",
      width: 1,
      height: 1,
      sourceNodeId: "",
      compositeAssetId: "",
      selectedLayerId: "",
      url: "",
      layers: [],
    },
    model3dPreview: { label: "3D 模型预览", url: false, modelAssetId: "", modelName: "", modelFormat: "", renderMode: "clay", view: null },
    videoConfig: { label: "视频生成", model: getDefaultModel("video"), videoMode: "reference", ratio: "16:9", resolution: "720p", seconds: 8 },
    video: { label: "视频节点", url: false },
    storyboardConfig: {
      label: "故事板生成",
      pathway: "temporal-dense-meta",
      subject: "",
      genre: "classical-dance",
      cellCount: 16,
      gridLayout: "4x4",
      characterFace: "",
      characterOutfit: "",
      characterTemperament: "",
      perspective: "eye-level",
      composition: "4x4-grid",
      paletteCommitment: "",
      aestheticDirection: "dreamy",
      physicsDirection: "realistic",
      sceneAtmosphere: "",
      decorativeDetails: "",
      cameraLanguage: "",
      narrativeArc: "",
      extraReverseConstraints: "",
      model: getDefaultModel("image"),
      size: getImageSizeValue(getDefaultModel("image"), "1536x1024"),
    },
    templateImageConfig: (() => {
      const templates = (typeof window !== "undefined" && window.IMAGE_TEMPLATES) || {};
      const firstKey = Object.keys(templates)[0] || "";
      const tpl = templates[firstKey] || {};
      return {
        label: "营销物料",
        template: firstKey,
        ...(tpl.defaults || {}),
        model: getDefaultModel("image"),
        size: getImageSizeValue(getDefaultModel("image"), tpl.size || "1024x1536"),
      };
    })(),
  };
  const node = {
    id: makeId(),
    type,
    position: { x: position.x, y: position.y },
    data: { ...defaults[type], ...data },
  };
  ensureNodeProvider(node);
  state.nodes = [...state.nodes, node];
  setSelectedNodes([node.id]);
  nodeMenu.hidden = true;
  saveState();
  render();
  return node.id;
}

function addImageTemplateNode(templateKey, position = getViewportCenter()) {
  const templates = (typeof window !== "undefined" && window.IMAGE_TEMPLATES) || {};
  const tpl = templates[templateKey];
  if (!tpl) {
    showToast("找不到指定的营销物料模板");
    return null;
  }
  return addNode("templateImageConfig", position, {
    label: tpl.label || "营销物料",
    template: templateKey,
    ...(tpl.defaults || {}),
    size: getImageSizeValue(getDefaultModel("image"), tpl.size || "1024x1536"),
  });
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

function hasApiKey(kind = "chat", providerId = "") {
  const group = backendConfig.providers?.[kind];
  if (!group) return false;
  const pid = providerId && group.items[providerId] ? providerId : group.default;
  const provider = group.items?.[pid];
  return window.KlingProvider?.isCallableProvider(provider) ?? Boolean(provider?.configured);
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
    const errorValue = data?.error;
    const message = (typeof errorValue === "string" ? errorValue : errorValue?.message)
      || data?.message
      || data?.raw
      || `HTTP ${response.status}`;
    if (response.status === 401 && typeof bootstrap === "function") {
      currentAuthUser = null;
      renderUserBadge();
      appShell.hidden = true;
      projectHome.hidden = true;
      authOverlay.hidden = false;
    }
    if (response.status === 402) {
      void refreshAuthUser();
    }
    const error = new Error(message);
    error.status = response.status;
    error.statusCode = response.status;
    throw error;
  }
  if (response.ok && path.startsWith("/api/") && !path.startsWith("/api/auth/") && !path.startsWith("/api/billing/")) {
    void refreshAuthUser();
  }
  return data;
}

const seedreamImageSizes = [
  ["1024x1024", "1:1 · 1024×1024"],
  ["1536x1024", "3:2 · 1536×1024"],
  ["2048x2048", "1:1 · 2048×2048"],
  ["4096x2160", "16:9 · 4096×2160"],
];
const seedream5ProImageSizes = window.SeedreamTools?.PRO_IMAGE_SIZES || [];
const seedream5ImageSizes = window.SeedreamTools?.LITE_IMAGE_SIZES || [];
const gptImageSizes = [
  ["1024x1024", "1:1 · 1024×1024"],
  ["1536x1024", "3:2 · 1536×1024"],
  ["1024x1536", "9:16 · 1024×1536"],
];
const gptImage2ExtraSizes = [
  ["2048x2048", "1:1 · 2048×2048 · 2K"],
  ["2048x1152", "16:9 · 2048×1152 · 2K"],
  ["1152x2048", "9:16 · 1152×2048 · 2K"],
  ["3072x1024", "3:1 · 3072×1024 · 超宽"],
  ["1024x3072", "1:3 · 1024×3072 · 超高"],
];
const fluxImageRatios = [
  ["1:1", "1:1 方形"],
  ["16:9", "16:9 横屏"],
  ["9:16", "9:16 竖屏"],
  ["21:9", "21:9 超宽"],
  ["3:2", "3:2"],
  ["2:3", "2:3"],
];

function isStandardImageModel(model) {
  return isGptImage2Model(model) || [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
  ].includes(normalizeModelValue("image", model));
}

function isGptImage2Model(model) {
  return window.GptImageModels.isModel(normalizeModelValue("image", model));
}

function isSeedream5ImageModel(model) {
  return Boolean(window.SeedreamTools?.isSeedream5Model(normalizeModelValue("image", model)));
}

function isSeedream5ProImageModel(model) {
  return Boolean(window.SeedreamTools?.isProModel(normalizeModelValue("image", model)));
}

function mapImageQuality(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  switch (raw) {
    case "标准画质":
      return "medium";
    case "高清画质":
    case "4K":
      return "high";
    case "auto":
    case "low":
    case "medium":
    case "high":
      return raw;
    default:
      return "";
  }
}

function imageQualityOptions(model) {
  return isGptImage2Model(model) ? ["标准画质", "高清画质"] : ["标准画质", "高清画质", "4K"];
}

function getImageQualityValue(model, value) {
  if (isGptImage2Model(model) && value === "4K") return "高清画质";
  return imageQualityOptions(model).includes(value) ? value : "标准画质";
}

function isFluxImageModel(model) {
  return normalizeModelValue("image", model).toLowerCase().includes("flux");
}

function imageSizeOptions(model) {
  const seedreamSizes = window.SeedreamTools?.imageSizeOptions(normalizeModelValue("image", model));
  if (seedreamSizes) return seedreamSizes;
  if (isStandardImageModel(model)) {
    return [...gptImageSizes, ...gptImage2ExtraSizes];
  }
  if (isFluxImageModel(model)) return fluxImageRatios;
  return seedreamImageSizes;
}

function getImageSizeValue(model, size) {
  const value = String(size || "");
  if (isGptImage2Model(model)) {
    return window.GptImage2Sizes.inferPreset(value).size;
  }
  const choices = imageSizeOptions(model);
  if (choices.some((pair) => pair[0] === value)) return value;
  if (isStandardImageModel(model)) return "1024x1024";
  if (isFluxImageModel(model)) return "1:1";
  return "2048x2048";
}

function gptImage2PresetFromData(data = {}) {
  const exactSize = window.GptImage2Sizes.allPresets().find((preset) => preset.size === String(data.size || ""));
  if (exactSize) return exactSize;
  const selected = window.GptImage2Sizes.getPreset(data.sizeRatio, data.sizeTier);
  if (selected) return selected;
  const legacySize = data.sizeWidth !== undefined || data.sizeHeight !== undefined
    ? `${data.sizeWidth || ""}x${data.sizeHeight || ""}`
    : data.size;
  return window.GptImage2Sizes.inferPreset(legacySize);
}

function gptImage2SizeFromData(data = {}) {
  return gptImage2PresetFromData(data).size;
}

function applyGptImage2Preset(data, preset) {
  const next = preset || gptImage2PresetFromData(data);
  data.sizeRatio = next.ratio;
  data.sizeTier = next.tier;
  data.size = next.size;
  delete data.sizeWidth;
  delete data.sizeHeight;
  return next;
}

function renderImageSizeControl(model, data, label = "尺寸") {
  if (!isGptImage2Model(model)) {
    return `<div class="node-row"><span>${escapeHtml(label)}</span><select data-field="size">${optionPairs(imageSizeOptions(model), getImageSizeValue(model, data.size))}</select></div>`;
  }
  const preset = gptImage2PresetFromData(data);
  return `
    <div class="node-row"><span>画面比例</span><select data-field="sizeRatio">${optionPairs(window.GptImage2Sizes.RATIO_OPTIONS, preset.ratio)}</select></div>
    <div class="node-row"><span>${escapeHtml(label)}档位</span><select data-field="sizeTier">${optionPairs(window.GptImage2Sizes.TIER_OPTIONS, preset.tier)}</select></div>
    <div class="gpt-image2-size-status valid">实际输出 ${escapeHtml(preset.size.replace("x", " × "))} · ${(preset.pixels / 1000000).toFixed(2)} MP</div>`;
}

function assertImageConfigSize(configNode) {
  const model = normalizeModelValue("image", configNode?.data?.model) || getDefaultModel("image");
  if (!isGptImage2Model(model)) return getImageSizeValue(model, configNode?.data?.size);
  return window.GptImage2Sizes.assertSize(gptImage2SizeFromData(configNode.data));
}

// 3D 取景比例选项（label, 数值比例）。
const model3dRatios = [
  ["1:1", 1],
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
  ["4:3", 4 / 3],
  ["3:4", 3 / 4],
  ["3:2", 3 / 2],
  ["2:3", 2 / 3],
  ["21:9", 21 / 9],
];

// "16:9" / "1536x1024" → 宽高比数值；解析不出返回 null。
function parseAspect(str) {
  const s = String(str || "");
  let m = s.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return null;
}

// 从一组候选值（size 串或比例串）里挑宽高比最接近 ar 的。
function nearestByAspect(values, ar) {
  let best = values[0];
  let bestD = Infinity;
  for (const v of values) {
    const a = parseAspect(v);
    if (!a) continue;
    const d = Math.abs(Math.log(a / ar));
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function imageSizeForAspect(model, aspect, preferredSize) {
  if (isGptImage2Model(model)) {
    return window.GptImage2Sizes.presetForAspect(aspect, preferredSize).size;
  }
  return nearestByAspect(imageSizeOptions(model).map((pair) => pair[0]), aspect);
}

function ratioNumOf(label) {
  const found = model3dRatios.find((r) => r[0] === label);
  return found ? found[1] : parseAspect(label) || 1;
}

// 3D 节点 → 它下游连接的文生图节点。
function connectedImageConfigs(nodeId) {
  return outgoingNodes(nodeId, ["imageConfig"]);
}

// 把比例写回所有连接的文生图节点（按模型类型选最接近的合法 size / mjAr）。
function applyAspectToImageConfigs(nodeId, ar) {
  const cfgs = connectedImageConfigs(nodeId);
  cfgs.forEach((cfg) => {
    const model = cfg.data.model;
    if (isMjImageModel(model)) {
      updateNode(cfg.id, { mjAr: nearestByAspect(mjAspectOptions, ar) });
    } else {
      const preset = isGptImage2Model(model) ? window.GptImage2Sizes.presetForAspect(ar, cfg.data.size) : null;
      const size = preset?.size || imageSizeForAspect(model, ar, cfg.data.size);
      updateNode(cfg.id, {
        size,
        ...(preset ? { sizeRatio: preset.ratio, sizeTier: preset.tier } : {}),
      });
    }
  });
  return cfgs.length;
}

// 读连接的文生图当前比例（取第一个），匹配到最接近的 3D 比例 label。
function aspectLabelFromImageConfigs(nodeId) {
  const cfgs = connectedImageConfigs(nodeId);
  if (!cfgs.length) return null;
  const cfg = cfgs[0];
  const v = isMjImageModel(cfg.data.model) ? cfg.data.mjAr : cfg.data.size;
  const ar = parseAspect(v);
  if (!ar) return null;
  return nearestByAspect(model3dRatios.map((r) => r[0]), ar);
}

function normalizeImageSize(model, size) {
  if (isSeedream5ImageModel(model)) return String(size);
  if (!size) return "2K";
  if (String(size).includes("4096")) return "4K";
  if (String(size).includes("2048")) return "2K";
  return String(size);
}

function getNodePrompt(targetId) {
  return incomingNodes(targetId, ["text", "llmConfig", "storyboardAssistant", "promptOptimizer"])
    .map((node) => {
      if (node.type === "promptOptimizer") return composeOptimizerPrompt(node.data.fields);
      return node.data.output || node.data.content || "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function composeOptimizerPrompt(fields) {
  if (!fields) return "";
  const order = ["subject", "structure", "material", "lighting", "style", "composition"];
  return order.map((key) => String(fields[key] || "").trim()).filter(Boolean).join("，");
}

function normalizePromptReferenceMentions(prompt) {
  return String(prompt || "").replace(/@(图片|视频)\s*(\d+)/g, "$1$2");
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
    menu.innerHTML = `<div class="prompt-mention-empty">暂无可引用素材</div>`;
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

async function polishWithApi(text, model = getDefaultModel("chat"), providerId = "") {
  const data = await apiFetch("/api/chat/polish", {
    method: "POST",
    body: JSON.stringify({
      providerId,
      model: normalizeModelValue("chat", model) || getDefaultModel("chat"),
      text,
    }),
  });
  return data?.text || text;
}

async function storyboardAssistantWithApi(text, requirements = "", model = getDefaultModel("chat"), providerId = "") {
  const data = await apiFetch("/api/chat/storyboard-assistant", {
    method: "POST",
    body: JSON.stringify({
      providerId,
      model: normalizeModelValue("chat", model) || getDefaultModel("chat"),
      text,
      requirements,
    }),
  });
  return data?.text || "";
}

async function requestImageGeneration(configNode, prompt, refImages = []) {
  const body = buildImageGenerationBody(configNode, prompt, refImages);

  const data = await apiFetch("/api/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (data?.adapter === "kling-cli" && data?.id) {
    const result = await pollKlingTask(data.id, "图片");
    const source = result?.urls?.[0] || result?.video_url || "";
    if (!source) throw new Error("可灵图片任务完成但未返回图片地址");
    return persistImageSource(source);
  }
  const source = extractImageSource(data);
  if (!source) throw new Error("图像接口未返回可显示的图片地址或 base64 数据");
  return persistImageSource(source);
}

function buildImageGenerationBody(configNode, prompt, refImages = []) {
  const model = normalizeModelValue("image", configNode.data.model) || getDefaultModel("image");
  const providerId = configNode.data.providerId || "";
  const size = isGptImage2Model(model)
    ? assertImageConfigSize(configNode)
    : getImageSizeValue(model, configNode.data.size);
  const klingParams = getKlingRequestParams(configNode, "image", refImages.length);

  if (klingParams) {
    return {
      providerId,
      model,
      prompt,
      dynamicParams: klingParams,
      ...(refImages.length ? { image: refImages } : {}),
    };
  }

  if (isStandardImageModel(model)) {
    const quality = mapImageQuality(configNode.data.quality);
    const body = {
      providerId,
      model,
      prompt,
      size,
      n: 1,
      ...(quality ? { quality } : {}),
    };
    if (refImages.length) {
      body.image = refImages;
    }
    return body;
  }

  if (isFluxImageModel(model)) {
    return {
      providerId,
      model,
      prompt,
      aspect_ratio: size,
      n: 1,
    };
  }

  const seedreamOptions = window.SeedreamTools?.buildGenerationOptions(model, {
    size: normalizeImageSize(model, size),
    outputFormat: configNode.data.outputFormat,
    promptOptimization: configNode.data.promptOptimization,
  });
  const body = {
    providerId,
    model,
    prompt,
    ...(seedreamOptions || {
      sequential_image_generation: "disabled",
      size: normalizeImageSize(model, size),
      watermark: false,
    }),
  };
  if (refImages.length) body.image = refImages;
  return body;
}

function extractImageSource(payload) {
  const seedreamItems = window.SeedreamTools?.extractImageItems(payload) || [];
  if (seedreamItems[0]?.source) return seedreamItems[0].source;
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

async function requestVideoCreate(configNode, prompt, images = [], videos = []) {
  const model = normalizeModelValue("video", configNode.data.model) || getDefaultModel("video");
  const providerId = configNode.data.providerId || "";
  const klingParams = getKlingRequestParams(configNode, "video", images.length);
  return apiFetch("/api/video/create", {
    method: "POST",
    body: JSON.stringify({
      providerId,
      model,
      prompt,
      ...(klingParams ? { dynamicParams: klingParams } : {}),
      videoMode: getVideoMode(configNode.data),
      ratio: getVideoRatioValue(configNode.data),
      resolution: getVideoResolutionValue(configNode.data),
      seconds: clamp(Number(configNode.data.seconds) || 8, videoSecondsMin, videoSecondsMax),
      ...(images.length ? { images } : {}),
      ...(videos.length ? { videos } : {}),
    }),
  });
}

async function requestVideoQuery(taskId, providerId = "") {
  if (providerId === "kling-cli") {
    return apiFetch(`/api/kling/tasks/${encodeURIComponent(taskId)}`, { method: "GET" });
  }
  const qp = providerId ? `&providerId=${encodeURIComponent(providerId)}` : "";
  return apiFetch(`/api/video/query?id=${encodeURIComponent(taskId)}${qp}`, { method: "GET" });
}

async function pollKlingTask(taskId, label = "任务") {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    processingText.textContent = `可灵${label}生成中... ${attempt + 1}/180`;
    const result = await apiFetch(`/api/kling/tasks/${encodeURIComponent(taskId)}`, { method: "GET" });
    if (String(result?.status || "").toLowerCase() === "succeeded") return result;
    if (String(result?.status || "").toLowerCase() === "failed") {
      throw new Error(result?.error || "可灵任务失败");
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`可灵${label}任务仍在生成中，可稍后使用任务 ID ${taskId} 继续查询`);
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

// 把上游图像接口的英文报错转成更直观的中文提示。
// 安全审核拒绝（多为参考图含受版权保护的角色，或提示词要求写实化）最常见，单独友好化。
function friendlyImageError(message) {
  const raw = String(message || "");
  // 本地积分不足（后端 db.adjustBalance 抛的 402「余额不足」），请求还没发往上游，跟上游账单无关
  if (/^余额不足$/.test(raw.trim())) {
    return (
      "⚠️ 你的账号积分不足\n" +
      "当前账号余额不够支付本次生成，扣费这步就没通过（请求未发往上游）。\n" +
      "建议：用 admin 账号在「管理」面板给本账号充值积分后重试。"
    );
  }
  if (/safety system|rejected by the safety|content[_\s-]?policy|moderation/i.test(raw)) {
    const reqMatch = raw.match(/req_[A-Za-z0-9]+/);
    const reqNote = reqMatch ? `\n请求 ID：${reqMatch[0]}` : "";
    return (
      "⚠️ 内容被模型安全审核拦截\n" +
      "常见原因：参考图包含受版权保护的角色（影视 / 动漫 IP 等），或提示词要求「写实 / 真人质感」被限制。\n" +
      "建议：① 换一个审核更宽松的图像模型；② 去掉「真实 / 写实」等措辞，改用风格化上色描述；③ 换成无版权的参考图后重试。" +
      reqNote
    );
  }
  if (/billing hard limit|hard limit has been reached|quota|insufficient_quota|exceeded your current quota|billing/i.test(raw)) {
    return (
      "⚠️ 上游 API 账号额度已用尽\n" +
      "图像接口对接的 API Key 已达到计费硬上限（Billing hard limit），无法继续生成。\n" +
      "建议：① 给该 API Key 对应账号充值 / 提高额度上限；② 在设置里更换一个有余额的 Key；③ 确认计费周期是否已重置。"
    );
  }
  return raw;
}

async function generateImage(configId) {
  const config = getNode(configId);
  if (!config) return;
  try {
    assertImageConfigSize(config);
  } catch (error) {
    showToast(error.message);
    return;
  }
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

  const imgConfigured = hasApiKey("image", config.data.providerId);
  showProcessing(imgConfigured ? "正在调用图像 API..." : "未配置图像 API Key，使用本地模拟生成...");

  if (!imgConfigured) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model: config.data.model, gradient: generateGradient(prompt || config.data.model), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("图片生成成功（模拟）");
    }, 850);
    return;
  }

  try {
    const refImages = (await Promise.all(refImageNodes.map((node) => resolveImageForApi(node.data.url)))).filter(Boolean);
    const url = isMjImageModel(config.data.model)
      ? await requestMjImageGeneration(config, prompt, refImages)
      : await requestImageGeneration(config, prompt, refImages);
    updateNode(imageId, { loading: false, url, model: config.data.model, gradient: generateGradient(prompt || config.data.model), error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("图片生成成功");
    void recordProjectHistory({ type: "image", url, prompt, model: config.data.model });
  } catch (error) {
    const friendly = friendlyImageError(error.message);
    updateNode(imageId, { loading: false, url: false, error: friendly });
    processing.hidden = true;
    showToast(`图片生成失败：${error.message}`);
  }
}

// 换脸提示词：强制模型在底图统一光照下"重生成"脸，而不是抠图粘贴。图片1=底图，图片2=脸源。
const FACE_SWAP_PROMPT = `这是一次"换脸"任务，给你两张参考图：
- 图片1 是底图：必须完整保留它的发型、头部角度、姿态、身体、服装、背景、构图与整体光照。
- 图片2 是脸源：只取这张图中人物的面部身份特征——五官形状、脸型、神态。

要求：
1. 把图片2人物的面容自然地重新生成到图片1人物的头部上，替换其面部，让来自图片2的人物身份清晰可辨。
2. 这不是抠图粘贴：要在图片1的统一光照下重新渲染这张脸，使肤色、光线方向、色温、明暗过渡、阴影、噪点颗粒、清晰度都与图片1完全一致，边缘无缝融合。
3. 除面部以外，图片1的一切都不要改变。
4. 输出与图片1相同的画面和比例，只是人物换了脸，整体真实和谐，看不出后期痕迹。`;

// 探测图片自然宽高比（用于让换脸输出跟随底图比例，避免裁切/拉伸）。
function probeImageAspect(source) {
  return new Promise((resolve) => {
    (async () => {
      try {
        const display = await getDisplayImageUrl(source);
        if (!display) return resolve(0);
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0);
        img.onerror = () => resolve(0);
        img.src = display;
      } catch {
        resolve(0);
      }
    })();
  });
}

async function generateFaceSwap(configId) {
  const config = getNode(configId);
  if (!config) return;
  const model = normalizeModelValue("image", config.data.model) || getDefaultModel("image");
  if (isMjImageModel(model)) {
    showToast("换脸请用 Gemini / gpt-image 这类编辑模型，Midjourney 不支持多图换脸");
    return;
  }
  const slots = getImageReferenceSlots(configId);
  if (slots.length < 2) {
    showToast("需连接两张图片：第1张=底图，第2张=脸源");
    return;
  }
  const baseNode = slots[0].node; // 底图（保留）
  const faceNode = slots[1].node; // 脸源（取脸）
  const extra = String(config.data.extra || "").trim();
  const prompt = FACE_SWAP_PROMPT + (extra ? `\n\n额外要求：${extra}` : "");

  const existing = findOutputImageNode(configId);
  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 390, y: config.position.y }, { label: "换脸结果", loading: true, model });
    addEdge(configId, imageId, "output", { label: "输出" });
  } else {
    updateNode(imageId, { loading: true, url: false, error: "" });
  }

  const imgConfigured = hasApiKey("image", config.data.providerId);
  showProcessing(imgConfigured ? "正在换脸..." : "未配置图像 API Key，使用本地模拟生成...");

  if (!imgConfigured) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model, gradient: generateGradient("faceswap"), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("换脸完成（模拟）");
    }, 850);
    return;
  }

  try {
    // 底图在前、脸源在后，与提示词里的"图片1/图片2"一一对应。
    const refImages = (await Promise.all([baseNode, faceNode].map((n) => resolveImageForApi(n.data.url)))).filter(Boolean);
    if (refImages.length < 2) throw new Error("参考图读取失败，请确认两张图片都已就绪");
    // 输出尺寸跟随底图比例，保持构图和谐不裁切。
    const ar = await probeImageAspect(baseNode.data.url);
    const size = ar ? imageSizeForAspect(model, ar, config.data.size) : getImageSizeValue(model, config.data.size);
    const cfg = { ...config, data: { ...config.data, model, size } };
    const url = await requestImageGeneration(cfg, prompt, refImages);
    updateNode(imageId, { loading: false, url, model, gradient: generateGradient("faceswap"), error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("换脸完成");
    void recordProjectHistory({ type: "image", url, prompt: "[换脸]", model });
  } catch (error) {
    const friendly = friendlyImageError(error.message);
    updateNode(imageId, { loading: false, url: false, error: friendly });
    processing.hidden = true;
    showToast(`换脸失败：${error.message}`);
  }
}

async function generateStyleTransfer(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "styleTransferConfig") return;
  const slots = getImageReferenceSlots(configId);
  try {
    window.StyleTransfer.validateInputCount(slots.length);
  } catch (error) {
    showToast(error.message);
    return;
  }
  const contentNode = slots[0].node;
  const styleNode = slots[1].node;
  if (!contentNode?.data?.url || !styleNode?.data?.url) {
    showToast("两张输入图片都需要先载入完成");
    return;
  }

  const model = normalizeModelValue("image", config.data.model) || getDefaultModel("image");
  if (isFluxImageModel(model)) {
    showToast("风格迁移需要支持两张参考图的模型，请选择 GPT Image、Gemini、Seedream 或 Midjourney");
    return;
  }
  const strength = window.StyleTransfer.normalizeStrength(config.data.strength);
  const prompt = window.StyleTransfer.buildPrompt({ strength, extra: config.data.extra });
  const existing = findOutputImageNode(configId);
  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 410, y: config.position.y }, { label: "风格迁移结果", loading: true, model });
    addEdge(configId, imageId, "output", { label: "输出" });
  } else {
    updateNode(imageId, { label: "风格迁移结果", loading: true, url: false, error: "" });
  }

  const imgConfigured = hasApiKey("image", config.data.providerId);
  showProcessing(imgConfigured ? "正在迁移图片风格..." : "未配置图像 API Key，使用本地模拟生成...");
  if (!imgConfigured) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model, gradient: generateGradient(`style-transfer-${strength}`), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("风格迁移完成（模拟）");
    }, 850);
    return;
  }

  try {
    const refImages = await Promise.all([contentNode, styleNode].map((node) => resolveImageForApi(node.data.url)));
    if (refImages.some((source) => !source)) throw new Error("参考图读取失败，请确认两张图片都已就绪");
    const aspect = await probeImageAspect(contentNode.data.url);
    const nextData = { ...config.data, model };
    if (isMjImageModel(model)) {
      if (aspect) nextData.mjAr = nearestByAspect(mjAspectOptions, aspect);
    } else if (aspect) {
      nextData.size = imageSizeForAspect(model, aspect, config.data.size);
    }
    const requestConfig = { ...config, data: nextData };
    const url = isMjImageModel(model)
      ? await requestMjImageGeneration(requestConfig, prompt, refImages)
      : await requestImageGeneration(requestConfig, prompt, refImages);
    updateNode(imageId, { loading: false, url, model, gradient: generateGradient(`style-transfer-${strength}`), error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("风格迁移完成");
    void recordProjectHistory({ type: "image", url, prompt: `[风格迁移:${strength}]`, model });
  } catch (error) {
    const friendly = friendlyImageError(error.message);
    updateNode(imageId, { loading: false, url: false, error: friendly });
    processing.hidden = true;
    showToast(`风格迁移失败：${error.message}`);
  }
}

async function generateMaterialTransfer(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "materialTransferConfig") return;
  const slots = getImageReferenceSlots(configId);
  try {
    window.MaterialTransfer.validateInputCount(slots.length);
  } catch (error) {
    showToast(error.message);
    return;
  }
  const structureNode = slots[0].node;
  const materialNode = slots[1].node;
  if (!structureNode?.data?.url || !materialNode?.data?.url) {
    showToast("主体 / 结构图和材质参考图都需要先载入完成");
    return;
  }

  const model = normalizeModelValue("image", config.data.model) || getDefaultModel("image");
  if (isFluxImageModel(model)) {
    showToast("材质迁移需要支持两张参考图的模型，请选择 GPT Image、Gemini、Seedream 或 Midjourney");
    return;
  }
  const strength = window.MaterialTransfer.normalizeStrength(config.data.strength);
  const prompt = window.MaterialTransfer.buildPrompt({
    strength,
    materialHint: config.data.materialHint,
    extra: config.data.extra,
  });
  const existing = findOutputImageNode(configId);
  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 420, y: config.position.y }, { label: "材质迁移结果", loading: true, model });
    addEdge(configId, imageId, "output", { label: "输出" });
  } else {
    updateNode(imageId, { label: "材质迁移结果", loading: true, url: false, error: "" });
  }

  const imgConfigured = hasApiKey("image", config.data.providerId);
  showProcessing(imgConfigured ? "正在迁移主体材质..." : "未配置图像 API Key，使用本地模拟生成...");
  if (!imgConfigured) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model, gradient: generateGradient(`material-transfer-${strength}`), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("材质迁移完成（模拟）");
    }, 850);
    return;
  }

  try {
    // 第1张始终是结构母版，第2张始终是材质样本，顺序与提示词合同一致。
    const refImages = await Promise.all([structureNode, materialNode].map((node) => resolveImageForApi(node.data.url)));
    if (refImages.some((source) => !source)) throw new Error("参考图读取失败，请确认两张图片都已就绪");
    const aspect = await probeImageAspect(structureNode.data.url);
    const nextData = { ...config.data, model };
    if (isMjImageModel(model)) {
      if (aspect) nextData.mjAr = nearestByAspect(mjAspectOptions, aspect);
    } else if (aspect) {
      nextData.size = imageSizeForAspect(model, aspect, config.data.size);
    }
    const requestConfig = { ...config, data: nextData };
    const url = isMjImageModel(model)
      ? await requestMjImageGeneration(requestConfig, prompt, refImages)
      : await requestImageGeneration(requestConfig, prompt, refImages);
    updateNode(imageId, { loading: false, url, model, gradient: generateGradient(`material-transfer-${strength}`), error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("材质迁移完成");
    void recordProjectHistory({ type: "image", url, prompt: `[材质迁移:${strength}] ${String(config.data.materialHint || "").trim()}`.trim(), model });
  } catch (error) {
    const friendly = friendlyImageError(error.message);
    updateNode(imageId, { loading: false, url: false, error: friendly });
    processing.hidden = true;
    showToast(`材质迁移失败：${error.message}`);
  }
}

const activeProductBackgroundRuns = new Set();

async function generateProductBackground(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "productBackgroundConfig" || activeProductBackgroundRuns.has(configId)) return;
  let inputs;
  try { inputs = window.ProductBackground.validateInputs(getImageReferenceSlots(configId)); }
  catch (error) { showToast(error.message); return; }
  const model = normalizeModelValue("image", config.data.model) || getDefaultModel("image");
  if (isFluxImageModel(model) || isMjImageModel(model)) {
    showToast("产品换背景需要双图编辑模型，请选择 GPT Image、Gemini 或 Seedream");
    return;
  }
  if (!hasApiKey("image", config.data.providerId)) {
    showToast("请先配置所选图片模型的 API，再进行产品换背景");
    return;
  }

  // 固定输入顺序和本次参数，后续上传或调整控件不会改变正在运行的任务。
  const sources = [inputs.product.node.data.url, inputs.background.node.data.url];
  const settings = { ...config.data, model };
  const prompt = window.ProductBackground.buildPrompt(settings);
  activeProductBackgroundRuns.add(configId);
  const existing = findOutputImageNode(configId);
  let imageId = existing?.id || null;
  try {
    if (!imageId) {
      imageId = addNode("image", { x: config.position.x + 430, y: config.position.y }, { label: "产品换背景结果", loading: true, model });
      addEdge(configId, imageId, "output", { label: "输出" });
    } else {
      updateNode(imageId, { label: "产品换背景结果", loading: true, url: false, error: "" });
    }
    showProcessing("正在更换产品背景并统一光影...");
    const refImages = await Promise.all(sources.map((source) => resolveImageForApi(source)));
    if (refImages.some((source) => !source)) throw new Error("输入图片读取失败，请重新载入产品图和背景图");
    const aspectIndex = window.ProductBackground.normalizeAspectSource(settings.aspectSource) === "background" ? 1 : 0;
    const aspect = await probeImageAspect(sources[aspectIndex]);
    if (aspect) settings.size = imageSizeForAspect(model, aspect, settings.size);
    const url = await requestImageGeneration({ ...config, data: settings }, prompt, refImages);
    updateNode(imageId, { loading: false, url, model, error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("产品换背景完成");
    void recordProjectHistory({ type: "image", url, prompt, model });
  } catch (error) {
    if (imageId) updateNode(imageId, { loading: false, url: false, error: friendlyImageError(error.message) });
    processing.hidden = true;
    showToast(`产品换背景失败：${error.message}`);
  } finally {
    activeProductBackgroundRuns.delete(configId);
    render();
  }
}

function triggerProductBackgroundUpload(configId, role) {
  if (activeProductBackgroundRuns.has(configId)) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    const config = getNode(configId);
    if (!file || !config || activeProductBackgroundRuns.has(configId)) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { showToast("请上传 PNG、JPEG 或 WebP 图片"); return; }
    try {
      const url = await persistImageBlob(file);
      if (!getNode(configId) || activeProductBackgroundRuns.has(configId)) return;
      const assigned = window.ProductBackground.assignInputs(getImageReferenceSlots(configId));
      const previous = assigned[role];
      const label = role === "background" ? "背景图" : "产品图";
      // 上传替换只换此节点的输入连线，保留原素材供其他工作流继续使用。
      if (previous) removeEdge(previous.edge.id);
      const id = addNode("image", { x: config.position.x - 350, y: config.position.y + (role === "background" ? nodeSizes.image.height + 40 : 0) }, { label, url });
      addEdge(id, configId, "imageOrder", { label });
      showToast(`已载入${label}`);
    } catch (error) { showToast(`载入失败：${error.message}`); }
  });
  input.click();
}

async function generateSeedreamEdit(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "seedreamEdit") return;
  const model = normalizeModelValue("image", config.data.model) || "doubao-seedream-5-0-pro-260628";
  if (!isSeedream5ProImageModel(model)) {
    showToast("精确图片编辑需要选择豆包 Seedream 5.0 Pro");
    return;
  }
  const slots = getImageReferenceSlots(configId);
  if (!slots[0]?.node?.data?.url) {
    showToast("先连接一张待编辑原图");
    return;
  }
  if (slots.length > 10) {
    showToast("Seedream 5.0 Pro 最多支持 10 张输入图片");
    return;
  }
  const marks = Array.isArray(config.data.annotation?.marks) ? config.data.annotation.marks : [];
  const prompt = window.SeedreamTools.buildPreciseEditPrompt(
    String(config.data.prompt || "").trim() || "按照标记位置精确编辑图片，使修改自然融入原画面。",
    marks,
  );
  const existing = findOutputImageNode(configId);
  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 420, y: config.position.y }, { label: "精确编辑结果", loading: true, model });
    addEdge(configId, imageId, "output", { label: "编辑结果" });
  } else {
    updateNode(imageId, { loading: true, url: false, error: "" });
  }

  const configured = hasApiKey("image", config.data.providerId);
  showProcessing(configured ? "正在执行 Seedream 精确编辑..." : "未配置火山图片 API Key，使用本地模拟生成...");
  if (!configured) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model, gradient: generateGradient("seedream-edit"), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("精确编辑完成（模拟）");
    }, 850);
    return;
  }

  try {
    const baseNode = slots[0].node;
    const baseSource = marks.length
      ? await renderAnnotatedImage(baseNode.data.url, config.data.annotation)
      : await resolveImageForApi(baseNode.data.url);
    const extraSources = (await Promise.all(slots.slice(1).map((slot) => resolveImageForApi(slot.node.data.url)))).filter(Boolean);
    if (!baseSource) throw new Error("待编辑原图读取失败");
    const aspect = await probeImageAspect(baseNode.data.url);
    const size = aspect
      ? nearestByAspect(imageSizeOptions(model).map(([value]) => value), aspect)
      : getImageSizeValue(model, config.data.size);
    const requestConfig = { ...config, data: { ...config.data, model, size } };
    const url = await requestImageGeneration(requestConfig, prompt, [baseSource, ...extraSources]);
    updateNode(imageId, { loading: false, url, model, gradient: generateGradient("seedream-edit"), error: "" });
    updateNode(configId, { executed: true, size });
    hideProcessing("精确编辑完成");
    void recordProjectHistory({ type: "image", url, prompt, model });
  } catch (error) {
    updateNode(imageId, { loading: false, url: false, error: friendlyImageError(error.message) });
    processing.hidden = true;
    showToast(`精确编辑失败：${error.message}`);
  }
}

function findOutputLayerGroupNode(configId) {
  return state.edges
    .filter((edge) => edge.source === configId)
    .map((edge) => getNode(edge.target))
    .find((node) => node?.type === "layerGroup");
}

async function requestLayerSeparation(configNode, source) {
  const body = window.SeedreamTools.buildLayerSeparationBody({
    providerId: configNode.data.providerId || "volc",
    model: normalizeModelValue("image", configNode.data.model) || "doubao-seedream-5-0-pro-260628",
    prompt: configNode.data.prompt,
    size: configNode.data.size,
    seed: configNode.data.seed,
    promptOptimization: configNode.data.promptOptimization,
  }, source);
  return apiFetch("/api/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function serializableLayerResponse(parsed) {
  const entries = [parsed?.background, ...(parsed?.layers || [])];
  if (!entries.length || entries.some((entry) => !/^https?:\/\//i.test(String(entry?.source || "")))) return null;
  const clean = (entry) => ({
    source: entry.source,
    name: entry.name || "",
    description: entry.description || "",
    role: entry.role || "layer",
    zIndex: Number(entry.zIndex) || 0,
    responseIndex: Number(entry.responseIndex) || 0,
    bbox: entry.bbox ? { ...entry.bbox } : null,
    flags: [...(entry.flags || [])],
  });
  return { background: clean(parsed.background), layers: parsed.layers.map(clean) };
}

function imageSourceRevision(source) {
  const text = String(source || "");
  const sample = text.length <= 4096 ? text : `${text.slice(0, 2048)}${text.slice(-2048)}`;
  let hash = 2166136261;
  for (let index = 0; index < sample.length; index += 1) {
    hash ^= sample.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

async function materializeLayerGroup(config, sourceNode, parsed) {
  const layerEntries = [parsed.background, ...parsed.layers];
  const stored = await Promise.all(layerEntries.map((entry) => persistLayerImageSource(entry.source)));
  const assets = stored.map((asset) => ({
    assetId: asset.assetId,
    nativeWidth: asset.width,
    nativeHeight: asset.height,
  }));
  const groupData = window.SeedreamTools.createLayerGroupData(parsed, assets, {
    label: `${sourceNode.data.label || "图片"} · 图层组`,
    sourceNodeId: sourceNode.id,
  });
  const composite = await composeLayerGroupDataUrl(groupData);
  const compositeSentinel = await persistCanvasDataUrl(composite);
  groupData.compositeAssetId = getIndexedImageId(compositeSentinel);
  groupData.url = compositeSentinel;

  const existing = findOutputLayerGroupNode(config.id);
  if (existing) {
    updateNode(existing.id, groupData);
  } else {
    const groupId = addNode("layerGroup", { x: config.position.x + 390, y: config.position.y }, groupData);
    addEdge(config.id, groupId, "output", { label: "图层文档" });
  }
  return parsed.layers.length;
}

async function refreshLayerGroupComposite(groupId) {
  const group = getNode(groupId);
  if (!group || group.type !== "layerGroup" || !group.data.layers?.length) return "";
  const dataUrl = await composeLayerGroupDataUrl(group.data);
  const sentinel = await persistCanvasDataUrl(dataUrl);
  updateNode(groupId, { compositeAssetId: getIndexedImageId(sentinel), url: sentinel });
  return sentinel;
}

async function generateLayerSeparation(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "layerSeparation") return;
  const model = normalizeModelValue("image", config.data.model) || "doubao-seedream-5-0-pro-260628";
  if (!isSeedream5ProImageModel(model)) {
    updateNode(configId, { error: "智能图层分离仅支持豆包 Seedream 5.0 Pro。" });
    showToast("智能图层分离需要选择豆包 Seedream 5.0 Pro");
    return;
  }
  const slots = getImageReferenceSlots(configId);
  if (slots.length !== 1 || !slots[0]?.node?.data?.url) {
    updateNode(configId, { error: "请只连接一张待拆分原图。" });
    showToast("智能图层分离需要且只能连接一张原图");
    return;
  }
  const sourceNode = slots[0].node;
  const sourceRevision = imageSourceRevision(sourceNode.data.url);
  const dimensions = await probeImageDimensions(sourceNode.data.url);
  const aspect = dimensions.height ? dimensions.width / dimensions.height : 0;
  if (!dimensions.width || !dimensions.height) {
    updateNode(configId, { error: "无法读取原图尺寸，请重新载入图片。" });
    return;
  }
  if (Math.min(dimensions.width, dimensions.height) < 512 || aspect < 1 / 16 || aspect > 16) {
    updateNode(configId, { error: "原图短边需至少 512px，宽高比需在 1:16～16:1 内。" });
    showToast("原图尺寸不符合图层分离要求");
    return;
  }
  if (config.data.pendingLayerResponse) {
    if (config.data.pendingLayerSourceRevision !== sourceRevision) {
      updateNode(configId, { pendingLayerResponse: null, pendingLayerSourceRevision: "", error: "原图已经变化，已丢弃旧图层的待导入记录；请重新点击分离。" });
      showToast("原图已变化，请重新点击图层分离");
      return;
    }
    updateNode(configId, { error: "", loading: true });
    showProcessing("正在重新下载并导入已生成的图层...");
    try {
      const count = await materializeLayerGroup(config, sourceNode, config.data.pendingLayerResponse);
      updateNode(configId, { executed: true, loading: false, error: "", pendingLayerResponse: null, pendingLayerSourceRevision: "" });
      hideProcessing(`图层导入完成：背景 + ${count} 个透明图层`);
    } catch (error) {
      updateNode(configId, { loading: false, error: `已生成图层仍未导入：${error.message}` });
      processing.hidden = true;
      showToast(`图层导入失败：${error.message}`);
    }
    return;
  }
  if (!hasApiKey("image", config.data.providerId || "volc")) {
    updateNode(configId, { error: "尚未配置火山方舟图片 API Key；图层分离不提供模拟结果。" });
    showToast("请先在设置中配置火山方舟图片 API Key");
    return;
  }

  updateNode(configId, { error: "", loading: true });
  showProcessing("Seedream 正在识别主体并生成透明图层...");
  try {
    const source = await resolveImageForApi(sourceNode.data.url);
    if (!source) throw new Error("原图读取失败");
    const response = await requestLayerSeparation({ ...config, data: { ...config.data, model } }, source);
    const parsed = window.SeedreamTools.parseLayerResponse(response);
    const pendingLayerResponse = serializableLayerResponse(parsed);
    if (pendingLayerResponse) updateNode(configId, { pendingLayerResponse, pendingLayerSourceRevision: sourceRevision });
    const count = await materializeLayerGroup(config, sourceNode, parsed);
    updateNode(configId, { executed: true, loading: false, error: "", pendingLayerResponse: null, pendingLayerSourceRevision: "" });
    hideProcessing(`图层分离完成：背景 + ${count} 个透明图层`);
  } catch (error) {
    updateNode(configId, { loading: false, error: error.message || "图层分离失败" });
    processing.hidden = true;
    showToast(`图层分离失败：${error.message}`);
  }
}

function layerGroupToImage(groupId) {
  const group = getNode(groupId);
  if (!group || group.type !== "layerGroup" || !group.data.url) return;
  const imageId = addNode("image", { x: group.position.x + 410, y: group.position.y }, {
    label: `${group.data.label || "图层组"} · 合成图`,
    url: group.data.url,
  });
  addEdge(groupId, imageId, "output", { label: "合成图" });
}

function extractLayerAsImage(groupId, layerId) {
  const group = getNode(groupId);
  const layer = group?.data?.layers?.find((item) => item.id === layerId);
  if (!group || !layer?.assetId) return;
  const imageId = addNode("image", { x: group.position.x + 410, y: group.position.y + 80 }, {
    label: layer.name || "提取图层",
    url: `${imageAssetPrefix}${layer.assetId}`,
  });
  addEdge(groupId, imageId, "output", { label: layer.name || "提取图层" });
  showToast(`已将「${layer.name || "图层"}」提取为图片节点`);
}

async function openLayerGroupEditor(groupId) {
  const group = getNode(groupId);
  if (!group || group.type !== "layerGroup" || !group.data.layers?.length) return;
  const draft = typeof structuredClone === "function"
    ? structuredClone(group.data)
    : JSON.parse(JSON.stringify(group.data));
  let selectedId = draft.selectedLayerId || draft.layers.find((layer) => layer.role !== "background")?.id || draft.layers[0].id;
  const imageCache = new Map();
  const overlay = document.createElement("div");
  overlay.className = "layer-editor-overlay";
  overlay.innerHTML = `
    <section class="layer-editor-dialog" role="dialog" aria-modal="true" aria-label="图层编辑器">
      <header class="layer-editor-head">
        <div><strong>Seedream 图层编辑器</strong><small>${Math.round(draft.width)} × ${Math.round(draft.height)} · 移动、等比缩放、排序与透明度</small></div>
        <button type="button" data-layer-action="close" aria-label="关闭">×</button>
      </header>
      <div class="layer-editor-body">
        <div class="layer-editor-stage"><canvas></canvas></div>
        <aside class="layer-editor-side">
          <div class="layer-editor-side-title">图层</div>
          <div class="layer-editor-list"></div>
          <div class="layer-editor-inspector"></div>
        </aside>
      </div>
      <footer class="layer-editor-foot">
        <span>拖动图层移动；拖动四角控制点等比缩放</span>
        <button type="button" class="node-secondary-button" data-layer-action="cancel">取消</button>
        <button type="button" class="node-button" data-layer-action="apply">应用到画布</button>
      </footer>
    </section>`;
  document.body.append(overlay);

  const canvas = overlay.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const listEl = overlay.querySelector(".layer-editor-list");
  const inspectorEl = overlay.querySelector(".layer-editor-inspector");
  canvas.width = Math.max(1, Math.round(draft.width));
  canvas.height = Math.max(1, Math.round(draft.height));

  try {
    await Promise.all(draft.layers.map(async (layer) => {
      if (!layer.assetId || imageCache.has(layer.assetId)) return;
      imageCache.set(layer.assetId, await loadCanvasImage(`${imageAssetPrefix}${layer.assetId}`));
    }));
  } catch (error) {
    overlay.remove();
    showToast(`图层资源加载失败：${error.message}`);
    return;
  }

  const sortedTopFirst = () => [...draft.layers].sort((a, b) => Number(b.zIndex) - Number(a.zIndex));
  const selectedLayer = () => draft.layers.find((layer) => layer.id === selectedId) || null;
  const canvasPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
      tolerance: 12 * canvas.width / Math.max(1, rect.width),
    };
  };

  function drawEditorCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const layer of window.SeedreamTools.layerRenderPlan(draft.layers)) {
      const image = imageCache.get(layer.assetId);
      if (!image) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(image, Number(layer.x) || 0, Number(layer.y) || 0, Number(layer.width) || image.naturalWidth, Number(layer.height) || image.naturalHeight);
    }
    ctx.globalAlpha = 1;
    const layer = selectedLayer();
    if (!layer || layer.visible === false) return;
    const x = Number(layer.x) || 0;
    const y = Number(layer.y) || 0;
    const width = Number(layer.width) || 1;
    const height = Number(layer.height) || 1;
    const handle = Math.max(7, canvas.width / 220);
    ctx.save();
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = Math.max(2, canvas.width / 800);
    ctx.setLineDash([handle, handle * 0.7]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
    ctx.fillStyle = "#8b5cf6";
    [[x, y], [x + width, y], [x, y + height], [x + width, y + height]].forEach(([hx, hy]) => {
      ctx.fillRect(hx - handle, hy - handle, handle * 2, handle * 2);
    });
    ctx.restore();
  }

  function renderLayerPanel() {
    listEl.innerHTML = sortedTopFirst().map((layer) => `
      <div class="layer-editor-row ${layer.id === selectedId ? "active" : ""} ${layer.visible === false ? "muted" : ""}" data-layer-id="${escapeHtml(layer.id)}">
        <button type="button" title="显示/隐藏" data-layer-op="visible">${layer.visible === false ? "◌" : "◉"}</button>
        <button type="button" class="layer-editor-name" data-layer-op="select">${escapeHtml(layer.name || "未命名图层")}</button>
        <button type="button" title="锁定" data-layer-op="lock" ${layer.role === "background" ? "disabled" : ""}>${layer.locked ? "🔒" : "◇"}</button>
        <button type="button" title="上移" data-layer-op="up" ${layer.role === "background" ? "disabled" : ""}>↑</button>
        <button type="button" title="下移" data-layer-op="down" ${layer.role === "background" ? "disabled" : ""}>↓</button>
      </div>`).join("");
    const layer = selectedLayer();
    inspectorEl.innerHTML = layer ? `
      <label>名称<input type="text" data-layer-field="name" value="${escapeHtml(layer.name || "")}"></label>
      <label>不透明度 <b>${Math.round((Number(layer.opacity) || 0) * 100)}%</b><input type="range" min="0" max="1" step="0.01" data-layer-field="opacity" value="${Number(layer.opacity) || 0}"></label>
      <div class="layer-editor-geometry">X ${Math.round(layer.x)} · Y ${Math.round(layer.y)} · ${Math.round(layer.width)} × ${Math.round(layer.height)}</div>
      <button type="button" class="node-secondary-button" data-layer-action="extract" ${layer.assetId ? "" : "disabled"}>提取为图片节点</button>
      ${layer.flags?.length ? `<small>提示：${escapeHtml(layer.flags.join(", "))}</small>` : ""}` : "";
  }

  function refreshEditor() {
    drawEditorCanvas();
    renderLayerPanel();
  }

  listEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-layer-id]");
    const operation = event.target.closest("[data-layer-op]")?.dataset.layerOp;
    if (!row || !operation) return;
    selectedId = row.dataset.layerId;
    const layer = selectedLayer();
    if (!layer) return;
    if (operation === "visible") layer.visible = layer.visible === false;
    if (operation === "lock" && layer.role !== "background") layer.locked = !layer.locked;
    if (operation === "up") draft.layers = window.SeedreamTools.reorderLayer(draft.layers, layer.id, 1);
    if (operation === "down") draft.layers = window.SeedreamTools.reorderLayer(draft.layers, layer.id, -1);
    refreshEditor();
  });

  inspectorEl.addEventListener("input", (event) => {
    const layer = selectedLayer();
    if (!layer) return;
    if (event.target.dataset.layerField === "name") layer.name = event.target.value;
    if (event.target.dataset.layerField === "opacity") layer.opacity = Number(event.target.value);
    drawEditorCanvas();
    if (event.target.dataset.layerField === "opacity") {
      const label = inspectorEl.querySelector("label b");
      if (label) label.textContent = `${Math.round(layer.opacity * 100)}%`;
    }
  });

  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    const point = canvasPoint(event);
    let layer = selectedLayer();
    const hitLayer = [...sortedTopFirst()].find((candidate) => candidate.visible !== false
      && point.x >= candidate.x && point.x <= candidate.x + candidate.width
      && point.y >= candidate.y && point.y <= candidate.y + candidate.height);
    const insideSelected = layer && point.x >= layer.x && point.x <= layer.x + layer.width && point.y >= layer.y && point.y <= layer.y + layer.height;
    if (hitLayer && (!layer || layer.role === "background" || layer.visible === false || !insideSelected)) {
      selectedId = hitLayer.id;
      layer = hitLayer;
      refreshEditor();
    }
    if (!layer || layer.locked) return;
    const corners = {
      nw: { x: layer.x, y: layer.y },
      ne: { x: layer.x + layer.width, y: layer.y },
      sw: { x: layer.x, y: layer.y + layer.height },
      se: { x: layer.x + layer.width, y: layer.y + layer.height },
    };
    const corner = Object.entries(corners).find(([, value]) => Math.hypot(point.x - value.x, point.y - value.y) <= point.tolerance)?.[0] || "";
    if (!corner && !(point.x >= layer.x && point.x <= layer.x + layer.width && point.y >= layer.y && point.y <= layer.y + layer.height)) return;
    const opposite = { nw: "se", ne: "sw", sw: "ne", se: "nw" }[corner];
    drag = {
      mode: corner ? "resize" : "move",
      corner,
      startPoint: point,
      startLayer: { ...layer },
      anchor: opposite ? corners[opposite] : null,
    };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const point = canvasPoint(event);
    const index = draft.layers.findIndex((layer) => layer.id === selectedId);
    if (index < 0) return;
    if (drag.mode === "move") {
      draft.layers[index] = window.SeedreamTools.moveLayer(drag.startLayer, point.x - drag.startPoint.x, point.y - drag.startPoint.y);
    } else {
      const startDistance = Math.hypot(drag.startPoint.x - drag.anchor.x, drag.startPoint.y - drag.anchor.y) || 1;
      const currentDistance = Math.hypot(point.x - drag.anchor.x, point.y - drag.anchor.y);
      draft.layers[index] = window.SeedreamTools.resizeLayerFromCorner(drag.startLayer, drag.corner, currentDistance / startDistance);
    }
    drawEditorCanvas();
  });
  const stopDrag = (event) => {
    if (!drag) return;
    drag = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
    refreshEditor();
  };
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);

  let onKeyDown = null;
  const closeEditor = () => {
    if (onKeyDown) document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };
  overlay.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-layer-action]")?.dataset.layerAction;
    if (!action) return;
    if (action === "close" || action === "cancel") closeEditor();
    if (action === "extract") extractLayerAsImage(groupId, selectedId);
    if (action === "apply") {
      const button = event.target.closest("button");
      button.disabled = true;
      button.textContent = "正在合成...";
      try {
        draft.selectedLayerId = selectedId;
        const dataUrl = await composeLayerGroupDataUrl(draft);
        const sentinel = await persistCanvasDataUrl(dataUrl);
        draft.compositeAssetId = getIndexedImageId(sentinel);
        draft.url = sentinel;
        commitHistory();
        updateNode(groupId, draft);
        closeEditor();
        showToast("图层编辑已应用到画布");
      } catch (error) {
        button.disabled = false;
        button.textContent = "应用到画布";
        showToast(`图层合成失败：${error.message}`);
      }
    }
  });
  onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    closeEditor();
  };
  document.addEventListener("keydown", onKeyDown);
  refreshEditor();
}

async function requestMjImageGeneration(configNode, prompt, refImages = []) {
  const model = normalizeModelValue("image", configNode.data.model) || "midjourney";
  const providerId = configNode.data.providerId || "";
  const suffix = buildMjPromptSuffix(configNode.data);
  const fullPrompt = suffix ? `${prompt} ${suffix}` : prompt;
  const submitted = await apiFetch("/api/images/mj/create", {
    method: "POST",
    body: JSON.stringify({
      providerId,
      model,
      prompt: fullPrompt,
      ...(refImages.length ? { images: refImages } : {}),
    }),
  });
  const taskId = submitted?.id;
  if (!taskId) throw new Error("Midjourney 接口未返回任务 ID");
  return pollMjImageTask(taskId, providerId);
}

async function pollMjImageTask(taskId, providerId = "") {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    processingText.textContent = `Midjourney 生成中... ${attempt + 1}/60`;
    const qp = providerId ? `&providerId=${encodeURIComponent(providerId)}` : "";
    const result = await apiFetch(`/api/images/mj/query?id=${encodeURIComponent(taskId)}${qp}`, { method: "GET" });
    const status = String(result?.status || "").toUpperCase();
    if (status === "SUCCESS") {
      const imageUrl = result?.imageUrl || result?.image_url || "";
      if (!imageUrl) throw new Error("Midjourney 任务完成但未返回图片地址");
      return persistImageSource(imageUrl);
    }
    if (status === "FAILURE") {
      throw new Error(result?.failReason || result?.fail_reason || "Midjourney 任务失败");
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Midjourney 任务超时（5 分钟未完成）");
}

function findOutputImageNode(configId) {
  return state.edges
    .filter((edge) => edge.source === configId)
    .map((edge) => getNode(edge.target))
    .find((node) => node?.type === "image");
}

function findOutputVideoNode(configId) {
  return state.edges
    .filter((edge) => edge.source === configId)
    .map((edge) => getNode(edge.target))
    .find((node) => node?.type === "video");
}

let storyboardBlacklist = null;
async function loadStoryboardBlacklist() {
  try {
    const res = await fetch("/storyboard-blacklist.json");
    storyboardBlacklist = await res.json();
  } catch (error) {
    storyboardBlacklist = { _default: { constraints: ["不要让相邻两格过于相似"] } };
  }
}

function renderTemplateField(field, data, hasRef) {
  const value = data[field.name] != null ? data[field.name] : (field.default || "");
  const star = field.required ? ` <em class="field-req">*</em>` : "";
  const dim = field.dimWhenReference && hasRef;
  const note = dim ? `<span class="field-note">（由参考图决定）</span>` : "";
  if (field.type === "select") {
    const opts = (field.options || [])
      .map((o) => {
        const ov = Array.isArray(o) ? o[0] : o;
        const ol = Array.isArray(o) ? o[1] : o;
        return `<option value="${escapeHtml(ov)}" ${ov === value ? "selected" : ""}>${escapeHtml(ol)}</option>`;
      })
      .join("");
    return `<div class="node-row"><span>${escapeHtml(field.label)}${star}</span><select data-field="${escapeHtml(field.name)}" ${dim ? "disabled" : ""}>${opts}</select>${note}</div>`;
  }
  if (field.type === "textarea") {
    return `<div class="node-row node-row-col"><span>${escapeHtml(field.label)}${star}</span><textarea data-field="${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value)}</textarea></div>`;
  }
  return `<div class="node-row"><span>${escapeHtml(field.label)}${star}</span><input type="text" data-field="${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder || "")}" value="${escapeHtml(value)}"></div>`;
}

function buildStoryboardPrompt(node) {
  const d = node.data;
  const genreEntry = (storyboardBlacklist && storyboardBlacklist[d.genre]) || storyboardBlacklist?._default || { constraints: [] };
  const blacklistFromGenre = (genreEntry.constraints || []).map((c) => `- ${c}`).join("\n");
  const blacklistExtra = String(d.extraReverseConstraints || "")
    .split(/[,，;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((c) => `- ${c.startsWith("不要") ? c : `不要${c}`}`)
    .join("\n");
  const allBlacklist = [blacklistFromGenre, blacklistExtra].filter(Boolean).join("\n");

  const cells = Number(d.cellCount) || 16;
  const layout = d.gridLayout || "4x4";
  const subject = (d.subject || "未命名主题").trim();

  const sec1 = `# 1. 整体定位\n主题：${subject}。\n美学方向：${d.aestheticDirection || "dreamy"}；物理方向：${d.physicsDirection || "realistic"}。\n要呈现一组 ${cells} 格 ${layout} 网格的分镜，作为下游视频模型的视觉指令通道——版式本身是元数据，不追求"单张漂亮"。`;

  const sec2 = `# 2. 场景设定（禁止 vs 许用）\n禁止：\n${allBlacklist || "- 不要让相邻两格过于相似"}\n许用：${d.sceneAtmosphere || "（按主题自由发挥）"}。`;

  const sec3 = `# 3. 人物一致性（必须跨格保持）\n- 脸：${d.characterFace || "（未指定，模型须在 N 格之间保持同一张脸）"}\n- 服装体系：${d.characterOutfit || "（未指定）"}\n- 气质：${d.characterTemperament || "（未指定）"}`;

  const sec4 = `# 4. 服装妆造\n服装颜色清单：${d.paletteCommitment || "（未指定）"}。整体色系要在 ${cells} 格之间保持。`;

  const sec5 = `# 5. 画面风格（双轨夹角）\n美学：${d.aestheticDirection}；物理：${d.physicsDirection}。这两个维度独立——美学可以梦幻但物理要写实。`;

  const sec6 = `# 6. 版式要求（把分镜信息嵌入图本身）\n- 网格：${layout}（共 ${cells} 格）\n- 视角：${d.perspective || "eye-level"}\n- 每格应有清晰编号（1 至 ${cells}）+ 简短中文标题\n- 相邻格之间应有动作连续性，但视觉区分度要足够（不要相邻两格几乎一样）`;

  const narrative = (d.narrativeArc || "").trim();
  const sec7 = narrative
    ? `# 7. 动作分镜（${cells} 格叙事弧）\n${narrative}`
    : `# 7. 动作分镜（${cells} 格叙事弧）\n按"起 → 承 → 转 → 合"四段把 ${cells} 格切分，每段平均 ${Math.round(cells / 4)} 格，从起势到收尾形成完整动作链。`;

  const sec8 = `# 8. 重点要求（末端权重重述）\n- 全程同一张脸：${d.characterFace || "（按上文一致性约束）"}\n- 同一套造型：${d.characterOutfit || ""}\n- 版式：${layout} 网格 ${cells} 格，每格编号 + 中文标题\n- 反默认：${allBlacklist ? "（见第 2 段黑名单）" : "（默认通用约束）"}`;

  const cameraLine = (d.cameraLanguage || "").trim();
  const sec9 = cameraLine ? `\n# 镜头语言（下游 R2V 节点消费）\n${cameraLine}` : "";

  const decorative = (d.decorativeDetails || "").trim();
  const sec10 = decorative ? `\n# 装饰细节\n${decorative}` : "";

  return [sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10].filter(Boolean).join("\n\n");
}

function buildStoryboardContract(node) {
  const d = node.data;
  const consistencyKeywords = [];
  if (d.characterFace) consistencyKeywords.push(d.characterFace);
  if (d.characterOutfit) consistencyKeywords.push(d.characterOutfit);
  if (d.characterTemperament) consistencyKeywords.push(d.characterTemperament);
  if (d.paletteCommitment) consistencyKeywords.push(`色系：${d.paletteCommitment}`);

  const genreEntry = (storyboardBlacklist && storyboardBlacklist[d.genre]) || { constraints: [] };
  const reverseConstraints = [...(genreEntry.constraints || [])];
  const extra = String(d.extraReverseConstraints || "").split(/[,，;；\n]/).map((s) => s.trim()).filter(Boolean);
  for (const c of extra) reverseConstraints.push(c.startsWith("不要") ? c : `不要${c}`);

  return {
    pathway: d.pathway,
    genre: d.genre,
    consistencyKeywords,
    reverseConstraints,
    cellCount: Number(d.cellCount) || 16,
    gridLayout: d.gridLayout,
    cameraLanguage: d.cameraLanguage,
  };
}

async function generateStoryboard(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "storyboardConfig") return;
  if (!config.data.subject?.trim()) {
    showToast("先填一个主题");
    return;
  }
  try {
    assertImageConfigSize(config);
  } catch (error) {
    showToast(error.message);
    return;
  }
  const prompt = buildStoryboardPrompt(config);
  const contract = buildStoryboardContract(config);
  const existing = state.edges
    .filter((edge) => edge.source === configId)
    .map((edge) => getNode(edge.target))
    .find((node) => node?.type === "image");

  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 410, y: config.position.y }, {
      label: "故事板图像",
      loading: true,
      model: config.data.model,
      storyboardContract: contract,
      storyboardPrompt: prompt,
    });
    addEdge(configId, imageId, "output", { label: "故事板" });
  } else {
    updateNode(imageId, { loading: true, url: false, error: "", storyboardContract: contract, storyboardPrompt: prompt });
  }

  showProcessing("正在生成故事板...");
  try {
    const url = await requestImageGeneration(config, prompt, []);
    updateNode(imageId, {
      loading: false,
      url,
      model: config.data.model,
      gradient: generateGradient(prompt),
      error: "",
      storyboardContract: contract,
    });
    updateNode(configId, { executed: true });
    propagateStoryboardContract(imageId, contract);
    hideProcessing("故事板生成成功");
    void recordProjectHistory({ type: "image", url, prompt: `[storyboard] ${config.data.subject}`, model: config.data.model });
  } catch (error) {
    updateNode(imageId, { loading: false, url: false, error: friendlyImageError(error.message) });
    processing.hidden = true;
    showToast(`故事板生成失败：${error.message}`);
  }
}

async function generateTemplateImage(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "templateImageConfig") return;
  try {
    assertImageConfigSize(config);
  } catch (error) {
    showToast(error.message);
    return;
  }
  const templates = (typeof window !== "undefined" && window.IMAGE_TEMPLATES) || {};
  const tpl = templates[config.data.template] || templates[Object.keys(templates)[0]];
  if (!tpl) {
    showToast("没有可用的模板");
    return;
  }
  const missing = (tpl.fields || []).filter((f) => f.required && !String(config.data[f.name] || "").trim());
  if (missing.length) {
    showToast(`先填：${missing.map((f) => f.label).join("、")}`);
    return;
  }

  const refImageNodes = getImageReferenceSlots(configId).map((ref) => ref.node);
  const hasReference = refImageNodes.length > 0;
  const prompt = tpl.build(config.data, { hasReference });

  const existing = findOutputImageNode(configId);
  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 410, y: config.position.y }, {
      label: `${tpl.label}结果`,
      loading: true,
      model: config.data.model,
    });
    addEdge(configId, imageId, "output", { label: "输出" });
  } else {
    updateNode(imageId, { loading: true, url: false, error: "" });
  }

  const imgConfigured = hasApiKey("image", config.data.providerId);
  showProcessing(imgConfigured ? "正在调用图像 API..." : "未配置图像 API Key，使用本地模拟生成...");

  if (!imgConfigured) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model: config.data.model, gradient: generateGradient(prompt), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("图片生成成功（模拟）");
    }, 850);
    return;
  }

  try {
    const refImages = (await Promise.all(refImageNodes.map((node) => resolveImageForApi(node.data.url)))).filter(Boolean);
    const url = isMjImageModel(config.data.model)
      ? await requestMjImageGeneration(config, prompt, refImages)
      : await requestImageGeneration(config, prompt, refImages);
    updateNode(imageId, { loading: false, url, model: config.data.model, gradient: generateGradient(prompt), error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("图片生成成功");
    void recordProjectHistory({ type: "image", url, prompt: `[${tpl.label}] ${config.data.brandName || ""}`.trim(), model: config.data.model });
  } catch (error) {
    updateNode(imageId, { loading: false, url: false, error: friendlyImageError(error.message) });
    processing.hidden = true;
    showToast(`图片生成失败：${error.message}`);
  }
}

function propagateStoryboardContract(imageId, contract) {
  if (!contract?.consistencyKeywords?.length) return;
  const downstreamVideoConfigs = state.edges
    .filter((edge) => edge.source === imageId)
    .map((edge) => getNode(edge.target))
    .filter((node) => node?.type === "videoConfig");
  if (!downstreamVideoConfigs.length) return;
  for (const vc of downstreamVideoConfigs) {
    const promptNode = state.edges
      .filter((edge) => edge.target === vc.id && edge.type === "promptOrder")
      .map((edge) => getNode(edge.source))
      .find((node) => node?.type === "text");
    if (promptNode) {
      const tag = "[storyboard 一致性] ";
      const keywords = contract.consistencyKeywords.join("；");
      const existingContent = String(promptNode.data.content || "");
      if (!existingContent.includes(tag)) {
        const next = existingContent ? `${existingContent}\n\n${tag}${keywords}` : `${tag}${keywords}`;
        updateNode(promptNode.id, { content: next });
      }
    }
  }
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
  if (source?.type === "storyboardConfig" && target?.type === "image") return { type: "output", label: "故事板" };
  if (source?.type === "templateImageConfig" && target?.type === "image") return { type: "output", label: "输出" };
  if (target?.type === "templateImageConfig" && source?.type === "image") return { type: "imageOrder", label: "参考图" };
  if (target?.type === "imageCompare" && source?.type === "image") return { type: "imageOrder", label: "对比图" };
  if (source?.type === "imageExpand" && target?.type === "image") return { type: "output", label: "输出" };
  if (target?.type === "imageExpand" && source?.type === "image") return { type: "imageOrder", label: "原图" };
  if (source?.type === "styleTransferConfig" && target?.type === "image") return { type: "output", label: "输出" };
  if (target?.type === "styleTransferConfig" && ["image", "layerGroup", "model3dPreview"].includes(source?.type)) {
    const existing = getImageReferenceSlots(targetId).length;
    return { type: "imageOrder", label: window.StyleTransfer.connectionLabel(existing) };
  }
  if (source?.type === "materialTransferConfig" && target?.type === "image") return { type: "output", label: "输出" };
  if (target?.type === "materialTransferConfig" && ["image", "layerGroup", "model3dPreview"].includes(source?.type)) {
    const existing = getImageReferenceSlots(targetId).length;
    return { type: "imageOrder", label: window.MaterialTransfer.connectionLabel(existing) };
  }
  if (source?.type === "productBackgroundConfig" && target?.type === "image") return { type: "output", label: "输出" };
  if (target?.type === "productBackgroundConfig" && ["image", "layerGroup", "model3dPreview"].includes(source?.type)) {
    return { type: "imageOrder", label: window.ProductBackground.nextConnectionLabel(getImageReferenceSlots(targetId)) };
  }
  if (target?.type === "promptOptimizer" && source?.type === "text") return { type: "promptOrder", label: "原始创意" };
  if (target?.type === "storyboardAssistant" && ["text", "llmConfig", "promptOptimizer"].includes(source?.type)) return { type: "promptOrder", label: "故事/概念" };
  if (target?.type === "imageConfig" && ["text", "llmConfig", "storyboardAssistant", "promptOptimizer"].includes(source?.type)) return { type: "promptOrder", label: "提示词" };
  if (target?.type === "imageConfig" && source?.type === "image") return { type: "imageOrder", label: "参考图" };
  if (source?.type === "faceSwapConfig" && target?.type === "image") return { type: "output", label: "输出" };
  if (target?.type === "faceSwapConfig" && source?.type === "image") {
    // 连线先后决定角色：第1张=底图，第2张=脸源。
    const existing = state.edges.filter((e) => e.target === targetId && getNode(e.source)?.type === "image").length;
    const label = existing === 0 ? "底图" : existing === 1 ? "脸源" : `参考图${existing + 1}`;
    return { type: "imageOrder", label };
  }
  if (source?.type === "seedreamEdit" && target?.type === "image") return { type: "output", label: "编辑结果" };
  if (target?.type === "seedreamEdit" && ["image", "layerGroup"].includes(source?.type)) {
    const existing = state.edges.filter((edge) => edge.target === targetId && ["image", "layerGroup"].includes(getNode(edge.source)?.type)).length;
    return { type: "imageOrder", label: existing === 0 ? "待编辑原图" : `参考图 ${existing + 1}` };
  }
  if (target?.type === "layerSeparation" && source?.type === "image") return { type: "imageOrder", label: "原图" };
  if (source?.type === "layerSeparation" && target?.type === "layerGroup") return { type: "output", label: "图层文档" };
  if (source?.type === "layerGroup" && target?.type === "image") return { type: "output", label: "合成图" };
  if (source?.type === "layerGroup" && target?.type === "imageConfig") return { type: "imageOrder", label: "参考图" };
  if (target?.type === "videoConfig" && ["text", "llmConfig", "storyboardAssistant", "promptOptimizer"].includes(source?.type)) return { type: "promptOrder", label: "提示词" };
  if (target?.type === "videoConfig" && ["image", "layerGroup"].includes(source?.type)) return { type: "imageRole", label: "首帧" };
  return { type: "default", label: "连接" };
}

const connectionDropTargets = {
  text: [
    { type: "storyboardAssistant", label: "+ 分镜助手" },
    { type: "promptOptimizer", label: "+ 提示词优化" },
    { type: "imageConfig", label: "+ 图片生成" },
    { type: "videoConfig", label: "+ 文生视频" },
    { type: "storyboardConfig", label: "+ 故事板生成" },
  ],
  llmConfig: [
    { type: "storyboardAssistant", label: "+ 分镜助手" },
    { type: "imageConfig", label: "+ 图片生成" },
    { type: "videoConfig", label: "+ 文生视频" },
    { type: "storyboardConfig", label: "+ 故事板生成" },
  ],
  storyboardAssistant: [
    { type: "imageConfig", label: "+ 图片生成" },
    { type: "videoConfig", label: "+ 文生视频" },
    { type: "storyboardConfig", label: "+ 故事板生成" },
  ],
  templateImageConfig: [
    { type: "image", label: "+ 图像结果" },
  ],
  promptOptimizer: [
    { type: "imageConfig", label: "+ 图片生成" },
    { type: "videoConfig", label: "+ 文生视频" },
  ],
  image: [
    { type: "imageConfig", label: "+ 图片生成(用作参考图)" },
    { type: "styleTransferConfig", label: "+ 风格迁移(用作内容图)" },
    { type: "productBackgroundConfig", label: "+ 产品换背景(用作产品图)" },
    { type: "materialTransferConfig", label: "+ 材质迁移(用作主体/结构)" },
    { type: "seedreamEdit", label: "+ Seedream 精确编辑" },
    { type: "layerSeparation", label: "+ Seedream 智能图层分离" },
    { type: "templateImageConfig", label: "+ 营销物料(用作产品图)" },
    { type: "faceSwapConfig", label: "+ 换脸" },
    { type: "imageCompare", label: "+ 图片对比" },
    { type: "imageExpand", label: "+ 图片扩展" },
    { type: "videoConfig", label: "+ 文生视频(用作首帧)" },
  ],
  imageExpand: [
    { type: "image", label: "+ 扩展结果" },
  ],
  imageConfig: [
    { type: "image", label: "+ 图像结果" },
  ],
  faceSwapConfig: [
    { type: "image", label: "+ 换脸结果" },
  ],
  styleTransferConfig: [
    { type: "image", label: "+ 风格迁移结果" },
  ],
  materialTransferConfig: [
    { type: "image", label: "+ 材质迁移结果" },
  ],
  productBackgroundConfig: [
    { type: "image", label: "+ 产品换背景结果" },
  ],
  seedreamEdit: [
    { type: "image", label: "+ 精确编辑结果" },
  ],
  layerSeparation: [
    { type: "layerGroup", label: "+ 可编辑图层组" },
  ],
  layerGroup: [
    { type: "image", label: "+ 合成图片" },
    { type: "productBackgroundConfig", label: "+ 产品换背景(用作产品图)" },
    { type: "imageConfig", label: "+ 图片生成(用作参考图)" },
    { type: "materialTransferConfig", label: "+ 材质迁移(用作主体/结构)" },
    { type: "seedreamEdit", label: "+ Seedream 精确编辑" },
    { type: "videoConfig", label: "+ 视频生成(用作首帧)" },
  ],
  videoConfig: [
    { type: "video", label: "+ 视频结果" },
  ],
  storyboardConfig: [
    { type: "image", label: "+ 故事板图像" },
  ],
  model3dPreview: [
    { type: "productBackgroundConfig", label: "+ 产品换背景(用作产品图)" },
    { type: "materialTransferConfig", label: "+ 材质迁移(用作主体/结构)" },
    { type: "imageConfig", label: "+ 图片生成(用作参考图)" },
  ],
};

let connectionDropSource = null;
let connectionDropWorld = null;

function showConnectionDropMenu(sourceId, clientX, clientY) {
  const source = getNode(sourceId);
  const targets = connectionDropTargets[source?.type] || [];
  if (!targets.length) return false;
  connectionDropSource = sourceId;
  connectionDropWorld = screenToWorld(clientX, clientY);

  const title = `<div class="context-menu-title">新建并连接</div>`;
  const buttons = targets.map((target) => (
    `<button type="button" data-drop-type="${escapeHtml(target.type)}">${escapeHtml(target.label)}</button>`
  )).join("");
  connectionDropMenu.innerHTML = title + buttons;
  connectionDropMenu.hidden = false;
  connectionDropMenu.style.visibility = "hidden";
  connectionDropMenu.style.left = "0px";
  connectionDropMenu.style.top = "0px";

  const rect = connectionDropMenu.getBoundingClientRect();
  const left = clamp(clientX, 8, window.innerWidth - rect.width - 8);
  const top = clamp(clientY, 8, window.innerHeight - rect.height - 8);
  connectionDropMenu.style.left = `${left}px`;
  connectionDropMenu.style.top = `${top}px`;
  connectionDropMenu.style.visibility = "";
  return true;
}

function hideConnectionDropMenu() {
  connectionDropMenu.hidden = true;
  connectionDropSource = null;
  connectionDropWorld = null;
}

function pickConnectionDropOption(targetType) {
  const sourceId = connectionDropSource;
  const worldPoint = connectionDropWorld;
  hideConnectionDropMenu();
  if (!sourceId || !worldPoint || !targetType) return;
  if (!getNode(sourceId)) return;
  const size = nodeSizes[targetType] || { width: 260, height: 220 };
  const position = {
    x: worldPoint.x - 24,
    y: worldPoint.y - size.height / 2,
  };
  const newId = addNode(targetType, position);
  const connection = inferConnection(sourceId, newId);
  addEdge(sourceId, newId, connection.type, { label: connection.label });
}

connectionDropMenu.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-drop-type]");
  if (!button) return;
  event.stopPropagation();
  pickConnectionDropOption(button.dataset.dropType);
});

async function refreshNode(id) {
  const node = getNode(id);
  if (!node) return;

  if (node.type === "llmConfig") {
    await runLlmNode(id);
    return;
  }
  if (node.type === "storyboardAssistant") {
    await runStoryboardAssistantNode(id);
    return;
  }
  if (node.type === "promptOptimizer") {
    await runPromptOptimizerNode(id);
    return;
  }
  if (node.type === "imageConfig") {
    generateImage(id);
    return;
  }
  if (node.type === "styleTransferConfig") {
    generateStyleTransfer(id);
    return;
  }
  if (node.type === "materialTransferConfig") {
    generateMaterialTransfer(id);
    return;
  }
  if (node.type === "productBackgroundConfig") {
    generateProductBackground(id);
    return;
  }
  if (node.type === "templateImageConfig") {
    generateTemplateImage(id);
    return;
  }
  if (node.type === "imageExpand") {
    generateImageExpand(id);
    return;
  }
  if (node.type === "faceSwapConfig") {
    generateFaceSwap(id);
    return;
  }
  if (node.type === "seedreamEdit") {
    generateSeedreamEdit(id);
    return;
  }
  if (node.type === "layerSeparation") {
    generateLayerSeparation(id);
    return;
  }
  if (node.type === "layerGroup") {
    try {
      await refreshLayerGroupComposite(id);
      showToast("图层组合成图已刷新");
    } catch (error) {
      showToast(`图层合成失败：${error.message}`);
    }
    return;
  }
  if (node.type === "videoConfig") {
    generateVideo(id);
    return;
  }
  if (node.type === "image") {
    const materialConfig = incomingNodes(id, ["materialTransferConfig"])[0];
    const productBackgroundConfig = incomingNodes(id, ["productBackgroundConfig"])[0];
    if (productBackgroundConfig) {
      generateProductBackground(productBackgroundConfig.id);
      return;
    }
    if (materialConfig) {
      generateMaterialTransfer(materialConfig.id);
      return;
    }
    const styleConfig = incomingNodes(id, ["styleTransferConfig"])[0];
    if (styleConfig) {
      generateStyleTransfer(styleConfig.id);
      return;
    }
    const tplConfig = incomingNodes(id, ["templateImageConfig"])[0];
    if (tplConfig) {
      generateTemplateImage(tplConfig.id);
      return;
    }
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
  const source = incomingNodes(id, ["text"]).map((node) => node.data.content).join(" ") || "创意提示词";
  showProcessing(hasApiKey("chat") ? "正在调用文本 API..." : "未配置文本 API Key，使用本地润色...");
  try {
    const output = hasApiKey("chat", node?.data.providerId) ? await polishWithApi(source, node?.data.model, node?.data.providerId) : polishText(source);
    updateNode(id, { output });
    hideProcessing("文本生成完成");
  } catch (error) {
    processing.hidden = true;
    showToast(`文本生成失败：${error.message}`);
  }
}

function getStoryboardAssistantSource(id) {
  return incomingNodes(id, ["text", "llmConfig", "promptOptimizer"])
    .map((node) => {
      if (node.type === "promptOptimizer") return composeOptimizerPrompt(node.data.fields);
      return node.data.output || node.data.content || "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function runStoryboardAssistantNode(id) {
  const node = getNode(id);
  if (!node) return;
  const source = getStoryboardAssistantSource(id);
  const requirements = node.data.requirements || "";
  showProcessing(hasApiKey("chat", node.data.providerId) ? "正在调用分镜助手..." : "未配置文本 API Key，使用本地分镜模板...");
  try {
    const output = hasApiKey("chat", node.data.providerId)
      ? await storyboardAssistantWithApi(source, requirements, node.data.model, node.data.providerId)
      : localStoryboardAssistant(source, requirements);
    updateNode(id, { output });
    hideProcessing("分镜方案已生成");
  } catch (error) {
    processing.hidden = true;
    showToast(`分镜助手失败：${error.message}`);
  }
}

async function runPromptOptimizerNode(id) {
  const node = getNode(id);
  if (!node) return;
  const source = incomingNodes(id, ["text"]).map((n) => n.data.content).filter(Boolean).join("\n\n") || "";
  if (!source.trim()) {
    showToast("先连接一个文本节点提供原始创意");
    return;
  }
  if (!hasApiKey("chat")) {
    const fields = localOptimizePrompt(source);
    updateNode(id, { fields });
    showToast("未配置文本 API Key，已使用本地结构化模板");
    return;
  }
  showProcessing("正在调用提示词优化 API...");
  try {
    const fields = await optimizePromptWithApi(source, node?.data.model, node?.data.providerId);
    updateNode(id, { fields });
    hideProcessing("提示词优化完成");
  } catch (error) {
    processing.hidden = true;
    showToast(`提示词优化失败：${error.message}`);
  }
}

async function optimizePromptWithApi(text, model = getDefaultModel("chat"), providerId = "") {
  const data = await apiFetch("/api/chat/optimize-prompt", {
    method: "POST",
    body: JSON.stringify({
      providerId,
      model: normalizeModelValue("chat", model) || getDefaultModel("chat"),
      text,
    }),
  });
  return {
    subject: data?.subject || "",
    structure: data?.structure || "",
    material: data?.material || "",
    lighting: data?.lighting || "",
    style: data?.style || "",
    composition: data?.composition || "",
  };
}

function localOptimizePrompt(text) {
  const base = String(text || "").trim();
  return {
    subject: base,
    structure: "主体居中、姿态自然，结构层次清晰",
    material: "皮肤/织物/金属/反光面材质准确，纹理细腻",
    lighting: "电影级三点布光，主光偏暖，补光柔和，体积光与空气感",
    style: "高级写实风格，色调统一，质感丰富",
    composition: "中景偏特写，浅景深，背景具有空间纵深与叙事氛围",
  };
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
  const runningOutput = findOutputVideoNode(configId);
  if (runningOutput?.data?.loading && runningOutput.data.taskId) {
    showToast("已有视频任务在生成，请勿重复提交");
    return;
  }
  let ratio = getVideoRatioValue(config.data);
  const klingContext = klingContextForNode(config, "video");
  if (klingContext && window.KlingProvider?.videoRatioForSpec) {
    const firstImage = getImageReferenceSlots(configId)[0]?.node;
    const imageAspect = firstImage?.data?.url ? await probeImageAspect(firstImage.data.url) : 0;
    const inputRatio = imageAspect
      ? nearestByAspect(videoAspectOptions.filter((value) => value !== "adaptive"), imageAspect)
      : "";
    ratio = window.KlingProvider.videoRatioForSpec(klingContext.spec, klingStoredParams(config), inputRatio, ratio);
  }
  // 已连了视频结果节点就复用，不再新建
  const existing = findOutputVideoNode(configId);
  let videoId = existing?.id;
  if (!videoId) {
    videoId = addNode("video", { x: config.position.x + 370, y: config.position.y }, { label: "视频生成中...", loading: true, model: config.data.model, ratio, taskId: `task_${Date.now()}` });
    addEdge(configId, videoId, "output", { label: "输出" });
  } else {
    updateNode(videoId, { loading: true, url: false, error: "", label: "视频生成中...", ratio, model: config.data.model });
  }
  const prompt = normalizePromptReferenceMentions(getNodePrompt(configId) || "make animate");
  // 按 @图片N / @视频N 的槽位顺序收集素材，编号要和提示词里的引用对齐。
  const slots = getReferenceMaterialSlots(configId);
  const images = (await Promise.all(
    slots.filter((s) => s.kind === "image").map((s) => resolveImageForApi(s.node.data.url)),
  )).filter(Boolean);
  const videos = (await Promise.all(
    slots.filter((s) => s.kind === "video").map((s) => resolveImageForApi(s.node.data.url)),
  )).filter(Boolean);

  const vidConfigured = hasApiKey("video", config.data.providerId);
  showProcessing(vidConfigured ? "正在创建视频 API 任务..." : "未配置视频 API Key，使用本地模拟生成...");

  if (!vidConfigured) {
    setTimeout(() => {
      updateNode(videoId, { label: "视频生成结果", loading: false, url: true, gradient: generateGradient(config.data.model + ratio) });
      updateNode(configId, { executed: true });
      hideProcessing("视频任务已完成（模拟）");
    }, 1000);
    return;
  }

  try {
    const created = await requestVideoCreate(config, prompt, images, videos);
    const taskId = created?.id;
    if (!taskId) throw new Error("视频接口未返回任务 ID");
    updateNode(videoId, { taskId, label: "视频生成中...", loading: true, providerId: config.data.providerId });
    await pollVideoTask(videoId, taskId, config.data.providerId);
    updateNode(configId, { executed: true });
    hideProcessing("视频任务已完成");
  } catch (error) {
    handleVideoPollingError(videoId, error);
  }
}

function videoProviderForPolling(providerId = "") {
  const group = backendConfig.providers?.video;
  if (!group) return null;
  const resolvedId = providerId && group.items?.[providerId] ? providerId : group.default;
  return group.items?.[resolvedId] || null;
}

function handleVideoPollingError(videoId, error) {
  const pending = Boolean(error?.pollingPending);
  updateNode(videoId, {
    label: pending ? "视频仍在生成" : "生成失败",
    loading: false,
    error: error.message,
  });
  processing.hidden = true;
  showToast(`${pending ? "视频任务仍在生成" : "视频生成失败"}：${error.message}`);
}

async function resumeVideoTask(videoId) {
  const videoNode = getNode(videoId);
  const taskId = String(videoNode?.data?.taskId || "");
  if (!taskId) {
    showToast("该视频节点没有可查询的任务 ID");
    return;
  }
  const providerId = videoNode.data.providerId || "";
  updateNode(videoId, { label: "视频生成中...", loading: true, error: "" });
  showProcessing("正在继续查询已有视频任务...");
  try {
    await pollVideoTask(videoId, taskId, providerId);
    const config = incomingNodes(videoId, ["videoConfig"])[0];
    if (config) updateNode(config.id, { executed: true });
    hideProcessing("视频任务已完成");
  } catch (error) {
    handleVideoPollingError(videoId, error);
  }
}

async function pollVideoTask(videoId, taskId, providerId = "") {
  const provider = videoProviderForPolling(providerId);
  const policy = window.VideoPolling?.policyFor(providerId, provider)
    || { initialDelayMs: 0, intervalMs: 5000, maxAttempts: providerId === "kling-cli" ? 180 : 24 };
  if (policy.initialDelayMs > 0) {
    processingText.textContent = "视频任务已创建，等待上游登记...";
    await new Promise((resolve) => setTimeout(resolve, policy.initialDelayMs));
  }
  let lastTransientError = "";
  const maxAttempts = policy.maxAttempts;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    processingText.textContent = `视频生成中，正在查询任务... ${attempt + 1}/${maxAttempts}`;
    let result;
    try {
      result = await requestVideoQuery(taskId, providerId);
      lastTransientError = "";
    } catch (error) {
      if (!window.VideoPolling?.isRetryableError(error)) throw error;
      lastTransientError = error.message;
      processingText.textContent = `上游任务正在登记或繁忙，稍后重试... ${attempt + 1}/${maxAttempts}`;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, policy.intervalMs));
        continue;
      }
      break;
    }
    if (result?.video_url) {
      updateNode(videoId, { label: "视频生成结果", loading: false, url: result.video_url, taskId, gradient: generateGradient(taskId), error: "" });
      const videoNode = getNode(videoId);
      const saved = await recordProjectHistory({ type: "video", url: result.video_url, prompt: "", model: videoNode?.data?.model || "" });
      // 上游视频链接会过期；落盘成功后切到持久的本地回流地址，刷新画布后仍可播放。
      if (saved?.fileUrl && getNode(videoId)) updateNode(videoId, { url: saved.fileUrl });
      return;
    }
    if (["failed", "error", "canceled", "cancelled"].includes(String(result?.status || "").toLowerCase())) {
      throw new Error(result?.error || `任务状态：${result.status}`);
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, policy.intervalMs));
    }
  }
  const error = new Error(lastTransientError
    ? `任务暂时无法查询（${lastTransientError}），请稍后继续查询`
    : "任务仍在生成中，请稍后继续查询");
  error.pollingPending = true;
  throw error;
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

function createStyleTransferFromImage(imageId) {
  const image = getNode(imageId);
  if (!image) return;
  const configId = addNode("styleTransferConfig", { x: image.position.x + 340, y: image.position.y }, { label: "风格迁移" });
  addEdge(imageId, configId, "imageOrder", { label: "内容图" });
  showToast("已连接为内容图，再把风格参考图连进来即可");
}

function createMaterialTransferFromSource(sourceId) {
  const source = getNode(sourceId);
  if (!source || !["image", "layerGroup", "model3dPreview"].includes(source.type)) return;
  if (!source.data?.url) {
    showToast(source.type === "model3dPreview" ? "先在 3D 模型预览里截取当前视角" : "先准备好主体 / 结构图");
    return;
  }
  const configId = addNode("materialTransferConfig", { x: source.position.x + 350, y: source.position.y }, { label: "材质迁移" });
  addEdge(sourceId, configId, "imageOrder", { label: "主体 / 结构" });
  showToast("已连接为主体 / 结构，再把材质参考图连进来即可");
}

function createProductBackgroundFromSource(sourceId) {
  const source = getNode(sourceId);
  if (!source || !["image", "layerGroup", "model3dPreview"].includes(source.type)) return;
  const configId = addNode("productBackgroundConfig", { x: source.position.x + 350, y: source.position.y });
  addEdge(sourceId, configId, "imageOrder", { label: "产品图" });
  showToast("已连接产品图，上传或连接背景图即可");
}

function createSeedreamPreciseEdit(imageId) {
  const image = getNode(imageId);
  if (!image) return;
  const configId = addNode("seedreamEdit", { x: image.position.x + 340, y: image.position.y }, { label: "精确图片编辑" });
  addEdge(imageId, configId, "imageOrder", { label: "待编辑原图" });
  showToast("已创建 Seedream 精确编辑节点");
}

function createSeedreamLayerSeparation(imageId) {
  const image = getNode(imageId);
  if (!image || image.type !== "image") return;
  const configId = addNode("layerSeparation", { x: image.position.x + 340, y: image.position.y }, { label: "智能图层分离" });
  addEdge(imageId, configId, "imageOrder", { label: "原图" });
  showToast("已创建 Seedream 智能图层分离节点");
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

function polishText(text) {
  return `${text}，高质量细节，清晰主体，统一风格，电影级光影，构图完整，适合 AI 图像/视频生成。`;
}

function localStoryboardAssistant(text, requirements = "") {
  const subject = String(text || "").trim() || "一个需要影视化呈现的场景";
  const extra = String(requirements || "").trim();
  return `关键假设：${subject}${extra ? `；补充要求：${extra}` : ""}。

场景目标：
- 这场戏用于交代核心人物/事件，并通过镜头递进建立情绪。
- 观众需要接收到：人物处境、环境关系、关键动作和情绪变化。
- 情绪从建立氛围 → 信息推进 → 关键反应 → 收束到下一动作。

镜头结构思路：
- 先用环境镜头建立空间和时间。
- 再用中景/全景明确人物位置与动作关系。
- 用近景/特写推动情绪和信息重点。
- 最后用反应镜头或细节镜头作为剪辑连接点。

逐镜分镜：
1. 远景 / 环境建立
画面内容：展示主要场景、时间、天气和人物所在空间。
机位 / 运镜：固定机位或缓慢推进。
情绪 / 叙事作用：建立氛围与空间关系。
时长建议：3-4 秒。
AI生成建议：优先生成静帧，统一角色外观、服装、光线和场景材质。

2. 全景 / 人物进入关系
画面内容：人物进入画面或处在核心动作开始前的位置。
机位 / 运镜：平视或轻微低角度，保持空间连续。
情绪 / 叙事作用：明确角色与环境的关系。
时长建议：3 秒。
AI生成建议：约束人物服装、姿态、道具，不要更换场景。

3. 中景 / 事件推进
画面内容：人物执行关键动作，画面中保留可识别环境线索。
机位 / 运镜：跟拍、轻推或横移。
情绪 / 叙事作用：推动剧情进入主要事件。
时长建议：4-5 秒。
AI生成建议：适合视频生成，动作描述要具体且单一。

4. 近景 / 情绪反应
画面内容：人物表情、视线或手部细节变化。
机位 / 运镜：稳定近景，浅景深。
情绪 / 叙事作用：让观众理解人物心理。
时长建议：2-3 秒。
AI生成建议：作为关键画面先生成静帧，重点锁定脸、服装、光线。

5. 特写 / 信息重点
画面内容：关键道具、动作细节或视线落点。
机位 / 运镜：特写，轻微推近。
情绪 / 叙事作用：强化转折或信息提示。
时长建议：2 秒。
AI生成建议：拆成独立镜头，避免同画面里同时塞入过多动作。

6. 中远景 / 收束与转场
画面内容：人物完成动作，空间关系重新展开，为下一场留下方向。
机位 / 运镜：缓慢拉远或切空镜。
情绪 / 叙事作用：收束本场，形成转场余韵。
时长建议：3-4 秒。
AI生成建议：可作为补镜或转场镜头，保持色调和材质一致。

关键画面优先级：
- 镜头1：建立场景视觉锚点。
- 镜头4：锁定角色脸和情绪。
- 镜头5：锁定剧情信息点。`;
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
  contextMenu.classList.toggle("submenu-left", left + rect.width + 232 > window.innerWidth - 8);
  contextMenu.classList.toggle("submenu-up", top + rect.height + 190 > window.innerHeight - 8);
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
    items.push({ action: "style-transfer", label: "创建风格迁移" });
    items.push({ action: "product-background", label: "创建产品换背景" });
    items.push({ action: "material-transfer", label: "创建材质迁移" });
    items.push({ action: "seedream-precise-edit", label: "Seedream 精确编辑" });
    items.push({ action: "seedream-layer-separation", label: "Seedream 智能图层分离" });
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
      items.push({ action: "style-transfer", label: "创建风格迁移" });
      items.push({ action: "product-background", label: "创建产品换背景" });
      items.push({ action: "material-transfer", label: "创建材质迁移" });
      items.push({ action: "seedream-precise-edit", label: "Seedream 精确编辑" });
      items.push({ action: "seedream-layer-separation", label: "Seedream 智能图层分离" });
      items.push({ action: "image-to-video", label: "创建生视频" });
    }
    if (node.type === "layerGroup") {
      items.push({ action: "open-layer-editor", label: "编辑图层" });
      items.push({ action: "layer-group-to-image", label: "合成为图片" });
      items.push({ action: "product-background", label: "创建产品换背景" });
      items.push({ action: "material-transfer", label: "创建材质迁移" });
    }
    if (node.type === "model3dPreview") items.push({ action: "material-transfer", label: "创建材质迁移" });
    if (node.type === "model3dPreview") items.push({ action: "product-background", label: "创建产品换背景" });
    if (nodeGroupId) items.push({ action: "remove-node-from-group", label: "移除群组" });
    items.push({ kind: "separator" });
    items.push({ action: "delete-node", label: "删除节点", danger: true });
    items.push({ kind: "separator" });
  }

  const [favoriteSection, ...categorySections] = contextMenuModel.creationSections(contextMenuFavorites);
  items.push({ kind: "title", label: favoriteSection.label });
  if (favoriteSection.items.length) {
    items.push(...favoriteSection.items.map((item) => ({ ...item, kind: "node", favorited: true })));
  } else {
    items.push({ kind: "hint", label: "点击分类中的 ☆ 添加常用" });
  }
  items.push({ kind: "separator" });
  items.push(...categorySections.map((section) => ({
    kind: "submenu",
    label: section.label,
    items: section.items.map((item) => ({
      ...item,
      kind: "node",
      favorited: contextMenuFavorites.includes(item.action),
    })),
  })));
  items.push({ kind: "separator" });
  items.push({ action: "fit-view", label: "适配视图" });

  return items.map(renderContextMenuItem).join("");
}

function renderContextMenuItem(item) {
  if (item.kind === "title") return `<div class="context-menu-title">${escapeHtml(item.label)}</div>`;
  if (item.kind === "separator") return `<div class="context-menu-separator"></div>`;
  if (item.kind === "hint") return `<div class="context-menu-hint">${escapeHtml(item.label)}</div>`;
  if (item.kind === "submenu") {
    return `
      <div class="context-menu-submenu">
        <button type="button" class="context-menu-submenu-trigger">
          <span>${escapeHtml(item.label)}</span><span class="context-menu-chevron">›</span>
        </button>
        <div class="context-menu-submenu-panel">
          <div class="context-menu-title">${escapeHtml(item.label)}</div>
          ${item.items.map(renderContextMenuItem).join("")}
        </div>
      </div>
    `;
  }
  if (item.kind === "node") {
    const favoriteLabel = item.favorited ? "移出常用" : "加入常用";
    return `
      <div class="context-menu-node-row">
        <button type="button" class="context-menu-node-action" data-context-action="${escapeHtml(item.action)}">${escapeHtml(item.label)}</button>
        <button type="button" class="context-menu-favorite-toggle" data-favorite-action="${escapeHtml(item.action)}" aria-label="${favoriteLabel}：${escapeHtml(item.label)}" aria-pressed="${item.favorited ? "true" : "false"}" title="${favoriteLabel}">${item.favorited ? "★" : "☆"}</button>
      </div>
    `;
  }
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
  if (action === "style-transfer" && nodeId) createStyleTransferFromImage(nodeId);
  if (action === "material-transfer" && nodeId) createMaterialTransferFromSource(nodeId);
  if (action === "product-background" && nodeId) createProductBackgroundFromSource(nodeId);
  if (action === "seedream-precise-edit" && nodeId) createSeedreamPreciseEdit(nodeId);
  if (action === "seedream-layer-separation" && nodeId) createSeedreamLayerSeparation(nodeId);
  if (action === "open-layer-editor" && nodeId) openLayerGroupEditor(nodeId);
  if (action === "layer-group-to-image" && nodeId) layerGroupToImage(nodeId);
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
    "add-storyboard-assistant": "storyboardAssistant",
    "add-prompt-optimizer": "promptOptimizer",
    "add-image-config": "imageConfig",
    "add-video-config": "videoConfig",
    "add-storyboard-config": "storyboardConfig",
    "add-template-image-config": "templateImageConfig",
    "add-style-transfer-config": "styleTransferConfig",
    "add-material-transfer-config": "materialTransferConfig",
    "add-product-background-config": "productBackgroundConfig",
    "add-face-swap-config": "faceSwapConfig",
    "add-seedream-edit": "seedreamEdit",
    "add-layer-separation": "layerSeparation",
    "add-image-compare": "imageCompare",
    "add-image-expand": "imageExpand",
    "add-image": "image",
    "add-video": "video",
    "add-model3d": "model3dPreview",
  };
  if (typeByAction[action]) addNode(typeByAction[action], worldPoint);
  if (action === "add-director3d") addDirector3dNode(worldPoint);
  if (action === "add-forced-perspective-poster") addImageTemplateNode("forced-perspective-poster", worldPoint);
  if (action === "add-uploaded-image") {
    const size = nodeSizes.image;
    createUploadedImageNode(null, worldPoint ? { x: worldPoint.x - size.width / 2, y: worldPoint.y - size.height / 2 } : undefined);
  }
  if (action === "add-uploaded-video") {
    const size = nodeSizes.video;
    createUploadedVideoNode(null, worldPoint ? { x: worldPoint.x - size.width / 2, y: worldPoint.y - size.height / 2 } : undefined);
  }
}

function applyTheme() {
  const theme = themeStyles.presentation(state.theme);
  state.theme = theme.state;
  document.body.classList.toggle("dark", theme.state === "dark");
  document.body.dataset.theme = theme.id;
  const themeButton = document.querySelector("[data-action='theme']");
  if (!themeButton) return;
  themeButton.title = `当前：${theme.label}；切换到${theme.nextLabel}`;
  themeButton.setAttribute("aria-label", `切换到${theme.nextLabel}`);
  themeButton.innerHTML = theme.state === "dark"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a7 7 0 1 0 9 9 5.5 5.5 0 0 1-9-9z"/></svg>';
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
  resetImagePreviewView();
  if (imagePreviewImg.complete && imagePreviewImg.naturalWidth) fitImagePreviewDialog();
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
    link.download = `6mang-image-${Date.now()}.png`;
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
  if (drag.type === "compare") saveState();
  if (drag.type === "expand") { saveState(); render(); }
  drag = null;
  viewport.classList.remove("dragging");
  viewport.classList.remove("resizing");
  try { viewport.releasePointerCapture(event?.pointerId); } catch {}
}

// 图片对比：把指针位置换算成分割线百分比，直接改 DOM（拖动时不整页重渲染，避免图片闪烁）
function applyCompareSplit(event) {
  if (!drag || drag.type !== "compare") return;
  const stage = drag.stageEl;
  const node = getNode(drag.nodeId);
  if (!stage || !node) return;
  const rect = stage.getBoundingClientRect();
  if (!rect.width) return;
  const pct = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  node.data.split = pct;
  const clip = stage.querySelector(".compare-clip");
  const divider = stage.querySelector(".compare-divider");
  if (clip) clip.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  if (divider) divider.style.left = `${pct}%`;
}

function cancelCanvasDrag(event) {
  if (!drag) return;
  if (event?.pointerId !== undefined && drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
  drag = null;
  viewport.classList.remove("dragging");
  viewport.classList.remove("resizing");
  try { viewport.releasePointerCapture(event?.pointerId); } catch {}
}

// ===== 图片扩展节点 =====
// 目标输出尺寸 = 原图尺寸 × (1 + 各边 pad)。GPT Image 2 自动吸附到上游允许的 16px 网格。
function fitExpandDimensions(width, height, model) {
  if (isGptImage2Model(model)) return window.GptImage2Sizes.fitDimensions(width, height);
  let w = width;
  let h = height;
  const cap = 2048;
  const maxEdge = Math.max(w, h);
  if (maxEdge > cap) {
    w = (w * cap) / maxEdge;
    h = (h * cap) / maxEdge;
  }
  return { valid: true, width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)), error: "" };
}

function expandTargetSize(node) {
  const ow = Number(node.data._imgW) || 0;
  const oh = Number(node.data._imgH) || 0;
  if (!ow || !oh) return null;
  const padL = +node.data.padL || 0, padR = +node.data.padR || 0, padT = +node.data.padT || 0, padB = +node.data.padB || 0;
  const fw = ow * (1 + padL + padR);
  const fh = oh * (1 + padT + padB);
  const fitted = fitExpandDimensions(fw, fh, node.data.model);
  if (!fitted.valid) {
    return { w: Math.max(1, Math.round(fw)), h: Math.max(1, Math.round(fh)), error: fitted.error };
  }
  return { w: fitted.width, h: fitted.height, error: "" };
}

function computeExpandTargetLabel(node) {
  const s = expandTargetSize(node);
  return s ? (s.error ? "尺寸不可用" : `${s.w} × ${s.h}`) : "加载中…";
}

function updateExpandSizeFeedback(root, node) {
  const target = expandTargetSize(node);
  const size = root?.querySelector(".expand-size");
  const error = root?.querySelector(".expand-size-error");
  if (size) size.textContent = target ? (target.error ? "尺寸不可用" : `${target.w} × ${target.h}`) : "加载中…";
  if (error) {
    error.textContent = target?.error || "";
    error.hidden = !target?.error;
  }
}

// 把"原图 + 四边 pad"组成的画框按比例塞进舞台，并定位原图所在子区域
function layoutExpandStage(stage, node) {
  const frame = stage.querySelector(".expand-frame");
  const img = stage.querySelector(".expand-img");
  const ow = Number(node.data._imgW) || 0, oh = Number(node.data._imgH) || 0;
  if (!frame || !img || !ow || !oh) return;
  const padL = +node.data.padL || 0, padR = +node.data.padR || 0, padT = +node.data.padT || 0, padB = +node.data.padB || 0;
  const fwU = ow * (1 + padL + padR), fhU = oh * (1 + padT + padB);
  // 用布局像素(clientWidth/Height)而非 getBoundingClientRect——后者是画布缩放后的屏幕像素，
  // 会把画布 zoom 叠加进画框尺寸，导致拉近变巨大、拉远变很小。
  const availW = stage.clientWidth - 28, availH = stage.clientHeight - 28; // 留边给手柄
  if (availW <= 0 || availH <= 0) return;
  const scale = Math.min(availW / fwU, availH / fhU);
  frame.style.width = `${Math.round(fwU * scale)}px`;
  frame.style.height = `${Math.round(fhU * scale)}px`;
  img.style.left = `${(padL * ow / fwU) * 100}%`;
  img.style.top = `${(padT * oh / fhU) * 100}%`;
  img.style.width = `${(ow / fwU) * 100}%`;
  img.style.height = `${(oh / fhU) * 100}%`;
}

// 每次渲染后：读出原图自然尺寸缓存到 node.data，再布局舞台
function setupExpandStages() {
  document.querySelectorAll(".expand-stage").forEach((stage) => {
    const node = getNode(stage.closest(".node")?.dataset.id);
    if (!node) return;
    const img = stage.querySelector(".expand-img");
    if (!img) return;
    if (node.data._imgW && node.data._imgH) layoutExpandStage(stage, node);
    const onReady = () => {
      if (img.naturalWidth > 2 && img.naturalHeight > 2) {
        const changed = node.data._imgW !== img.naturalWidth || node.data._imgH !== img.naturalHeight;
        node.data._imgW = img.naturalWidth;
        node.data._imgH = img.naturalHeight;
        layoutExpandStage(stage, node);
        if (changed) {
          updateExpandSizeFeedback(stage.parentElement, node);
        }
      }
    };
    if (img.complete && img.naturalWidth > 2) onReady();
    img.addEventListener("load", onReady);
  });
}

// 图片对比：每次渲染后读出 A 图自然尺寸，按其比例定死舞台 aspect-ratio（横屏输入 → 横屏对比框）
function setupCompareStages() {
  document.querySelectorAll('.node[data-type="imageCompare"] .compare-stage').forEach((stage) => {
    const node = getNode(stage.closest(".node")?.dataset.id);
    if (!node) return;
    // A 图在 .compare-clip 里（B 是裸 .compare-img），取 A 作基准比例
    const aImg = stage.querySelector(".compare-clip .compare-img");
    if (!aImg) return;
    const onReady = () => {
      const w = aImg.naturalWidth, h = aImg.naturalHeight;
      if (w > 2 && h > 2 && (node.data._imgW !== w || node.data._imgH !== h)) {
        node.data._imgW = w;
        node.data._imgH = h;
        // 直接改样式，避免整页重渲染导致图片闪烁（参照 applyCompareSplit 的做法）
        stage.style.aspectRatio = `${w} / ${h}`;
        stage.style.minHeight = "0";
      }
    };
    if (aImg.complete && aImg.naturalWidth > 2) onReady();
    aImg.addEventListener("load", onReady);
  });
}

// 拖某条边的手柄 → 改对应 pad（锁比例时四边一起按相同比例扩）
function applyExpandDrag(event) {
  if (!drag || drag.type !== "expand") return;
  const stage = drag.stageEl;
  const node = getNode(drag.nodeId);
  const img = stage?.querySelector(".expand-img");
  if (!stage || !node || !img) return;
  const r = img.getBoundingClientRect();
  const dx = event.clientX - drag.lastX, dy = event.clientY - drag.lastY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  const fx = r.width ? dx / r.width : 0;
  const fy = r.height ? dy / r.height : 0;
  const cp = (v) => Math.min(3, Math.max(0, v));
  if (node.data.lockRatio) {
    let delta = 0;
    if (drag.side === "right") delta = fx;
    else if (drag.side === "left") delta = -fx;
    else if (drag.side === "bottom") delta = fy;
    else delta = -fy;
    const cur = ((+node.data.padL || 0) + (+node.data.padR || 0) + (+node.data.padT || 0) + (+node.data.padB || 0)) / 4;
    const u = cp(cur + delta);
    node.data.padL = node.data.padR = node.data.padT = node.data.padB = u;
  } else if (drag.side === "right") node.data.padR = cp((+node.data.padR || 0) + fx);
  else if (drag.side === "left") node.data.padL = cp((+node.data.padL || 0) - fx);
  else if (drag.side === "bottom") node.data.padB = cp((+node.data.padB || 0) + fy);
  else node.data.padT = cp((+node.data.padT || 0) - fy);
  layoutExpandStage(stage, node);
  updateExpandSizeFeedback(stage.parentElement, node);
}

function loadImageElement(srcUrl) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("图片加载失败"));
    im.src = srcUrl;
  });
}

async function resolveDrawableSrc(src) {
  const assetId = getIndexedImageId(src);
  if (assetId) return (await loadImageAssetObjectUrl(assetId)) || "";
  if (/^https?:\/\//i.test(src)) return `/api/image-proxy?url=${encodeURIComponent(src)}`;
  return src;
}

// 浏览器端把原图画到更大的透明画布上（用户框选的位置/大小），透明区交给上游扩图
async function buildExpandComposite(src, pads, model) {
  const drawable = await resolveDrawableSrc(src);
  if (!drawable) throw new Error("无法解析原图");
  const img = await loadImageElement(drawable);
  const ow = img.naturalWidth, oh = img.naturalHeight;
  if (!ow || !oh) throw new Error("原图尺寸无效");
  const fw = ow * (1 + pads.padL + pads.padR);
  const fh = oh * (1 + pads.padT + pads.padB);
  const fitted = fitExpandDimensions(fw, fh, model);
  if (!fitted.valid) throw new Error(fitted.error);
  const outW = fitted.width;
  const outH = fitted.height;
  const scale = Math.min(outW / fw, outH / fh);
  const dw = Math.round(ow * scale), dh = Math.round(oh * scale);
  const dx = Math.round((outW - fw * scale) / 2 + pads.padL * ow * scale);
  const dy = Math.round((outH - fh * scale) / 2 + pads.padT * oh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, dx, dy, dw, dh);
  return { dataUrl: canvas.toDataURL("image/png"), outW, outH };
}

function buildExpandPrompt(userText, pads) {
  const dirs = [];
  if (pads.padT > 0.01) dirs.push("上");
  if (pads.padB > 0.01) dirs.push("下");
  if (pads.padL > 0.01) dirs.push("左");
  if (pads.padR > 0.01) dirs.push("右");
  const dirText = dirs.length ? `向${dirs.join("、")}侧` : "";
  const base = `请把这张图${dirText}自然向外扩展（outpainting），填充四周透明/空白区域，与原图无缝衔接：保持原有主体、构图、透视、光线、色调和整体风格完全一致，绝不改动、裁切或缩放原有内容，新扩展出来的部分要真实、连贯、自然。`;
  const t = (userText || "").trim();
  return t ? `${base}\n补充说明：${t}` : base;
}

// 直发精确 size（不走 buildImageGenerationBody，避免 getImageSizeValue 把任意尺寸吸附成预设）
async function requestExpandImage(config, prompt, compositeDataUrl, size) {
  const model = normalizeModelValue("image", config.data.model) || getDefaultModel("image");
  const providerId = config.data.providerId || "";
  if (isGptImage2Model(model)) window.GptImage2Sizes.assertSize(size);
  const data = await apiFetch("/api/images/generations", {
    method: "POST",
    body: JSON.stringify({ providerId, model, prompt, size, n: 1, image: [compositeDataUrl] }),
  });
  const source = extractImageSource(data);
  if (!source) throw new Error("图像接口未返回可显示的图片地址或 base64 数据");
  return persistImageSource(source);
}

async function generateImageExpand(configId) {
  const config = getNode(configId);
  if (!config || config.type !== "imageExpand") return;
  const slots = getImageReferenceSlots(configId);
  const srcNode = slots[0]?.node;
  const src = typeof srcNode?.data?.url === "string" && srcNode.data.url ? srcNode.data.url : "";
  if (!src) { showToast("先连入一张原图"); return; }
  const pads = { padL: +config.data.padL || 0, padR: +config.data.padR || 0, padT: +config.data.padT || 0, padB: +config.data.padB || 0 };
  if (pads.padL + pads.padR + pads.padT + pads.padB < 0.02) { showToast("先把外框往外拖一点，确定扩展范围"); return; }

  let composite, outW, outH;
  try {
    const r = await buildExpandComposite(src, pads, config.data.model);
    composite = r.dataUrl; outW = r.outW; outH = r.outH;
  } catch (e) { showToast(`原图处理失败：${e.message}`); return; }
  const size = `${outW}x${outH}`;
  const prompt = buildExpandPrompt(config.data.prompt, pads);

  const existing = findOutputImageNode(configId);
  let imageId = existing?.id || null;
  if (!imageId) {
    imageId = addNode("image", { x: config.position.x + 430, y: config.position.y }, { label: "扩展结果", loading: true, model: config.data.model });
    addEdge(configId, imageId, "output", { label: "输出" });
  } else {
    updateNode(imageId, { loading: true, url: false, error: "" });
  }

  const imgConfigured = hasApiKey("image", config.data.providerId);
  showProcessing(imgConfigured ? "正在扩展图片..." : "未配置图像 API Key，使用本地模拟...");
  if (!imgConfigured) {
    setTimeout(() => {
      updateNode(imageId, { loading: false, url: true, model: config.data.model, gradient: generateGradient("expand"), error: "" });
      updateNode(configId, { executed: true });
      hideProcessing("扩展完成（模拟）");
    }, 800);
    return;
  }
  try {
    const url = await requestExpandImage(config, prompt, composite, size);
    updateNode(imageId, { loading: false, url, model: config.data.model, gradient: generateGradient(prompt), error: "" });
    updateNode(configId, { executed: true });
    hideProcessing("扩展完成");
    void recordProjectHistory({ type: "image", url, prompt: `[扩展 ${size}]`, model: config.data.model });
  } catch (error) {
    updateNode(imageId, { loading: false, url: false, error: friendlyImageError(error.message) });
    processing.hidden = true;
    showToast(`扩展失败：${error.message}`);
  }
}

function primaryButtonReleased(event) {
  return event.pointerType === "mouse" && (event.buttons & 1) === 0;
}

// 当前拖拽是由哪个键发起的就检测哪个键是否松开：中键(button 1)看 buttons 的第 3 位(值 4)，
// 其余(左键 / 未标注)看第 1 位(值 1)。
function dragButtonReleased(event) {
  if (event.pointerType !== "mouse") return false;
  const bit = drag?.button === 1 ? 4 : 1;
  return (event.buttons & bit) === 0;
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
  // 中键长按拖拽平移画布（不依赖左键，照顾没有中键的鼠标仍可用左键平移）
  if (event.button === 1) {
    event.preventDefault();
    drag = { type: "pan", button: 1, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewX: state.view.x, viewY: state.view.y };
    viewport.classList.add("dragging");
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    return;
  }
  if (event.button !== 0) return;
  if (event.target.closest("[contenteditable='true']")) return;

  const interactive = event.target.closest("button, input, textarea, select, a, summary");
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
  // 图片对比节点：在对比舞台上按下 = 拖动分割线（不触发选中 / 拖节点 / 平移）
  const compareStage = event.target.closest(".compare-stage");
  if (compareStage) {
    event.preventDefault();
    const nodeEl = compareStage.closest(".node");
    if (nodeEl && getNode(nodeEl.dataset.id)) {
      drag = { type: "compare", button: 0, pointerId: event.pointerId, nodeId: nodeEl.dataset.id, stageEl: compareStage };
      viewport.classList.add("dragging");
      try { viewport.setPointerCapture(event.pointerId); } catch {}
      applyCompareSplit(event);
    }
    return;
  }
  // 图片扩展节点：拖某条边的手柄 = 调整该方向的扩展量
  const expandHandle = event.target.closest(".expand-handle");
  if (expandHandle) {
    event.preventDefault();
    const nodeEl = expandHandle.closest(".node");
    const stageEl = expandHandle.closest(".expand-stage");
    if (nodeEl && stageEl && getNode(nodeEl.dataset.id)) {
      drag = { type: "expand", button: 0, pointerId: event.pointerId, nodeId: nodeEl.dataset.id, stageEl, side: expandHandle.dataset.expandSide, lastX: event.clientX, lastY: event.clientY };
      viewport.classList.add("dragging");
      try { viewport.setPointerCapture(event.pointerId); } catch {}
    }
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
  if (dragButtonReleased(event)) {
    finishCanvasDrag(event);
    return;
  }

  if (drag.type === "pan") {
    setView({ ...state.view, x: drag.viewX + event.clientX - drag.startX, y: drag.viewY + event.clientY - drag.startY });
    return;
  }
  if (drag.type === "compare") {
    applyCompareSplit(event);
    return;
  }
  if (drag.type === "expand") {
    applyExpandDrag(event);
    return;
  }
  if (drag.type === "resize") {
    const node = getNode(drag.id);
    if (!node) return;
    const min = getMinNodeSize(node.type);
    const width = Math.round(clamp(drag.width + (event.clientX - drag.startX) / state.view.zoom, min.width, 900));
    const height = Math.round(clamp(drag.height + (event.clientY - drag.startY) / state.view.zoom, min.height, 900));
    if (node.type === "layerGroup") {
      node.data.nodeWidth = width;
      node.data.nodeHeight = height;
    } else {
      node.data.width = width;
      node.data.height = height;
    }
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

// 抑制浏览器中键默认的“自动滚动”光标，让中键专门用于拖拽平移
viewport.addEventListener("mousedown", (event) => {
  if (event.button === 1) event.preventDefault();
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


function beginNodeTitleEdit(titleEl, node) {
  if (titleEl.dataset.editing === "1") return;
  const original = node.data.label || node.type;
  titleEl.dataset.editing = "1";
  titleEl.setAttribute("contenteditable", "true");
  titleEl.spellcheck = false;
  titleEl.classList.add("editing");
  titleEl.textContent = original;

  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  titleEl.focus();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    titleEl.removeEventListener("keydown", onKeyDown);
    titleEl.removeEventListener("blur", onBlur);
    titleEl.removeAttribute("contenteditable");
    titleEl.classList.remove("editing");
    delete titleEl.dataset.editing;
    if (save) {
      const next = titleEl.textContent.replace(/\s+/g, " ").trim();
      const label = next || node.type;
      if (label !== node.data.label) {
        commitHistory();
        updateNode(node.id, { label });
        return;
      }
    }
    titleEl.textContent = original;
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      titleEl.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      titleEl.blur();
    }
  };
  const onBlur = () => finish(true);

  titleEl.addEventListener("keydown", onKeyDown);
  titleEl.addEventListener("blur", onBlur);
}

document.addEventListener("pointerup", (event) => {
  if (!connectionDrag) return;
  const elementUnder = document.elementFromPoint(event.clientX, event.clientY);
  const target = elementUnder?.closest(".node-port.input");
  const targetId = target?.closest(".node")?.dataset.id;
  const shouldClear = connectionDrag.moved;
  try { viewport.releasePointerCapture(event.pointerId); } catch {}

  if (targetId) {
    finishConnection(targetId);
    return;
  }

  if (shouldClear && pendingConnection) {
    const sourceId = pendingConnection;
    const onNode = elementUnder?.closest(".node");
    if (onNode) {
      clearPendingConnection();
      return;
    }
    const popped = showConnectionDropMenu(sourceId, event.clientX, event.clientY);
    clearPendingConnection();
    if (popped) return;
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
  hideDropOverlay();

  const files = [...(event.dataTransfer.files || [])];
  const imageFile = pickImageFile(files);
  const videoFile = pickVideoFile(files);

  if (imageFile && projectHome.hidden) {
    const targetNode = findNodeAtClient(event.clientX, event.clientY, "image");
    if (targetNode) {
      await loadImageFileIntoNode(imageFile, targetNode.id);
    } else {
      const worldPoint = screenToWorld(event.clientX, event.clientY);
      const size = nodeSizes.image;
      await createUploadedImageNode(imageFile, {
        x: worldPoint.x - size.width / 2,
        y: worldPoint.y - size.height / 2,
      });
    }
    return;
  }

  if (videoFile && projectHome.hidden) {
    const targetNode = findNodeAtClient(event.clientX, event.clientY, "video");
    if (targetNode) {
      await loadVideoFileIntoNode(videoFile, targetNode.id);
    } else {
      const worldPoint = screenToWorld(event.clientX, event.clientY);
      const size = nodeSizes.video;
      await createUploadedVideoNode(videoFile, {
        x: worldPoint.x - size.width / 2,
        y: worldPoint.y - size.height / 2,
      });
    }
    return;
  }

  const file = files.find((item) => /\.json$/i.test(item.name) || String(item.type).includes("json"));
  if (projectHome.hidden) await importWorkflowFile(file);
  else await importProjectFile(file);
});

document.addEventListener("paste", async (event) => {
  if (!projectHome.hidden) return;
  if (isTypingTarget(event.target)) return;
  const items = event.clipboardData?.items;
  if (!items) return;
  let imageFile = null;
  let videoFile = null;
  for (const item of items) {
    if (item.kind !== "file") continue;
    const type = String(item.type || "");
    if (!imageFile && type.startsWith("image/")) imageFile = item.getAsFile();
    if (!videoFile && type.startsWith("video/")) videoFile = item.getAsFile();
  }
  if (!imageFile && !videoFile) return;
  event.preventDefault();

  if (imageFile) {
    const selectedImage = [...selectedNodeIds].map((id) => getNode(id)).find((node) => node?.type === "image");
    if (selectedImage) {
      await loadImageFileIntoNode(imageFile, selectedImage.id);
    } else {
      await createUploadedImageNode(imageFile);
    }
    return;
  }

  const selectedVideo = [...selectedNodeIds].map((id) => getNode(id)).find((node) => node?.type === "video");
  if (selectedVideo) {
    await loadVideoFileIntoNode(videoFile, selectedVideo.id);
  } else {
    await createUploadedVideoNode(videoFile);
  }
});

// 所有视频结果都以真实媒体尺寸校准预览比例；loadedmetadata 不冒泡，用捕获监听。
document.addEventListener("loadedmetadata", (event) => {
  const videoEl = event.target;
  if (!(videoEl instanceof HTMLVideoElement) || !videoEl.classList.contains("result-video")) return;
  const node = getNode(videoEl.closest(".node")?.dataset.id);
  const ratio = window.KlingProvider?.videoMetadataRatio({
    source: videoEl.dataset.assetUrl || videoEl.currentSrc || "",
    width: videoEl.videoWidth,
    height: videoEl.videoHeight,
    currentRatio: node?.data?.ratio || "",
  }) || "";
  if (!ratio || !node || node.type !== "video" || node.data.ratio === ratio) return;
  updateNode(node.id, { ratio });
}, true);

document.addEventListener("contextmenu", showContextMenu);

contextMenu.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest("[data-favorite-action]");
  if (favoriteButton) {
    event.preventDefault();
    event.stopPropagation();
    const action = favoriteButton.dataset.favoriteAction;
    const wasFavorite = contextMenuFavorites.includes(action);
    contextMenuFavorites = contextMenuModel.toggleFavorite(contextMenuFavorites, action);
    const saved = safeLocalStorageSet(contextMenuFavoritesStorageKey, JSON.stringify(contextMenuFavorites));
    contextMenu.innerHTML = renderContextMenu();
    showToast(saved ? (wasFavorite ? "已移出常用" : "已加入常用") : "常用设置保存失败");
    return;
  }
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
  if (event.button !== 0) return;
  if (!contextMenu.hidden && !contextMenu.contains(event.target)) hideContextMenu();
  if (!connectionDropMenu.hidden && !connectionDropMenu.contains(event.target)) hideConnectionDropMenu();
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
    if (nodeAction === "generate-storyboard") generateStoryboard(id);
    if (nodeAction === "generate-template-image") generateTemplateImage(id);
    if (nodeAction === "generate-expand") generateImageExpand(id);
    if (nodeAction === "generate-faceswap") generateFaceSwap(id);
    if (nodeAction === "generate-style-transfer") generateStyleTransfer(id);
    if (nodeAction === "generate-material-transfer") generateMaterialTransfer(id);
    if (nodeAction === "generate-product-background") generateProductBackground(id);
    if (nodeAction === "upload-product-background-product") triggerProductBackgroundUpload(id, "product");
    if (nodeAction === "upload-product-background-background") triggerProductBackgroundUpload(id, "background");
    if (nodeAction === "open-seedream-editor") openSeedreamAnnotationEditor(id);
    if (nodeAction === "generate-seedream-edit") generateSeedreamEdit(id);
    if (nodeAction === "generate-layer-separation") generateLayerSeparation(id);
    if (nodeAction === "open-layer-editor") openLayerGroupEditor(id);
    if (nodeAction === "layer-group-to-image") layerGroupToImage(id);
    if (nodeAction === "generate-video") generateVideo(id);
    if (nodeAction === "resume-video-task") resumeVideoTask(id);
    if (nodeAction === "image-to-image") createImageToImage(id);
    if (nodeAction === "image-to-video") createImageToVideo(id);
    if (nodeAction === "edit-image") openImageEditor(id);
    if (nodeAction === "insert-ref-mention") {
      insertReferenceMention(id, event.target.closest("[data-ref-token]")?.dataset.refToken || "");
    }
    if (nodeAction === "video-toggle-play") {
      const v = event.target.closest(".node")?.querySelector("video.result-video");
      if (v) {
        if (v.paused) { v.play().catch(() => {}); event.target.textContent = "⏸"; }
        else { v.pause(); event.target.textContent = "▶"; }
      }
    }
    if (nodeAction === "video-toggle-mute") {
      const v = event.target.closest(".node")?.querySelector("video.result-video");
      if (v) { v.muted = !v.muted; event.target.textContent = v.muted ? "🔇" : "🔊"; }
    }
    if (nodeAction === "run-llm") {
      await runLlmNode(id);
    }
    if (nodeAction === "run-storyboard-assistant") {
      await runStoryboardAssistantNode(id);
    }
    if (nodeAction === "run-prompt-optimizer") {
      await runPromptOptimizerNode(id);
    }
    if (nodeAction === "upload-image") triggerImageUpload(id);
    if (nodeAction === "upload-video") triggerVideoUpload(id);
    if (nodeAction === "model3d-upload") triggerModelUpload(id);
    if (nodeAction === "model3d-open") openModel3dEditor(id);
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
  if (action === "add-storyboard-assistant") addNode("storyboardAssistant");
  if (action === "add-prompt-optimizer") addNode("promptOptimizer");
  if (action === "add-image") addNode("image");
  if (action === "add-uploaded-image") {
    nodeMenu.hidden = true;
    createUploadedImageNode();
  }
  if (action === "add-uploaded-video") {
    nodeMenu.hidden = true;
    createUploadedVideoNode();
  }
  if (action === "add-video") addNode("video");
  if (action === "add-image-config") addNode("imageConfig");
  if (action === "add-video-config") addNode("videoConfig");
  if (action === "add-storyboard-config") addNode("storyboardConfig");
  if (action === "add-forced-perspective-poster") addImageTemplateNode("forced-perspective-poster");
  if (action === "add-template-image-config") addNode("templateImageConfig");
  if (action === "add-style-transfer-config") addNode("styleTransferConfig");
  if (action === "add-material-transfer-config") addNode("materialTransferConfig");
  if (action === "add-product-background-config") addNode("productBackgroundConfig");
  if (action === "add-face-swap-config") addNode("faceSwapConfig");
  if (action === "add-seedream-edit") addNode("seedreamEdit");
  if (action === "add-layer-separation") addNode("layerSeparation");
  if (action === "add-image-compare") addNode("imageCompare");
  if (action === "add-image-expand") addNode("imageExpand");
  if (action === "add-model3d") addNode("model3dPreview");
  if (action === "add-director3d") addDirector3dNode();
  if (action === "zoom-in") setView({ ...state.view, zoom: state.view.zoom * 1.18 });
  if (action === "zoom-out") setView({ ...state.view, zoom: state.view.zoom / 1.18 });
  if (action === "fit-view") fitView();
  if (action === "theme") {
    state.theme = themeStyles.nextTheme(state.theme);
    applyTheme();
    saveState();
  }
  if (action === "settings") {
    await openSettingsModal();
  }
  if (action === "provider-switch") {
    await openProviderSwitch();
  }
  if (action === "workflow-panel") {
    templatePanel.hidden = !templatePanel.hidden;
    historyPanel.hidden = true;
    renderTemplateLibrary();
  }
  if (action === "close-template-panel") templatePanel.hidden = true;
  if (action === "history-panel") {
    historyPanel.hidden = !historyPanel.hidden;
    templatePanel.hidden = true;
    if (!historyPanel.hidden) renderHistoryPanel();
  }
  if (action === "close-history-panel") historyPanel.hidden = true;
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
  const nodeEl = control?.closest?.(".node");
  if (!nodeEl) return false;
  const node = getNode(nodeEl.dataset.id);
  if (!node) return false;
  const klingParam = control?.dataset?.klingParam;
  if (klingParam) {
    if (!node.data.dynamicParams) node.data.dynamicParams = {};
    if (!node.data.dynamicParams["kling-cli"]) node.data.dynamicParams["kling-cli"] = {};
    if (!node.data.dynamicParams["kling-cli"][node.data.model]) node.data.dynamicParams["kling-cli"][node.data.model] = {};
    node.data.dynamicParams["kling-cli"][node.data.model][klingParam] = control.value;
    if (node.type === "videoConfig" && klingParam === "aspect_ratio") node.data.ratio = control.value;
    saveState();
    return true;
  }
  const field = control?.dataset?.field;
  if (!field) return false;
  const value = control.type === "checkbox" ? control.checked : control.value;
  if (field === "model") {
    const parsed = parseModelKey(value);
    node.data.providerId = parsed.providerId;
    node.data.model = parsed.model;
  } else if ((field === "sizeRatio" || field === "sizeTier") && isGptImage2Model(node.data.model)) {
    const current = gptImage2PresetFromData(node.data);
    const ratio = field === "sizeRatio" ? value : current.ratio;
    const tier = field === "sizeTier" ? value : current.tier;
    applyGptImage2Preset(node.data, window.GptImage2Sizes.getPreset(ratio, tier));
  } else {
    node.data[field] = value;
  }
  if (field === "model" && node.type === "imageConfig") {
    if (isMjImageModel(node.data.model)) {
      node.data.mjAr = node.data.mjAr || "1:1";
      node.data.mjVersion = getMjVersion(node.data.model, node.data.mjVersion);
      node.data.mjSpeed = node.data.mjSpeed || "fast";
    } else {
      node.data.size = getImageSizeValue(node.data.model, node.data.size);
    }
  }
  if (field === "model" && ["styleTransferConfig", "materialTransferConfig", "productBackgroundConfig"].includes(node.type)) {
    if (isMjImageModel(node.data.model)) {
      node.data.mjAr = node.data.mjAr || "1:1";
      node.data.mjVersion = getMjVersion(node.data.model, node.data.mjVersion);
      node.data.mjSpeed = node.data.mjSpeed || "fast";
    } else {
      node.data.size = getImageSizeValue(node.data.model, node.data.size);
    }
  }
  if (field === "model" && node.type === "seedreamEdit") {
    node.data.providerId = "volc";
    node.data.model = "doubao-seedream-5-0-pro-260628";
    node.data.size = getImageSizeValue(node.data.model, node.data.size);
    node.data.outputFormat = node.data.outputFormat === "jpeg" ? "jpeg" : "png";
    node.data.promptOptimization = node.data.promptOptimization === "fast" ? "fast" : "standard";
  }
  if (field === "model" && node.type === "layerSeparation") {
    node.data.providerId = "volc";
    node.data.model = "doubao-seedream-5-0-pro-260628";
    node.data.size = ["auto", "1K", "1.5K", "2K"].includes(node.data.size) ? node.data.size : "auto";
    node.data.promptOptimization = node.data.promptOptimization === "fast" ? "fast" : "standard";
  }
  if (field === "seed" && node.type === "layerSeparation") {
    node.data.seed = Math.max(0, Math.min(2147483647, Math.trunc(Number(value) || 0)));
  }
  if (field === "model" && (node.type === "storyboardConfig" || node.type === "templateImageConfig")) {
    node.data.size = getImageSizeValue(node.data.model, node.data.size);
  }
  if (field === "template" && node.type === "templateImageConfig") {
    const templates = (typeof window !== "undefined" && window.IMAGE_TEMPLATES) || {};
    const tpl = templates[node.data.template];
    if (tpl) {
      for (const [k, v] of Object.entries(tpl.defaults || {})) {
        if (node.data[k] == null) node.data[k] = v;
      }
      node.data.size = getImageSizeValue(node.data.model, tpl.size || node.data.size);
    }
  }
  if (field === "model" && node.type === "videoConfig") {
    node.data.ratio = getVideoRatioValue(node.data);
  }
  if (field === "model" && isGptImage2Model(node.data.model) && ["imageConfig", "storyboardConfig", "templateImageConfig"].includes(node.type)) {
    applyGptImage2Preset(node.data);
    if (node.data.quality === "4K") node.data.quality = "高清画质";
  }
  saveState();
  if (field === "content") {
    syncPromptEditorVisuals(control);
    updatePromptMentionMenu(control);
    return true;
  }
  const tag = control.tagName;
  const type = control.type;
  const isTextInput = tag === "INPUT" && (type === "text" || type === "number" || type === "search" || type === "url");
  const isTextarea = tag === "TEXTAREA";
  const isRange = tag === "INPUT" && type === "range";
  if (isRange) {
    // 滑块拖动不重建画布（否则卡顿+丢焦点），只更新旁边的数字
    const out = nodeEl.querySelector(`[data-range-label="${field}"]`);
    if (out) out.textContent = `${value}s`;
    return true;
  }
  if (isTextInput || isTextarea) return true;
  render();
  return true;
}

function normalizeNodeModelValue(nodeType, value) {
  if (nodeType === "llmConfig") return normalizeModelValue("chat", value);
  if (nodeType === "storyboardAssistant") return normalizeModelValue("chat", value);
  if (nodeType === "promptOptimizer") return normalizeModelValue("chat", value);
  if (nodeType === "imageConfig") return normalizeModelValue("image", value);
  if (nodeType === "styleTransferConfig") return normalizeModelValue("image", value);
  if (nodeType === "materialTransferConfig") return normalizeModelValue("image", value);
  if (nodeType === "productBackgroundConfig") return normalizeModelValue("image", value);
  if (nodeType === "templateImageConfig") return normalizeModelValue("image", value);
  if (nodeType === "seedreamEdit") return normalizeModelValue("image", value);
  if (nodeType === "layerSeparation") return normalizeModelValue("image", value);
  if (nodeType === "videoConfig") return normalizeModelValue("video", value);
  return value;
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
  syncNodeFieldControl(event.target);
});

// 记住「营销物料」节点里「更多选项」折叠区的展开状态，避免重渲染后被收起。
// toggle 事件不冒泡，用捕获阶段监听。
document.addEventListener("toggle", (event) => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement)) return;
  const nodeEl = details.closest?.(".node");
  if (!nodeEl) return;
  const node = getNode(nodeEl.dataset.id);
  if (!node || node.type !== "templateImageConfig") return;
  node.data._optOpen = details.open;
  saveState();
}, true);

projectImportInput.addEventListener("change", async () => {
  await importProjectFile(projectImportInput.files?.[0]);
});

document.addEventListener("keydown", (event) => {
  if (activeModel3dEditor) return;
  if (event.key === "Escape" && !connectionDropMenu.hidden) {
    event.preventDefault();
    hideConnectionDropMenu();
    return;
  }
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

  // Alt+G：把当前框选的多个节点群组化（用物理键 KeyG，不受 Alt 组合出的特殊字符影响）
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyG" && !isTypingTarget(event.target)) {
    event.preventDefault();
    createGroupFromSelection();
    return;
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

const authOverlay = document.createElement("div");
authOverlay.className = "auth-overlay";
authOverlay.hidden = true;
authOverlay.innerHTML = `
  <div class="auth-card">
    <h1>登录</h1>
    <div class="auth-tabs">
      <button data-auth-mode="login" class="active">登录</button>
      <button data-auth-mode="register">注册</button>
    </div>
    <form class="auth-form" data-auth-form>
      <label><span>用户名</span><input type="text" name="username" autocomplete="username" required></label>
      <label><span>密码</span><input type="password" name="password" autocomplete="current-password" required></label>
      <button type="submit" class="primary-small">提交</button>
      <div class="auth-error" data-auth-error></div>
    </form>
    <div class="auth-hint">默认管理员 <code>admin / admin1234</code>（可在 .env 改 ADMIN_PASSWORD）</div>
  </div>
`;
document.body.append(authOverlay);

const userBadge = document.createElement("div");
userBadge.className = "user-badge";
userBadge.hidden = true;
userBadge.innerHTML = `
  <span class="user-badge-name" data-user-name></span>
  <span class="user-badge-balance" data-user-balance>0</span>
  <button class="ghost-small" data-action="open-account">个人中心</button>
  <button class="ghost-small" data-action="open-admin" data-admin-only hidden>管理后台</button>
  <button class="ghost-small" data-action="logout">退出</button>
`;
document.body.append(userBadge);

const accountDialog = document.createElement("dialog");
accountDialog.className = "account-dialog";
accountDialog.innerHTML = `
  <div class="account-shell">
    <div class="account-head">
      <strong>个人中心</strong>
      <button class="icon-button" data-action="close-account" aria-label="关闭">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="account-summary">
      <div class="account-summary-cell">
        <span>账户</span>
        <strong data-account-username></strong>
      </div>
      <div class="account-summary-cell">
        <span>当前积分</span>
        <strong data-account-balance class="account-balance-strong">0</strong>
      </div>
      <div class="account-summary-cell">
        <span>注册时间</span>
        <strong data-account-created></strong>
      </div>
    </div>
    <div class="account-tabs">
      <button data-account-tab="transactions" class="active">积分流水</button>
      <button data-account-tab="usage">调用记录</button>
    </div>
    <div class="account-list" data-account-list></div>
  </div>
`;
document.body.append(accountDialog);

const adminDialog = document.createElement("dialog");
adminDialog.className = "account-dialog admin-dialog";
adminDialog.innerHTML = `
  <div class="account-shell">
    <div class="account-head">
      <strong>管理员后台</strong>
      <button class="icon-button" data-action="close-admin" aria-label="关闭">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="admin-grid">
      <div class="admin-pane admin-users">
        <div class="admin-pane-head">
          <strong>用户列表</strong>
          <button class="ghost-small" data-action="reload-admin">刷新</button>
        </div>
        <div class="admin-user-list" data-admin-user-list></div>
      </div>
      <div class="admin-pane admin-detail">
        <div class="admin-pane-head">
          <strong data-admin-detail-title>选择左侧用户查看详情</strong>
        </div>
        <div class="admin-credit-form" data-admin-credit-form hidden>
          <input type="number" placeholder="正数加 / 负数扣" data-admin-amount>
          <input type="text" placeholder="备注 (选填)" data-admin-note>
          <button class="primary-small" data-action="apply-credit">提交</button>
        </div>
        <div class="admin-tabs" data-admin-tabs hidden>
          <button data-admin-tab="transactions" class="active">积分流水</button>
          <button data-admin-tab="usage">调用记录</button>
        </div>
        <div class="admin-list" data-admin-list></div>
      </div>
    </div>
  </div>
`;
document.body.append(adminDialog);

let accountActiveTab = "transactions";
let adminSelectedUserId = null;
let adminActiveTab = "transactions";

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function transactionTypeLabel(type) {
  switch (type) {
    case "spend": return "消耗";
    case "refund": return "退款";
    case "admin_credit": return "管理员加分";
    case "admin_debit": return "管理员扣分";
    case "register": return "注册";
    default: return type || "";
  }
}

async function renderAccountList() {
  const listEl = accountDialog.querySelector("[data-account-list]");
  listEl.textContent = "加载中...";
  const path = accountActiveTab === "transactions" ? "/api/billing/transactions" : "/api/billing/usage";
  try {
    const response = await fetch(path);
    const data = await response.json();
    if (accountActiveTab === "transactions") {
      const items = data?.transactions || [];
      if (!items.length) { listEl.innerHTML = `<div class="account-empty">暂无流水</div>`; return; }
      listEl.innerHTML = items.map((row) => `
        <div class="account-row">
          <span class="account-row-time">${escapeHtml(formatTime(row.created_at))}</span>
          <span class="account-row-type">${escapeHtml(transactionTypeLabel(row.type))}</span>
          <span class="account-row-amount ${row.amount >= 0 ? "positive" : "negative"}">${row.amount >= 0 ? "+" : ""}${row.amount}</span>
          <span class="account-row-balance">余额 ${row.balance_after}</span>
          <span class="account-row-desc">${escapeHtml(row.description || "")}</span>
        </div>
      `).join("");
    } else {
      const items = data?.usage || [];
      if (!items.length) { listEl.innerHTML = `<div class="account-empty">暂无调用记录</div>`; return; }
      listEl.innerHTML = items.map((row) => `
        <div class="account-row">
          <span class="account-row-time">${escapeHtml(formatTime(row.created_at))}</span>
          <span class="account-row-type">${escapeHtml(row.route)}</span>
          <span class="account-row-amount">${row.cost} 分</span>
          <span class="account-row-balance">${escapeHtml(row.model || "")}</span>
          <span class="account-row-desc">${escapeHtml(row.status || "")}</span>
        </div>
      `).join("");
    }
  } catch (error) {
    listEl.innerHTML = `<div class="account-empty">加载失败：${escapeHtml(error.message)}</div>`;
  }
}

function openAccountDialog() {
  if (!currentAuthUser) return;
  accountDialog.querySelector("[data-account-username]").textContent = currentAuthUser.username + (currentAuthUser.isAdmin ? "（管理员）" : "");
  accountDialog.querySelector("[data-account-balance]").textContent = `${currentAuthUser.balance} 积分`;
  accountDialog.querySelector("[data-account-created]").textContent = formatTime(currentAuthUser.createdAt);
  accountActiveTab = "transactions";
  accountDialog.querySelectorAll("[data-account-tab]").forEach((btn) => btn.classList.toggle("active", btn.dataset.accountTab === "transactions"));
  if (!accountDialog.open) accountDialog.showModal();
  void renderAccountList();
}

accountDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-action='close-account']")) accountDialog.close();
  const tab = event.target.closest("[data-account-tab]");
  if (tab) {
    accountActiveTab = tab.dataset.accountTab;
    accountDialog.querySelectorAll("[data-account-tab]").forEach((btn) => btn.classList.toggle("active", btn === tab));
    void renderAccountList();
  }
  if (event.target === accountDialog) accountDialog.close();
});

async function renderAdminUserList() {
  const listEl = adminDialog.querySelector("[data-admin-user-list]");
  listEl.textContent = "加载中...";
  try {
    const response = await fetch("/api/admin/users");
    const data = await response.json();
    const users = data?.users || [];
    listEl.innerHTML = users.map((user) => `
      <button class="admin-user-row ${user.id === adminSelectedUserId ? "active" : ""}" data-admin-user-id="${user.id}">
        <div class="admin-user-row-name">${escapeHtml(user.username)}${user.isAdmin ? ' <span class="admin-tag">admin</span>' : ""}</div>
        <div class="admin-user-row-balance">${user.balance} 积分</div>
      </button>
    `).join("");
  } catch (error) {
    listEl.innerHTML = `<div class="account-empty">加载失败：${escapeHtml(error.message)}</div>`;
  }
}

async function renderAdminDetail(userId) {
  adminSelectedUserId = userId;
  adminDialog.querySelectorAll(".admin-user-row").forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.adminUserId) === userId));
  const listEl = adminDialog.querySelector("[data-admin-list]");
  if (!userId) {
    adminDialog.querySelector("[data-admin-detail-title]").textContent = "选择左侧用户查看详情";
    adminDialog.querySelector("[data-admin-credit-form]").hidden = true;
    adminDialog.querySelector("[data-admin-tabs]").hidden = true;
    listEl.innerHTML = "";
    return;
  }
  const target = (await (await fetch("/api/admin/users")).json())?.users?.find((u) => u.id === userId);
  adminDialog.querySelector("[data-admin-detail-title]").textContent = target ? `${target.username} · 当前余额 ${target.balance}` : `用户 #${userId}`;
  adminDialog.querySelector("[data-admin-credit-form]").hidden = false;
  adminDialog.querySelector("[data-admin-tabs]").hidden = false;

  listEl.textContent = "加载中...";
  const path = adminActiveTab === "transactions"
    ? `/api/admin/users/${userId}/transactions`
    : `/api/admin/users/${userId}/usage`;
  try {
    const data = await (await fetch(path)).json();
    if (adminActiveTab === "transactions") {
      const items = data?.transactions || [];
      if (!items.length) { listEl.innerHTML = `<div class="account-empty">暂无流水</div>`; return; }
      listEl.innerHTML = items.map((row) => `
        <div class="account-row">
          <span class="account-row-time">${escapeHtml(formatTime(row.created_at))}</span>
          <span class="account-row-type">${escapeHtml(transactionTypeLabel(row.type))}</span>
          <span class="account-row-amount ${row.amount >= 0 ? "positive" : "negative"}">${row.amount >= 0 ? "+" : ""}${row.amount}</span>
          <span class="account-row-balance">余额 ${row.balance_after}</span>
          <span class="account-row-desc">${escapeHtml(row.description || "")}</span>
        </div>
      `).join("");
    } else {
      const items = data?.usage || [];
      if (!items.length) { listEl.innerHTML = `<div class="account-empty">暂无调用记录</div>`; return; }
      listEl.innerHTML = items.map((row) => `
        <div class="account-row">
          <span class="account-row-time">${escapeHtml(formatTime(row.created_at))}</span>
          <span class="account-row-type">${escapeHtml(row.route)}</span>
          <span class="account-row-amount">${row.cost} 分</span>
          <span class="account-row-balance">${escapeHtml(row.model || "")}</span>
          <span class="account-row-desc">${escapeHtml(row.status || "")}</span>
        </div>
      `).join("");
    }
  } catch (error) {
    listEl.innerHTML = `<div class="account-empty">加载失败：${escapeHtml(error.message)}</div>`;
  }
}

function openAdminDialog() {
  if (!currentAuthUser?.isAdmin) {
    showToast("仅管理员可访问");
    return;
  }
  adminSelectedUserId = null;
  adminActiveTab = "transactions";
  if (!adminDialog.open) adminDialog.showModal();
  void renderAdminUserList();
  void renderAdminDetail(null);
}

adminDialog.addEventListener("click", async (event) => {
  if (event.target.closest("[data-action='close-admin']")) { adminDialog.close(); return; }
  if (event.target.closest("[data-action='reload-admin']")) { void renderAdminUserList(); return; }
  if (event.target === adminDialog) { adminDialog.close(); return; }
  const userRow = event.target.closest("[data-admin-user-id]");
  if (userRow) { void renderAdminDetail(Number(userRow.dataset.adminUserId)); return; }
  const tab = event.target.closest("[data-admin-tab]");
  if (tab) {
    adminActiveTab = tab.dataset.adminTab;
    adminDialog.querySelectorAll("[data-admin-tab]").forEach((btn) => btn.classList.toggle("active", btn === tab));
    void renderAdminDetail(adminSelectedUserId);
    return;
  }
  if (event.target.closest("[data-action='apply-credit']")) {
    if (!adminSelectedUserId) { showToast("先选用户"); return; }
    const amount = Number(adminDialog.querySelector("[data-admin-amount]").value) || 0;
    const note = adminDialog.querySelector("[data-admin-note]").value || "";
    if (!amount) { showToast("金额不能为 0"); return; }
    const target = (await (await fetch("/api/admin/users")).json())?.users?.find((u) => u.id === adminSelectedUserId);
    if (!target) return;
    const response = await fetch("/api/admin/credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: target.username, amount, note }),
    });
    const data = await response.json();
    if (!response.ok) { showToast(`失败：${data?.error || response.status}`); return; }
    showToast(`已调整：${target.username} 当前 ${data.balance}`);
    adminDialog.querySelector("[data-admin-amount]").value = "";
    adminDialog.querySelector("[data-admin-note]").value = "";
    void renderAdminUserList();
    void renderAdminDetail(adminSelectedUserId);
    if (currentAuthUser && target.username === currentAuthUser.username) void refreshAuthUser();
  }
});

let currentAuthUser = null;
let authMode = "login";

function applyAuthMode(mode) {
  authMode = mode;
  authOverlay.querySelectorAll("[data-auth-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.authMode === mode);
  });
  authOverlay.querySelector("h1").textContent = mode === "login" ? "登录" : "注册";
  authOverlay.querySelector("[data-auth-error]").textContent = "";
  authOverlay.querySelector("button[type='submit']").textContent = mode === "login" ? "登录" : "注册";
}

authOverlay.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-auth-mode]");
  if (tab) applyAuthMode(tab.dataset.authMode);
});

authOverlay.querySelector("[data-auth-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  const errorEl = authOverlay.querySelector("[data-auth-error]");
  errorEl.textContent = "";
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    currentAuthUser = data.user;
    renderUserBadge();
    authOverlay.hidden = true;
    initializeProjectManager();
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

userBadge.addEventListener("click", async (event) => {
  if (event.target.closest("[data-action='logout']")) {
    await fetch("/api/auth/logout", { method: "POST" });
    currentAuthUser = null;
    userBadge.hidden = true;
    appShell.hidden = true;
    projectHome.hidden = true;
    authOverlay.hidden = false;
    return;
  }
  if (event.target.closest("[data-action='open-account']")) {
    openAccountDialog();
    return;
  }
  if (event.target.closest("[data-action='open-admin']")) {
    openAdminDialog();
    return;
  }
});

function renderUserBadge() {
  if (!currentAuthUser) {
    userBadge.hidden = true;
    return;
  }
  userBadge.hidden = false;
  userBadge.querySelector("[data-user-name]").textContent = currentAuthUser.username + (currentAuthUser.isAdmin ? " (admin)" : "");
  userBadge.querySelector("[data-user-balance]").textContent = `${currentAuthUser.balance} 积分`;
  const adminBtn = userBadge.querySelector("[data-admin-only]");
  if (adminBtn) adminBtn.hidden = !currentAuthUser.isAdmin;
}

async function refreshAuthUser() {
  try {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    currentAuthUser = data?.user || null;
  } catch {
    currentAuthUser = null;
  }
  renderUserBadge();
}

async function bootstrap() {
  await refreshAuthUser();
  if (currentAuthUser) {
    authOverlay.hidden = true;
    await loadBackendStatus();
    await loadStoryboardBlacklist();
    renderTemplateLibrary();
    applyTheme();
    initializeProjectManager();
  } else {
    await loadStoryboardBlacklist();
    appShell.hidden = true;
    projectHome.hidden = true;
    authOverlay.hidden = false;
    applyAuthMode("login");
  }
}

bootstrap();
