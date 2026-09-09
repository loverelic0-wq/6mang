(function initMaterialTransfer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaterialTransfer = api;
})(typeof window !== "undefined" ? window : null, function createMaterialTransfer() {
  const strengthOptions = [
    ["subtle", "轻度 · 保留部分原色"],
    ["balanced", "标准 · 完整替换材质"],
    ["strong", "强烈 · 强化材质特征"],
  ];

  const strengthInstructions = {
    subtle: "轻度迁移：采用图片2的纹理、反射和表面触感，但允许图片1保留少量原有色彩与旧化痕迹。",
    balanced: "标准迁移：完整采用图片2的主色、纹理、粗糙度、光泽、透明或半透明特征，让图片1主体像由该材质真实制作而成。",
    strong: "强烈迁移：最大化图片2材质的辨识度与纯度，强化其颜色、纹理、透光、金属、陶瓷、织物或石材特征，但仍不得改变图片1的几何结构。",
  };

  function normalizeStrength(value) {
    return Object.hasOwn(strengthInstructions, value) ? value : "balanced";
  }

  function connectionLabel(existingCount) {
    if (existingCount === 0) return "主体 / 结构";
    if (existingCount === 1) return "材质参考";
    return `多余参考 ${existingCount + 1}`;
  }

  function validateInputCount(count) {
    const total = Number(count) || 0;
    if (total < 2) throw new Error("需连接两张图片：第1张=主体 / 结构，第2张=材质参考");
    if (total > 2) throw new Error("材质迁移只接受两张图片，请移除多余连线");
    return true;
  }

  function buildPrompt({ strength = "balanced", materialHint = "", extra = "" } = {}) {
    const normalized = normalizeStrength(strength);
    const hintText = String(materialHint || "").trim();
    const extraText = String(extra || "").trim();
    return `这是一次“材质迁移”任务，给你两张按顺序排列的参考图：
- 图片1 是主体 / 结构图：它是输出内容的唯一结构母版。必须保留主体身份、几何形状、轮廓、拓扑、比例、姿态、部件数量、细节雕刻、镜头视角、构图、背景、遮挡关系和画面比例。
- 图片2 是材质参考图：只提取其主要材质的物理外观，包括主色、纹理尺度、纹理方向、粗糙度、光泽、反射、金属度、透明度、半透明感、次表面散射、孔隙和边缘高光。不要提取图片2的主体造型。

材质目标：${hintText || "自动识别图片2主体最有代表性的主要材质"}。

要求：
1. 只替换图片1主体的可见表面材质，让同一个主体看起来由图片2的主要材质真实制作而成；这是“同一物体换材质”，不是两个物体融合、变形、拼贴或换主体。
2. 图片1决定“是什么、长什么形状、位于哪里”；图片2只决定“表面由什么材质构成”。禁止把图片2的人物、脸、服装款式、器物形状、姿态、底座、文字、标志、水印、背景、构图或摄影风格复制到结果中。
3. 严格保持图片1的外轮廓、面部与手部、武器或配件、装甲分片、衣褶、发丝、雕纹、接缝、底座文字和所有小结构，不新增、不删减、不替换任何部件。
4. 新材质必须沿图片1的曲面、转折、接缝、纹理方向和透视自然包覆；材质尺度合理且连续，不要出现贴图拉伸、漂浮纹理、局部漏换、斑驳混材质或边缘融化。
5. 保持图片1的机位、透视、景别、主体大小、背景和光线方向。新材质应在图片1原有光照下产生物理可信的高光、阴影、反射、透光或次表面散射，而不是照搬图片2的布光。
6. 保持图片1的清晰度与画面比例，主体边缘完整，不裁切，不改变背景，不添加说明文字或界面元素。
7. ${strengthInstructions[normalized]}${extraText ? `

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
