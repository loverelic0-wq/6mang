const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const C = require("../public/canvas-cases");
const source = (id, type = "image") => ({ id, type, data: { label: id, url: `idb-image:${id}` } });

test("split uses shared pixel boundaries, covers odd dimensions without gaps, and respects adjusted lines", () => {
  const rects = C.gridRects(101, 203, [0.2, 0.7], [0.3, 0.6]);
  assert.equal(rects.length, 9);
  assert.equal(rects.reduce((sum, r) => sum + r.width * r.height, 0), 101 * 203);
  assert.deepEqual(rects.slice(0, 3).map((r) => [r.x, r.width]), [[0, 20], [20, 51], [71, 30]]);
  assert.equal(rects[8].y + rects[8].height, 203);
  assert.equal(C.gridRects(2, 2, C.evenCuts(20), C.evenCuts(20)).length, 4);
  assert.throws(() => C.gridRects(100, 100, [NaN], []), /分割线/);
  assert.throws(() => C.gridRects(100, 100, C.evenCuts(20), C.evenCuts(20)), /100/);
});
test("crop clamps to source and SKU fitting distinguishes retain from crop", () => {
  assert.deepEqual(C.cropRect(100, 200, { x: .1, y: .25, width: .5, height: .5 }), { x: 10, y: 50, width: 50, height: 100 });
  assert.deepEqual(C.cropRect(100, 200, { x: .9, y: .8, width: .5, height: .5 }), { x: 90, y: 160, width: 10, height: 40 });
  assert.deepEqual(C.fitRect(200, 100, 100, 100), { x: 0, y: 25, width: 100, height: 50 });
  assert.deepEqual(C.fitRect(200, 100, 100, 100, "cover"), { x: -50, y: 0, width: 200, height: 100 });
  assert.throws(() => C.dimensions(10000, 10000), /像素/);
  assert.throws(() => C.dimensions(NaN, 10), /整数/);
});
test("product references preserve order and identity across all direction branches", () => {
  const input = [source("product"), source("style")], before = structuredClone(input);
  const graph = C.plan("product", input, { directions: "棚拍\n自然光", brief: "保留瓶盖" });
  assert.deepEqual(input, before);
  const configs = graph.nodes.filter((n) => n.type === "imageConfig");
  assert.equal(configs.length, 2);
  const refs = graph.nodes.filter((n) => n.data.sourceNodeId);
  for (const node of configs) {
    assert.deepEqual(graph.edges.filter((e) => e.target === node.id && e.type === "imageOrder").map((e) => e.source), refs.map((n) => n.id));
    assert.equal(graph.edges.filter((e) => e.source === node.id && e.type === "output").length, 1);
    assert.equal(node.data.providerId, undefined, "provider must come from canvas factory");
  }
  const prompt = graph.nodes.find((n) => n.data.content?.includes("唯一商品身份"));
  assert.match(prompt.data.content, /@图片1/);
  assert.match(prompt.data.content, /@图片2 只用于视觉风格/);
  assert.match(prompt.data.content, /保留瓶盖/);
  assert.equal(graph.nodes.some((n) => /layerSeparation/.test(n.type)), false);
});
test("storyboard wires explicit video roles, keeps audio separate and all group memberships valid", () => {
  const graph = C.plan("storyboard", [source("hero"), source("voice", "audio"), source("ref", "video")], { shots: "推进\n特写" });
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const config of graph.nodes.filter((n) => n.type === "videoConfig")) {
    const inputs = graph.edges.filter((e) => e.target === config.id);
    assert.deepEqual(inputs.map((e) => e.data.videoRole), ["subject", "prompt"]);
    assert.equal(byId.get(inputs[0].source).type, "image");
  }
  const audio = graph.nodes.find((n) => n.type === "audio");
  assert.equal(audio.data.url, "idb-image:voice");
  assert.equal(graph.edges.some((e) => e.source === audio.id), false);
  assert.equal(new Set(graph.groups.flatMap((g) => g.nodeIds)).size, graph.nodes.length);
  assert.ok(graph.groups.every((g) => g.nodeIds.every((id) => byId.has(id))));
});
test("moodboard creates comparisons only for valid pairs; SKU groups preserve matching labels", () => {
  const graph = C.plan("moodboard", [source("a"), source("b"), source("c")], { directions: "A\nB" });
  assert.equal(graph.nodes.filter((n) => n.type === "imageCompare").length, 1);
  const results = C.imageResults([{ url: "a" }, { url: "b" }, { url: "c" }], "SKU", ["红色", "蓝色", "红色"]);
  assert.deepEqual(results.groups.map((g) => g.label), ["红色", "蓝色"]);
  const red = results.groups[0].nodeIds.map((id) => results.nodes.find((n) => n.id === id)).filter((n) => n.type === "image");
  assert.deepEqual(red.map((n) => n.data.url), ["a", "c"]);
});
test("real node factory and transaction retain configured providers, commit once, reject project drift", () => {
  const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  const factory = app.slice(app.indexOf("function createCanvasNode("), app.indexOf("\nfunction addNode("));
  const bridge = app.slice(app.indexOf("const canvasCasesBridge ="), app.indexOf("\nfunction removeNode(", app.indexOf("const canvasCasesBridge =")));
  const previous = source("existing");
  const context = {
    structuredClone, window: { VideoReplica: { selectModel: () => ({}) } },
    getDefaultModel: (kind) => `${kind}-existing-model`,
    getImageSizeValue: (_m, size) => size,
    getDefaultUpscaleProviderAndModel: () => ({ providerId: "upscale", model: "upscale" }),
    getProviderGroup: () => ({}),
    ensureNodeProvider: (n) => { if (n.type.endsWith("Config")) n.data.providerId = "existing-provider"; },
    makeId: (() => { let n = 0; return () => `new-${++n}`; })(),
    getViewportCenter: () => ({ x: 30, y: 50 }),
    nodeSizes: { image: {}, imageConfig: {}, text: {}, videoConfig: {}, video: {} },
    getNodeSize: () => ({ width: 300, height: 400 }),
    state: { nodes: [previous], edges: [], groups: [], view: {} },
    projectLibrary: { activeProjectId: "one" }, appShell: { hidden: false },
    viewport: { clientWidth: 1200, clientHeight: 800 },
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    commits: [], saves: 0, renders: 0,
    commitHistory() { context.commits.push(structuredClone(context.state)); },
    setSelectedNodes(ids) { context.selection = ids; },
    saveState() { context.saves++; }, render() { context.renders++; },
    showToast() {}, readMediaDownloadBlob() {}, mediaDownloadExtension() {},
  };
  vm.createContext(context);
  vm.runInContext(factory + "\n" + bridge + "\nthis.bridge = canvasCasesBridge;", context);
  const graph = C.plan("product", [source("product")], { directions: "A\nB" });
  context.bridge.commit(graph, "one");
  assert.equal(context.commits.length, 1);
  assert.equal(context.saves, 1);
  assert.equal(context.renders, 1);
  assert.deepEqual(context.commits[0].nodes, [previous]);
  assert.equal(context.state.nodes[0], previous);
  assert.equal(context.selection.length, graph.nodes.length);
  assert.ok(context.state.nodes.filter((n) => n.type === "imageConfig").every((n) => n.data.model === "image-existing-model" && n.data.providerId === "existing-provider"));
  context.projectLibrary.activeProjectId = "two";
  assert.throws(() => context.bridge.commit(graph, "one"), /项目已切换/);
  assert.equal(context.commits.length, 1);
});
