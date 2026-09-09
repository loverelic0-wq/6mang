(function initProductBackground(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProductBackground = api;
})(typeof window !== "undefined" ? window : null, function createProductBackground() {
  const labels = ["产品图", "背景图"];

  // 显式角色在断开、补连与逆序上传后仍保持不变；普通连线按先后填空位。
  function assignInputs(slots = []) {
    const inputs = [null, null];
    const unassigned = [];
    const extras = [];
    for (const slot of slots) {
      const role = labels.indexOf(slot.edge?.data?.label);
      if (role < 0) unassigned.push(slot);
      else if (!inputs[role]) inputs[role] = slot;
      else extras.push(slot);
    }
    for (const slot of unassigned) {
      const empty = inputs.indexOf(null);
      if (empty < 0) extras.push(slot);
      else inputs[empty] = slot;
    }
    return { product: inputs[0], background: inputs[1], extras };
  }

  function nextConnectionLabel(slots) {
    const { product, background } = assignInputs(slots);
    return !product ? labels[0] : !background ? labels[1] : "多余参考图";
  }

  function validateInputs(slots) {
    const assigned = assignInputs(slots);
    if (assigned.extras.length) throw new Error("产品换背景只接受两张图片，请移除多余连线");
    if (!assigned.product || !assigned.background) throw new Error("请上传或连接产品图和背景图");
    if ([assigned.product, assigned.background].some((slot) => typeof slot.node?.data?.url !== "string" || !slot.node.data.url || slot.node.data.loading)) {
      throw new Error("产品图和背景图都需要先载入完成");
    }
    return assigned;
  }

  function normalizeAspectSource(value) {
    return value === "background" ? "background" : "product";
  }

  function buildPrompt({ extra = "", aspectSource = "product" } = {}) {
    const framing = normalizeAspectSource(aspectSource) === "background"
      ? "输出画面比例跟随图片2，保留背景空间布局，将完整产品以合理大小放入场景。"
      : "输出画面比例跟随图片1，尽量保持产品原有构图和画面占比，让图片2的环境适配画幅。";
    const extraText = String(extra || "").trim();
    return `对上传的两张图片执行一次产品换背景编辑，直接输出完成背景替换并统一光影后的单张成品图。

图片1：产品原图，是产品外观与细节的唯一依据。
图片2：用户指定的背景图，是新场景、环境与光照的依据。

编辑要求：
1. 保留图片1中的全部产品及其相对关系，替换原背景。高度保持产品的身份、轮廓、几何比例、部件数量、拍摄角度、Logo、商标、文字内容和排版、图案、接缝、边缘及微小结构；不要重新设计产品、添加或删减零件、改变文字或生成第二套产品。
2. 保持产品原有配色、材质类型、纹理尺度与方向、表面细节和工艺。织物仍是织物，金属仍是金属；不要磨平纹理、替换材质或把环境颜色误当作产品自身颜色。
3. 使用图片2所呈现的真实场景作为背景，保留其有辨识度的建筑、地面、桌面与空间关系；不要仅提取风格后另造场景。原产品背景、原底板及不属于产品的旧投影应被替换，不保留白底、抠图白边或拼贴边框。
4. 在同一次编辑中统一产品与环境的光源方向、色温、明暗、对比度和阴影软硬。允许产品表面出现与新环境一致的受光、高光和环境反射，但不得改变产品的结构、文字、图案或材质纹理。
5. 根据产品与承接面的真实接触位置生成接触阴影和投影；仅在场景和材质需要时补充合理倒影、反射或透射。去掉原环境不匹配的投影，避免双重阴影、漂浮、穿插、悬空或不合理透视。
6. 尽量让背景适配产品现有视角，不旋转产品去编造原图不可见的结构。${framing}产品保持完整清晰，不裁掉边缘。
7. 不添加宣传文案、水印、装饰边框或对比拼图。只输出最终产品场景照片。${extraText ? `\n\n补充要求（在以上产品保留约束下执行）：${extraText}` : ""}`;
  }

  return { assignInputs, nextConnectionLabel, validateInputs, normalizeAspectSource, buildPrompt };
});
