const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const productBackground = require("../public/product-background");

function slot(label, url) {
  return { edge: { data: { label } }, node: { data: { url } } };
}

test("product background keeps roles after reverse upload, removal and reconnection", () => {
  const background = slot("背景图", "background");
  const product = slot("产品图", "product");
  assert.equal(productBackground.assignInputs([background]).product, null);
  assert.equal(productBackground.nextConnectionLabel([background]), "产品图");
  assert.equal(productBackground.validateInputs([background, product]).product, product);
  assert.equal(productBackground.validateInputs([background, product]).background, background);
  const generic = slot("连接", "product");
  assert.equal(productBackground.assignInputs([background, generic]).product, generic);
});

test("missing, duplicate, extra, loading and simulated inputs cannot generate", () => {
  const product = slot("产品图", "product");
  assert.throws(() => productBackground.validateInputs([product]), /上传或连接/);
  assert.throws(() => productBackground.validateInputs([product, slot("产品图", "other")]), /多余连线/);
  assert.throws(() => productBackground.validateInputs([product, slot("背景图", "bg"), slot("连接", "extra")]), /多余连线/);
  assert.throws(() => productBackground.validateInputs([product, slot("背景图", true)]), /载入完成/);
  const loading = slot("背景图", "bg");
  loading.node.data.loading = true;
  assert.throws(() => productBackground.validateInputs([product, loading]), /载入完成/);
});

// 执行前端真实生成函数，用边界替身验证图片顺序、单次调用、出错恢复和重复点击。
function harness({ slots, configured = true, model = "gpt-image-2", request } = {}) {
  const config = { id: "config", type: "productBackgroundConfig", position: { x: 0, y: 0 }, data: { model, providerId: "chosen", size: "2048x2048", aspectSource: "background", extra: "放在桌面" } };
  const nodes = new Map([[config.id, config]]);
  const calls = [];
  const messages = [];
  const context = vm.createContext({
    window: { ProductBackground: productBackground },
    getNode: (id) => nodes.get(id),
    getImageReferenceSlots: () => slots || [slot("背景图", "background"), slot("产品图", "product")],
    normalizeModelValue: (_, value) => value,
    getDefaultModel: () => "gpt-image-2",
    isFluxImageModel: (value) => value === "flux",
    isMjImageModel: (value) => value === "midjourney",
    hasApiKey: () => configured,
    showToast: (message) => messages.push(message),
    findOutputImageNode: () => nodes.get("result"),
    addNode: (_, position, data) => { nodes.set("result", { id: "result", position, data }); return "result"; },
    addEdge: () => {},
    updateNode: (id, patch) => Object.assign(nodes.get(id)?.data || {}, patch),
    showProcessing: () => {}, hideProcessing: () => {}, render: () => {}, processing: {},
    resolveImageForApi: async (source) => `resolved:${source}`,
    probeImageAspect: async (source) => source === "background" ? 1.5 : 1,
    imageSizeForAspect: (_, aspect) => { assert.equal(aspect, 1.5); return "1536x1024"; },
    requestImageGeneration: async (cfg, prompt, refs) => { calls.push({ cfg, prompt, refs }); return request ? request() : "idb-image:result"; },
    friendlyImageError: (message) => message,
    recordProjectHistory: () => {},
  });
  const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  vm.runInContext(source.slice(source.indexOf("const activeProductBackgroundRuns = new Set();"), source.indexOf("function triggerProductBackgroundUpload(")), context);
  return { run: () => context.generateProductBackground("config"), nodes, calls, messages };
}

test("single edit sends product first, background second with selected provider and background ratio", async () => {
  const h = harness();
  await h.run();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(Array.from(h.calls[0].refs), ["resolved:product", "resolved:background"]);
  assert.equal(h.calls[0].cfg.data.providerId, "chosen");
  assert.equal(h.calls[0].cfg.data.size, "1536x1024");
  assert.match(h.calls[0].prompt, /放在桌面/);
  assert.match(h.calls[0].prompt, /输出画面比例跟随图片2/);
  assert.equal(h.nodes.get("result").data.url, "idb-image:result");
  assert.equal(h.nodes.get("result").data.loading, false);
});

test("unconfigured or incompatible models and incomplete inputs make no request or fake output", async () => {
  for (const options of [{ configured: false }, { model: "midjourney" }, { model: "flux" }, { slots: [] }]) {
    const h = harness(options);
    await h.run();
    assert.equal(h.calls.length, 0);
    assert.equal(h.nodes.has("result"), false);
    assert.equal(h.messages.length, 1);
  }
});

test("concurrent clicks make one edit and failed edits can retry", async () => {
  let rejectRequest;
  const h = harness({ request: () => new Promise((_, reject) => { rejectRequest = reject; }) });
  const first = h.run();
  await new Promise(setImmediate);
  await h.run();
  assert.equal(h.calls.length, 1);
  rejectRequest(new Error("upstream unavailable"));
  await first;
  assert.equal(h.nodes.get("result").data.loading, false);
  assert.equal(h.nodes.get("result").data.error, "upstream unavailable");
  const retry = h.run();
  await new Promise(setImmediate);
  assert.equal(h.calls.length, 2);
  rejectRequest(new Error("retry unavailable"));
  await retry;
});
