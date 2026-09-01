const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadRouting() {
  try {
    return require(path.join(__dirname, "image-routing.js"));
  } catch {
    return {};
  }
}

test("Volcengine reference editing remains JSON on images/generations", () => {
  const routing = loadRouting();
  assert.equal(typeof routing.selectImageUpstreamRequest, "function", "routing selector should be implemented");
  const request = routing.selectImageUpstreamRequest(
    { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "fallback" },
    {
      providerId: "volc",
      model: "doubao-seedream-5-0-pro-260628",
      prompt: "把外套改成蓝色",
      image: ["data:image/png;base64,AAA", "https://example.com/material.png"],
      size: "2048x2048",
    },
  );
  assert.equal(request.mode, "json");
  assert.equal(request.route, "/images/generations");
  assert.deepEqual(request.payload.image, ["data:image/png;base64,AAA", "https://example.com/material.png"]);
  assert.equal(Object.hasOwn(request.payload, "providerId"), false);
});

test("generic providers keep multipart reference editing", () => {
  const routing = loadRouting();
  assert.equal(typeof routing.selectImageUpstreamRequest, "function", "routing selector should be implemented");
  const request = routing.selectImageUpstreamRequest(
    { baseUrl: "https://example.com/v1", defaultModel: "gpt-image-2" },
    { providerId: "default", model: "gpt-image-2", prompt: "edit", image: ["data:image/png;base64,AAA"] },
  );
  assert.equal(request.mode, "multipart");
  assert.equal(request.route, "/images/edits");
  assert.deepEqual(request.refs, ["data:image/png;base64,AAA"]);
});

test("text-to-image remains JSON for generic providers", () => {
  const routing = loadRouting();
  assert.equal(typeof routing.selectImageUpstreamRequest, "function", "routing selector should be implemented");
  const request = routing.selectImageUpstreamRequest(
    { baseUrl: "https://example.com/v1", defaultModel: "gpt-image-2" },
    { providerId: "default", model: "gpt-image-2", prompt: "create" },
  );
  assert.equal(request.mode, "json");
  assert.equal(request.route, "/images/generations");
  assert.equal(Object.hasOwn(request.payload, "providerId"), false);
});

test("Volcengine rejects more than ten reference images before forwarding", () => {
  const routing = loadRouting();
  assert.equal(typeof routing.selectImageUpstreamRequest, "function", "routing selector should be implemented");
  assert.throws(
    () => routing.selectImageUpstreamRequest(
      { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seedream-5-0-pro-260628" },
      { image: Array.from({ length: 11 }, (_, index) => `image-${index}`) },
    ),
    (error) => error?.statusCode === 400 && /10 张参考图/.test(error.message),
  );
});

test("native layer separation accepts exactly one image on a Volcengine Pro model", () => {
  const routing = loadRouting();
  assert.equal(typeof routing.selectImageUpstreamRequest, "function", "routing selector should be implemented");
  const request = routing.selectImageUpstreamRequest(
    { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seedream-5-0-pro-260628" },
    {
      model: "doubao-seedream-5-0-pro-260628",
      image: "https://cdn.example.com/source.png",
      layer_decomposition: true,
      output_format: "png",
    },
  );
  assert.equal(request.mode, "json");
  assert.equal(request.payload.layer_decomposition, true);
  assert.equal(request.payload.image, "https://cdn.example.com/source.png");

  const normalized = routing.selectImageUpstreamRequest(
    { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seedream-5-0-pro-260628" },
    { model: "doubao-seedream-5-0-pro-260628", image: ["https://cdn.example.com/source.png"], layer_decomposition: true },
  );
  assert.equal(normalized.payload.image, "https://cdn.example.com/source.png");
});

test("native layer separation rejects generic providers, non-Pro models and multiple images", () => {
  const routing = loadRouting();
  const generic = { baseUrl: "https://example.com/v1", defaultModel: "gpt-image-2" };
  const volc = { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seedream-5-0-pro-260628" };
  assert.throws(
    () => routing.selectImageUpstreamRequest(generic, { model: "gpt-image-2", image: "one", layer_decomposition: true }),
    (error) => error?.statusCode === 400 && /火山方舟/.test(error.message),
  );
  assert.throws(
    () => routing.selectImageUpstreamRequest(volc, { model: "doubao-seedream-5-0-260128", image: "one", layer_decomposition: true }),
    (error) => error?.statusCode === 400 && /5\.0 Pro/.test(error.message),
  );
  assert.throws(
    () => routing.selectImageUpstreamRequest(volc, { model: "doubao-seedream-5-0-pro-260628", image: ["one", "two"], layer_decomposition: true }),
    (error) => error?.statusCode === 400 && /一张输入图/.test(error.message),
  );
});
