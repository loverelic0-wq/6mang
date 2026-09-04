(function initContextMenuModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ContextMenuModel = api;
})(typeof window !== "undefined" ? window : null, function createContextMenuModel() {
  const nodeGroups = [
    {
      id: "text",
      label: "文本与智能",
      items: [
        { action: "add-text", label: "文本节点" },
        { action: "add-llm", label: "LLM 文本生成" },
        { action: "add-storyboard-assistant", label: "分镜助手" },
        { action: "add-prompt-optimizer", label: "提示词优化" },
      ],
    },
    {
      id: "image-generation",
      label: "图片生成",
      items: [
        { action: "add-image-config", label: "图片生成" },
        { action: "add-storyboard-config", label: "故事板生成" },
        { action: "add-template-image-config", label: "营销物料" },
      ],
    },
    {
      id: "image-editing",
      label: "图片编辑",
      items: [
        { action: "add-style-transfer-config", label: "风格迁移" },
        { action: "add-face-swap-config", label: "换脸" },
        { action: "add-seedream-edit", label: "精确图片编辑" },
        { action: "add-layer-separation", label: "智能图层分离" },
        { action: "add-image-compare", label: "图片对比" },
        { action: "add-image-expand", label: "图片扩展" },
      ],
    },
    {
      id: "video",
      label: "视频创作",
      items: [
        { action: "add-video-config", label: "视频生成配置" },
      ],
    },
    {
      id: "media",
      label: "素材与预览",
      items: [
        { action: "add-uploaded-image", label: "载入图像" },
        { action: "add-image", label: "图片节点" },
        { action: "add-uploaded-video", label: "载入视频" },
        { action: "add-video", label: "视频节点" },
        { action: "add-model3d", label: "3D 模型预览" },
      ],
    },
  ];

  const defaultFavorites = [
    "add-text",
    "add-image-config",
    "add-video-config",
    "add-uploaded-image",
  ];

  const itemByAction = new Map(
    nodeGroups.flatMap((group) => group.items).map((item) => [item.action, item]),
  );

  function normalizeFavorites(actions) {
    if (!Array.isArray(actions)) return [...defaultFavorites];
    return [...new Set(actions.filter((action) => itemByAction.has(action)))];
  }

  function parseStoredFavorites(raw) {
    if (raw === null || raw === undefined || raw === "") return [...defaultFavorites];
    try {
      return normalizeFavorites(JSON.parse(raw));
    } catch {
      return [...defaultFavorites];
    }
  }

  function toggleFavorite(favorites, action) {
    const normalized = normalizeFavorites(favorites);
    if (!itemByAction.has(action)) return normalized;
    if (normalized.includes(action)) return normalized.filter((item) => item !== action);
    return [...normalized, action];
  }

  function favoriteItems(favorites) {
    return normalizeFavorites(favorites)
      .map((action) => itemByAction.get(action))
      .filter(Boolean)
      .map((item) => ({ ...item }));
  }

  function creationSections(favorites) {
    return [
      { id: "favorites", label: "常用", items: favoriteItems(favorites) },
      ...nodeGroups.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map((item) => ({ ...item })),
      })),
    ];
  }

  return {
    nodeGroups,
    defaultFavorites,
    parseStoredFavorites,
    toggleFavorite,
    favoriteItems,
    creationSections,
  };
});
