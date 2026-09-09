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

test("layer response keeps the base and orders transparent layers by z-index", () => {
  const tools = loadTools();
  assert.equal(typeof tools.parseLayerResponse, "function", "parseLayerResponse should be implemented");

  const parsed = tools.parseLayerResponse({
    model: "doubao-seedream-5-0-pro-260628",
    data: [
      { url: "https://cdn.example.com/bg.png", z_index: 0 },
      {
        url: "https://cdn.example.com/top.png",
        z_index: 8,
        name: "标题",
        description: "海报标题",
        bounding_box: { absolute: [10, 20, 110, 70] },
      },
      {
        url: "https://cdn.example.com/subject.png",
        z_index: "2",
        name: "人物",
        bounding_box: { absolute: [100, 200, 700, 1200] },
      },
    ],
  });

  assert.equal(parsed.background.source, "https://cdn.example.com/bg.png");
  assert.equal(parsed.background.role, "background");
  assert.deepEqual(parsed.layers.map((layer) => layer.name), ["人物", "标题"]);
  assert.deepEqual(parsed.layers[0].bbox, { x: 100, y: 200, width: 600, height: 1000 });
  assert.deepEqual(parsed.layers[1].bbox, { x: 10, y: 20, width: 100, height: 50 });
  assert.equal(parsed.layers[1].description, "海报标题");
});

test("layer response records missing and degenerate bounding boxes without inventing geometry", () => {
  const tools = loadTools();
  assert.equal(typeof tools.parseLayerResponse, "function", "parseLayerResponse should be implemented");

  const parsed = tools.parseLayerResponse({ data: [
    { b64_json: "QkdEQVRB" },
    { url: "https://cdn.example.com/missing.png", name: "装饰" },
    { url: "https://cdn.example.com/bad.png", name: "空框", bounding_box: { absolute: [30, 40, 20, 10] } },
  ] });

  assert.match(parsed.background.source, /^data:image\/png;base64,/);
  assert.equal(parsed.layers[0].bbox, null);
  assert.deepEqual(parsed.layers[0].flags, ["bbox_missing"]);
  assert.equal(parsed.layers[1].bbox, null);
  assert.deepEqual(parsed.layers[1].flags, ["bbox_degenerate"]);
});

test("layers with equal or missing z-index preserve response order", () => {
  const tools = loadTools();
  assert.equal(typeof tools.parseLayerResponse, "function", "parseLayerResponse should be implemented");

  const parsed = tools.parseLayerResponse({ data: [
    { url: "https://cdn.example.com/bg.png" },
    { url: "https://cdn.example.com/first.png", name: "第一层", z_index: "unknown", bounding_box: { absolute: [0, 0, 10, 10] } },
    { url: "https://cdn.example.com/second.png", name: "第二层", bounding_box: { absolute: [10, 10, 20, 20] } },
  ] });

  assert.deepEqual(parsed.layers.map((layer) => layer.name), ["第一层", "第二层"]);
  assert.deepEqual(parsed.layers.map((layer) => layer.zIndex), [1, 2]);
});

test("layer parser rejects a response without a usable background", () => {
  const tools = loadTools();
  assert.equal(typeof tools.parseLayerResponse, "function", "parseLayerResponse should be implemented");
  assert.throws(() => tools.parseLayerResponse({ data: [{ name: "missing-url" }] }), /背景底板/);
});

test("layer parser rejects a flattened response with no editable layers", () => {
  const tools = loadTools();
  assert.equal(typeof tools.parseLayerResponse, "function", "parseLayerResponse should be implemented");
  assert.throws(() => tools.parseLayerResponse({ data: [{ url: "https://cdn.example.com/flat.png" }] }), /可编辑图层/);
});

test("image item extraction preserves response objects and common nested containers", () => {
  const tools = loadTools();
  assert.equal(typeof tools.extractImageItems, "function", "extractImageItems should be implemented");

  const items = tools.extractImageItems({ result: { images: [
    { image_url: "https://cdn.example.com/one.png", name: "一" },
    { base64: "VFdP", name: "二" },
  ] } });

  assert.equal(items[0].source, "https://cdn.example.com/one.png");
  assert.equal(items[0].item.name, "一");
  assert.match(items[1].source, /^data:image\/png;base64,/);
});
