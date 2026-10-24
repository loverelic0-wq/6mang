const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const models = require("../public/gpt-image-models");
const sizes = require("../public/gpt-image-2-sizes");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

// 执行真实前端函数，只替换 DOM、持久化和可灵边界，不访问画布数据或上游。
function harness(provider, config) {
  const context = vm.createContext({
    window: { GptImageModels: models, GptImage2Sizes: sizes },
    backendConfig: { providers: { image: { default: "chosen", items: { chosen: provider } } } },
    modelDefaults: {},
    getNode: (id) => id === config?.id ? config : null,
    getKlingRequestParams: () => null,
    isMjImageModel: () => false,
    escapeHtml: (value) => String(value),
    saveState: () => {},
    render: () => {},
  });
  for (const [start, end] of [
    ["const MODEL_KEY_SEPARATOR =", "const mjAspectOptions ="],
    ["function getDefaultModel(", "function modelOptionsForNode("],
    ["function optionPairs(", "function getNode("],
    ["const seedreamImageSizes =", "// 3D 取景比例选项"],
    ["function imageSizeForAspect(", "function ratioNumOf("],
    ["function buildImageGenerationBody(", "function extractImageSource("],
    ["function fitUpscaleDimensions(", "function upscaleTargetSize("],
    ["function fitExpandDimensions(", "function expandTargetSize("],
    ["function syncNodeFieldControl(", "function normalizeNodeModelValue("],
  ]) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `frontend function range: ${start}`);
    vm.runInContext(source.slice(from, to), context);
  }
  return context;
}

function provider(baseUrl = "https://147ai.com/v1", defaultModel = models.DEFAULT_MODEL) {
  return { baseUrl, defaultModel, models: models.MODELS.map((model) => ({ ...model })) };
}

function control(config, field, value) {
  return {
    dataset: { field }, value, tagName: "SELECT", type: "select-one",
    closest: () => ({ dataset: { id: config.id } }),
  };
}

test("old 147 canvas nodes adopt the replacement before provider lookup", () => {
  for (const type of ["imageConfig", "storyboardConfig", "templateImageConfig", "imageExpand", "productBackgroundConfig"]) {
    for (const providerId of ["chosen", ""]) {
      const node = { type, data: { providerId, model: "gpt-image-2", size: "3840x2160" } };
      const app = harness(provider("https://147ai.com/v1", "gpt-image-2.5-sunburst"));
      app.ensureNodeProvider(node);
      assert.equal(node.data.model, "gpt-image-2.5-sunburst");
      assert.equal(node.data.providerId, "chosen");
      assert.equal(node.data.size, "3840x2160");
    }
  }
});

test("upscale dimensions preserve ratio and apply scale, edge, pixel, and model limits", () => {
  const app = harness(provider());
  const exact = app.fitUpscaleDimensions(1001, 667, 2, { maxEdge: 4096, maxPixels: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(exact)), {
    valid: true, width: 2002, height: 1334, limited: false, error: "",
  });
  const edgeLimited = app.fitUpscaleDimensions(1200, 800, 4, { maxScale: 4, maxEdge: 4096, maxPixels: 0 });
  assert.deepEqual([edgeLimited.valid, edgeLimited.width, edgeLimited.height, edgeLimited.limited], [true, 4096, 2731, true]);
  const pixelLimited = app.fitUpscaleDimensions(3000, 2000, 4, { maxEdge: 8192, maxPixels: 8_000_000 });
  assert.equal(pixelLimited.valid, true);
  assert.equal(pixelLimited.limited, true);
  assert.ok(pixelLimited.width * pixelLimited.height <= 8_000_000);
  assert.ok(Math.abs(pixelLimited.width / pixelLimited.height - 1.5) < 0.002);
  assert.deepEqual(JSON.parse(JSON.stringify(app.fitUpscaleDimensions(100, 80, 4, { maxScale: 2 }))), {
    valid: false, width: 0, height: 0, limited: false, error: "当前模型最多支持 2x 放大",
  });
  assert.equal(app.fitUpscaleDimensions(0, 80, 2, {}).valid, false);
});

test("node migration preserves other providers and an explicitly retained legacy model", () => {
  for (const item of [
    provider("https://images.example.com/v1"),
    { ...provider(), models: [...models.MODELS, { id: "gpt-image-2", label: "Legacy" }] },
  ]) {
    const node = { type: "imageConfig", data: { providerId: "chosen", model: "gpt-image-2" } };
    harness(item).ensureNodeProvider(node);
    assert.equal(node.data.model, "gpt-image-2");
    assert.equal(node.data.providerId, "chosen");
  }
});

test("old nodes without a provider keep a channel that still declares their model", () => {
  const app = harness(provider());
  app.backendConfig.providers.image.items.other = {
    baseUrl: "https://images.example.com/v1",
    defaultModel: "gpt-image-2",
    models: [{ id: "gpt-image-2", label: "Legacy" }],
  };
  const node = { type: "imageConfig", data: { model: "gpt-image-2" } };
  app.ensureNodeProvider(node);
  assert.equal(node.data.model, "gpt-image-2");
  assert.equal(node.data.providerId, "other");

  const explicit147Node = { type: "imageConfig", data: { providerId: "chosen", model: "gpt-image-2" } };
  app.ensureNodeProvider(explicit147Node);
  assert.equal(explicit147Node.data.model, models.DEFAULT_MODEL);
  assert.equal(explicit147Node.data.providerId, "chosen");
});

test("new upscale nodes prefer the configured local ComfyUI provider", () => {
  const app = harness(provider());
  app.backendConfig.providers.image.items.comfyui = {
    adapter: "comfyui",
    baseUrl: "http://127.0.0.1:8188",
    defaultModel: "comfyui-upscale",
    models: [{ id: "comfyui-upscale", label: "ComfyUI 放大", capabilities: ["upscale"] }],
  };
  const defaults = app.getDefaultUpscaleProviderAndModel();
  assert.deepEqual(JSON.parse(JSON.stringify(defaults)), { providerId: "comfyui", model: "comfyui-upscale" });
  const node = { type: "imageUpscale", data: {} };
  app.ensureNodeProvider(node);
  assert.equal(node.data.providerId, "comfyui");
  assert.equal(node.data.model, "comfyui-upscale");
});

test("both replacement models build OpenAI generation and reference-edit payloads", () => {
  const app = harness(provider());
  for (const { id: model } of models.MODELS) {
    for (const [quality, upstreamQuality] of [["标准画质", "medium"], ["高清画质", "high"]]) {
      for (const refs of [[], ["first-reference", "second-reference"]]) {
        const config = { data: { providerId: "chosen", model, quality, size: "3840x2160" } };
        const body = app.buildImageGenerationBody(config, "test prompt", refs);
        assert.deepEqual(JSON.parse(JSON.stringify(body)), {
          providerId: "chosen", model, prompt: "test prompt", size: "3840x2160", n: 1,
          quality: upstreamQuality,
          ...(refs.length ? { image: refs } : {}),
        });
      }
    }
  }
});

test("147 nano banana 2 nodes migrate to the new 2.1 model", () => {
  const bananaProvider = {
    baseUrl: "https://147ai.com/v1",
    defaultModel: models.LEGACY_NANO_BANANA_MODEL,
    models: [
      { id: "gemini-3-pro-image-preview", label: "nano banana pro" },
      { id: models.LEGACY_NANO_BANANA_MODEL, label: "nano banana 2" },
    ],
  };
  const app = harness(bananaProvider);
  const node = { type: "imageConfig", data: { providerId: "chosen", model: models.LEGACY_NANO_BANANA_MODEL } };
  app.ensureNodeProvider(node);
  assert.equal(node.data.model, models.NANO_BANANA_21_MODEL);
  assert.equal(bananaProvider.defaultModel, models.NANO_BANANA_21_MODEL);
  assert.deepEqual(bananaProvider.models.map(({ id }) => id), [
    "gemini-3-pro-image-preview",
    models.NANO_BANANA_21_MODEL,
  ]);
  const body = app.buildImageGenerationBody({ data: {
    providerId: "chosen", model: models.NANO_BANANA_21_MODEL, quality: "高清画质", size: "2048x1152",
  } }, "test prompt", []);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    providerId: "chosen", model: models.NANO_BANANA_21_MODEL, prompt: "test prompt", size: "2048x1152", n: 1, quality: "high",
  });
});

test("replacement models retain ratio and resolution controls with real output pixels", () => {
  const app = harness(provider());
  for (const { id: model } of models.MODELS) {
    const markup = app.renderImageSizeControl(model, { size: "3840x2160" });
    assert.match(markup, /data-field="sizeRatio"/);
    assert.match(markup, /data-field="sizeTier"/);
    assert.match(markup, /value="16:9" selected/);
    assert.match(markup, /value="4K" selected/);
    assert.match(markup, /实际输出 3840 × 2160/);
    assert.equal(app.imageSizeForAspect(model, 3 / 4, "2048x2048"), "1536x2048");
    const expanded = app.fitExpandDimensions(7680, 4320, model);
    assert.equal(expanded.valid, true);
    assert.deepEqual([expanded.width, expanded.height], [3840, 2160]);
  }
});

test("switching variants and changing ratio or tier preserve compatible canvas choices", () => {
  for (const type of ["imageConfig", "storyboardConfig", "templateImageConfig"]) {
    for (const { id: model } of models.MODELS) {
      const node = { id: "config", type, data: { providerId: "chosen", model: "gpt-image-2", size: "3840x2160", quality: "4K" } };
      const app = harness(provider(), node);
      assert.equal(app.syncNodeFieldControl(control(node, "model", `chosen::${model}`)), true);
      assert.equal(node.data.model, model);
      assert.equal(node.data.providerId, "chosen");
      assert.equal(node.data.quality, "高清画质");
      assert.equal(node.data.sizeRatio, "16:9");
      assert.equal(node.data.sizeTier, "4K");
      assert.equal(node.data.size, "3840x2160");

      app.syncNodeFieldControl(control(node, "sizeRatio", "9:16"));
      assert.equal(node.data.size, "2160x3840");
      assert.equal(node.data.sizeTier, "4K");
      app.syncNodeFieldControl(control(node, "sizeTier", "1K"));
      assert.equal(node.data.size, sizes.getPreset("9:16", "1K").size);
      assert.equal(node.data.sizeRatio, "9:16");
      assert.equal(sizes.validateSize(node.data.size).valid, true);
    }
  }
});
