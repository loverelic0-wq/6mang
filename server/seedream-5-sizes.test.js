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

test("Seedream 5.0 Pro exposes only documented 1K and 2K presets", () => {
  const tools = loadTools();
  assert.equal(typeof tools.imageSizeOptions, "function", "imageSizeOptions should be implemented");
  const values = tools.imageSizeOptions("doubao-seedream-5-0-pro-260628").map(([value]) => value);
  assert.deepEqual(values, [
    "1024x1024", "1152x864", "864x1152", "1424x800", "800x1424",
    "1248x832", "832x1248", "1568x672", "2048x2048", "2368x1776",
    "1776x2368", "2816x1584", "1584x2816", "2496x1664", "1664x2496", "3136x1344",
  ]);
  assert.equal(values.includes("3072x3072"), false);
  assert.equal(values.includes("4096x2304"), false);
});

test("Seedream 5.0 Lite retains its documented 3K and 4K presets", () => {
  const tools = loadTools();
  assert.equal(typeof tools.imageSizeOptions, "function", "imageSizeOptions should be implemented");
  const values = tools.imageSizeOptions("doubao-seedream-5-0-260128").map(([value]) => value);
  assert.equal(values.includes("3072x3072"), true);
  assert.equal(values.includes("4096x2304"), true);
  assert.equal(values.includes("4704x2016"), true);
});

test("non-Seedream models are outside the Seedream size helper", () => {
  const tools = loadTools();
  assert.equal(typeof tools.imageSizeOptions, "function", "imageSizeOptions should be implemented");
  assert.equal(tools.imageSizeOptions("gpt-image-2"), null);
});
