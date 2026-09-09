const test = require("node:test");
const assert = require("node:assert/strict");

let ui = {};
try {
  ui = require("../public/kling-provider");
} catch {}

test("tool selection follows node kind and connected image inputs", () => {
  assert.equal(typeof ui.toolFor, "function", "toolFor should be exported");
  assert.equal(ui.toolFor("image", false), "text_to_image");
  assert.equal(ui.toolFor("image", true), "image_to_image");
  assert.equal(ui.toolFor("video", false), "text_to_video");
  assert.equal(ui.toolFor("video", true), "image_to_video");
});

test("model filtering keeps only models declared for the active tool", () => {
  assert.equal(typeof ui.modelsForTool, "function", "modelsForTool should be exported");
  const provider = {
    models: [
      { id: "text-only", tools: ["text_to_video"] },
      { id: "both", tools: ["text_to_video", "image_to_video"] },
    ],
  };

  assert.deepEqual(ui.modelsForTool(provider, "image_to_video").map((model) => model.id), ["both"]);
});

test("field descriptors omit prompt and preserve server defaults without submitting them", () => {
  assert.equal(typeof ui.fieldsForSpec, "function", "fieldsForSpec should be exported");
  const fields = ui.fieldsForSpec({ arguments: [
    { name: "prompt", required: true, allowedValues: [] },
    { name: "duration", required: false, default: "5", allowedValues: ["5", "10"], description: "时长" },
    { name: "enable_audio", required: false, default: "true", allowedValues: ["true", "false"] },
  ] }, {});

  assert.deepEqual(fields.map((field) => field.name), ["duration", "enable_audio"]);
  assert.deepEqual(fields[0], {
    name: "duration",
    required: false,
    defaultValue: "5",
    value: "5",
    touched: false,
    description: "时长",
    options: ["5", "10"],
    kind: "select",
  });
  assert.deepEqual(ui.serializeParams({ arguments: fields.map((field) => ({ name: field.name, required: field.required, default: field.defaultValue, allowedValues: field.options })) }, {}), {});
});

test("parameter serialization rejects an invalid enum and keeps explicitly selected values", () => {
  const spec = { arguments: [{ name: "duration", required: false, default: "5", allowedValues: ["5", "10"] }] };

  assert.throws(() => ui.serializeParams(spec, { duration: "3" }), /duration.*3.*可选值/);
  assert.deepEqual(ui.serializeParams(spec, { duration: "10" }), { duration: "10" });
});

test("input validation reports missing required image slots", () => {
  assert.equal(typeof ui.validateInputs, "function", "validateInputs should be exported");
  const spec = { inputs: [
    { name: "first_image", required: true },
    { name: "tail_image", required: false },
  ] };

  assert.throws(() => ui.validateInputs(spec, 0), /first_image/);
  assert.doesNotThrow(() => ui.validateInputs(spec, 1));
});

test("a selected Kling provider reaches the backend even before OAuth is ready", () => {
  assert.equal(typeof ui.isCallableProvider, "function", "isCallableProvider should be exported");
  assert.equal(ui.isCallableProvider({ adapter: "kling-cli", configured: false }), true);
  assert.equal(ui.isCallableProvider({ adapter: "http", configured: false }), false);
  assert.equal(ui.isCallableProvider({ adapter: "http", configured: true }), true);
});

test("video preview ratio follows the first image when the active Kling spec has no aspect ratio argument", () => {
  assert.equal(typeof ui.videoRatioForSpec, "function", "videoRatioForSpec should be exported");
  const imageToVideoSpec = {
    arguments: [
      { name: "duration", default: "5", allowedValues: ["3", "5", "10"] },
      { name: "resolution", default: "1080p", allowedValues: ["720p", "1080p"] },
    ],
    inputs: [{ name: "first_image", required: true }],
  };

  assert.equal(ui.videoRatioForSpec(imageToVideoSpec, {}, "3:4", "16:9"), "3:4");
});

test("video preview ratio honors a declared Kling aspect ratio parameter", () => {
  const textToVideoSpec = {
    arguments: [{ name: "aspect_ratio", default: "16:9", allowedValues: ["16:9", "9:16", "1:1"] }],
    inputs: [],
  };

  assert.equal(ui.videoRatioForSpec(textToVideoSpec, { aspect_ratio: "9:16" }, "3:4", "16:9"), "9:16");
  assert.equal(ui.videoRatioForSpec(textToVideoSpec, {}, "3:4", "4:3"), "16:9");
});

test("generated remote video metadata replaces a stale preview ratio", () => {
  assert.equal(typeof ui.videoMetadataRatio, "function", "videoMetadataRatio should be exported");

  assert.equal(ui.videoMetadataRatio({
    source: "https://cdn.example/generated.mp4",
    width: 720,
    height: 1280,
    currentRatio: "16:9",
  }), "9:16");
  assert.equal(ui.videoMetadataRatio({
    source: "/api/history/files/generated.mp4",
    width: 1080,
    height: 1440,
    currentRatio: "16:9",
  }), "3:4");
});
