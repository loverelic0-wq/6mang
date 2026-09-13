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
      isDark: false,
    },
    dark: {
      state: "dark",
      id: "graphite-night",
      label: "石墨夜",
      nextLabel: "战术终端",
      isDark: true,
    },
    tactical: {
      state: "tactical",
      id: "tactical-terminal",
      label: "战术终端",
      nextLabel: "符文峡谷",
      isDark: true,
    },
    rift: {
      state: "rift",
      id: "arcane-rift",
      label: "符文峡谷",
      nextLabel: "暖纸棕",
      isDark: true,
    },
  };
  const order = ["light", "dark", "tactical", "rift"];

  function normalizeTheme(value) {
    if (value === "rift" || value === "arcane-rift") return "rift";
    if (value === "tactical" || value === "tactical-terminal") return "tactical";
    if (value === "dark" || value === "graphite-night") return "dark";
    return "light";
  }

  function nextTheme(value) {
    const index = order.indexOf(normalizeTheme(value));
    return order[(index + 1) % order.length];
  }

  function presentation(value) {
    return { ...definitions[normalizeTheme(value)] };
  }

  function presets() {
    return order.map((state) => {
      const { id, label, isDark } = definitions[state];
      return { state, id, label, isDark };
    });
  }

  return { normalizeTheme, nextTheme, presentation, presets };
});
