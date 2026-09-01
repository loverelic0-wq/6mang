const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadTools() {
  try {
    return require(path.join(__dirname, "..", "public", "seedream-tools.js"));
  } catch {
    return {};
  }
}

test("Seedream 5.0 Pro omits sequential output and sends its professional controls", () => {
  const tools = loadTools();
  assert.equal(typeof tools.buildGenerationOptions, "function", "buildGenerationOptions should be implemented");
  const options = tools.buildGenerationOptions("doubao-seedream-5-0-pro-260628", {
    size: "2816x1584",
    outputFormat: "png",
    promptOptimization: "fast",
  });
  assert.deepEqual(options, {
    size: "2816x1584",
    output_format: "png",
    optimize_prompt_options: { mode: "fast" },
    watermark: false,
  });
  assert.equal(Object.hasOwn(options, "sequential_image_generation"), false);
});

test("Seedream 5.0 Pro normalizes invalid controls to safe defaults", () => {
  const tools = loadTools();
  assert.equal(typeof tools.buildGenerationOptions, "function", "buildGenerationOptions should be implemented");
  const options = tools.buildGenerationOptions("doubao-seedream-5-0-pro-260628", {
    size: "2048x2048",
    outputFormat: "gif",
    promptOptimization: "turbo",
  });
  assert.equal(options.output_format, "png");
  assert.deepEqual(options.optimize_prompt_options, { mode: "standard" });
});

test("Seedream 5.0 Lite keeps the supported sequential image parameter", () => {
  const tools = loadTools();
  assert.equal(typeof tools.buildGenerationOptions, "function", "buildGenerationOptions should be implemented");
  const options = tools.buildGenerationOptions("doubao-seedream-5-0-260128", {
    size: "4096x2304",
    outputFormat: "jpeg",
  });
  assert.deepEqual(options, {
    sequential_image_generation: "disabled",
    size: "4096x2304",
    watermark: false,
  });
});

test("non-Seedream models do not receive Seedream-only options", () => {
  const tools = loadTools();
  assert.equal(typeof tools.buildGenerationOptions, "function", "buildGenerationOptions should be implemented");
  assert.equal(tools.buildGenerationOptions("gpt-image-2", { size: "1024x1024" }), null);
});
