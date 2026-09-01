const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("runtime settings route Seedream 5.0 Pro only through the Volcengine image provider", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".huobao-settings.json"), "utf8"));
  const imageProviders = settings.providers.image.items;
  const modelId = "doubao-seedream-5-0-pro-260628";

  assert.equal(imageProviders.default.models.some((model) => model.id === modelId), false);
  assert.equal(imageProviders.volc.models.some((model) => model.id === modelId), true);
});
