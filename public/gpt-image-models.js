(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GptImageModels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_MODEL = "gpt-image-2.5-flare";
  const MODELS = [
    { id: DEFAULT_MODEL, label: "GPT Image 2.5 Flare" },
    { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst" },
  ];

  function isModel(model) {
    const id = String(model || "").trim().toLowerCase();
    return id === "gpt-image-2" || MODELS.some((entry) => entry.id === id);
  }

  function is147Provider(provider) {
    try {
      return ["147ai.com", "api.147ai.cn"].includes(new URL(provider?.baseUrl).hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  // 只迁移已从 147 模型池移除的旧选择，保留其他渠道及用户仍配置的旧模型。
  function resolveModel(provider, model) {
    const id = String(model || "");
    if (id !== "gpt-image-2" || !is147Provider(provider)) return id;
    const configured = provider.models || [];
    if (configured.some((entry) => entry.id === id)) return id;
    const replacements = MODELS.filter((entry) => configured.some((item) => item.id === entry.id));
    return replacements.find((entry) => entry.id === provider.defaultModel)?.id || replacements[0]?.id || id;
  }

  return { DEFAULT_MODEL, MODELS, isModel, is147Provider, resolveModel };
});
