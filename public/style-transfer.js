(function initStyleTransfer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StyleTransfer = api;
})(typeof window !== "undefined" ? window : null, function createStyleTransfer() {
  const strengthOptions = [
    ["subtle", "轻度 · 色彩与质感"],
    ["balanced", "标准 · 风格明显"],
    ["strong", "强烈 · 风格优先"],
  ];

  const strengthInstructions = {
    subtle: "轻度迁移：主要迁移色彩、光影气氛和表面质感，尽量保留内容图的写实程度与细节表现。",
    balanced: "标准迁移：明显采用风格参考图的线条、配色、材质和渲染语言，同时稳定保留内容图的主体与构图。",
    strong: "强烈迁移：最大化采用风格参考图的完整视觉语言，但内容图的主体身份、姿态、轮廓、构图和空间关系仍不得改变。",
  };

  function normalizeStrength(value) {
    return Object.hasOwn(strengthInstructions, value) ? value : "balanced";
  }

  function connectionLabel(existingCount) {
    if (existingCount === 0) return "内容图";
    if (existingCount === 1) return "风格参考";
    return `多余参考 ${existingCount + 1}`;
  }

  function validateInputCount(count) {
    const total = Number(count) || 0;
    if (total < 2) throw new Error("需连接两张图片：第1张=内容图，第2张=风格参考图");
    if (total > 2) throw new Error("风格迁移只接受两张图片，请移除多余连线");
    return true;
  }

  function buildPrompt({ strength = "balanced", extra = "" } = {}) {
    const normalized = normalizeStrength(strength);
    const extraText = String(extra || "").trim();
    return `这是一次“风格迁移”任务，给你两张参考图：
- 图片1 是内容图：必须保留它的主体身份、五官特征、姿态、动作、服装轮廓、物体形状、镜头视角、构图、空间关系和画面比例。
- 图片2 是风格参考图：只提取它的线条笔触、造型概括方式、配色体系、材质表现、光影气氛和整体渲染语言。

要求：
1. 用图片2的视觉风格重新绘制图片1的内容，不要把图片2中的人物、物体、文字、标志、水印或构图复制到结果中。
2. 图片1决定“画什么、在哪里、什么姿态”；图片2只决定“怎么画”。
3. 保持图片1主体清晰可辨，不新增或删减主体，不改变人物身份，不交换服装和背景内容。
4. 输出与图片1相同的画面比例，边缘完整，不裁掉主体。
5. ${strengthInstructions[normalized]}${extraText ? `

额外要求：${extraText}` : ""}`;
  }

  return {
    strengthOptions,
    normalizeStrength,
    connectionLabel,
    validateInputCount,
    buildPrompt,
  };
});
