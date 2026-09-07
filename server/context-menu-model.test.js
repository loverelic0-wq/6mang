const test = require("node:test");
const assert = require("node:assert/strict");

let menu = {};
try {
  menu = require("../public/context-menu-model");
} catch {}

test("node creation actions are grouped without omissions or duplicates", () => {
  assert.equal(Array.isArray(menu.nodeGroups), true, "nodeGroups should be exported");

  const summary = menu.nodeGroups.map((group) => ({
    label: group.label,
    actions: group.items.map((item) => item.action),
  }));

  assert.deepEqual(summary, [
    {
      label: "文本与智能",
      actions: ["add-text", "add-llm", "add-storyboard-assistant", "add-prompt-optimizer"],
    },
    {
      label: "图片生成",
      actions: ["add-image-config", "add-storyboard-config", "add-forced-perspective-poster", "add-template-image-config"],
    },
    {
      label: "图片编辑",
      actions: ["add-style-transfer-config", "add-material-transfer-config", "add-product-background-config", "add-face-swap-config", "add-seedream-edit", "add-layer-separation", "add-image-compare", "add-image-expand"],
    },
    {
      label: "视频创作",
      actions: ["add-director3d", "add-video-config"],
    },
    {
      label: "素材与预览",
      actions: ["add-uploaded-image", "add-image", "add-uploaded-video", "add-video", "add-model3d"],
    },
  ]);
});

test("first-time users get a useful default favorites section", () => {
  assert.deepEqual(menu.parseStoredFavorites(null), [
    "add-text",
    "add-image-config",
    "add-video-config",
    "add-uploaded-image",
  ]);
});

test("stored favorites preserve user order while dropping invalid and duplicate actions", () => {
  const stored = JSON.stringify([
    "add-video-config",
    "missing-action",
    "add-text",
    "add-video-config",
  ]);

  assert.deepEqual(menu.parseStoredFavorites(stored), ["add-video-config", "add-text"]);
  assert.deepEqual(menu.parseStoredFavorites("not-json"), menu.defaultFavorites);
  assert.deepEqual(menu.parseStoredFavorites("[]"), []);
});

test("favorite toggling adds and removes the selected node action", () => {
  assert.deepEqual(menu.toggleFavorite(["add-text"], "add-image-config"), ["add-text", "add-image-config"]);
  assert.deepEqual(menu.toggleFavorite(["add-text", "add-image-config"], "add-text"), ["add-image-config"]);
  assert.deepEqual(menu.toggleFavorite(["add-text"], "missing-action"), ["add-text"]);
});

test("favorite entries resolve to their user-facing node labels", () => {
  assert.deepEqual(menu.favoriteItems(["add-video-config", "add-text"]), [
    { action: "add-video-config", label: "视频生成配置" },
    { action: "add-text", label: "文本节点" },
  ]);
});

test("creation sections keep favorites above the categorized node groups", () => {
  const sections = menu.creationSections(["add-video-config", "add-text"]);

  assert.deepEqual(sections[0], {
    id: "favorites",
    label: "常用",
    items: [
      { action: "add-video-config", label: "视频生成配置" },
      { action: "add-text", label: "文本节点" },
    ],
  });
  assert.deepEqual(sections.slice(1).map((section) => section.label), [
    "文本与智能",
    "图片生成",
    "图片编辑",
    "视频创作",
    "素材与预览",
  ]);
});
