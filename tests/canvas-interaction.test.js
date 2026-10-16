const test = require("node:test");
const assert = require("node:assert/strict");
const { checkCanvas } = require("../scripts/check-canvas-performance");

test("canvas gestures retain media DOM, batch saving and preserve geometry/history", { timeout: 120000 }, async (t) => {
  const result = await checkCanvas();
  if (!result) return t.skip("Chrome or Edge is required for canvas interaction checks");
  for (const gesture of ["nodeDrag", "groupDrag", "resize", "pan"]) {
    assert.equal(result[gesture].renders, 0, `${gesture} must not rebuild the canvas`);
    assert.equal(result[gesture].saves, 1, `${gesture} saves once on release`);
    assert.equal(result[gesture].retainedNode, true, `${gesture} must retain existing node DOM`);
    assert.ok((result[gesture].edgeUpdates || 0) <= 26, `${gesture} must coalesce pointer events into animation frames`);
  }
  assert.equal(result.zoomBeforeIdle.saves, 0, "wheel input must not synchronously serialize projects");
  assert.equal(result.zoom.saves, 1, "wheel burst saves once after idle");
  assert.equal(result.persisted, true, "final view and node geometry must be persisted");
  assert.ok(result.edgeAlignmentError < 1, "edge endpoints stay aligned within one world pixel");
  assert.ok(result.nodeDrag.rectReads < 100, "node dragging must use cached geometry");
  for (const [name, passed] of Object.entries(result.checks)) assert.equal(passed, true, name);
});
