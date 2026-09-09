const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let cprt = {};
try {
  cprt = require("./cprt-provider");
} catch {}

const { isCprtProvider, buildCprtCreatePayload, normalizeCprtTask } = cprt;

test("CPRT provider is identified from its API host", () => {
  assert.equal(typeof isCprtProvider, "function", "isCprtProvider should be exported");
  assert.equal(isCprtProvider({ baseUrl: "https://ai-api.cprt.xyz/v1" }), true);
  assert.equal(isCprtProvider({ baseUrl: "https://147ai.com/v1" }), false);
});

test("CPRT creates multimodal payloads from canvas text, image and video inputs", () => {
  assert.equal(typeof buildCprtCreatePayload, "function", "buildCprtCreatePayload should be exported");
  assert.deepEqual(buildCprtCreatePayload("free-video-2.5-multimodal-video", {
    prompt: "主播举起商品，普通话自然讲解",
    ratio: "9:16",
    resolution: "1080p",
    seconds: 8,
    images: ["https://cdn.example/product.png"],
    videos: ["https://cdn.example/host.mp4"],
  }), {
    model: "free-video-2.5-multimodal-video",
    prompt: "主播举起商品，普通话自然讲解",
    resolution: "1080p",
    duration: 8,
    imageUrls: ["https://cdn.example/product.png"],
    videoUrls: ["https://cdn.example/host.mp4"],
    audioUrls: [],
    generateAudio: true,
    ratio: "9:16",
    realPersonMode: true,
    conversionSlots: ["all"],
    returnLastFrame: true,
    seed: -1,
    returnOriginData: true,
  });
});

test("CPRT flat multimodal payload supplies safe defaults without dropping empty reference arrays", () => {
  assert.deepEqual(buildCprtCreatePayload("free-video-2.0-multimodal-video", {
    prompt: "红色小球缓慢滚过白色地面",
    seconds: 4,
  }), {
    model: "free-video-2.0-multimodal-video",
    prompt: "红色小球缓慢滚过白色地面",
    resolution: "720p",
    duration: 4,
    imageUrls: [],
    videoUrls: [],
    audioUrls: [],
    generateAudio: true,
    ratio: "16:9",
    realPersonMode: true,
    conversionSlots: ["all"],
    returnLastFrame: true,
    seed: -1,
    returnOriginData: true,
  });
});

test("CPRT first/last-frame mode uses the image-to-video contract", () => {
  assert.deepEqual(buildCprtCreatePayload("free-video-2.0-multimodal-video", {
    videoMode: "first_last",
    prompt: "从首帧自然过渡到尾帧",
    resolution: "1080p",
    seconds: 6,
    images: ["https://cdn.example/first.png", "https://cdn.example/last.png", "https://cdn.example/ignored.png"],
  }), {
    model: "free-video-2.0-image-to-video",
    prompt: "从首帧自然过渡到尾帧",
    resolution: "native1080p",
    duration: 6,
    firstFrameUrl: "https://cdn.example/first.png",
    lastFrameUrl: "https://cdn.example/last.png",
    generateAudio: true,
    ratio: "16:9",
    realPersonMode: true,
    conversionSlots: ["all"],
    returnLastFrame: true,
    seed: -1,
    returnOriginData: true,
  });
});

test("CPRT fast multimodal routes stay flat and cap reference videos at three", () => {
  const payload = buildCprtCreatePayload("free-video-2.0-fast-multimodal-video", {
    videoMode: "reference",
    prompt: "按多份素材生成",
    images: Array.from({ length: 12 }, (_, index) => `image-${index + 1}`),
    videos: Array.from({ length: 5 }, (_, index) => `video-${index + 1}`),
  });
  assert.equal(payload.model, "free-video-2.0-fast-multimodal-video");
  assert.deepEqual(payload.imageUrls, Array.from({ length: 9 }, (_, index) => `image-${index + 1}`));
  assert.deepEqual(payload.videoUrls, ["video-1", "video-2", "video-3"]);
  assert.equal(payload.returnOriginData, true);
});

test("CPRT terminal failures preserve failedReason details", () => {
  assert.equal(normalizeCprtTask({
    status: "FAILED",
    failedReason: { message: "参考素材处理失败" },
  }, "task-failed").error, "参考素材处理失败");
});

test("other CPRT video families keep content inputs and receive the required resolution", () => {
  const payload = buildCprtCreatePayload("XG-MASTER-VIDEO-2.0-MINI", {
    prompt: "固定镜头",
    size: "854x480",
    images: ["https://cdn.example/first.png"],
  });

  assert.equal(payload.resolution, "480p");
  assert.deepEqual(payload.content, [
    { type: "text", text: "固定镜头" },
    { type: "image_url", image_url: { url: "https://cdn.example/first.png" }, role: "reference_image" },
  ]);
});

test("CPRT task responses are normalized for the canvas polling contract", () => {
  assert.equal(typeof normalizeCprtTask, "function", "normalizeCprtTask should be exported");
  assert.deepEqual(normalizeCprtTask({
    taskId: "task-123",
    status: "success",
    result: { video_url: "https://cdn.example/final.mp4" },
  }), {
    id: "task-123",
    status: "succeeded",
    video_url: "https://cdn.example/final.mp4",
    error: "",
  });
});

test("CPRT nested task responses expose the id expected by the canvas", () => {
  assert.deepEqual(normalizeCprtTask({ data: {
    task_id: "task-nested",
    state: "processing",
  } }), {
    id: "task-nested",
    status: "running",
    video_url: "",
    error: "",
  });
});

test("CPRT polling keeps the submitted task id ahead of an upstream internal id", () => {
  assert.equal(normalizeCprtTask({ id: "internal-row-id", status: "running" }, "submitted-task-id").id, "submitted-task-id");
});

test("canvas video requests send the selected resolution to the backend", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(source, /resolution: getVideoResolutionValue\(configNode\.data\)/);
  assert.match(source, /data-field="resolution"/);
});
