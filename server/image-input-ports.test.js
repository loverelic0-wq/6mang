const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Execute the real browser slot/resolution functions without DOM, storage, or API access.
function harness({ nodes = [], edges = [], resolve = async (url) => typeof url === "string" ? url : "" } = {}) {
  const state = { nodes, edges };
  const context = vm.createContext({ state, resolveImageForApi: resolve });
  const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  for (const name of [
    "migrateImageInputSlots",
    "getNode", "incomingNodes", "getReferenceMaterialSlots", "getImageReferenceSlots",
    "getImageGenerationInputSlots", "resolveImageReferenceSlots",
  ]) {
    const declaration = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(source);
    assert.ok(declaration, `frontend function exists: ${name}`);
    const from = declaration.index;
    const nextDeclaration = /\n(?:(?:async )?function |(?:const|let|class) )/.exec(source.slice(from));
    const to = nextDeclaration ? from + nextDeclaration.index : source.length;
    vm.runInContext(source.slice(from, to), context);
  }
  return { app: context, state };
}

function node(id, type, url) {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id, ...(url === undefined ? {} : { url }) } };
}

function edge(source, target = "config") {
  // Legacy connections, including 3D inputs, may have a generic type and label.
  return { id: `${target}:${source}`, source, target, type: "default", data: { label: "连接" } };
}

function slotPairs(slots) {
  return Array.from(slots, (slot) => [slot.node.id, slot.token]);
}

function fixture() {
  const nodes = [
    node("config", "imageConfig"), node("video-config", "videoConfig"),
    node("model", "model3dPreview", "model-frame"), node("photo", "image", "photo-url"),
    node("layers", "layerGroup", "composite-url"), node("text", "text"),
    node("optimizer", "promptOptimizer"), node("clip", "video", "video-url"),
  ];
  return { nodes, edges: ["model", "optimizer", "photo", "text", "layers", "clip"].map((id) => edge(id)) };
}

test("image input rows group prompts and images while retaining their connection order", () => {
  const h = harness(fixture());
  const describe = () => Array.from(h.app.getImageGenerationInputSlots("config"), (slot) => [
    slot.edge.id, slot.node.id, slot.kind, slot.label,
  ]);
  const before = describe();
  assert.deepEqual(before.slice(0, 5), [
    ["config:optimizer", "optimizer", "prompt", "提示词 1"],
    ["config:text", "text", "prompt", "提示词 2"],
    ["config:model", "model", "image", "@图片1"],
    ["config:photo", "photo", "image", "@图片2"],
    ["config:layers", "layers", "image", "@图片3"],
  ]);
  assert.equal(before.length, 6);
  assert.equal(before[5][1], "clip");
  assert.equal(before[5][2], "other");
  assert.deepEqual(slotPairs(h.app.getImageReferenceSlots("config")), [
    ["model", "@图片1"], ["photo", "@图片2"], ["layers", "@图片3"],
  ]);

  h.state.nodes.reverse();
  h.state.nodes.forEach((item, index) => { item.position = { x: index * -700, y: index * 500 }; });
  assert.deepEqual(describe(), before, "moving nodes or changing node-array order must not change image numbers");
});

test("unready 3D and layer inputs reserve image numbers only for image generation", () => {
  const initial = fixture();
  initial.nodes.find((item) => item.id === "model").data.url = false;
  delete initial.nodes.find((item) => item.id === "layers").data.url;
  initial.edges.push(...["model", "photo", "layers", "clip"].map((id) => edge(id, "video-config")));
  const h = harness(initial);
  const expected = [["model", "@图片1"], ["photo", "@图片2"], ["layers", "@图片3"]];
  assert.deepEqual(slotPairs(h.app.getImageReferenceSlots("config")), expected);
  assert.deepEqual(slotPairs(h.app.getImageGenerationInputSlots("config").filter((slot) => slot.kind === "image")), expected);
  assert.deepEqual(slotPairs(h.app.getImageReferenceSlots("video-config")), [["photo", "@图片1"]]);
  assert.deepEqual(slotPairs(h.app.getReferenceMaterialSlots("video-config")), [["photo", "@图片1"], ["clip", "@视频1"]]);

  h.state.nodes.find((item) => item.id === "model").data.url = "new-model-frame";
  h.state.nodes.find((item) => item.id === "layers").data.url = "new-composite";
  assert.deepEqual(slotPairs(h.app.getImageReferenceSlots("config")), expected, "asset readiness must not renumber later inputs");
});

test("removing, restoring, and reconnecting image edges keeps rows consistent with submission order", () => {
  const h = harness(fixture());
  const originalEdges = [...h.state.edges];
  const imageRows = () => slotPairs(h.app.getImageGenerationInputSlots("config").filter((slot) => slot.kind === "image"));
  h.state.edges = h.state.edges.filter((item) => item.source !== "photo");
  assert.deepEqual(imageRows(), [["model", "@图片1"], ["layers", "@图片2"]]);
  assert.deepEqual(imageRows(), slotPairs(h.app.getImageReferenceSlots("config")));

  h.state.edges = [...originalEdges];
  assert.deepEqual(imageRows(), [["model", "@图片1"], ["photo", "@图片2"], ["layers", "@图片3"]]);

  h.state.edges = h.state.edges.filter((item) => item.source !== "photo");
  h.state.edges.push(edge("photo"));
  assert.deepEqual(imageRows(), [["model", "@图片1"], ["layers", "@图片2"], ["photo", "@图片3"]]);
  assert.deepEqual(imageRows(), slotPairs(h.app.getImageReferenceSlots("config")));
});

test("reference resolution rejects an empty numbered input instead of shifting subsequent images", async () => {
  for (const type of ["image", "model3dPreview", "layerGroup"]) {
    for (const missingUrl of [undefined, false, true, "idb-image:missing"]) {
      const h = harness({
        nodes: [node("config", "imageConfig"), node("missing", type, missingUrl), node("valid", "image", "valid-url")],
        edges: [edge("missing"), edge("valid")],
        resolve: async (url) => url === "valid-url" ? "resolved-valid" : "",
      });
      await assert.rejects(h.app.resolveImageReferenceSlots(h.app.getImageReferenceSlots("config")), /@图片1/);
    }
  }

  const h = harness({
    nodes: [node("config", "imageConfig"), node("valid", "image", "valid-url"), node("missing", "image", false)],
    edges: [edge("valid"), edge("missing")],
  });
  await assert.rejects(h.app.resolveImageReferenceSlots(h.app.getImageReferenceSlots("config")), /@图片2/);
});

test("asynchronous asset completion cannot change the numbered reference submission order", async () => {
  const deferred = new Map();
  const completionOrder = [];
  for (const url of ["model-frame", "photo-url", "composite-url"]) {
    let complete;
    const promise = new Promise((resolve) => { complete = () => { completionOrder.push(url); resolve(`resolved:${url}`); }; });
    deferred.set(url, { promise, complete });
  }
  const h = harness({ ...fixture(), resolve: (url) => deferred.get(url).promise });
  const pending = h.app.resolveImageReferenceSlots(h.app.getImageReferenceSlots("config"));
  deferred.get("composite-url").complete();
  deferred.get("photo-url").complete();
  deferred.get("model-frame").complete();
  assert.deepEqual(completionOrder, ["composite-url", "photo-url", "model-frame"]);
  assert.deepEqual(Array.from(await pending), ["resolved:model-frame", "resolved:photo-url", "resolved:composite-url"]);
});

test("text-only generation resolves an empty reference list without asset reads", async () => {
  const h = harness({
    nodes: [node("config", "imageConfig"), node("text", "text")], edges: [edge("text")],
    resolve: () => { throw new Error("text-only generation must not read images"); },
  });
  assert.deepEqual(Array.from(await h.app.resolveImageReferenceSlots(h.app.getImageReferenceSlots("config"))), []);
  assert.deepEqual(Array.from(h.app.getImageGenerationInputSlots("config"), (slot) => slot.label), ["提示词 1"]);
});

function migrationFixture() {
  const initial = fixture();
  const secondConfig = node("second-config", "imageConfig");
  secondConfig.data.imageInputVersion = 1;
  initial.nodes.push(
    secondConfig, node("pending-model", "model3dPreview", false),
    node("pending-layers", "layerGroup"), node("empty-image", "image", false),
  );
  initial.edges = [
    edge("pending-model"), edge("pending-model", "second-config"), edge("optimizer"),
    edge("photo"), edge("photo", "second-config"), edge("empty-image"), edge("text"),
    edge("pending-layers"), edge("model"), edge("layers"), edge("clip"),
  ];
  return { ...initial, view: { x: 35, y: -70, zoom: 0.8 }, groups: [{ id: "group", nodeIds: ["model", "photo"] }] };
}

function freezeInput(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeInput);
  return Object.freeze(value);
}

test("legacy migration preserves numbered references and only replaces their existing edge positions", () => {
  const original = migrationFixture();
  const snapshot = JSON.stringify(original);
  freezeInput(original);
  const h = harness(original);
  const migrated = h.app.migrateImageInputSlots(original);
  assert.equal(JSON.stringify(original), snapshot, "migration must not mutate its workflow input");
  assert.notEqual(migrated, original);
  assert.equal(migrated.nodes.find((item) => item.id === "config").data.imageInputVersion, 1);
  assert.equal(original.nodes.find((item) => item.id === "config").data.imageInputVersion, undefined);
  assert.deepEqual(migrated.view, original.view);
  assert.deepEqual(migrated.groups, original.groups);

  h.state.nodes = migrated.nodes;
  h.state.edges = migrated.edges;
  assert.deepEqual(slotPairs(h.app.getImageReferenceSlots("config")), [
    ["photo", "@图片1"], ["empty-image", "@图片2"], ["model", "@图片3"],
    ["layers", "@图片4"], ["pending-model", "@图片5"], ["pending-layers", "@图片6"],
  ], "an empty image already had an old slot; only pending 3D/layers go to the end");
  for (const index of [1, 2, 4, 6, 10]) {
    assert.equal(migrated.edges[index], original.edges[index], `unrelated edge at index ${index} must remain in place`);
  }
  assert.deepEqual(Array.from(migrated.edges.filter((item) => item.target === "second-config"), (item) => item.id), [
    "second-config:pending-model", "second-config:photo",
  ]);
  assert.deepEqual(Array.from(h.app.getImageGenerationInputSlots("config").filter((slot) => slot.kind === "prompt"), (slot) => slot.node.id), [
    "optimizer", "text",
  ]);
});

test("legacy input migration is idempotent and does not renumber references after assets become ready", () => {
  const h = harness(migrationFixture());
  const migrated = h.app.migrateImageInputSlots(h.state);
  const twice = h.app.migrateImageInputSlots(migrated);
  assert.equal(JSON.stringify(twice), JSON.stringify(migrated));

  const reloaded = JSON.parse(JSON.stringify(migrated));
  reloaded.nodes.find((item) => item.id === "pending-model").data.url = "captured-later";
  reloaded.nodes.find((item) => item.id === "pending-layers").data.url = "composited-later";
  const readyReload = h.app.migrateImageInputSlots(reloaded);
  assert.deepEqual(Array.from(readyReload.edges, (item) => item.id), Array.from(migrated.edges, (item) => item.id));
  h.state.nodes = readyReload.nodes;
  h.state.edges = readyReload.edges;
  assert.deepEqual(slotPairs(h.app.getImageReferenceSlots("config")), [
    ["photo", "@图片1"], ["empty-image", "@图片2"], ["model", "@图片3"],
    ["layers", "@图片4"], ["pending-model", "@图片5"], ["pending-layers", "@图片6"],
  ]);
});

test("version 1 workflows preserve reserved inputs in their original connection order", () => {
  const original = migrationFixture();
  original.nodes.find((item) => item.id === "config").data.imageInputVersion = 1;
  const snapshot = JSON.stringify(original);
  const h = harness(original);
  const migrated = h.app.migrateImageInputSlots(freezeInput(original));
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(JSON.stringify(migrated), snapshot);
  h.state.nodes = migrated.nodes;
  h.state.edges = migrated.edges;
  assert.deepEqual(slotPairs(h.app.getImageReferenceSlots("config")), [
    ["pending-model", "@图片1"], ["photo", "@图片2"], ["empty-image", "@图片3"],
    ["pending-layers", "@图片4"], ["model", "@图片5"], ["layers", "@图片6"],
  ]);
});
