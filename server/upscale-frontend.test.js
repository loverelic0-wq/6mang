const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

function harness({ failStorage = false, failApi = false } = {}) {
  const config = { id: "config", type: "imageUpscale", position: { x: 0, y: 0 },
    data: { providerId: "comfyui-local", model: "RealESRGAN", scale: 2, outputFormat: "png" } };
  const input = { id: "input", type: "image", data: { url: "idb-image:source" } };
  const nodes = new Map([[config.id, config], [input.id, input]]);
  const assets = new Map(), requests = [], history = [], saves = [], messages = [];
  let id = 0;
  const controls = { failStorage, failApi };
  const context = vm.createContext({
    console: { warn() {} }, fetch, URL, Blob, imageAssetPrefix: "idb-image:",
    imageAssetObjectUrls: new Map(), window: {}, activeImageUpscaleRuns: new Set(),
    makeId: () => `asset-${++id}`,
    putImageAsset: async (record) => {
      if (controls.failStorage) throw new Error("disk full");
      assets.set(record.id, record);
    },
    apiFetch: async (route, options) => {
      requests.push({ route, body: JSON.parse(options.body) });
      if (route.startsWith("/api/comfyui/test")) return { ready: true };
      if (controls.failApi) throw new Error("ComfyUI 无法解码输入图片");
      return { data: [{ b64_json: PNG.split(",")[1] }] };
    },
    getNode: (nodeId) => nodes.get(nodeId),
    getImageReferenceSlots: () => [{ node: input }],
    supportsUpscaleModel: () => true,
    getProviderItem: () => ({ adapter: "comfyui", configured: true, workflowPath: "test.json" }),
    isKlingProviderItem: () => false,
    resolveImageReferenceSlots: async () => [PNG],
    loadImageElement: async () => ({ naturalWidth: 96, naturalHeight: 64 }),
    upscaleTargetSize: (node) => ({ valid: true, width: 96 * node.data.scale, height: 64 * node.data.scale }),
    findOutputImageNode: () => nodes.get("result"),
    addNode: (type, position, data) => { nodes.set("result", { id: "result", type, position, data }); return "result"; },
    addEdge() {},
    updateNode: (nodeId, patch) => {
      const node = nodes.get(nodeId);
      nodes.set(nodeId, { ...node, data: { ...node.data, ...patch } });
      saves.push(JSON.stringify([...nodes.values()]));
    },
    showProcessing() {}, hideProcessing() {}, render() {}, processing: {},
    friendlyImageError: (message) => message,
    showToast: (message) => messages.push(message),
    recordProjectHistory: (entry) => history.push(entry),
    generateGradient: () => "",
    imageDisplaySource: (url) => url,
    isIndexedImageSource: (url) => url.startsWith("idb-image:"),
    escapeHtml: (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    transparentPixel: "",
  });
  for (const [start, end] of [
    ["function shouldPersistImageSource(", "async function probeImageDimensions("],
    ["function extractImageSource(", "async function requestVideoCreate("],
    ["async function requestImageUpscale(", "async function generateImageExpand("],
    ["function renderImageMedia(", "function imageDisplaySource("],
  ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
  return { context, nodes, assets, requests, history, saves, messages, controls,
    run: () => context.generateImageUpscale("config") };
}

test("small 2x/4x upscale results and history persist only asset references", async () => {
  const h = harness();
  for (const scale of [2, 4]) {
    h.nodes.get("config").data.scale = scale;
    await h.run();
    const output = h.nodes.get("result").data;
    assert.match(output.url, /^idb-image:/);
    assert.equal(output.loading, false);
    assert.equal(h.nodes.get("config").data.upscaleStatus, "done");
    assert.equal(h.nodes.get("config").data.sourceWidth, 96);
    assert.equal(h.nodes.get("config").data.sourceHeight, 64);
    const asset = h.assets.get(output.url.slice("idb-image:".length));
    assert.ok(asset.blob.size < 120000);
    assert.equal(Buffer.from(await asset.blob.arrayBuffer()).toString("base64"), PNG.split(",")[1]);
    const request = h.requests.filter((entry) => entry.route === "/api/images/upscale").at(-1);
    assert.equal(request.body.scale, scale);
    assert.equal(request.body.targetWidth, 96 * scale);
    assert.equal(request.body.targetHeight, 64 * scale);
    assert.equal(request.body.providerId, "comfyui-local");
  }
  assert.equal(h.nodes.size, 3);
  assert.equal(h.nodes.get("input").data.url, "idb-image:source");
  assert.equal(h.history.length, 2);
  assert.doesNotMatch(JSON.stringify([h.saves, h.history]), /data:image|base64|b64_json/);
});

test("IndexedDB failure never falls back to binary in project JSON and is retryable", async () => {
  const h = harness({ failStorage: true });
  await h.run();
  assert.equal(h.nodes.get("config").data.upscaleStatus, "error");
  assert.match(h.nodes.get("result").data.error, /素材保存失败/);
  assert.equal(h.nodes.get("result").data.url, undefined);
  assert.equal(h.history.length, 0);
  assert.doesNotMatch(JSON.stringify(h.saves), /data:image|base64|b64_json/);
  assert.equal(h.context.activeImageUpscaleRuns.size, 0);
  h.controls.failStorage = false;
  await h.run();
  assert.equal(h.nodes.get("config").data.upscaleStatus, "done");
  assert.equal(h.nodes.get("config").data.upscaleError, "");
  assert.equal(h.history.length, 1);
});

test("a failed rerun retains the last result with a visible error and clears it on retry", async () => {
  const h = harness();
  await h.run();
  const previous = h.nodes.get("result").data.url;
  h.controls.failApi = true;
  await h.run();
  const result = h.nodes.get("result");
  assert.equal(result.data.url, previous);
  assert.match(h.context.renderImageMedia(result), /node-inline-error.*无法解码输入图片/);
  assert.match(h.context.renderImageMedia(result), /下方保留上次结果/);
  assert.match(h.nodes.get("config").data.upscaleError, /无法解码/);
  assert.match(h.messages.at(-1), /图像放大失败/);
  assert.equal(h.nodes.get("config").data.executed, false);
  assert.equal(h.history.length, 1);
  h.controls.failApi = false;
  await h.run();
  assert.equal(h.nodes.get("result").data.error, "");
  assert.equal(h.nodes.get("config").data.upscaleError, "");
  assert.equal(h.history.length, 2);
});

test("duplicate clicks cannot submit a second upscale while one is pending", async () => {
  const h = harness();
  const first = h.run();
  await h.run();
  await first;
  assert.equal(h.requests.filter((entry) => entry.route === "/api/images/upscale").length, 1);
});
