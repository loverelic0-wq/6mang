const test = require("node:test");
const assert = require("node:assert/strict");

let themes = {};
try {
  themes = require("../public/theme-styles");
} catch {}

test("legacy and named theme values normalize to the two approved styles", () => {
  assert.equal(themes.normalizeTheme("light"), "light");
  assert.equal(themes.normalizeTheme("studio-paper"), "light");
  assert.equal(themes.normalizeTheme("dark"), "dark");
  assert.equal(themes.normalizeTheme("graphite-night"), "dark");
  assert.equal(themes.normalizeTheme("unknown"), "light");
});

test("theme switching alternates between warm paper and graphite night", () => {
  assert.equal(themes.nextTheme("light"), "dark");
  assert.equal(themes.nextTheme("studio-paper"), "dark");
  assert.equal(themes.nextTheme("dark"), "light");
  assert.equal(themes.nextTheme("graphite-night"), "light");
});

test("theme presentation exposes visible names and the next switch target", () => {
  assert.deepEqual(themes.presentation("light"), {
    state: "light",
    id: "studio-paper",
    label: "暖纸棕",
    nextLabel: "石墨夜",
  });
  assert.deepEqual(themes.presentation("dark"), {
    state: "dark",
    id: "graphite-night",
    label: "石墨夜",
    nextLabel: "暖纸棕",
  });
});
