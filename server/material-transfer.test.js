const test = require("node:test");
const assert = require("node:assert/strict");

const materialTransfer = require("../public/material-transfer");

test("material transfer assigns deterministic roles by connection order", () => {
  assert.equal(materialTransfer.connectionLabel(0), "主体 / 结构");
  assert.equal(materialTransfer.connectionLabel(1), "材质参考");
  assert.equal(materialTransfer.connectionLabel(2), "多余参考 3");
});

test("material transfer requires exactly two input images", () => {
  assert.throws(() => materialTransfer.validateInputCount(1), /第1张=主体 \/ 结构/);
  assert.equal(materialTransfer.validateInputCount(2), true);
  assert.throws(() => materialTransfer.validateInputCount(3), /移除多余连线/);
});

test("material transfer keeps geometry and material responsibilities separate", () => {
  const prompt = materialTransfer.buildPrompt({
    strength: "strong",
    materialHint: "温润半透明白玉",
    extra: "底座也使用同一种白玉",
  });

  assert.match(prompt, /图片1 是主体 \/ 结构图/);
  assert.match(prompt, /唯一结构母版/);
  assert.match(prompt, /图片2 是材质参考图/);
  assert.match(prompt, /同一物体换材质/);
  assert.match(prompt, /禁止把图片2的人物、脸、服装款式、器物形状、姿态、底座/);
  assert.match(prompt, /保持图片1的机位、透视、景别、主体大小、背景和光线方向/);
  assert.match(prompt, /温润半透明白玉/);
  assert.match(prompt, /强烈迁移/);
  assert.match(prompt, /额外要求：底座也使用同一种白玉/);
});

test("unknown material strength safely falls back to balanced", () => {
  assert.equal(materialTransfer.normalizeStrength("unknown"), "balanced");
  assert.match(materialTransfer.buildPrompt({ strength: "unknown" }), /标准迁移/);
});
