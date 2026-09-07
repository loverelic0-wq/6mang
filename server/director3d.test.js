const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const director = require("../public/director3d");
const start = { position: [3, 2, 6], target: [0, 1, 0], fov: 35 };
const distance = (shot) => Math.hypot(...shot.position.map((v, i) => v - shot.target[i]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("exported director frames retain typed output edges, frame labels and motion metadata", async () => {
  const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  const state = { nodes: [{ id: "director", position: { x: 0, y: 0 }, data: {} }], edges: [] };
  let serial = 0;
  const getNode = (id) => state.nodes.find((node) => node.id === id);
  const context = vm.createContext({
    state, getNode, nodeId: "director", projectLibrary: { activeProjectId: "test" },
    fetch: async (url) => ({ blob: async () => url }),
    persistImageBlob: async (blob) => `idb-image:${blob}`,
    makeId: () => `id-${++serial}`,
    addNode: (type, position, data) => { const id = `frame-${++serial}`; state.nodes.push({ id, type, position, data }); return id; },
    updateNode: (id, data) => Object.assign(getNode(id).data, data),
    commitHistory() {}, saveState() {}, render() {}, saveScene() {},
  });
  vm.runInContext(source.slice(source.indexOf("function addEdge("), source.indexOf("function removeEdge(")), context);
  vm.runInContext(source.slice(source.indexOf("const exportDirectorFrames = async"), source.indexOf("  const onResize = () => { if (controller)")) + "\nthis.exportFrames = exportDirectorFrames;", context);
  const frames = [{ label: "首帧", url: "first", camera: start }, { label: "尾帧", url: "last", camera: start }];
  const motion = { kind: "orbit" };
  await context.exportFrames(frames, motion);
  assert.equal(state.edges.length, 2);
  state.edges.forEach((edge, index) => {
    assert.equal(edge.source, "director");
    assert.equal(edge.type, "output");
    assert.equal(edge.data.label, frames[index].label);
    assert.equal(getNode(edge.target).data.url, `idb-image:${frames[index].url}`);
    assert.equal(getNode(edge.target).data.directorMotion, motion);
  });
});

test("director camera storage rejects invalid and duplicate shots, preserves names and scene poses", () => {
  const saved = director.normalize({ shots: [
    { id: "a", name: "主角近景", camera: start, aspect: "9:16" },
    { id: "a", camera: start }, { id: "broken", camera: { position: [NaN, 0, 0], target: [0, 0, 0] } },
  ], motion: { kind: "unknown", duration: Infinity } });
  assert.equal(saved.shots.length, 1);
  assert.equal(saved.shots[0].name, "主角近景");
  assert.equal(saved.shots[0].aspect, "9:16");
  assert.equal(saved.motion.duration, 4);
  assert.equal(saved.motion.kind, "dollyIn");
  assert.deepEqual(director.normalize(JSON.parse(JSON.stringify(saved))), saved);
  const view = director.initialView();
  assert.ok(view.primitives.some((p) => p.kind === "actor"));
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
  assert.equal(director.camera({ position: [0, 0, 0], target: [0, 0, 0] }), null);
});

test("dolly changes subject distance; truck and crane preserve distance and framing direction", () => {
  near(distance(director.endpoint(start, "dollyIn")), distance(start) * 0.65);
  near(distance(director.endpoint(start, "dollyOut")), distance(start) * 1.4);
  for (const kind of ["truck", "crane"]) {
    const end = director.endpoint(start, kind);
    near(distance(end), distance(start));
    end.position.forEach((v, i) => near(v - end.target[i], start.position[i] - start.target[i]));
  }
  assert.deepEqual(start.position, [3, 2, 6]);
});

test("orbit follows a circular arc through every frame and lands on the exported end camera", () => {
  const motion = { kind: "orbit", start, end: director.endpoint(start, "orbit"), easing: "smooth" };
  for (let i = 0; i <= 100; i++) near(distance(director.sample(motion, i / 100)), distance(start));
  assert.deepEqual(director.sample(motion, 0), start);
  assert.deepEqual(director.sample(motion, 1), motion.end);
});

test("custom movement interpolates focus and lens, clamps scrubbing and rejects camera crossing focus", () => {
  const motion = { kind: "custom", start, end: { position: [7, 4, 8], target: [2, 1, 0], fov: 55 }, easing: "linear" };
  assert.deepEqual(director.sample(motion, 0.5), { position: [5, 3, 7], target: [1, 1, 0], fov: 45 });
  assert.deepEqual(director.sample(motion, -1), start);
  assert.deepEqual(director.sample(motion, 2), motion.end);
  assert.throws(() => director.sample({ start, end: null }, 0), /记录/);
  const crossing = { start: { position: [0, 0, 2], target: [0, 0, 0] }, end: { position: [0, 0, -2], target: [0, 0, 0] } };
  assert.throws(() => director.sample(crossing, 0.5), /对焦点/);
});

test("every preset remains finite and serializable, dialogue includes two distinct roles", () => {
  for (const kind of ["studio", "dialogue", "product"]) {
    for (const object of director.scenePreset(kind)) {
      assert.ok(object.name);
      for (const field of ["position", "rotation", "scale"]) assert.ok(object[field].every(Number.isFinite));
    }
  }
  const actors = director.scenePreset("dialogue").filter((p) => p.kind === "actor");
  assert.equal(actors.length, 2);
  assert.notEqual(actors[0].color, actors[1].color);
  assert.notDeepEqual(actors[0].position, actors[1].position);
});
