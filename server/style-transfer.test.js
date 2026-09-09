const test = require("node:test");
const assert = require("node:assert/strict");

const styleTransfer = require("../public/style-transfer");

test("style transfer assigns deterministic roles by connection order", () => {
  assert.equal(styleTransfer.connectionLabel(0), "内容图");
  assert.equal(styleTransfer.connectionLabel(1), "风格参考");
  assert.equal(styleTransfer.connectionLabel(2), "多余参考 3");
});

test("style transfer requires exactly two input images", () => {
  assert.throws(() => styleTransfer.validateInputCount(1), /第1张=内容图/);
  assert.equal(styleTransfer.validateInputCount(2), true);
  assert.throws(() => styleTransfer.validateInputCount(3), /移除多余连线/);
});

test("style transfer prompt keeps content and style responsibilities separate", () => {
  const prompt = styleTransfer.buildPrompt({ strength: "strong", extra: "背景保持纯白" });

  assert.match(prompt, /图片1 是内容图/);
  assert.match(prompt, /图片2 是风格参考图/);
  assert.match(prompt, /不要把图片2中的人物、物体、文字、标志、水印或构图复制/);
  assert.match(prompt, /强烈迁移/);
  assert.match(prompt, /额外要求：背景保持纯白/);
});

test("unknown strength safely falls back to balanced", () => {
  assert.equal(styleTransfer.normalizeStrength("unknown"), "balanced");
  assert.match(styleTransfer.buildPrompt({ strength: "unknown" }), /标准迁移/);
});
