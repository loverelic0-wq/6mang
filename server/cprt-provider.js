function isCprtProvider(provider) {
  return /(?:^|\.)cprt\.xyz(?:\/|$)/i.test(String(provider?.baseUrl || ""));
}

function clampDuration(value) {
  const seconds = Number(value) || 8;
  return Math.max(4, Math.min(15, Math.round(seconds)));
}

function normalizeResolution(value, size) {
  const direct = String(value || "").trim().toLowerCase();
  if (/^\d{3,4}p$/.test(direct)) return direct;

  const match = String(size || "").match(/(\d+)\s*[x×]\s*(\d+)/i);
  const shortEdge = match ? Math.min(Number(match[1]), Number(match[2])) : 0;
  if (shortEdge >= 1080) return "1080p";
  if (shortEdge > 0 && shortEdge < 720) return "480p";
  return "720p";
}

function isFlatMultimodalModel(model) {
  return /^free-video-2\.(?:0|5)(?:-(?:fast|mini))?-multimodal-video$/i.test(String(model || ""));
}

function isFlatImageToVideoModel(model) {
  return /^free-video-2\.(?:0|5)(?:-(?:fast|mini))?-image-to-video$/i.test(String(model || ""));
}

function imageToVideoModelFor(model) {
  const value = String(model || "");
  return isFlatMultimodalModel(value) ? value.replace(/multimodal-video$/i, "image-to-video") : value;
}

function normalizeFreeVideoResolution(model, resolution) {
  const value = String(resolution || "720p").toLowerCase();
  // CPRT 的标准 2.0 路由把原生高分辨率命名为 native1080p/native4k。
  if (/^free-video-2\.0-(?:multimodal|image-to)-video$/i.test(String(model || ""))) {
    if (value === "1080p") return "native1080p";
    if (value === "4k") return "native4k";
  }
  return value;
}

function buildCprtCreatePayload(model, body) {
  const images = Array.isArray(body?.images) ? body.images.filter(Boolean) : [];
  const videos = Array.isArray(body?.videos) ? body.videos.filter(Boolean) : [];
  const modelId = String(model || "free-video-2.5-multimodal-video");
  const prompt = String(body?.prompt || "");
  const selectedResolution = normalizeResolution(body?.resolution, body?.size);
  const ratio = body?.ratio || body?.aspect_ratio || "16:9";
  const duration = clampDuration(body?.duration ?? body?.seconds);
  const useImageToVideo = body?.videoMode === "first_last" || isFlatImageToVideoModel(modelId);

  // 首尾帧和多模态参考是 CPRT 的两个不同合同，不能都塞进 imageUrls。
  if (useImageToVideo && (isFlatMultimodalModel(modelId) || isFlatImageToVideoModel(modelId))) {
    if (!images[0]) throw new Error("首尾帧模式至少需要一张首帧图片");
    const requestModel = imageToVideoModelFor(modelId);
    return {
      model: requestModel,
      prompt,
      resolution: normalizeFreeVideoResolution(requestModel, selectedResolution),
      duration,
      firstFrameUrl: String(images[0]),
      ...(images[1] ? { lastFrameUrl: String(images[1]) } : {}),
      generateAudio: body?.generateAudio !== false,
      ratio,
      realPersonMode: body?.realPersonMode !== false,
      conversionSlots: Array.isArray(body?.conversionSlots) && body.conversionSlots.length
        ? body.conversionSlots.map(String)
        : ["all"],
      returnLastFrame: body?.returnLastFrame !== false,
      seed: Number.isInteger(body?.seed) ? body.seed : -1,
      returnOriginData: body?.returnOriginData !== false,
    };
  }

  // free-video 2.0/2.5 多模态接口使用扁平字段，不接受 content[] 作为 prompt 替代。
  if (isFlatMultimodalModel(modelId)) {
    const conversionSlots = Array.isArray(body?.conversionSlots) && body.conversionSlots.length
      ? body.conversionSlots.map(String)
      : ["all"];
    return {
      model: modelId,
      prompt,
      resolution: normalizeFreeVideoResolution(modelId, selectedResolution),
      duration,
      imageUrls: images.slice(0, 9).map(String),
      videoUrls: videos.slice(0, 3).map(String),
      audioUrls: [],
      generateAudio: body?.generateAudio !== false,
      ratio,
      realPersonMode: body?.realPersonMode !== false,
      conversionSlots,
      returnLastFrame: body?.returnLastFrame !== false,
      seed: Number.isInteger(body?.seed) ? body.seed : -1,
      returnOriginData: body?.returnOriginData !== false,
    };
  }

  const content = [{ type: "text", text: String(body?.prompt || "") }];

  images.slice(0, 9).forEach((url) => content.push({
    type: "image_url",
    image_url: { url: String(url) },
    role: "reference_image",
  }));
  videos.slice(0, 9).forEach((url) => content.push({
    type: "video_url",
    video_url: { url: String(url) },
    role: "reference_video",
  }));

  return {
    model: modelId,
    content,
    generate_audio: body?.generateAudio !== false,
    ratio,
    duration,
    watermark: false,
    resolution: selectedResolution,
  };
}

function readableFailure(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const message = value.message || value.errorMessage || value.reason || value.detail;
  if (message) return String(message);
  try {
    const serialized = JSON.stringify(value);
    return serialized === "{}" ? "" : serialized;
  } catch {
    return "";
  }
}

function normalizeCprtStatus(value) {
  const status = String(value || "queued").toLowerCase();
  if (["success", "succeeded", "completed", "complete"].includes(status)) return "succeeded";
  if (["failed", "failure", "error", "cancelled", "canceled", "expired"].includes(status)) return "failed";
  if (["running", "processing", "in_progress", "generating"].includes(status)) return "running";
  return "queued";
}

function normalizeCprtTask(raw, fallbackId = "") {
  const body = raw && typeof raw === "object" ? raw : {};
  const nested = body.data && typeof body.data === "object" ? body.data : {};
  const result = body.result && typeof body.result === "object"
    ? body.result
    : nested.result && typeof nested.result === "object" ? nested.result : {};
  const content = body.content && typeof body.content === "object"
    ? body.content
    : nested.content && typeof nested.content === "object" ? nested.content : {};
  const results = Array.isArray(body.results) ? body.results : Array.isArray(nested.results) ? nested.results : [];
  const videoItem = results.find((item) => item && typeof item === "object" && (item.name === "videoUrl" || item.outputType === "mp4"));
  const videoUrl = body.video_url || body.videoUrl || nested.video_url || nested.videoUrl || result.video_url || result.videoUrl || content.video_url || content.videoUrl || videoItem?.url || "";
  const status = normalizeCprtStatus(body.status || body.state || nested.status || nested.state);
  const error = status === "failed"
    ? String(
        readableFailure(body.error) || body.errorMessage || readableFailure(body.failedReason) || body.message ||
        readableFailure(nested.error) || nested.errorMessage || readableFailure(nested.failedReason) || nested.message ||
        body.errorCode || nested.errorCode || "任务失败"
      )
    : "";
  return {
    id: String(body.task_id || body.taskId || nested.task_id || nested.taskId || fallbackId || body.id || nested.id || ""),
    status,
    video_url: String(videoUrl || ""),
    error,
  };
}

module.exports = { isCprtProvider, buildCprtCreatePayload, normalizeCprtTask };
