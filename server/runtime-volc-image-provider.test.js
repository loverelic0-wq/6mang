const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("fresh runtime settings keep Seedream on Volcengine and use GPT Image 2.5 on 147", () => {
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const settingsPath = "test-settings.json";
  let settingsReads = 0;
  const context = vm.createContext({
    gptImageModels: require("../public/gpt-image-models"),
    runtimeSettingsPath: settingsPath,
    fs: {
      readFileSync(filePath, encoding) {
        assert.equal(filePath, settingsPath);
        assert.equal(encoding, "utf8");
        settingsReads += 1;
        throw Object.assign(new Error("No saved settings in a fresh checkout"), { code: "ENOENT" });
      },
    },
  });
  // Run the production default initialization without opening a database, starting
  // a server, or reading the developer's private provider configuration.
  for (const [start, end] of [
    ["const DEFAULT_PROVIDERS =", "const API_KEY_KEEP_SENTINEL ="],
    ["function cloneDefaultProviders()", "function migrateLegacySettings("],
  ]) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `production settings range: ${start}`);
    vm.runInContext(source.slice(from, to), context);
  }
  const settings = context.loadRuntimeSettings();
  assert.equal(settingsReads, 1);
  const imageProviders = settings.providers.image.items;
  const modelId = "doubao-seedream-5-0-pro-260628";

  assert.equal(imageProviders.default.models.some((model) => model.id === modelId), false);
  assert.equal(imageProviders.volc.models.some((model) => model.id === modelId), true);
  assert.equal(settings.providers.image.default, "default");
  assert.equal(imageProviders.default.baseUrl, "https://147ai.com/v1");
  assert.equal(imageProviders.default.defaultModel, "gpt-image-2.5-flare");
  assert.deepEqual(Array.from(imageProviders.default.models, (model) => model.id), [
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst",
  ]);
});
