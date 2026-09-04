const { assertSize: assertGptImage2Size } = require("../public/gpt-image-2-sizes");

function compactPayload(payload) {
  return Object.fromEntries(Object.entries(payload || {}).filter(([, value]) => value !== undefined));
}

function isVolcArkProvider(provider) {
  return /volces\.com|bytepluses\.com/i.test(String(provider?.baseUrl || ""));
}

function imageReferences(body) {
  if (Array.isArray(body?.image)) return body.image.filter(Boolean);
  return body?.image ? [body.image] : [];
}

function isSeedream5ProModel(model) {
  return /^(?:doubao-|dola-)?seedream-5-0-pro-\d+$/i.test(String(model || ""));
}

function isGptImage2Model(model) {
  return String(model || "").trim().toLowerCase() === "gpt-image-2";
}

function selectImageUpstreamRequest(provider, body = {}) {
  const model = String(body.model || provider?.defaultModel || "");
  const refs = imageReferences(body);
  const basePayload = compactPayload({ ...body, providerId: undefined, model });

  if (isGptImage2Model(model) && body.size !== undefined) {
    assertGptImage2Size(body.size);
  }

  if (body.layer_decomposition) {
    if (!isVolcArkProvider(provider)) {
      const error = new Error("原生图层分离只支持火山方舟图片 Provider");
      error.statusCode = 400;
      throw error;
    }
    if (!isSeedream5ProModel(model)) {
      const error = new Error("原生图层分离需要 Seedream 5.0 Pro 模型");
      error.statusCode = 400;
      throw error;
    }
    if (refs.length !== 1) {
      const error = new Error("原生图层分离必须且只能提供一张输入图");
      error.statusCode = 400;
      throw error;
    }
  }

  if (isVolcArkProvider(provider)) {
    if (refs.length > 10) {
      const error = new Error("Seedream 5.0 Pro 最多支持 10 张参考图");
      error.statusCode = 400;
      throw error;
    }
    return {
      mode: "json",
      route: "/images/generations",
      refs,
      payload: compactPayload({
        ...basePayload,
        image: refs.length ? (body.layer_decomposition ? refs[0] : (Array.isArray(body.image) ? refs : refs[0])) : undefined,
      }),
    };
  }

  if (refs.length) {
    return { mode: "multipart", route: "/images/edits", refs, payload: null };
  }

  return {
    mode: "json",
    route: "/images/generations",
    refs,
    payload: compactPayload({ ...basePayload, image: undefined }),
  };
}

module.exports = {
  imageReferences,
  isVolcArkProvider,
  isSeedream5ProModel,
  isGptImage2Model,
  selectImageUpstreamRequest,
};
