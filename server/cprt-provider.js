function isCprtProvider(provider) {
  return /(?:^|\.)cprt\.xyz(?:\/|$)/i.test(String(provider?.baseUrl || ""));
}

function clampDuration(value) {
  const seconds = Number(value) || 8;
  return Math.max(4, Math.min(15, Math.round(seconds)));
}

function buildCprtCreatePayload(model, body) {
  const images = Array.isArray(body?.images) ? body.images.filter(Boolean) : [];
  const videos = Array.isArray(body?.videos) ? body.videos.filter(Boolean) : [];
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
    model: String(model || "free-video-2.5-multimodal-video"),
    content,
    generate_audio: true,
    ratio: body?.ratio || body?.aspect_ratio || "16:9",
    duration: clampDuration(body?.duration ?? body?.seconds),
    watermark: false,
  };
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
  const result = body.result && typeof body.result === "object" ? body.result : {};
  const content = body.content && typeof body.content === "object" ? body.content : {};
  const results = Array.isArray(body.results) ? body.results : [];
  const videoItem = results.find((item) => item && typeof item === "object" && (item.name === "videoUrl" || item.outputType === "mp4"));
  const videoUrl = body.video_url || body.videoUrl || result.video_url || result.videoUrl || content.video_url || content.videoUrl || videoItem?.url || "";
  const status = normalizeCprtStatus(body.status || body.state);
  const error = status === "failed" ? String(body.error?.message || body.error || body.errorMessage || body.message || "任务失败") : "";
  return {
    id: String(body.task_id || body.taskId || body.id || fallbackId),
    status,
    video_url: String(videoUrl || ""),
    error,
  };
}

module.exports = { isCprtProvider, buildCprtCreatePayload, normalizeCprtTask };
