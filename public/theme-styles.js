(function initThemeStyles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ThemeStyles = api;
})(typeof window !== "undefined" ? window : null, function createThemeStyles() {
  const definitions = {
    light: {
      state: "light",
      id: "studio-paper",
      label: "暖纸棕",
      nextLabel: "石墨夜",
    },
    dark: {
      state: "dark",
      id: "graphite-night",
      label: "石墨夜",
      nextLabel: "暖纸棕",
    },
  };

  function normalizeTheme(value) {
    return value === "dark" || value === "graphite-night" ? "dark" : "light";
  }

  function nextTheme(value) {
    return normalizeTheme(value) === "dark" ? "light" : "dark";
  }

  function presentation(value) {
    return { ...definitions[normalizeTheme(value)] };
  }

  return { normalizeTheme, nextTheme, presentation };
});
