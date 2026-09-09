(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GptImage2Sizes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GRID = 16;
  const MAX_EDGE = 3840;
  const MAX_ASPECT = 3;
  const MIN_PIXELS = 655360;
  const MAX_PIXELS = 8294400;
  const DEFAULT_SIZE = "2048x2048";
  const RATIO_OPTIONS = [
    ["16:9", "16:9 · 横屏"],
    ["9:16", "9:16 · 竖屏"],
    ["2:3", "2:3 · 竖版"],
    ["3:2", "3:2 · 横版"],
    ["3:4", "3:4 · 竖版"],
    ["4:3", "4:3 · 横版"],
    ["1:1", "1:1 · 方形"],
  ];
  const TIER_OPTIONS = [
    ["1K", "1K"],
    ["2K", "2K"],
    ["4K", "4K"],
  ];
  const PRESET_SIZES = {
    "16:9": { "1K": "1280x720", "2K": "2048x1152", "4K": "3840x2160" },
    "9:16": { "1K": "720x1280", "2K": "1152x2048", "4K": "2160x3840" },
    "2:3": { "1K": "672x1008", "2K": "1344x2016", "4K": "2336x3504" },
    "3:2": { "1K": "1008x672", "2K": "2016x1344", "4K": "3504x2336" },
    "3:4": { "1K": "768x1024", "2K": "1536x2048", "4K": "2448x3264" },
    "4:3": { "1K": "1024x768", "2K": "2048x1536", "4K": "3264x2448" },
    "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" },
  };

  function parseSize(value) {
    const match = String(value || "").trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return null;
    return { width, height, size: `${width}x${height}` };
  }

  function invalid(error, width = 0, height = 0) {
    return { valid: false, error, width, height, size: `${width}x${height}` };
  }

  function validateDimensions(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w <= 0 || h <= 0) {
      return invalid("宽和高必须是正整数", w, h);
    }
    if (Math.max(w, h) > MAX_EDGE) {
      return invalid(`最大边不能超过 ${MAX_EDGE}px`, w, h);
    }
    if (w % GRID !== 0 || h % GRID !== 0) {
      return invalid(`宽和高都必须是 ${GRID}px 的倍数`, w, h);
    }
    if (Math.max(w, h) / Math.min(w, h) > MAX_ASPECT) {
      return invalid(`长短边比例不能超过 ${MAX_ASPECT}:1`, w, h);
    }
    const pixels = w * h;
    if (pixels < MIN_PIXELS) {
      return invalid(`总像素不能少于 ${MIN_PIXELS.toLocaleString("en-US")}`, w, h);
    }
    if (pixels > MAX_PIXELS) {
      return invalid(`总像素不能超过 ${MAX_PIXELS.toLocaleString("en-US")}`, w, h);
    }
    return {
      valid: true,
      error: "",
      width: w,
      height: h,
      size: `${w}x${h}`,
      pixels,
      aspect: w / h,
    };
  }

  function validateSize(value) {
    const parsed = parseSize(value);
    if (!parsed) return invalid("请输入“宽 × 高”像素尺寸");
    return validateDimensions(parsed.width, parsed.height);
  }

  function assertSize(value) {
    const result = validateSize(value);
    if (!result.valid) {
      const error = new Error(`GPT Image 2 尺寸无效：${result.error}`);
      error.statusCode = 400;
      throw error;
    }
    return result.size;
  }

  function getPreset(ratio, tier) {
    const size = PRESET_SIZES[String(ratio || "")]?.[String(tier || "")];
    if (!size) return null;
    const result = validateSize(size);
    if (!result.valid) return null;
    return { ...result, ratio: String(ratio), tier: String(tier) };
  }

  function allPresets() {
    return RATIO_OPTIONS.flatMap(([ratio]) => TIER_OPTIONS.map(([tier]) => getPreset(ratio, tier)));
  }

  function inferPreset(value) {
    const parsed = parseSize(value) || parseSize(DEFAULT_SIZE);
    const targetAspect = parsed.width / parsed.height;
    const targetPixels = parsed.width * parsed.height;
    let best = getPreset("1:1", "2K");
    let bestScore = Infinity;
    for (const preset of allPresets()) {
      const aspectError = Math.abs(Math.log(preset.aspect / targetAspect));
      const areaError = Math.abs(Math.log(preset.pixels / targetPixels));
      const score = aspectError * 100 + areaError;
      if (score < bestScore) {
        best = preset;
        bestScore = score;
      }
    }
    return best;
  }

  function presetForAspect(aspect, preferred = DEFAULT_SIZE) {
    const targetAspect = Number(aspect);
    if (!Number.isFinite(targetAspect) || targetAspect <= 0) return inferPreset(preferred);
    const preferredParsed = parseSize(preferred) || parseSize(DEFAULT_SIZE);
    const targetPixels = preferredParsed.width * preferredParsed.height;
    let bestRatio = RATIO_OPTIONS[0][0];
    let ratioError = Infinity;
    for (const [ratio] of RATIO_OPTIONS) {
      const [rw, rh] = ratio.split(":").map(Number);
      const error = Math.abs(Math.log((rw / rh) / targetAspect));
      if (error < ratioError) {
        bestRatio = ratio;
        ratioError = error;
      }
    }
    return TIER_OPTIONS
      .map(([tier]) => getPreset(bestRatio, tier))
      .reduce((best, preset) => (
        Math.abs(Math.log(preset.pixels / targetPixels)) < Math.abs(Math.log(best.pixels / targetPixels)) ? preset : best
      ));
  }

  function preferredPixelCount(preferred) {
    if (Number.isFinite(Number(preferred)) && Number(preferred) > 0) {
      return Math.max(MIN_PIXELS, Math.min(MAX_PIXELS, Number(preferred)));
    }
    const parsed = parseSize(preferred) || parseSize(DEFAULT_SIZE);
    return Math.max(MIN_PIXELS, Math.min(MAX_PIXELS, parsed.width * parsed.height));
  }

  function nearestValidSizeForAspect(aspect, preferred = DEFAULT_SIZE) {
    const targetAspect = Number(aspect);
    if (!Number.isFinite(targetAspect) || targetAspect <= 0) {
      return invalid("画面比例无效");
    }
    if (targetAspect > MAX_ASPECT || targetAspect < 1 / MAX_ASPECT) {
      return invalid(`长短边比例不能超过 ${MAX_ASPECT}:1`);
    }

    const targetPixels = preferredPixelCount(preferred);
    let best = null;
    let bestScore = Infinity;
    for (let width = GRID; width <= MAX_EDGE; width += GRID) {
      const nearestHeight = Math.round((width / targetAspect) / GRID) * GRID;
      for (let offset = -2; offset <= 2; offset += 1) {
        const height = nearestHeight + offset * GRID;
        const candidate = validateDimensions(width, height);
        if (!candidate.valid) continue;
        const aspectError = Math.abs(Math.log(candidate.aspect / targetAspect));
        const areaError = Math.abs(Math.log(candidate.pixels / targetPixels));
        const score = aspectError * 100 + areaError;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
    }
    return best || invalid("找不到符合约束的尺寸");
  }

  function fitDimensions(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return invalid("宽和高必须是正数", w, h);
    }
    const aspect = w / h;
    if (aspect > MAX_ASPECT || aspect < 1 / MAX_ASPECT) {
      return invalid(`长短边比例不能超过 ${MAX_ASPECT}:1`, w, h);
    }

    const rawPixels = w * h;
    const areaScale = Math.sqrt(Math.max(MIN_PIXELS, Math.min(MAX_PIXELS, rawPixels)) / rawPixels);
    const edgeScale = MAX_EDGE / Math.max(w, h);
    const scale = Math.min(areaScale, edgeScale);
    const targetPixels = rawPixels * scale * scale;
    return nearestValidSizeForAspect(aspect, targetPixels);
  }

  return {
    GRID,
    MAX_EDGE,
    MAX_ASPECT,
    MIN_PIXELS,
    MAX_PIXELS,
    DEFAULT_SIZE,
    RATIO_OPTIONS,
    TIER_OPTIONS,
    PRESET_SIZES,
    parseSize,
    validateDimensions,
    validateSize,
    assertSize,
    getPreset,
    allPresets,
    inferPreset,
    presetForAspect,
    nearestValidSizeForAspect,
    fitDimensions,
  };
});
