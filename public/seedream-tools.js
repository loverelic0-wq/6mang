(function exposeSeedreamTools(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SeedreamTools = api;
})(typeof window !== "undefined" ? window : globalThis, function createSeedreamTools() {
  const PRO_IMAGE_SIZES = [
    ["1024x1024", "1:1 · 1024×1024 · 1K"],
    ["1152x864", "4:3 · 1152×864 · 1K"],
    ["864x1152", "3:4 · 864×1152 · 1K"],
    ["1424x800", "16:9 · 1424×800 · 1K"],
    ["800x1424", "9:16 · 800×1424 · 1K"],
    ["1248x832", "3:2 · 1248×832 · 1K"],
    ["832x1248", "2:3 · 832×1248 · 1K"],
    ["1568x672", "21:9 · 1568×672 · 1K"],
    ["2048x2048", "1:1 · 2048×2048 · 2K"],
    ["2368x1776", "4:3 · 2368×1776 · 2K"],
    ["1776x2368", "3:4 · 1776×2368 · 2K"],
    ["2816x1584", "16:9 · 2816×1584 · 2K"],
    ["1584x2816", "9:16 · 1584×2816 · 2K"],
    ["2496x1664", "3:2 · 2496×1664 · 2K"],
    ["1664x2496", "2:3 · 1664×2496 · 2K"],
    ["3136x1344", "21:9 · 3136×1344 · 2K"],
  ];

  const LITE_IMAGE_SIZES = [
    ["2048x2048", "1:1 · 2048×2048 · 2K"],
    ["3072x3072", "1:1 · 3072×3072 · 3K"],
    ["2304x1728", "4:3 · 2304×1728"],
    ["1728x2304", "3:4 · 1728×2304"],
    ["3456x2592", "4:3 · 3456×2592 · 3K"],
    ["2592x3456", "3:4 · 2592×3456 · 3K"],
    ["2848x1600", "16:9 · 2848×1600"],
    ["1600x2848", "9:16 · 1600×2848"],
    ["4096x2304", "16:9 · 4096×2304 · 4K"],
    ["2304x4096", "9:16 · 2304×4096 · 4K"],
    ["2496x1664", "3:2 · 2496×1664"],
    ["1664x2496", "2:3 · 1664×2496"],
    ["3744x2496", "3:2 · 3744×2496 · 3K"],
    ["2496x3744", "2:3 · 2496×3744 · 3K"],
    ["3136x1344", "7:3 · 3136×1344 · 超宽"],
    ["4704x2016", "7:3 · 4704×2016 · 超宽"],
  ];

  function normalizeModel(model) {
    return String(model || "").trim().toLowerCase();
  }

  function isProModel(model) {
    return /^doubao-seedream-5-0-pro-\d+$/.test(normalizeModel(model));
  }

  function isLiteModel(model) {
    return /^doubao-seedream-5-0-(?:lite-)?\d+$/.test(normalizeModel(model));
  }

  function isSeedream5Model(model) {
    return isProModel(model) || isLiteModel(model);
  }

  function imageSizeOptions(model) {
    if (isProModel(model)) return PRO_IMAGE_SIZES.map((pair) => [...pair]);
    if (isLiteModel(model)) return LITE_IMAGE_SIZES.map((pair) => [...pair]);
    return null;
  }

  function buildGenerationOptions(model, options = {}) {
    const size = String(options.size || "");
    if (isProModel(model)) {
      return {
        size,
        output_format: options.outputFormat === "jpeg" ? "jpeg" : "png",
        optimize_prompt_options: { mode: options.promptOptimization === "fast" ? "fast" : "standard" },
        watermark: false,
      };
    }
    if (isLiteModel(model)) {
      return {
        sequential_image_generation: "disabled",
        size,
        watermark: false,
      };
    }
    return null;
  }

  function normalizeImageSource(value, hint = "") {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^(?:https?:|blob:|data:image\/)/i.test(source)) return source;
    if (/base64/i.test(hint) || /^[A-Za-z0-9+/]+={0,2}$/.test(source)) {
      return `data:image/png;base64,${source}`;
    }
    return "";
  }

  function imageSourceFromItem(item) {
    if (typeof item === "string") return normalizeImageSource(item);
    if (!item || typeof item !== "object") return "";
    const keys = ["url", "image_url", "imageUrl", "output_url", "outputUrl", "b64_json", "base64", "image_base64"];
    for (const key of keys) {
      const source = normalizeImageSource(item[key], key);
      if (source) return source;
    }
    return "";
  }

  function extractImageItems(payload) {
    const containers = ["data", "images", "image", "output", "result", "results"];
    const visited = new Set();

    function scan(value) {
      if (!value) return [];
      if (typeof value === "string") {
        const source = normalizeImageSource(value);
        return source ? [{ source, item: { url: value } }] : [];
      }
      if (typeof value !== "object" || visited.has(value)) return [];
      visited.add(value);
      if (Array.isArray(value)) return value.flatMap(scan);
      const direct = imageSourceFromItem(value);
      if (direct) return [{ source: direct, item: value }];
      for (const key of containers) {
        const found = scan(value[key]);
        if (found.length) return found;
      }
      return [];
    }

    return scan(payload);
  }

  function numericZIndex(value, fallback) {
    if (typeof value === "boolean") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
  }

  function layerBoundingBox(item) {
    const absolute = item?.bounding_box?.absolute;
    if (!Array.isArray(absolute) || absolute.length !== 4 || absolute.some((value) => !Number.isFinite(Number(value)))) {
      return { bbox: null, flags: ["bbox_missing"] };
    }
    const [left, top, right, bottom] = absolute.map(Number);
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return { bbox: null, flags: ["bbox_degenerate"] };
    return { bbox: { x: left, y: top, width, height }, flags: [] };
  }

  function normalizeLayerItem(entry, responseIndex, background = false) {
    const item = entry.item || {};
    const geometry = background ? { bbox: null, flags: [] } : layerBoundingBox(item);
    return {
      source: entry.source,
      name: String(item.name || (background ? "背景" : `图层 ${responseIndex}`)),
      description: String(item.description || ""),
      role: background ? "background" : "layer",
      zIndex: background ? 0 : numericZIndex(item.z_index, responseIndex),
      responseIndex,
      bbox: geometry.bbox,
      flags: geometry.flags,
      item,
    };
  }

  function parseLayerResponse(payload) {
    const items = extractImageItems(payload);
    if (!items.length || !items[0].source) throw new Error("图层接口未返回背景底板");
    const background = normalizeLayerItem(items[0], 0, true);
    const layers = items.slice(1)
      .map((item, index) => normalizeLayerItem(item, index + 1, false))
      .sort((a, b) => a.zIndex - b.zIndex || a.responseIndex - b.responseIndex);
    if (!layers.length) throw new Error("模型未返回可编辑图层");
    return { background, layers };
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function clampNormalizedPoint(point) {
    return { x: clamp01(point?.x), y: clamp01(point?.y) };
  }

  function pointDistance(a, b) {
    return Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.y) - Number(b?.y));
  }

  function simplifyNormalizedPath(points, minimumDistance = 0.004) {
    const normalized = (Array.isArray(points) ? points : []).map(clampNormalizedPoint);
    if (normalized.length < 3) return normalized;
    const kept = [normalized[0]];
    for (let index = 1; index < normalized.length - 1; index += 1) {
      if (pointDistance(kept[kept.length - 1], normalized[index]) >= minimumDistance) kept.push(normalized[index]);
    }
    const last = normalized[normalized.length - 1];
    if (pointDistance(kept[kept.length - 1], last) > 0) kept.push(last);
    return kept;
  }

  function distanceToSegment(point, start, end) {
    const px = Number(point?.x) || 0;
    const py = Number(point?.y) || 0;
    const x1 = Number(start?.x) || 0;
    const y1 = Number(start?.y) || 0;
    const dx = (Number(end?.x) || 0) - x1;
    const dy = (Number(end?.y) || 0) - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function annotationMarkHit(mark, point, tolerance) {
    if (!mark || !point) return false;
    if (mark.type === "point") return pointDistance(mark, point) <= tolerance;
    if (mark.type === "box") {
      const left = Math.min(Number(mark.x1), Number(mark.x2));
      const right = Math.max(Number(mark.x1), Number(mark.x2));
      const top = Math.min(Number(mark.y1), Number(mark.y2));
      const bottom = Math.max(Number(mark.y1), Number(mark.y2));
      return point.x >= left - tolerance && point.x <= right + tolerance && point.y >= top - tolerance && point.y <= bottom + tolerance;
    }
    if (mark.type === "arrow") {
      return distanceToSegment(point, { x: mark.x1, y: mark.y1 }, { x: mark.x2, y: mark.y2 }) <= tolerance;
    }
    if (mark.type === "brush") {
      const points = Array.isArray(mark.points) ? mark.points : [];
      if (points.length === 1) return pointDistance(points[0], point) <= tolerance;
      for (let index = 1; index < points.length; index += 1) {
        if (distanceToSegment(point, points[index - 1], points[index]) <= tolerance) return true;
      }
    }
    return false;
  }

  function findAnnotationMarkAt(marks, point, tolerance = 0.02) {
    const list = Array.isArray(marks) ? marks : [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (annotationMarkHit(list[index], point, tolerance)) return index;
    }
    return -1;
  }

  function buildPreciseEditPrompt(prompt, marks) {
    const instruction = Array.isArray(marks) && marks.length
      ? "紫色标记仅用于定位。完成修改后删除全部紫色标记，并保持未标记区域、构图和比例不变。"
      : "保持未要求修改的区域、构图和比例不变。";
    return `${String(prompt || "").trim()}\n${instruction}`;
  }

  function buildLayerSeparationBody(options = {}, image) {
    if (!image) throw new Error("智能图层分离需要一张输入图");
    const allowedSizes = new Set(["auto", "1K", "1.5K", "2K"]);
    const rawSeed = Math.trunc(Number(options.seed));
    const seed = Number.isFinite(rawSeed) ? Math.max(0, Math.min(2147483647, rawSeed)) : 0;
    return {
      ...(options.providerId ? { providerId: String(options.providerId) } : {}),
      model: String(options.model || "doubao-seedream-5-0-pro-260628"),
      ...(String(options.prompt || "").trim() ? { prompt: String(options.prompt).trim() } : {}),
      image,
      size: allowedSizes.has(options.size) ? options.size : "auto",
      seed,
      response_format: "url",
      output_format: "png",
      layer_decomposition: true,
      watermark: false,
      optimize_prompt_options: { mode: options.promptOptimization === "fast" ? "fast" : "standard" },
    };
  }

  function createLayerGroupData(parsed, assets, options = {}) {
    if (!parsed?.background || !Array.isArray(parsed.layers)) throw new Error("图层响应结构不完整");
    if (!Array.isArray(assets) || assets.length !== parsed.layers.length + 1) throw new Error("图层资产数量与响应不一致");
    const backgroundAsset = assets[0];
    const width = Math.max(1, Math.round(Number(backgroundAsset?.nativeWidth) || 0));
    const height = Math.max(1, Math.round(Number(backgroundAsset?.nativeHeight) || 0));
    if (!backgroundAsset?.assetId || !width || !height) throw new Error("背景图层资产不可用");

    const background = {
      id: `layer-background-${backgroundAsset.assetId}`,
      name: parsed.background.name || "背景",
      description: parsed.background.description || "",
      role: "background",
      assetId: backgroundAsset.assetId,
      x: 0,
      y: 0,
      width,
      height,
      nativeWidth: width,
      nativeHeight: height,
      zIndex: 0,
      visible: true,
      opacity: 1,
      locked: true,
      generatedHiddenPixels: true,
      flags: [...(parsed.background.flags || [])],
    };
    const foreground = parsed.layers.map((item, index) => {
      const asset = assets[index + 1] || {};
      const nativeWidth = Math.max(1, Math.round(Number(asset.nativeWidth) || 1));
      const nativeHeight = Math.max(1, Math.round(Number(asset.nativeHeight) || 1));
      const bbox = item.bbox;
      return {
        id: `layer-${index + 1}-${asset.assetId || "missing"}`,
        name: item.name || `图层 ${index + 1}`,
        description: item.description || "",
        role: item.role || "layer",
        assetId: asset.assetId || "",
        x: bbox ? bbox.x : 0,
        y: bbox ? bbox.y : 0,
        width: bbox ? bbox.width : nativeWidth,
        height: bbox ? bbox.height : nativeHeight,
        nativeWidth,
        nativeHeight,
        zIndex: Number.isFinite(Number(item.zIndex)) ? Number(item.zIndex) : index + 1,
        visible: true,
        opacity: 1,
        locked: false,
        generatedHiddenPixels: true,
        flags: [...(item.flags || [])],
      };
    });
    return {
      label: options.label || "图层组",
      width,
      height,
      sourceNodeId: options.sourceNodeId || "",
      compositeAssetId: "",
      selectedLayerId: foreground[0]?.id || background.id,
      layers: [background, ...foreground].sort((a, b) => a.zIndex - b.zIndex),
    };
  }

  function layerGroupLayout(data = {}, fallback = {}) {
    const documentWidth = Math.max(1, Math.round(Number(data.width) || 1));
    const documentHeight = Math.max(1, Math.round(Number(data.height) || 1));
    const fallbackWidth = Math.max(1, Math.round(Number(fallback.width) || 340));
    const fallbackHeight = Math.max(1, Math.round(Number(fallback.height) || 430));
    return {
      nodeWidth: Math.max(1, Math.round(Number(data.nodeWidth) || fallbackWidth)),
      nodeHeight: Math.max(1, Math.round(Number(data.nodeHeight) || fallbackHeight)),
      documentWidth,
      documentHeight,
      aspectRatio: `${documentWidth} / ${documentHeight}`,
    };
  }

  function moveLayer(layer, deltaX, deltaY) {
    if (!layer || layer.locked) return { ...layer };
    return {
      ...layer,
      x: Number(layer.x || 0) + (Number.isFinite(Number(deltaX)) ? Number(deltaX) : 0),
      y: Number(layer.y || 0) + (Number.isFinite(Number(deltaY)) ? Number(deltaY) : 0),
    };
  }

  function resizeLayerFromCorner(layer, corner, scale) {
    if (!layer || layer.locked) return { ...layer };
    const width = Math.max(1, Number(layer.width) || 1);
    const height = Math.max(1, Number(layer.height) || 1);
    const safeScale = Number.isFinite(Number(scale)) ? Math.max(Number(scale), 8 / Math.min(width, height)) : 1;
    const nextWidth = Math.round(width * safeScale * 1000) / 1000;
    const nextHeight = Math.round(height * safeScale * 1000) / 1000;
    const next = { ...layer, width: nextWidth, height: nextHeight };
    if (String(corner).includes("w")) next.x = Number(layer.x || 0) + width - nextWidth;
    if (String(corner).includes("n")) next.y = Number(layer.y || 0) + height - nextHeight;
    return next;
  }

  function reorderLayer(layers, layerId, direction) {
    const sorted = (Array.isArray(layers) ? layers : []).map((layer) => ({ ...layer })).sort((a, b) => a.zIndex - b.zIndex);
    const background = sorted.find((layer) => layer.role === "background");
    if (background?.id === layerId) return sorted;
    const foreground = sorted.filter((layer) => layer.role !== "background");
    const index = foreground.findIndex((layer) => layer.id === layerId);
    if (index < 0) return sorted;
    const target = Math.max(0, Math.min(foreground.length - 1, index + Math.sign(Number(direction) || 0)));
    if (target !== index) [foreground[index], foreground[target]] = [foreground[target], foreground[index]];
    const result = [];
    if (background) result.push({ ...background, zIndex: 0 });
    foreground.forEach((layer, itemIndex) => result.push({ ...layer, zIndex: itemIndex + 1 }));
    return result;
  }

  function layerRenderPlan(layers) {
    return (Array.isArray(layers) ? layers : [])
      .filter((layer) => layer.visible !== false && layer.assetId)
      .map((layer) => {
        const opacity = Number(layer.opacity);
        return { ...layer, opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1 };
      })
      .sort((a, b) => Number(a.zIndex) - Number(b.zIndex));
  }

  return {
    PRO_IMAGE_SIZES,
    LITE_IMAGE_SIZES,
    isProModel,
    isLiteModel,
    isSeedream5Model,
    imageSizeOptions,
    buildGenerationOptions,
    extractImageItems,
    parseLayerResponse,
    clampNormalizedPoint,
    simplifyNormalizedPath,
    findAnnotationMarkAt,
    buildPreciseEditPrompt,
    buildLayerSeparationBody,
    createLayerGroupData,
    layerGroupLayout,
    moveLayer,
    resizeLayerFromCorner,
    reorderLayer,
    layerRenderPlan,
  };
});
