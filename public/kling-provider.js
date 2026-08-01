(function initKlingProvider(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KlingProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createKlingProvider() {
  function toolFor(kind, hasImages) {
    if (kind === "image") return hasImages ? "image_to_image" : "text_to_image";
    if (kind === "video") return hasImages ? "image_to_video" : "text_to_video";
    return "";
  }

  function modelsForTool(provider, tool) {
    return (Array.isArray(provider?.models) ? provider.models : []).filter((model) => (
      !Array.isArray(model?.tools) || model.tools.includes(tool)
    ));
  }

  function specFor(provider, modelId, tool) {
    const model = modelsForTool(provider, tool).find((entry) => entry.id === modelId);
    return model?.specs?.[tool] || { arguments: [], inputs: [] };
  }

  function fieldsForSpec(spec, storedParams = {}) {
    const stored = storedParams && typeof storedParams === "object" ? storedParams : {};
    return (Array.isArray(spec?.arguments) ? spec.arguments : [])
      .filter((arg) => arg?.name && arg.name !== "prompt")
      .map((arg) => {
        const name = String(arg.name);
        const touched = Object.prototype.hasOwnProperty.call(stored, name);
        const defaultValue = arg.default === undefined ? "" : String(arg.default);
        const options = Array.isArray(arg.allowedValues) ? arg.allowedValues.map(String) : [];
        return {
          name,
          required: Boolean(arg.required),
          defaultValue,
          value: touched ? String(stored[name]) : defaultValue,
          touched,
          description: String(arg.description || ""),
          options,
          kind: options.length ? (options.length === 2 && options.includes("true") && options.includes("false") ? "boolean" : "select") : "text",
        };
      });
  }

  function serializeParams(spec, storedParams = {}) {
    const stored = storedParams && typeof storedParams === "object" ? storedParams : {};
    const result = {};
    for (const arg of Array.isArray(spec?.arguments) ? spec.arguments : []) {
      const name = String(arg?.name || "");
      if (!name || name === "prompt") continue;
      const touched = Object.prototype.hasOwnProperty.call(stored, name);
      const value = touched ? String(stored[name] ?? "") : "";
      if (!touched || !value) {
        if (arg.required && arg.default === undefined) throw new Error(`缺少必填参数 ${name}`);
        continue;
      }
      const allowed = Array.isArray(arg.allowedValues) ? arg.allowedValues.map(String) : [];
      if (allowed.length && !allowed.includes(value)) {
        throw new Error(`参数 ${name} 的值 ${value} 无效，可选值：${allowed.join("、")}`);
      }
      result[name] = value;
    }
    return result;
  }

  function validateInputs(spec, connectedCount) {
    const inputs = Array.isArray(spec?.inputs) ? spec.inputs : [];
    const count = Math.max(0, Number(connectedCount) || 0);
    const missing = inputs.filter((input, index) => input.required && index >= count).map((input) => input.name);
    if (missing.length) throw new Error(`缺少必填素材：${missing.join("、")}`);
    if (inputs.length && count > inputs.length) throw new Error(`当前模型最多接收 ${inputs.length} 个图片素材`);
    return true;
  }

  function isCallableProvider(provider) {
    return provider?.adapter === "kling-cli" || Boolean(provider?.configured);
  }

  function videoRatioForSpec(spec, storedParams = {}, inputRatio = "", fallback = "16:9") {
    const args = Array.isArray(spec?.arguments) ? spec.arguments : [];
    const declaration = args.find((arg) => arg?.name === "aspect_ratio");
    if (!declaration) return String(inputRatio || fallback || "16:9");
    if (Object.prototype.hasOwnProperty.call(storedParams || {}, "aspect_ratio")) {
      return String(storedParams.aspect_ratio || declaration.default || fallback || "16:9");
    }
    return String(declaration.default || fallback || "16:9");
  }

  function videoMetadataRatio({ source = "", width = 0, height = 0, currentRatio = "" } = {}) {
    if (!String(source).trim()) return String(currentRatio || "");
    const w = Math.round(Number(width));
    const h = Math.round(Number(height));
    if (!(w > 0) || !(h > 0)) return String(currentRatio || "");
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const divisor = gcd(w, h);
    return `${w / divisor}:${h / divisor}`;
  }

  return {
    fieldsForSpec,
    isCallableProvider,
    modelsForTool,
    serializeParams,
    specFor,
    toolFor,
    validateInputs,
    videoMetadataRatio,
    videoRatioForSpec,
  };
});
