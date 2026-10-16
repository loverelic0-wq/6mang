(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GptImageModels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_MODEL = "gpt-image-2.5-flare";
  const NANO_BANANA_21_MODEL = "gemini-nano-banana-2.1";
  const LEGACY_NANO_BANANA_MODEL = "gemini-3.1-flash-image-preview";
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

  function isNanoBananaProvider(provider) {
    if (!is147Provider(provider)) return false;
    return (provider?.models || []).some((entry) =>
      [LEGACY_NANO_BANANA_MODEL, NANO_BANANA_21_MODEL, "gemini-3-pro-image-preview"].includes(entry?.id),
    );
  }

  function migrateNanoBananaProvider(provider) {
    if (!isNanoBananaProvider(provider)) return provider;
    const models = Array.isArray(provider.models) ? provider.models : [];
    const hasNew = models.some((entry) => entry?.id === NANO_BANANA_21_MODEL);
    if (!hasNew) {
      provider.models = models.map((entry) => entry?.id === LEGACY_NANO_BANANA_MODEL
        ? { ...entry, id: NANO_BANANA_21_MODEL, label: "nano banana 2.1" }
        : entry);
    }
    if (provider.defaultModel === LEGACY_NANO_BANANA_MODEL) provider.defaultModel = NANO_BANANA_21_MODEL;
    return provider;
  }

  // 只迁移已从 147 模型池移除的旧选择，保留其他渠道及仍明确配置的旧模型。
  function resolveModel(provider, model) {
    migrateNanoBananaProvider(provider);
    const id = String(model || "");
    if (id === LEGACY_NANO_BANANA_MODEL && isNanoBananaProvider(provider)) {
      const configured = provider.models || [];
      if (!configured.some((entry) => entry.id === id) && configured.some((entry) => entry.id === NANO_BANANA_21_MODEL)) {
        return NANO_BANANA_21_MODEL;
      }
    }
    if (id !== "gpt-image-2" || !is147Provider(provider)) return id;
    const configured = provider.models || [];
    if (configured.some((entry) => entry.id === id)) return id;
    const replacements = MODELS.filter((entry) => configured.some((item) => item.id === entry.id));
    return replacements.find((entry) => entry.id === provider.defaultModel)?.id || replacements[0]?.id || id;
  }

  return {
    DEFAULT_MODEL,
    MODELS,
    NANO_BANANA_21_MODEL,
    LEGACY_NANO_BANANA_MODEL,
    isModel,
    is147Provider,
    isNanoBananaProvider,
    migrateNanoBananaProvider,
    resolveModel,
  };
});
