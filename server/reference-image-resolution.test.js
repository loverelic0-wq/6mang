const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sizes = require("../public/gpt-image-2-sizes");
const models = require("../public/gpt-image-models");
const seedream = require("../public/seedream-tools");
const materialTransfer = require("../public/material-transfer");
const productBackground = require("../public/product-background");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const PRO_MODEL = "doubao-seedream-5-0-pro-260628";
const GPT_MODELS = ["gpt-image-2", ...models.MODELS.map(({ id }) => id)];
const NODE_TYPES = ["materialTransferConfig", "productBackgroundConfig"];

function loadFunction(context, name) {
  const declaration = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(source);
  assert.ok(declaration, `真实前端函数应存在：${name}`);
  const from = declaration.index;
  const next = /\n(?:(?:async )?function |(?:const|let|class) )/.exec(source.slice(from));
  vm.runInContext(source.slice(from, next ? from + next.index : source.length), context);
}

// 运行真实控件事件、尺寸计算、生成函数和请求序列化，仅替换 DOM、素材和 API 边界。
function harness({ type = "materialTransferConfig", model = GPT_MODELS[0], data = {}, aspect = true } = {}) {
  const config = {
    id: "config", type, position: { x: 0, y: 0 },
    data: { model, providerId: "chosen", size: "2048x2048", quality: "高清画质", aspectSource: "product", ...data },
  };
  const nodes = new Map([[config.id, config]]);
  const requests = [];
  const messages = [];
  const probes = [];
  let saveCount = 0;
  const inputs = [
    { edge: { data: { label: "产品图" } }, node: { data: { url: "first-image" } } },
    { edge: { data: { label: "背景图" } }, node: { data: { url: "second-image" } } },
  ];
  const app = vm.createContext({
    window: { GptImage2Sizes: sizes, GptImageModels: models, SeedreamTools: seedream, MaterialTransfer: materialTransfer, ProductBackground: productBackground },
    getNode: (id) => nodes.get(id),
    getDefaultModel: () => GPT_MODELS[0],
    getImageReferenceSlots: () => inputs,
    getKlingRequestParams: () => null,
    isMjImageModel: (value) => value === "midjourney",
    hasApiKey: () => true,
    escapeHtml: (value) => String(value),
    escapeHtmlAttr: (value) => String(value),
    findOutputImageNode: () => nodes.get("result"),
    addNode: (_, position, nodeData) => { nodes.set("result", { id: "result", position, data: nodeData }); return "result"; },
    addEdge: () => {},
    updateNode: (id, patch) => Object.assign(nodes.get(id).data, patch),
    showProcessing: () => {}, hideProcessing: () => {}, render: () => {}, processing: {},
    showToast: (message) => messages.push(message),
    generateGradient: () => "gradient",
    resolveImageForApi: async (url) => `resolved:${url}`,
    probeImageAspect: async (url) => { probes.push(url); return aspect ? (url === "first-image" ? 3 / 4 : 16 / 9) : null; },
    requestImageGeneration: async (requestConfig, prompt, references) => {
      const body = app.buildImageGenerationBody(requestConfig, prompt, references);
      requests.push(JSON.parse(JSON.stringify(body)));
      return "idb-image:result";
    },
    friendlyImageError: (message) => message,
    recordProjectHistory: () => {},
    saveState: () => { saveCount += 1; },
  });
  const constantsStart = source.indexOf("const seedreamImageSizes =");
  const constantsEnd = source.indexOf("function isStandardImageModel(", constantsStart);
  assert.ok(constantsStart >= 0 && constantsEnd > constantsStart);
  vm.runInContext(source.slice(constantsStart, constantsEnd), app);
  vm.runInContext('const MODEL_KEY_SEPARATOR = "::"; const activeProductBackgroundRuns = new Set();', app);
  for (const name of [
    "parseModelKey", "normalizeModelValue", "optionPairs",
    "isStandardImageModel", "isGptImage2Model", "isSeedream5ImageModel", "isSeedream5ProImageModel", "isFluxImageModel",
    "imageSizeOptions", "getImageSizeValue", "gptImage2PresetFromData", "gptImage2SizeFromData", "applyGptImage2Preset", "assertImageConfigSize",
    "parseAspect", "nearestByAspect", "imageSizeForAspect", "normalizeImageSize", "mapImageQuality",
    "referenceImageSizeTiers", "referenceImageSizeTier", "renderReferenceImageSizeControl", "referenceImageSizeForAspect",
    "buildImageGenerationBody", "syncNodeFieldControl", "generateMaterialTransfer", "generateProductBackground",
  ]) loadFunction(app, name);
  return {
    app, config, requests, messages, probes, nodes,
    saves: () => saveCount,
    set: (field, value) => app.syncNodeFieldControl({
      dataset: { field }, value, type: "select-one", tagName: "SELECT",
      closest: () => ({ dataset: { id: config.id } }),
    }),
    run: () => type === "materialTransferConfig" ? app.generateMaterialTransfer(config.id) : app.generateProductBackground(config.id),
  };
}

const expectedGpt = {
  portrait: { "1K": "768x1024", "2K": "1536x2048", "4K": "2448x3264" },
  landscape: { "1K": "1280x720", "2K": "2048x1152", "4K": "3840x2160" },
};
const expectedPro = {
  portrait: { "1K": "864x1152", "2K": "1776x2368" },
  landscape: { "1K": "1424x800", "2K": "2816x1584" },
};

test("两种参考图节点的 GPT 档位经过生成与请求序列化仍保留，并跟随指定输入比例", async () => {
  for (const model of GPT_MODELS) {
    for (const type of NODE_TYPES) {
      for (const aspectSource of type === "productBackgroundConfig" ? ["product", "background"] : ["product"]) {
        for (const tier of ["1K", "2K", "4K"]) {
          const h = harness({ type, model, data: { aspectSource } });
          assert.equal(h.set("sizeTier", tier), true);
          assert.equal(h.config.data.sizeTier, tier);
          assert.equal(h.saves(), 1);
          await h.run();
          assert.deepEqual(h.messages, []);
          assert.equal(h.requests.length, 1, `${type} ${model} ${tier} 应只调用一次`);
          const body = h.requests[0];
          const followsBackground = aspectSource === "background";
          assert.equal(body.size, expectedGpt[followsBackground ? "landscape" : "portrait"][tier]);
          assert.equal(body.model, model);
          assert.equal(body.providerId, "chosen");
          assert.equal(body.quality, "high");
          assert.deepEqual(body.image, ["resolved:first-image", "resolved:second-image"]);
          assert.deepEqual(h.probes, [followsBackground ? "second-image" : "first-image"]);
          assert.equal(sizes.validateSize(body.size).valid, true);
          assert.equal(h.nodes.get("result").data.url, "idb-image:result");
        }
      }
    }
  }
});

test("Seedream Pro 按选定档位匹配参考比例，2K 不再被较早的 1K 预设覆盖", async () => {
  for (const type of NODE_TYPES) {
    for (const aspectSource of type === "productBackgroundConfig" ? ["product", "background"] : ["product"]) {
      for (const tier of ["1K", "2K"]) {
        const h = harness({ type, model: PRO_MODEL, data: { aspectSource, outputFormat: "png", promptOptimization: "fast" } });
        h.set("sizeTier", tier);
        await h.run();
        assert.deepEqual(h.messages, []);
        assert.equal(h.requests.length, 1);
        const body = h.requests[0];
        assert.equal(body.size, expectedPro[aspectSource === "background" ? "landscape" : "portrait"][tier]);
        assert.equal(body.providerId, "chosen");
        assert.equal(body.output_format, "png");
        assert.deepEqual(body.optimize_prompt_options, { mode: "fast" });
        assert.equal(Object.hasOwn(body, "sequential_image_generation"), false);
        assert.deepEqual(body.image, ["resolved:first-image", "resolved:second-image"]);
      }
    }
  }
});

test("旧节点从已有尺寸恢复档位，空数据默认 2K，并处理不兼容的已存档位", () => {
  const { app } = harness();
  for (const model of GPT_MODELS) {
    assert.equal(app.referenceImageSizeTier(model, {}), "2K");
    assert.equal(app.referenceImageSizeTier(model, { size: "1024x1024" }), "1K");
    assert.equal(app.referenceImageSizeTier(model, { size: "3840x2160" }), "4K");
    assert.equal(app.referenceImageSizeTier(model, { size: "2048x2048", sizeTier: "1K" }), "1K");
  }
  assert.equal(app.referenceImageSizeTier(PRO_MODEL, {}), "2K");
  assert.equal(app.referenceImageSizeTier(PRO_MODEL, { size: "1424x800" }), "1K");
  assert.equal(app.referenceImageSizeTier(PRO_MODEL, { size: "3136x1344" }), "2K");
  assert.equal(app.referenceImageSizeTier(PRO_MODEL, { size: "3840x2160", sizeTier: "4K" }), "2K");
});

test("切换到 Seedream Pro 会将 4K 调整为支持的 2K，后续请求也使用 2K", async () => {
  for (const type of NODE_TYPES) {
    const h = harness({ type, data: { size: "3840x2160", sizeTier: "4K" } });
    assert.equal(h.set("model", `volc::${PRO_MODEL}`), true);
    assert.equal(h.config.data.sizeTier, "2K");
    assert.equal(h.config.data.providerId, "volc");
    await h.run();
    assert.deepEqual(h.messages, []);
    assert.equal(h.requests[0].size, "1776x2368");
    assert.equal(h.requests[0].providerId, "volc");
  }
});

test("分辨率控件显示所选档位并禁用 Seedream Pro 的 4K", () => {
  for (const type of NODE_TYPES) {
    const h = harness({ type, data: { sizeTier: "4K" } });
    const gptMarkup = h.app.renderReferenceImageSizeControl(h.config);
    assert.match(gptMarkup, /data-field="sizeTier"/);
    const gptOptions = Array.from(gptMarkup.matchAll(/<option\b([^>]*)>/g), (match) => match[1]);
    for (const tier of ["1K", "2K", "4K"]) {
      const option = gptOptions.find((attributes) => attributes.includes(`value="${tier}"`));
      assert.ok(option, `${tier} 选项应存在`);
      assert.doesNotMatch(option, /\bdisabled\b/);
      if (tier === "4K") assert.match(option, /\bselected\b/);
    }
    h.set("model", `volc::${PRO_MODEL}`);
    const proMarkup = h.app.renderReferenceImageSizeControl(h.config);
    const proOptions = Array.from(proMarkup.matchAll(/<option\b([^>]*)>/g), (match) => match[1]);
    assert.match(proOptions.find((attributes) => attributes.includes('value="4K"')), /\bdisabled\b/);
    assert.match(proOptions.find((attributes) => attributes.includes('value="2K"')), /\bselected\b/);
    assert.deepEqual(Array.from(h.app.referenceImageSizeTiers("midjourney")), []);
    h.config.data.model = "midjourney";
    const automaticMarkup = h.app.renderReferenceImageSizeControl(h.config);
    assert.match(automaticMarkup.match(/<select\b[^>]*>/)?.[0] || "", /\bdisabled\b/);
    assert.match(automaticMarkup, /由模型决定|自动/);
  }
});

test("读取不到输入比例时仍应用所选档位并生成合法尺寸", async () => {
  for (const type of NODE_TYPES) {
    for (const tier of ["1K", "2K", "4K"]) {
      const h = harness({ type, data: { sizeTier: tier }, aspect: false });
      await h.run();
      assert.deepEqual(h.messages, []);
      assert.equal(h.requests.length, 1);
      assert.equal(sizes.inferPreset(h.requests[0].size).tier, tier);
      assert.equal(sizes.validateSize(h.requests[0].size).valid, true);
    }
  }
});
