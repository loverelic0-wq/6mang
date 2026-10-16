const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { before, test } = require("node:test");

let THREE;
let previewSource;

before(async () => {
  // Use the bundled Three.js geometry/material implementation without a browser GPU.
  const source = fs.readFileSync(path.join(__dirname, "../public/vendor/three/build/three.module.js"), "utf8");
  THREE = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  previewSource = fs.readFileSync(path.join(__dirname, "../public/model-preview.js"), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/async function parseModel[\s\S]*?\nfunction makeModeMaterial/,
      "async function parseModel(format, buffer) { return testParse(format, buffer); }\nfunction makeModeMaterial");
  assert.ok(previewSource.includes("return testParse(format, buffer)"), "fixture parser is installed");
});

function harness(t) {
  const meshes = [];
  const orbits = [], transforms = [];
  class Renderer {
    constructor() {
      this.shadowMap = {};
      this.domElement = { style: {}, addEventListener() {}, removeEventListener() {} };
    }
    setPixelRatio() {} setSize() {} setAnimationLoop() {} render() {} dispose() {} getContext() { return null; }
  }
  class Orbit extends THREE.EventDispatcher {
    constructor(camera) { super(); this.object = camera; this.target = new THREE.Vector3(); this.mouseButtons = {}; orbits.push(this); }
    listenToKeyEvents() {} update() { this.object.lookAt(this.target); } dispose() {}
  }
  class Transform extends THREE.EventDispatcher {
    constructor() { super(); this.helper = new THREE.Group(); transforms.push(this); }
    setSize() {} getHelper() { return this.helper; } attach(object) { this.object = object; }
    detach() { this.object = null; } dispose() {} setMode(mode) { this.mode = mode; } setSpace(space) { this.space = space; }
  }
  class PostProcessing { addPass() {} setSize() {} updateGtaoMaterial() {} dispose() {} }
  const context = vm.createContext({
    THREE: {
      ...THREE,
      WebGLRenderer: Renderer,
      PMREMGenerator: class {
        fromScene() { return { texture: new THREE.Texture(), dispose() {} }; }
        dispose() {}
      },
    },
    OrbitControls: Orbit,
    TransformControls: Transform,
    RoomEnvironment: THREE.Group,
    RGBELoader: class { load() {} },
    EffectComposer: PostProcessing,
    RenderPass: PostProcessing,
    GTAOPass: PostProcessing,
    OutputPass: PostProcessing,
    window: { devicePixelRatio: 1 },
    TextDecoder,
    console,
    testParse: async (_format, buffer) => {
      const value = JSON.parse(new TextDecoder().decode(buffer));
      if (value.error) throw new Error("fixture parse error");
      const root = new THREE.Group();
      if (value.empty) return root;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...value.size),
        new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 }));
      mesh.userData.testStats = { sourceDisposed: 0, geometryDisposed: 0 };
      mesh.material.addEventListener("dispose", () => mesh.userData.testStats.sourceDisposed++);
      mesh.geometry.addEventListener("dispose", () => mesh.userData.testStats.geometryDisposed++);
      root.add(mesh);
      meshes.push(mesh);
      return root;
    },
  });
  vm.runInContext(previewSource, context, { filename: "model-preview.js" });
  function mount(options = {}) {
    const container = {
      clientWidth: 640, clientHeight: 480,
      appendChild(element) { element.parentNode = this; },
      removeChild(element) { element.parentNode = null; },
    };
    const controller = context.window.Model3D.mount(container, options);
    t.after(() => controller.dispose());
    return controller;
  }
  return { mount, meshes, orbits, transforms };
}

const blob = (value) => new Blob([JSON.stringify(Array.isArray(value) ? { size: value } : value)]);
const json = (value) => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const bounds = (mesh) => new THREE.Box3().setFromObject(mesh.parent.parent);

test("appended models preserve the camera and existing transforms, and have independent identities and materials", async (t) => {
  const { mount, meshes } = harness(t);
  const controller = mount();
  await controller.loadModel(blob([2, 2, 2]), "glb", { assetId: "asset-a", name: "same" });
  const cameraBefore = json(controller.getShot());
  const modelBefore = json(controller.getState().models[0]);
  await controller.loadModel(blob([4, 4, 4]), "glb", { append: true, id: "second", assetId: "asset-b", name: "same" });
  assert.deepEqual(json(controller.getShot()), cameraBefore);
  assert.deepEqual(json(controller.getState().models[0]), modelBefore);
  assert.deepEqual(json(controller.getObjects().map((object) => object.id)), ["model", "second"]);
  assert.ok(bounds(meshes[1]).min.x > bounds(meshes[0]).max.x);
  near(bounds(meshes[1]).min.y, bounds(meshes[0]).min.y);
  controller.setMaterialChannel("roughness", 0.23);
  controller.setSelectedTransform("rotation", 1, 45);
  controller.renameSelected("second-renamed");
  near(meshes[0].userData.srcMat.roughness, 0.8);
  near(meshes[1].userData.srcMat.roughness, 0.23);
  assert.deepEqual(json(controller.getState().models[0].materialOverride), {});
  assert.equal(controller.getState().models[1].name, "second-renamed");
  near(controller.getState().models[1].rotation[1], Math.PI / 4);
});

test("model state and primitive geometry units survive append and reopen", async (t) => {
  const { mount } = harness(t);
  const original = mount();
  await original.loadModel(blob([2, 2, 2]), "glb", { assetId: "asset-a", name: "first" });
  original.addPrimitive("plane");
  const planeBefore = json(original.getState().primitives[0]);
  await original.loadModel(blob([4, 4, 4]), "glb", { append: true, id: "second", assetId: "asset-b", name: "second" });
  original.setSelectedTransform("rotation", 1, 45);
  original.setSelectedTransform("scale", 2, 1.3);
  original.setMaterialChannel("roughness", 0.23);
  const saved = json(original.getState());
  const reopened = mount();
  await reopened.loadModel(blob([2, 2, 2]), "glb", { id: "model", autoPlace: false, select: false });
  await reopened.loadModel(blob([4, 4, 4]), "glb", { append: true, id: "second", autoPlace: false, select: false });
  reopened.setState(saved);
  assert.deepEqual(json(reopened.getState().models), saved.models);
  assert.deepEqual(json(reopened.getState().primitives[0]), planeBefore);
  assert.deepEqual(json(reopened.getShot()), saved.shot);
});

test("parse errors, empty scenes and duplicate model IDs preserve the existing scene", async (t) => {
  const { mount } = harness(t);
  const controller = mount();
  await controller.loadModel(blob([2, 2, 2]), "glb");
  const previous = json(controller.getState());
  await assert.rejects(controller.loadModel(blob({ error: true }), "glb"), /fixture parse error/);
  await assert.rejects(controller.loadModel(blob({ empty: true }), "obj"), /没有可显示的网格/);
  await assert.rejects(controller.loadModel(blob([2, 2, 2]), "glb", { append: true, id: "model" }), /相同编号/);
  assert.deepEqual(json(controller.getState()), previous);
});

test("deleting models disposes their source resources but preserves shared render-mode materials", async (t) => {
  const { mount, meshes } = harness(t);
  const controller = mount();
  await controller.loadModel(blob([2, 2, 2]), "glb");
  const shared = meshes[0].material;
  let sharedDisposals = 0;
  shared.addEventListener("dispose", () => sharedDisposals++);
  await controller.loadModel(blob([4, 4, 4]), "glb", { append: true, id: "second" });
  assert.equal(meshes[1].material, shared);
  assert.equal(controller.deleteSelected(), true);
  assert.equal(meshes[1].userData.testStats.sourceDisposed, 1);
  assert.equal(meshes[1].userData.testStats.geometryDisposed, 1);
  assert.equal(meshes[0].userData.testStats.sourceDisposed, 0);
  assert.equal(sharedDisposals, 0);
  controller.selectById("model");
  assert.equal(controller.deleteSelected(), true);
  assert.equal(controller.getState().models.length, 0);
  assert.equal(controller.getState().model, null);
  assert.equal(meshes[0].userData.testStats.sourceDisposed, 1);
  assert.equal(sharedDisposals, 0);
});

test("ground height persists when the first model is deleted and another is appended after reopen", async (t) => {
  const { mount, meshes } = harness(t);
  const original = mount();
  await original.loadModel(blob([2, 2, 2]), "glb");
  original.addPrimitive("plane");
  const planeBefore = json(original.getState().primitives[0]);
  await original.loadModel(blob([4, 4, 4]), "glb", { append: true, id: "second" });
  original.selectById("model");
  original.deleteSelected();
  const saved = json(original.getState());
  const reopened = mount();
  await reopened.loadModel(blob([4, 4, 4]), "glb", { id: "second", autoPlace: false, select: false });
  reopened.setState(saved);
  near(reopened.getState().groundY, -1);
  await reopened.loadModel(blob([1, 1, 1]), "glb", { append: true, id: "third" });
  near(bounds(meshes.at(-1)).min.y, -1);
  assert.deepEqual(json(reopened.getState().primitives[0]), planeBefore);
});

test("legacy state restores the single model and original primitive units, including copied primitives", async (t) => {
  const { mount } = harness(t);
  const controller = mount();
  await controller.loadModel(blob([2, 2, 2]), "glb");
  controller.setState({
    model: { position: [1, 2, 3], rotation: [0, 0.5, 0], scale: [2, 2, 2] },
    materialOverride: { metalness: 0.7 },
    primitives: [{ kind: "box", scale: [1, 1, 1] }],
  });
  assert.deepEqual(json(controller.getState().models[0].position), [1, 2, 3]);
  near(controller.getState().models[0].materialOverride.metalness, 0.7);
  near(controller.getState().primitives[0].unit, 0.5);
  controller.selectById(controller.getObjects().find((object) => object.kind === "primitive").id);
  assert.equal(controller.copySelected(), true);
  assert.equal(controller.pasteClipboard(), true);
  near(controller.getState().primitives[1].unit, 0.5);
});

test("director models retain normalized dimensions and fixed primitive units", async (t) => {
  const { mount, meshes } = harness(t);
  const controller = mount({ director: true });
  await controller.loadModel(blob([100, 200, 100]), "fbx");
  const modelBounds = bounds(meshes[0]);
  near(modelBounds.min.y, 0);
  near(modelBounds.getSize(new THREE.Vector3()).y, 2);
  controller.addPrimitive("box");
  near(controller.getState().primitives[0].unit, 1);
});

test("resetView frames the union of all imported models", async (t) => {
  const { mount, meshes } = harness(t);
  const controller = mount();
  await controller.loadModel(blob([2, 2, 2]), "glb");
  await controller.loadModel(blob([4, 4, 4]), "glb", { append: true, id: "second" });
  const expected = bounds(meshes[0]).union(bounds(meshes[1])).getCenter(new THREE.Vector3()).toArray();
  controller.resetView();
  controller.getShot().target.forEach((value, index) => near(value, expected[index]));
});

test("disposing a controller during import prevents committing the pending model", async (t) => {
  const { mount, meshes } = harness(t);
  const controller = mount();
  let finishRead;
  const pending = controller.loadModel({ arrayBuffer: () => new Promise((resolve) => { finishRead = resolve; }) }, "glb");
  controller.dispose();
  finishRead(await blob([2, 2, 2]).arrayBuffer());
  assert.equal(await pending, false);
  assert.equal(controller.getState().models.length, 0);
  assert.equal(meshes[0].userData.testStats.sourceDisposed, 1);
  assert.equal(meshes[0].userData.testStats.geometryDisposed, 1);
  assert.equal(await controller.loadModel(blob([2, 2, 2]), "glb"), false);
});

test("free observation camera, renamed lights and their transforms survive reopening", (t) => {
  const { mount } = harness(t);
  const controller = mount({ director: true });
  controller.addPrimitive("box");
  controller.addLight("point");
  controller.renameSelected("产品轮廓灯");
  controller.setSelectedTransform("scale", 0, 2);
  controller.setViewMode("free");
  const saved = json(controller.getState());
  saved.free.position = [10, 6, 8];
  saved.free.target = [1, 2, 0];
  const reopened = mount({ director: true });
  reopened.setState(saved);
  const restored = json(reopened.getState());
  assert.equal(restored.mode, "free");
  assert.deepEqual(restored.free, saved.free);
  assert.deepEqual(restored.shot, saved.shot);
  assert.deepEqual(restored.lights, saved.lights);
  assert.ok(reopened.getObjects().some((o) => o.label === "产品轮廓灯"));
  reopened.setState({ primitives: [{ kind: "sphere" }] });
  assert.deepEqual(json(reopened.getState()).free, saved.free);
});

test("keyboard paste and numeric transform edits notify scene persistence", (t) => {
  const { mount } = harness(t);
  let changes = 0;
  const controller = mount({ onChange: () => changes++ });
  controller.addPrimitive("box");
  controller.renameSelected("产品");
  controller.copySelected();
  const before = changes;
  controller.pasteClipboard();
  assert.ok(changes > before);
  assert.equal(controller.getSelectedTransform().name, "产品 副本");
  const afterPaste = changes;
  controller.setSelectedTransform("position", 0, 1.25);
  assert.ok(changes > afterPaste);
  assert.equal(controller.getSelectedTransform().position[0], 1.25);
});

test("gizmo drag retains its camera lock when overlay requests interaction, then releases correctly", (t) => {
  const { mount, orbits, transforms } = harness(t);
  const controller = mount({ director: true });
  const controls = orbits[0], gizmo = transforms[0];
  gizmo.dispatchEvent({ type: "dragging-changed", value: true });
  assert.equal(controls.enabled, false);
  controller.setInteractionEnabled(true);
  assert.equal(controls.enabled, false, "overlay must not unlock camera mid-drag");
  gizmo.dispatchEvent({ type: "dragging-changed", value: false });
  assert.equal(controls.enabled, true);
  controller.setInteractionEnabled(false);
  gizmo.dispatchEvent({ type: "dragging-changed", value: false });
  assert.equal(controls.enabled, false, "export lock survives a late pointer-up");
  controller.setInteractionEnabled(true);
  assert.equal(controls.enabled, true);
});
