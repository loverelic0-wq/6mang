const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadTools() {
  try {
    return require(path.join(__dirname, "..", "public", "seedream-tools.js"));
  } catch {
    return {};
  }
}

test("layer separation body uses the native Seedream 5.0 Pro contract", () => {
  const tools = loadTools();
  assert.equal(typeof tools.buildLayerSeparationBody, "function", "buildLayerSeparationBody should be implemented");
  assert.deepEqual(tools.buildLayerSeparationBody({
    providerId: "volc",
    model: "doubao-seedream-5-0-pro-260628",
    prompt: "把人物、标题、装饰和背景分别拆层",
    size: "auto",
    seed: 17,
    promptOptimization: "fast",
  }, "data:image/png;base64,AA=="), {
    providerId: "volc",
    model: "doubao-seedream-5-0-pro-260628",
    prompt: "把人物、标题、装饰和背景分别拆层",
    image: "data:image/png;base64,AA==",
    size: "auto",
    seed: 17,
    response_format: "url",
    output_format: "png",
    layer_decomposition: true,
    watermark: false,
    optimize_prompt_options: { mode: "fast" },
  });
});

test("layer separation body normalizes unsafe controls", () => {
  const tools = loadTools();
  assert.equal(typeof tools.buildLayerSeparationBody, "function", "buildLayerSeparationBody should be implemented");
  const body = tools.buildLayerSeparationBody({ size: "8K", seed: -10, promptOptimization: "turbo" }, "https://cdn.example.com/source.png");
  assert.equal(body.size, "auto");
  assert.equal(body.seed, 0);
  assert.deepEqual(body.optimize_prompt_options, { mode: "standard" });
});

test("layer group data preserves background and native response geometry", () => {
  const tools = loadTools();
  assert.equal(typeof tools.createLayerGroupData, "function", "createLayerGroupData should be implemented");
  const parsed = {
    background: { name: "背景", description: "补全背景", role: "background", zIndex: 0, flags: [] },
    layers: [
      { name: "人物", description: "主体", role: "layer", zIndex: 2, bbox: { x: 100, y: 200, width: 600, height: 1000 }, flags: [] },
      { name: "标题", description: "文字", role: "layer", zIndex: 8, bbox: null, flags: ["bbox_missing"] },
    ],
  };
  const group = tools.createLayerGroupData(parsed, [
    { assetId: "bg", nativeWidth: 2048, nativeHeight: 2048 },
    { assetId: "subject", nativeWidth: 600, nativeHeight: 1000 },
    { assetId: "title", nativeWidth: 500, nativeHeight: 120 },
  ], { sourceNodeId: "source-node" });

  assert.equal(group.width, 2048);
  assert.equal(group.height, 2048);
  assert.equal(group.sourceNodeId, "source-node");
  assert.deepEqual(group.layers.map((layer) => ({
    assetId: layer.assetId,
    role: layer.role,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    zIndex: layer.zIndex,
    locked: layer.locked,
  })), [
    { assetId: "bg", role: "background", x: 0, y: 0, width: 2048, height: 2048, zIndex: 0, locked: true },
    { assetId: "subject", role: "layer", x: 100, y: 200, width: 600, height: 1000, zIndex: 2, locked: false },
    { assetId: "title", role: "layer", x: 0, y: 0, width: 500, height: 120, zIndex: 8, locked: false },
  ]);
});

test("layer group layout keeps portrait document geometry separate from the node frame", () => {
  const tools = loadTools();
  assert.equal(typeof tools.layerGroupLayout, "function", "layerGroupLayout should be implemented");

  assert.deepEqual(tools.layerGroupLayout({ width: 721, height: 900 }, { width: 340, height: 430 }), {
    nodeWidth: 340,
    nodeHeight: 430,
    documentWidth: 721,
    documentHeight: 900,
    aspectRatio: "721 / 900",
  });
});

test("layer group layout preserves a resized node frame without changing the document aspect", () => {
  const tools = loadTools();
  assert.equal(typeof tools.layerGroupLayout, "function", "layerGroupLayout should be implemented");

  assert.deepEqual(tools.layerGroupLayout({
    width: 2048,
    height: 1024,
    nodeWidth: 480,
    nodeHeight: 520,
  }, { width: 340, height: 430 }), {
    nodeWidth: 480,
    nodeHeight: 520,
    documentWidth: 2048,
    documentHeight: 1024,
    aspectRatio: "2048 / 1024",
  });
});

test("moving and resizing layers respects locks and minimum size", () => {
  const tools = loadTools();
  assert.equal(typeof tools.moveLayer, "function", "moveLayer should be implemented");
  assert.equal(typeof tools.resizeLayerFromCorner, "function", "resizeLayerFromCorner should be implemented");
  const layer = { x: 10, y: 20, width: 100, height: 80, locked: false };
  assert.deepEqual(tools.moveLayer(layer, 30, -10), { ...layer, x: 40, y: 10 });
  assert.deepEqual(tools.moveLayer({ ...layer, locked: true }, 30, -10), { ...layer, locked: true });
  assert.deepEqual(tools.resizeLayerFromCorner(layer, "se", 0.5), { ...layer, width: 50, height: 40 });
  assert.deepEqual(tools.resizeLayerFromCorner(layer, "nw", 0.5), { ...layer, x: 60, y: 60, width: 50, height: 40 });
  assert.deepEqual(tools.resizeLayerFromCorner(layer, "se", 0.001), { ...layer, width: 10, height: 8 });
});

test("layer order operations keep the background at the bottom", () => {
  const tools = loadTools();
  assert.equal(typeof tools.reorderLayer, "function", "reorderLayer should be implemented");
  const layers = [
    { id: "bg", role: "background", zIndex: 0 },
    { id: "subject", role: "layer", zIndex: 1 },
    { id: "title", role: "layer", zIndex: 2 },
  ];
  assert.deepEqual(tools.reorderLayer(layers, "subject", 1).map((layer) => layer.id), ["bg", "title", "subject"]);
  assert.deepEqual(tools.reorderLayer(layers, "bg", 1).map((layer) => layer.id), ["bg", "subject", "title"]);
  assert.deepEqual(tools.reorderLayer(layers, "title", -1).map((layer) => layer.zIndex), [0, 1, 2]);
});

test("render plan excludes hidden layers and sorts visible layers bottom to top", () => {
  const tools = loadTools();
  assert.equal(typeof tools.layerRenderPlan, "function", "layerRenderPlan should be implemented");
  const plan = tools.layerRenderPlan([
    { id: "top", assetId: "top", visible: true, opacity: 2, zIndex: 9 },
    { id: "hidden", assetId: "hidden", visible: false, opacity: 1, zIndex: 2 },
    { id: "background", assetId: "background", visible: true, opacity: -1, zIndex: 0 },
  ]);
  assert.deepEqual(plan.map((layer) => ({ id: layer.id, opacity: layer.opacity })), [
    { id: "background", opacity: 0 },
    { id: "top", opacity: 1 },
  ]);
});

test("render plan treats a missing legacy opacity as fully visible", () => {
  const tools = loadTools();
  const plan = tools.layerRenderPlan([{ id: "legacy", assetId: "legacy", visible: true, zIndex: 1 }]);
  assert.equal(plan[0].opacity, 1);
});
