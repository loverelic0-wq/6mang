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

test("annotation coordinates are clamped to the normalized image rectangle", () => {
  const tools = loadTools();
  assert.equal(typeof tools.clampNormalizedPoint, "function", "clampNormalizedPoint should be implemented");
  assert.deepEqual(tools.clampNormalizedPoint({ x: -0.1, y: 1.2 }), { x: 0, y: 1 });
  assert.deepEqual(tools.clampNormalizedPoint({ x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
});

test("brush paths discard near-duplicate points while preserving the final gesture", () => {
  const tools = loadTools();
  assert.equal(typeof tools.simplifyNormalizedPath, "function", "simplifyNormalizedPath should be implemented");
  assert.deepEqual(tools.simplifyNormalizedPath([
    { x: 0, y: 0 },
    { x: 0.001, y: 0.001 },
    { x: 0.5, y: 0.5 },
    { x: 0.501, y: 0.501 },
  ], 0.01), [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 0.501, y: 0.501 },
  ]);
});

test("eraser hit testing selects the topmost overlapping mark", () => {
  const tools = loadTools();
  assert.equal(typeof tools.findAnnotationMarkAt, "function", "findAnnotationMarkAt should be implemented");
  const marks = [
    { type: "box", x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4 },
    { type: "point", x: 0.25, y: 0.25 },
  ];
  assert.equal(tools.findAnnotationMarkAt(marks, { x: 0.25, y: 0.25 }, 0.03), 1);
  assert.equal(tools.findAnnotationMarkAt(marks, { x: 0.35, y: 0.35 }, 0.03), 0);
  assert.equal(tools.findAnnotationMarkAt(marks, { x: 0.8, y: 0.8 }, 0.03), -1);
});

test("arrow and brush hit testing follows their actual line segments", () => {
  const tools = loadTools();
  assert.equal(typeof tools.findAnnotationMarkAt, "function", "findAnnotationMarkAt should be implemented");
  const marks = [
    { type: "arrow", x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1 },
    { type: "brush", points: [{ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.8 }] },
  ];
  assert.equal(tools.findAnnotationMarkAt(marks, { x: 0.5, y: 0.79 }, 0.03), 1);
  assert.equal(tools.findAnnotationMarkAt(marks, { x: 0.5, y: 0.11 }, 0.03), 0);
});

test("precise edit prompt explains the marker contract only when marks exist", () => {
  const tools = loadTools();
  assert.equal(typeof tools.buildPreciseEditPrompt, "function", "buildPreciseEditPrompt should be implemented");
  assert.equal(
    tools.buildPreciseEditPrompt("把沙发改成绿色", []),
    "把沙发改成绿色\n保持未要求修改的区域、构图和比例不变。",
  );
  assert.equal(
    tools.buildPreciseEditPrompt("把沙发改成绿色", [{ type: "point", x: 0.4, y: 0.5 }]),
    "把沙发改成绿色\n紫色标记仅用于定位。完成修改后删除全部紫色标记，并保持未标记区域、构图和比例不变。",
  );
});
