(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VideoInputs = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const roles = {
    camera: { label: "镜头控制", hint: "连接预演视频，决定机位与运镜", kind: "video", icon: "↗" },
    environment: { label: "环境场景", hint: "上传或连接场景图，参考空间与光线", kind: "image", icon: "▧" },
    subject: { label: "主体外观", hint: "可选 · 人物、汽车或产品参考图", kind: "image", icon: "◇" },
    prompt: { label: "提示词", hint: "描述主体动作、情节与画面要求", kind: "prompt", icon: "T" },
    first: { label: "首帧", hint: "上传或连接起始画面", kind: "image", icon: "1" },
    last: { label: "尾帧", hint: "可选 · 上传或连接结束画面", kind: "image", icon: "2" },
    reference: { label: "其他参考", hint: "添加图片、视频或提示词", kind: "reference", icon: "+" },
  };
  function kind(node) {
    if (["text", "llmConfig", "storyboardAssistant", "promptOptimizer"].includes(node?.type)) return "prompt";
    if (["image", "layerGroup", "model3dPreview"].includes(node?.type)) return "image";
    return node?.type === "video" ? "video" : "unsupported";
  }
  function accepts(role, node) {
    return role === "reference" ? kind(node) !== "unsupported" : roles[role]?.kind === kind(node);
  }
  function describe(inputs, mode = "reference") {
    const keys = mode === "first_last" ? ["first", "last", "prompt"] : ["camera", "environment", "subject", "prompt"];
    const rows = keys.map((role) => ({ ...roles[role], role, key: role }));
    const used = new Set();
    const extras = [];
    const fill = (row, input) => Object.assign(row, input, { role: row.role, key: row.key, label: row.label, hint: row.hint, icon: row.icon });
    // Reserve explicitly assigned roles before placing older, untyped edges.
    for (const input of inputs) {
      const role = input.edge?.data?.videoRole;
      const row = rows.find((r) => r.role === role && !r.edge);
      if (row && accepts(role, input.node)) { fill(row, input); used.add(input); }
    }
    for (const input of inputs) {
      if (used.has(input)) continue;
      const type = kind(input.node);
      const explicit = input.edge?.data?.videoRole;
      let role = explicit && accepts(explicit, input.node) ? explicit : "reference";
      if (type === "prompt") role = "prompt";
      else if (mode === "first_last" && type === "image") role = !rows[0].edge ? "first" : !rows[1].edge ? "last" : "reference";
      else if (!explicit && type === "video" && input.node.data?.directorSource && input.node.data.directorMotion) role = "camera";
      const row = rows.find((r) => r.role === role && !r.edge);
      if (row) fill(row, input);
      else extras.push({ ...roles[role], ...input, role, kind: type, key: input.edge.id });
    }
    return [...rows, ...extras, { ...roles.reference, role: "reference", key: "add" }];
  }
  function orderMaterials(inputs, mode) {
    if (mode !== "first_last") return inputs;
    const rows = describe(inputs, mode);
    const leading = rows.filter((r) => ["first", "last"].includes(r.role) && r.edge);
    const ids = new Set(leading.map((r) => r.edge.id));
    return [...leading, ...inputs.filter((r) => !ids.has(r.edge.id))];
  }
  function defaultRole(node, inputs = [], mode = "reference") {
    if (kind(node) === "prompt") return "prompt";
    if (mode === "first_last" && kind(node) === "image") {
      const rows = describe(inputs, mode);
      return !rows[0].edge ? "first" : !rows[1].edge ? "last" : "reference";
    }
    return node?.type === "video" && node.data?.directorSource ? "camera" : "reference";
  }
  function referenceGuidance(slots, mode) {
    if (mode === "first_last") return "";
    return slots.map((slot) => {
      if (slot.kind !== "image") return "";
      const role = slot.edge?.data?.videoRole;
      if (role === "environment") return `${slot.token} 用作环境场景参考：保留其场景类型、空间关系、建筑或地貌、地面材质、天气与光线；结合镜头控制展现该环境，不复制图片中的人物或产品，不用这张静态图片覆盖预演的机位与运镜。`;
      if (role === "subject") return `${slot.token} 用作主体外观参考：保留指定人物或产品的身份、造型、颜色、材质与细节；背景与拍摄视角由环境场景和镜头控制决定。`;
      return "";
    }).filter(Boolean).join("\n");
  }
  return { roles, kind, accepts, describe, orderMaterials, defaultRole, referenceGuidance };
});
