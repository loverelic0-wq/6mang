const test = require("node:test");
const assert = require("node:assert/strict");

let themes = {};
try {
  themes = require("../public/theme-styles");
} catch {}

test("legacy and named theme values normalize to the approved presets", () => {
  assert.equal(themes.normalizeTheme("light"), "light");
  assert.equal(themes.normalizeTheme("studio-paper"), "light");
  assert.equal(themes.normalizeTheme("dark"), "dark");
  assert.equal(themes.normalizeTheme("graphite-night"), "dark");
  assert.equal(themes.normalizeTheme("tactical"), "tactical");
  assert.equal(themes.normalizeTheme("tactical-terminal"), "tactical");
  assert.equal(themes.normalizeTheme("rift"), "rift");
  assert.equal(themes.normalizeTheme("arcane-rift"), "rift");
  assert.equal(themes.normalizeTheme("unknown"), "light");
});

test("theme switching cycles through all four presets", () => {
  assert.equal(themes.nextTheme("light"), "dark");
  assert.equal(themes.nextTheme("studio-paper"), "dark");
  assert.equal(themes.nextTheme("dark"), "tactical");
  assert.equal(themes.nextTheme("graphite-night"), "tactical");
  assert.equal(themes.nextTheme("tactical"), "rift");
  assert.equal(themes.nextTheme("tactical-terminal"), "rift");
  assert.equal(themes.nextTheme("rift"), "light");
  assert.equal(themes.nextTheme("arcane-rift"), "light");
});

test("theme presentation exposes visible names and the next switch target", () => {
  assert.deepEqual(themes.presentation("light"), {
    state: "light",
    id: "studio-paper",
    label: "暖纸棕",
    nextLabel: "石墨夜",
    isDark: false,
  });
  assert.deepEqual(themes.presentation("dark"), {
    state: "dark",
    id: "graphite-night",
    label: "石墨夜",
    nextLabel: "战术终端",
    isDark: true,
  });
  assert.deepEqual(themes.presentation("tactical"), {
    state: "tactical",
    id: "tactical-terminal",
    label: "战术终端",
    nextLabel: "符文峡谷",
    isDark: true,
  });
  assert.deepEqual(themes.presentation("rift"), {
    state: "rift",
    id: "arcane-rift",
    label: "符文峡谷",
    nextLabel: "暖纸棕",
    isDark: true,
  });
});

test("theme picker exposes the four presets in display order", () => {
  assert.deepEqual(themes.presets(), [
    { state: "light", id: "studio-paper", label: "暖纸棕", isDark: false },
    { state: "dark", id: "graphite-night", label: "石墨夜", isDark: true },
    { state: "tactical", id: "tactical-terminal", label: "战术终端", isDark: true },
    { state: "rift", id: "arcane-rift", label: "符文峡谷", isDark: true },
  ]);
});
