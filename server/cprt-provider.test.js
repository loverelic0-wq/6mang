const test = require("node:test");
const assert = require("node:assert/strict");

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
    seconds: 8,
    images: ["https://cdn.example/product.png"],
    videos: ["https://cdn.example/host.mp4"],
  }), {
    model: "free-video-2.5-multimodal-video",
    content: [
      { type: "text", text: "主播举起商品，普通话自然讲解" },
      { type: "image_url", image_url: { url: "https://cdn.example/product.png" }, role: "reference_image" },
      { type: "video_url", video_url: { url: "https://cdn.example/host.mp4" }, role: "reference_video" },
    ],
    generate_audio: true,
    ratio: "9:16",
    duration: 8,
    watermark: false,
  });
});

test("CPRT task responses are normalized for the canvas polling contract", () => {
  assert.equal(typeof normalizeCprtTask, "function", "normalizeCprtTask should be exported");
  assert.deepEqual(normalizeCprtTask({
    task_id: "task-123",
    status: "success",
    result: { video_url: "https://cdn.example/final.mp4" },
  }), {
    id: "task-123",
    status: "succeeded",
    video_url: "https://cdn.example/final.mp4",
    error: "",
  });
});
