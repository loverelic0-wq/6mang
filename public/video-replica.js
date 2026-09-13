(function initVideoReplica(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VideoReplica = api;
})(typeof window !== "undefined" ? window : null, function createVideoReplica() {
  "use strict";

  const modelLabels = {
    "free-video-2.0-multimodal-video": "SD 2.0 · 视频参考",
    "free-video-2.0-fast-multimodal-video": "SD 2.0 Fast · 视频参考",
    "free-video-2.0-mini-multimodal-video": "SD 2.0 Mini · 视频参考",
  };

  function isSupportedProvider(provider) {
    try {
      const url = new URL(provider?.baseUrl);
      return ["http:", "https:"].includes(url.protocol)
        && (url.hostname === "cprt.xyz" || url.hostname.endsWith(".cprt.xyz"));
    } catch {
      return false;
    }
  }

  function isSupportedModel(model) {
    return typeof model === "string" && Object.hasOwn(modelLabels, model);
  }

  function availableModels(group) {
    const results = [];
    for (const [providerId, provider] of Object.entries(group?.items || {})) {
      if (!isSupportedProvider(provider) || !Array.isArray(provider.models)) continue;
      const seen = new Set();
      for (const entry of provider.models) {
        if (!isSupportedModel(entry?.id) || seen.has(entry.id)) continue;
        seen.add(entry.id);
        results.push({
          providerId,
          model: entry.id,
          label: entry.label || modelLabels[entry.id],
          providerLabel: provider.label || providerId,
          configured: provider.configured === true,
        });
      }
    }
    return results;
  }

  function selectModel(group, { providerId = "", model = "" } = {}) {
    const options = availableModels(group);
    const selected = options.find((entry) => entry.providerId === providerId && entry.model === model)
      || options.find((entry) => entry.configured)
      || options[0];
    return { providerId: selected?.providerId || "", model: selected?.model || "" };
  }

  // 素材角色由类型固定：图片始终是新人物，视频始终是原片，不依赖连线顺序。
  function assignInputs(slots = []) {
    const assigned = { character: null, video: null, extras: [] };
    for (const slot of Array.isArray(slots) ? slots : []) {
      if (slot?.node?.type === "image" && !assigned.character) assigned.character = slot;
      else if (slot?.node?.type === "video" && !assigned.video) assigned.video = slot;
      else assigned.extras.push(slot);
    }
    return assigned;
  }

  function isMediaSource(source, type) {
    if (typeof source !== "string" || !source.trim()) return false;
    const value = source.trim();
    if (/^idb-image:[^\s]+$/.test(value)) return true;
    if (value.startsWith("/") && !value.startsWith("//") && !/[\r\n]/.test(value)) return true;
    if (value.startsWith("data:")) {
      return new RegExp(`^data:${type}/[^;,]+(?:;[^,]*)?,[\\s\\S]+$`, "i").test(value);
    }
    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol)) return Boolean(url.hostname);
      if (url.protocol === "blob:") {
        return /^blob:(?:https?:\/\/[^/]+|null)\/[^\s]+$/.test(value);
      }
    } catch {
      return false;
    }
    return false;
  }

  function validateInputs(slots) {
    const assigned = assignInputs(slots);
    if (assigned.extras.length) throw new Error("爆款视频复刻只接受一张人物参考图和一个参考视频，请移除多余或类型不符的连线");
    if (!assigned.character || !assigned.video) throw new Error("请连接一张人物参考图和一个参考视频");
    for (const [role, type, label] of [["character", "image", "人物参考图"], ["video", "video", "参考视频"]]) {
      const data = assigned[role].node.data;
      if (!data || data.loading || data.error || !isMediaSource(data.url, type)) {
        throw new Error(`${label}尚未载入完成或已失效，请重新载入有效素材`);
      }
    }
    return assigned;
  }

  function normalizeReplacementMode(value) {
    return value === "face" ? "face" : "person";
  }

  function buildPrompt({ replacementMode = "person", targetPerson = "", extra = "" } = {}) {
    const mode = normalizeReplacementMode(replacementMode);
    const target = String(targetPerson || "").trim();
    const extraText = String(extra || "").trim();
    const appearance = mode === "face"
      ? "仅将目标人物的面部特征和发型替换为 @图片1 中的人物，保留 @视频1 中目标人物的原服装、配饰与身体动作。不要使用参考图中的服装。"
      : "将目标人物替换为 @图片1 中的人物，替换后人物的面部特征、发型和服装以 @图片1 为准，保留原片中的身体动作和人物位置。";
    return `编辑 @视频1，使用 @图片1 作为人物外观参考，输出完成人物替换的视频。

素材角色：
- @视频1：原始参考视频，提供动作、表情、口型、时序、场景与镜头运动。
- @图片1：新人物的外观参考，不提供原片的动作或场景。

目标人物：${target || "参考视频中的主要出镜人物"}。如原片中有其他人物，只替换上述目标人物，保留其他人物。

编辑要求：
1. ${appearance}
2. 尽量保持原视频的动作、表情、口型、姿态、动作节奏和镜头时序；保持人物持物动作、手持产品的角度、产品外观、文字与标志以及遮挡关系。
3. 尽量保持原视频的场景背景、构图、景别、机位、运镜、光线方向和整体色调。让替换后人物的受光、投影、接触关系与原场景自然融合。
4. 保持人物身份与外观在连续帧中一致，动作与光照连续，尽量避免闪烁、面部漂移、手部变形、产品变形与突变。
5. 尽量保持原片音频、口播内容、字幕及其时间对应关系，不新增台词、字幕、标题或水印。${extraText ? `\n\n补充要求（在以上人物替换和原片保留约束下执行）：${extraText}` : ""}`;
  }

  // 智算谷参考视频为 2～15 秒，输出时长为 4～15 的整数；未公布输入宽高范围。
  function validateMetadata({ duration, width, height } = {}) {
    if (typeof duration !== "number" || !Number.isFinite(duration)) {
      throw new Error("无法读取参考视频时长，请重新载入视频");
    }
    if (duration < 2 || duration > 15) throw new Error("参考视频需为 2～15 秒，请先截取符合时长的片段");
    if ([width, height].some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
      throw new Error("无法读取参考视频尺寸，请重新载入视频");
    }
    return {
      duration,
      width,
      height,
      seconds: Math.max(4, Math.min(15, Math.ceil(duration))),
      warning: duration < 4 ? "参考视频不足 4 秒，生成视频最短为 4 秒，时长将长于原片。" : "",
    };
  }

  return {
    isSupportedProvider,
    isSupportedModel,
    availableModels,
    selectModel,
    assignInputs,
    validateInputs,
    normalizeReplacementMode,
    buildPrompt,
    validateMetadata,
  };
});
