const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadFunction(context, name) {
  const declaration = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(source);
  assert.ok(declaration, `前端函数应存在：${name}`);
  const from = declaration.index;
  const next = /\n(?:(?:async )?function |(?:const|let|class) )/.exec(source.slice(from));
  vm.runInContext(source.slice(from, next ? from + next.index : source.length), context);
}

function dataHarness() {
  const app = vm.createContext({});
  loadFunction(app, "getModel3dEntries");
  loadFunction(app, "model3dDataFromEntries");
  return app;
}

test("旧项目的单模型迁移后保留资产引用和稳定对象 ID", () => {
  const app = dataHarness();
  const legacy = { modelAssetId: "legacy-asset", modelName: "角色.glb", modelFormat: "glb" };
  const entries = app.getModel3dEntries(legacy);
  assert.deepEqual(plain(entries), [{ id: "model", assetId: "legacy-asset", name: "角色.glb", format: "glb" }]);
  const saved = plain(app.model3dDataFromEntries(entries));
  assert.deepEqual(saved, { ...legacy, models: plain(entries) });
  assert.deepEqual(plain(app.getModel3dEntries(JSON.parse(JSON.stringify(saved)))), plain(entries));
});

test("多模型保存保留顺序，删除首模型后兼容字段指向剩余模型", () => {
  const app = dataHarness();
  const first = { id: "character", assetId: "asset-character", name: "角色.glb", format: "glb" };
  const second = { id: "chair", assetId: "asset-chair", name: "椅子.obj", format: "obj" };
  const saved = app.model3dDataFromEntries([first, second]);
  assert.deepEqual(plain(app.getModel3dEntries(saved)), [first, second]);
  const afterDelete = app.model3dDataFromEntries([second]);
  assert.deepEqual(plain(afterDelete), {
    models: [second], modelAssetId: "asset-chair", modelName: "椅子.obj", modelFormat: "obj",
  });
});

test("显式空模型列表不会恢复已删除的旧单模型", () => {
  const app = dataHarness();
  assert.deepEqual(plain(app.getModel3dEntries({ models: [], modelAssetId: "deleted-asset" })), []);
  assert.deepEqual(plain(app.model3dDataFromEntries([])), {
    models: [], modelAssetId: "", modelName: "", modelFormat: "",
  });
  assert.deepEqual(plain(app.getModel3dEntries({})), []);
});

test("模型文件选择器支持多选，并把整批文件交给追加导入流程", async () => {
  const files = [{ name: "角色.glb" }, { name: "椅子.obj" }];
  const requests = [];
  const listeners = new Map();
  let clicks = 0;
  const input = {
    files,
    addEventListener: (type, callback) => listeners.set(type, callback),
    click: () => { clicks += 1; },
  };
  const app = vm.createContext({
    document: { createElement: (tag) => { assert.equal(tag, "input"); return input; } },
    projectLibrary: { activeProjectId: "project" }, getNode: () => input,
    importModelFiles: async (...args) => requests.push(args),
  });
  loadFunction(app, "triggerModelUpload");
  app.triggerModelUpload("scene-node");
  assert.equal(input.type, "file");
  assert.equal(input.multiple, true);
  assert.equal(clicks, 1);
  for (const format of ["glb", "gltf", "obj", "fbx", "stl"]) assert.ok(input.accept.includes(`.${format}`));
  await listeners.get("change")();
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "scene-node");
  assert.deepEqual(Array.from(requests[0][1]), files);
  assert.notEqual(requests[0][2]?.append, false);
});

function importHarness({ active = true, onOpen } = {}) {
  const node = { id: "scene-node", type: "model3dPreview", data: {} };
  const nodes = new Map([[node.id, node]]);
  const requests = [];
  const opened = [];
  const messages = [];
  const editor = {
    nodeId: node.id,
    importFiles: async (...args) => requests.push(args),
    close: () => { throw new Error("追加导入不应关闭当前编辑器"); },
  };
  const app = vm.createContext({
    projectLibrary: { activeProjectId: "project" },
    getNode: (id) => nodes.get(id),
    showToast: (message) => messages.push(message),
    editor,
    openModel3dEditor: async (...args) => {
      opened.push(args);
      vm.runInContext("activeModel3dEditor = editor;", app);
      if (onOpen) await onOpen({ app, nodes, setEditor });
    },
  });
  vm.runInContext(`let activeModel3dEditor = ${active ? "editor" : "null"};
    const model3dFormats = ["glb", "gltf", "obj", "fbx", "stl"];`, app);
  loadFunction(app, "detectModelFormat");
  loadFunction(app, "importModelFiles");
  function setEditor(next) {
    app.nextEditor = next;
    vm.runInContext("activeModel3dEditor = nextEditor;", app);
  }
  return { app, node, nodes, editor, requests, opened, messages, setEditor };
}

test("继续载入复用当前编辑器，以追加模式保留所有选中文件的顺序", async () => {
  const h = importHarness();
  const files = [{ name: "first.GLB" }, { name: "second.obj" }];
  await h.app.importModelFiles(h.node.id, files);
  assert.deepEqual(h.opened, []);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(Array.from(h.requests[0][0]), files);
  assert.deepEqual(plain(h.requests[0][1]), { append: true });
  assert.deepEqual(h.messages, []);
});

test("首次载入先创建空场景编辑器，再导入文件；明确更换时保留替换选项", async () => {
  const h = importHarness({ active: false });
  const files = [{ name: "first.glb" }];
  await h.app.importModelFiles(h.node.id, files, { append: false });
  assert.deepEqual(plain(h.opened), [[h.node.id, { allowEmpty: true }]]);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(plain(h.requests[0][1]), { append: false });
});

test("取消选择、文件类型错误或目标节点无效时不创建场景也不修改模型", async () => {
  const h = importHarness({ active: false });
  await h.app.importModelFiles(h.node.id, []);
  await h.app.importModelFiles(h.node.id, null);
  await h.app.importModelFiles(h.node.id, [{ name: "valid.glb" }, { name: "invalid.txt" }]);
  await h.app.importModelFiles("missing-node", [{ name: "valid.glb" }]);
  h.node.type = "image";
  await h.app.importModelFiles(h.node.id, [{ name: "valid.glb" }]);
  assert.deepEqual(h.opened, []);
  assert.deepEqual(h.requests, []);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /glb.*gltf.*obj.*fbx.*stl/);
});

test("等待场景初始化期间切换项目或删除节点时，放弃过期的文件导入", async () => {
  for (const change of [
    ({ app }) => { app.projectLibrary.activeProjectId = "another-project"; },
    ({ nodes }) => { nodes.delete("scene-node"); },
  ]) {
    const h = importHarness({ active: false, onOpen: change });
    await h.app.importModelFiles(h.node.id, [{ name: "valid.glb" }]);
    assert.equal(h.opened.length, 1);
    assert.deepEqual(h.requests, []);
  }
});

test("等待初始化期间切到另一个模型编辑器，不把文件导入错误节点", async () => {
  const wrongImports = [];
  const h = importHarness({
    active: false,
    onOpen: ({ setEditor }) => setEditor({ nodeId: "other-node", importFiles: async (...args) => wrongImports.push(args) }),
  });
  await h.app.importModelFiles(h.node.id, [{ name: "valid.glb" }]);
  assert.deepEqual(h.requests, []);
  assert.deepEqual(wrongImports, []);
});

test("等待初始化期间普通节点数据保存产生新对象时仍可完成导入", async () => {
  const h = importHarness({
    active: false,
    onOpen: ({ nodes }) => {
      const node = nodes.get("scene-node");
      nodes.set(node.id, { ...node, data: { ...node.data, view: { models: [] } } });
    },
  });
  await h.app.importModelFiles(h.node.id, [{ name: "valid.glb" }]);
  assert.equal(h.requests.length, 1);
});

function editorHarness({ onPersist, missing = [] } = {}) {
  const original = { id: "original", assetId: "old-asset", name: "旧模型.glb", format: "glb", position: [3, 0, 1] };
  let models = [original];
  let node = { id: "scene-node", type: "model3dPreview", data: { models, url: "idb-image:old-capture" } };
  const updates = [];
  const persisted = [];
  const loads = [];
  const interaction = [];
  const messages = [];
  const button = { disabled: false, textContent: "继续载入模型" };
  const title = { textContent: "" };
  let serial = 0;
  const app = vm.createContext({
    nodeId: node.id, projectLibrary: { activeProjectId: "project" },
    getNode: () => node,
    updateNode: (_, patch) => { updates.push(plain(patch)); node = { ...node, data: { ...node.data, ...patch } }; },
    document: { activeElement: null },
    overlay: { querySelector: (selector) => selector === ".model3d-title" ? title : button },
    controller: {
      setInteractionEnabled: (enabled) => interaction.push(enabled),
      getState: () => ({ models: models.map((entry) => ({ ...entry })), renderMode: "material", shot: { position: [5, 2, 8] } }),
      loadModel: async (file, format, options) => {
        loads.push({ file, format, options: plain(options) });
        if (file.bad) throw new Error("模型文件损坏");
        const entry = { id: options.id, assetId: options.assetId, name: options.name, format };
        models = options.append ? [...models, entry] : [entry];
        return true;
      },
    },
    loaded: true, closed: false, importBusy: false, sceneSaveTimer: null,
    missingModels: missing, directorUI: null, isDirector: false,
    selectedRatio: "16:9", maskAlpha: 0.6, showGrid: true,
    clearTimeout() {}, commitHistory() {}, syncCamera() {}, refreshPanel() {},
    makeId: () => `model-${++serial}`,
    showToast: (message) => messages.push(message),
    persistModelBlob: async (file) => {
      persisted.push(file.name);
      if (onPersist) await onPersist({ app, file, updates });
      return `asset:${file.name}`;
    },
  });
  vm.runInContext('const model3dFormats = ["glb", "gltf", "obj", "fbx", "stl"];', app);
  loadFunction(app, "detectModelFormat");
  loadFunction(app, "model3dDataFromEntries");
  const saveStart = source.indexOf("  const editorProjectId = projectLibrary.activeProjectId;");
  const saveEnd = source.indexOf("  const scheduleSceneSave =", saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  vm.runInContext(source.slice(saveStart, saveEnd), app);
  const importStart = source.indexOf("  const importFiles = async");
  const importEnd = source.indexOf("  activeModel3dEditor =", importStart);
  assert.ok(importStart >= 0 && importEnd > importStart);
  vm.runInContext(source.slice(importStart, importEnd) + "\nthis.importFiles = importFiles;", app);
  return { app, original, node: () => node, updates, persisted, loads, interaction, messages, button };
}

test("连续导入保留原模型和相机；单个文件损坏后继续载入其余文件并立即保存", async () => {
  const h = editorHarness();
  await h.app.importFiles([{ name: "one.glb" }, { name: "broken.obj", bad: true }, { name: "two.stl" }]);
  const data = h.node().data;
  assert.deepEqual(plain(data.models.map((entry) => entry.name)), ["旧模型.glb", "one.glb", "two.stl"]);
  assert.deepEqual(plain(data.models[0]), h.original);
  assert.deepEqual(plain(data.view.shot.position), [5, 2, 8]);
  assert.equal(data.url, false);
  assert.ok(h.updates.some((patch) => patch.models?.length === 2), "首个成功模型应在后续文件完成前保存");
  assert.ok(h.loads.every(({ options }) => options.append));
  assert.equal(new Set(data.models.map((entry) => entry.id)).size, 3);
  assert.deepEqual(h.interaction, [false, true]);
  assert.equal(h.button.disabled, false);
  assert.match(h.messages[0], /已载入 2 个模型.*broken.obj.*损坏/);
});

test("新增模型失败时保留原模型、旧截图和缺失素材引用", async () => {
  const missing = { id: "missing", assetId: "missing-asset", name: "待恢复.glb", format: "glb" };
  const h = editorHarness({ missing: [missing] });
  await h.app.importFiles([{ name: "broken.glb", bad: true }]);
  assert.deepEqual(plain(h.node().data.models), [h.original, missing]);
  assert.equal(h.node().data.url, "idb-image:old-capture");
  assert.equal(h.node().data.modelAssetId, h.original.assetId);
  assert.deepEqual(h.interaction, [false, true]);
  assert.match(h.messages[0], /载入失败.*broken.glb/);
});

test("更换模型只在首个文件成功后替换，后续文件继续追加", async () => {
  const h = editorHarness({ missing: [{ id: "missing", assetId: "missing-asset" }] });
  await h.app.importFiles([{ name: "broken.glb", bad: true }, { name: "one.glb" }, { name: "two.obj" }], { append: false });
  assert.deepEqual(h.loads.map(({ options }) => options.append), [false, false, true]);
  assert.deepEqual(plain(h.node().data.models.map((entry) => entry.name)), ["one.glb", "two.obj"]);
  assert.equal(h.node().data.modelAssetId, "asset:one.glb");
});

test("关闭窗口发生在素材写入期间时，完成写入后不再修改场景和节点", async () => {
  let updatesAtClose;
  const h = editorHarness({
    onPersist: ({ app, updates }) => { app.closed = true; updatesAtClose = updates.length; },
  });
  await h.app.importFiles([{ name: "one.glb" }, { name: "two.obj" }]);
  assert.deepEqual(h.persisted, ["one.glb"]);
  assert.deepEqual(h.loads, []);
  assert.equal(h.updates.length, updatesAtClose);
  assert.equal(h.node().data.url, "idb-image:old-capture");
  assert.deepEqual(h.messages, []);
});

test("导入尚未完成时再次触发不会并行写入同一场景", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const h = editorHarness({ onPersist: () => pending });
  const first = h.app.importFiles([{ name: "one.glb" }]);
  await h.app.importFiles([{ name: "two.obj" }]);
  assert.deepEqual(h.persisted, ["one.glb"]);
  assert.match(h.messages[0], /正在载入/);
  finish();
  await first;
  assert.deepEqual(plain(h.node().data.models.map((entry) => entry.name)), ["旧模型.glb", "one.glb"]);
  assert.deepEqual(h.interaction, [false, true]);
});
