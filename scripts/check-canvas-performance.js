// 独立临时浏览器与静态测试服务，不读取用户项目，也不调用生成接口。
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

function findChrome() {
  return [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => p && fs.existsSync(p));
}

async function checkCanvas() {
  const chrome = findChrome();
  if (!chrome) return null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "6mang-canvas-perf-"));
  const root = path.resolve(__dirname, "../public");
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/__test-video.webm") {
      res.setHeader("Content-Type", "video/webm");
      res.end(fs.readFileSync(path.join(__dirname, "fixtures/canvas-video.webm")));
      return;
    }
    if (pathname.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(pathname === "/api/auth/me" ? { user: { username: "performance-test", balance: 0 } } : {}));
      return;
    }
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    fs.readFile(file, (error, data) => error ? res.writeHead(404).end() : res.end(data));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const child = spawn(chrome, ["--headless=new", "--no-sandbox", "--no-first-run", "--disable-background-networking",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--window-size=1440,1000",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  let ws;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await once(ws, "open");
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        clearTimeout(timer);
        pending.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const next = ++id;
      const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 90000);
      pending.set(next, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 100; i++) {
      if (await evaluate("typeof bootstrap === 'function' && !!document.querySelector('#app-shell')")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 300));
    const result = await evaluate(`(${browserCheck.toString()})()`);
    if (process.env.CANVAS_PERF_SCREENSHOT) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(process.env.CANVAS_PERF_SCREENSHOT, Buffer.from(shot.data, "base64"));
    }
    if (process.env.CANVAS_PERF_REPORT) fs.writeFileSync(process.env.CANVAS_PERF_REPORT, JSON.stringify(result, null, 2));
    return result;
  } finally {
    ws?.close();
    child.kill();
    if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 3000))]);
    await new Promise((r) => server.close(r));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

async function browserCheck() {
  const frame = () => new Promise(requestAnimationFrame);
  const settle = async () => { await frame(); await frame(); await frame(); };
  appShell.hidden = false; projectHome.hidden = true;
  const base = defaultState();
  state = { view: { x: 60, y: 100, zoom: 0.55 }, theme: "light", nodes: [], edges: [], groups: [] };
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < base.nodes.length; j++) {
      const n = JSON.parse(JSON.stringify(base.nodes[j]));
      n.id = `perf-${i}-${j}`;
      n.position = { x: (i % 4) * 1900 + j * 350, y: Math.floor(i / 4) * 1100 + (j % 2) * 380 };
      state.nodes.push(n);
    }
    for (let j = 0; j < base.edges.length; j++) {
      const e = base.edges[j];
      state.edges.push({ ...e, id: `edge-${i}-${j}`, source: `perf-${i}-${base.nodes.findIndex(n => n.id === e.source)}`, target: `perf-${i}-${base.nodes.findIndex(n => n.id === e.target)}` });
    }
  }
  state.groups = [{ id: "perf-group", label: "性能验证", nodeIds: ["perf-0-0", "perf-0-1"] }];
  projectLibrary = { activeProjectId: "perf-project", projects: [{ id: "perf-project", name: "性能验证", workflow: JSON.parse(JSON.stringify(state)) }] };
  setSelectedNodes([]); applyTheme(); render(); await settle();
  const metrics = {};
  let counts;
  const originalRender = render, originalSave = saveState, originalRect = Element.prototype.getBoundingClientRect;
  const originalEdges = renderEdges;
  render = function(...args) { if (counts) counts.renders++; return originalRender(...args); };
  saveState = function(...args) { if (counts) counts.saves++; return originalSave(...args); };
  renderEdges = function(...args) { if (counts) counts.edgeUpdates = (counts.edgeUpdates || 0) + 1; return originalEdges(...args); };
  Element.prototype.getBoundingClientRect = function(...args) { if (counts) counts.rectReads++; return originalRect.apply(this, args); };
  const emit = (type, target, x, y, extra = {}) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, ...extra }));
  async function measure(name, target, extra = {}) {
    await settle();
    const retained = world.querySelector('.node[data-id="perf-0-4"]');
    counts = { renders: 0, saves: 0, rectReads: 0 };
    const durations = [], intervals = [];
    emit("pointerdown", target, 100, 200, extra);
    let previous = performance.now();
    for (let i = 1; i <= 24; i++) {
      const start = performance.now();
      for (let k = 0; k < 4; k++) emit("pointermove", viewport, 100 + i * 4 + k, 200 + i * 2, extra);
      durations.push(performance.now() - start);
      await frame();
      intervals.push(performance.now() - previous); previous = performance.now();
    }
    emit("pointerup", viewport, 199, 248, extra);
    await settle();
    metrics[name] = { ...counts, retainedNode: retained === world.querySelector('.node[data-id="perf-0-4"]'), meanHandlerMs: durations.reduce((a,b)=>a+b,0)/durations.length, p95FrameMs: intervals.sort((a,b)=>a-b)[Math.floor(intervals.length*.95)] };
    counts = null;
  }
  await measure("nodeDrag", world.querySelector('.node[data-id="perf-0-0"] .node-head'));
  await measure("groupDrag", world.querySelector(".node-group-title"));
  await measure("resize", world.querySelector('.node[data-id="perf-0-1"] .node-resize-handle'));
  await measure("pan", viewport);
  counts = { renders: 0, saves: 0, rectReads: 0 };
  for (let i = 0; i < 60; i++) viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 700, clientY: 400, deltaY: i % 2 ? 8 : -8 }));
  await settle();
  metrics.zoomBeforeIdle = { ...counts };
  await new Promise(r => setTimeout(r, 400));
  metrics.zoom = { ...counts }; counts = null;
  const saved = JSON.parse(localStorage.getItem(storageKey));
  metrics.persisted = JSON.stringify(saved.nodes.map(n=>[n.position,n.data.width,n.data.height])) === JSON.stringify(state.nodes.map(n=>[n.position,n.data.width,n.data.height])) && JSON.stringify(saved.view) === JSON.stringify(state.view);
  metrics.nodeCount = state.nodes.length; metrics.edgeCount = state.edges.length;
  metrics.edgeAlignmentError = Math.max(...state.edges.map(edge => {
    const path = [...edgeLayer.querySelectorAll(".edge-link")].find(el=>el.dataset.edgeId === edge.id)?.querySelector(".edge-path");
    const target = [...world.querySelectorAll(".node")].find(el=>el.dataset.id === edge.target);
    const port = [...target.querySelectorAll(".node-port.input")].find(el=>el.dataset.inputEdgeId === edge.id) || target.querySelector(".node-port.input");
    const expected = getPortWorldPoint(port), end = path.getPointAtLength(path.getTotalLength());
    return Math.hypot(end.x-expected.x,end.y-expected.y);
  }));
  const checks = {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const header = id => world.querySelector(`[data-id="${id}"] .node-head`);
  // 快速松手在下一帧之前发生，最终坐标、撤销和重做仍必须一致。
  setSelectedNodes(["perf-1-0", "perf-1-1"]);
  const original = state.nodes.filter(n => selectedNodeIds.has(n.id)).map(n=>({...n.position}));
  emit("pointerdown", header("perf-1-0"), 100, 200);
  emit("pointermove", viewport, 160, 220);
  emit("pointerup", viewport, 190, 245);
  const moved = [getNode("perf-1-0"), getNode("perf-1-1")].map(n=>({...n.position}));
  checks.finalPointerAndMultiSelect = moved.every((p,i)=>near(p.x-original[i].x,90/state.view.zoom) && near(p.y-original[i].y,45/state.view.zoom));
  document.querySelector('[data-action="undo"]').click();
  checks.undo = same([getNode("perf-1-0").position,getNode("perf-1-1").position], original);
  document.querySelector('[data-action="redo"]').click();
  checks.redo = same([getNode("perf-1-0").position,getNode("perf-1-1").position], moved);
  await settle();
  const beforeRelease = { ...getNode("perf-1-0").position };
  emit("pointerdown", header("perf-1-0"), 100, 200);
  emit("pointermove", viewport, 110, 210); await settle();
  emit("pointerup", viewport, 130, 240);
  checks.releaseAfterFrame = near(getNode("perf-1-0").position.x-beforeRelease.x,30/state.view.zoom) && near(getNode("perf-1-0").position.y-beforeRelease.y,40/state.view.zoom);
  setSelectedNodes([]);
  for (const cancellation of ["pointercancel", "lostpointercapture", "blur"]) {
    const before = { ...getNode("perf-1-0").position };
    emit("pointerdown", header("perf-1-0"), 100, 200);
    emit("pointermove", viewport, 140, 225);
    if (cancellation === "blur") window.dispatchEvent(new Event("blur"));
    else emit(cancellation, viewport, 0, 0);
    const savedNode = JSON.parse(localStorage.getItem(storageKey)).nodes.find(n=>n.id === "perf-1-0");
    checks[cancellation] = !drag && near(savedNode.position.x-before.x,40/state.view.zoom) && near(savedNode.position.y-before.y,25/state.view.zoom);
  }
  const beforePan = { ...state.view };
  emit("pointerdown", viewport, 100, 200, { button: 1, buttons: 4 });
  emit("pointermove", viewport, 145, 230, { button: 1, buttons: 4 });
  emit("pointerup", viewport, 145, 230, { button: 1, buttons: 0 });
  checks.middlePan = near(state.view.x-beforePan.x,45) && near(state.view.y-beforePan.y,30);
  const anchor = screenToWorld(700, 400);
  viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 700, clientY: 400, deltaY: -100 }));
  const afterAnchor = screenToWorld(700, 400);
  window.dispatchEvent(new Event("pagehide"));
  checks.zoomAnchor = near(anchor.x,afterAnchor.x) && near(anchor.y,afterAnchor.y);
  checks.pagehideSave = same(JSON.parse(localStorage.getItem(storageKey)).view,state.view);
  const nodeRect = header("perf-0-0").closest(".node").getBoundingClientRect();
  emit("pointerdown", viewport, nodeRect.left-1, nodeRect.top-1, { ctrlKey: true });
  emit("pointermove", viewport, nodeRect.right+1, nodeRect.bottom+1, { ctrlKey: true });
  emit("pointerup", viewport, nodeRect.right+1, nodeRect.bottom+1, { ctrlKey: true });
  checks.marquee = selectedNodeIds.has("perf-0-0") && !marquee;
  const existingEdge = edgeLayer.querySelector(".edge-link");
  const output = header("perf-0-0").closest(".node").querySelector(".node-port.output");
  emit("pointerdown", output, 100, 200);
  counts = { renders: 0, saves: 0, rectReads: 0 };
  for (let i=0;i<12;i++) emit("pointermove", viewport, 300+i, 400);
  await settle();
  checks.connectionPreview = existingEdge === edgeLayer.querySelector(".edge-link") && edgeLayer.querySelectorAll(".edge-preview").length === 1;
  checks.previewDoesNotRebuildEdges = !counts.edgeUpdates;
  counts = null;
  clearPendingConnection();
  await settle();
  checks.connectionCleared = !edgeLayer.querySelector(".edge-preview");
  const oldEdgeId = state.edges[0].id;
  removeEdge(oldEdgeId);
  checks.edgeRemoved = ![...edgeLayer.querySelectorAll(".edge-link")].some(el=>el.dataset.edgeId===oldEdgeId);
  // 内容更新后尺寸缓存应失效，输入端口和群组跟随实际卡片高度。
  const config = getNode("perf-0-1");
  updateNode(config.id, { height: 820 }); await settle();
  checks.contentResize = getRenderedNodeSize(config).height >= 820 && getGroupBounds([config.id]).height >= 930;
  // 一秒纯蓝色视频夹具，验证拖动不会重建/重置播放器。
  updateNode("perf-0-4", { url: "/__test-video.webm" }); await settle();
  const imageUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>');
  updateNode("perf-0-2", { url: imageUrl }); await settle();
  const liveVideo = world.querySelector('[data-id="perf-0-4"] video'); await liveVideo.play();
  const liveImage = world.querySelector('[data-id="perf-0-2"] img'); await liveImage.decode();
  emit("pointerdown", header("perf-0-0"), 100, 200);
  emit("pointermove", viewport, 110, 210); await settle();
  emit("pointerup", viewport, 110, 210);
  metrics.media = { videoRetained: liveVideo === world.querySelector('[data-id="perf-0-4"] video'), playing: !liveVideo.paused, imageRetained: liveImage === world.querySelector('[data-id="perf-0-2"] img'), imageWidth: liveImage.naturalWidth };
  checks.mediaPreserved = metrics.media.videoRetained && metrics.media.playing && metrics.media.imageRetained && metrics.media.imageWidth === 32;
  liveVideo.pause();
  metrics.checks = checks;
  return metrics;
}

module.exports = { checkCanvas };
if (require.main === module) checkCanvas().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
