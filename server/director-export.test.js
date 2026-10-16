const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validatePayload, encodeVideo, exportRequest } = require("./director-export");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");

test("previs encoder rejects invalid counts, dimensions and non-image inputs before spawning", async () => {
  for (const body of [{}, { width: 960, height: 540, fps: 60, count: 24, frames: [] },
    { width: 961, height: 540, fps: 24, count: 24, frames: [] },
    { width: 960, height: 540, fps: 24, count: 24, frames: Array(24).fill("https://example.com/frame.jpg") }]) {
    assert.throws(() => validatePayload(body), (error) => error.statusCode === 400);
    await assert.rejects(encodeVideo(body, { executable: "must-not-be-spawned" }));
  }
});

test("encoder makes a real 24-frame silent H.264 MP4, and reports missing FFmpeg", async (t) => {
  const frame = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=blue:s=96x64", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"], { windowsHide: true });
  if (frame.error?.code === "ENOENT") { t.skip("FFmpeg unavailable"); return; }
  assert.equal(frame.status, 0, frame.stderr?.toString());
  const body = { width: 96, height: 64, fps: 24, count: 24, frames: Array(24).fill(`data:image/jpeg;base64,${frame.stdout.toString("base64")}`) };
  assert.equal(validatePayload(body).buffers.length, 24);
  assert.throws(() => validatePayload({ ...body, width: 98 }), /尺寸不一致/);
  const video = await encodeVideo(body);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", "pipe:0"], { input: video, windowsHide: true });
  assert.equal(probe.status, 0, probe.stderr?.toString());
  const streams = JSON.parse(probe.stdout).streams;
  assert.equal(streams.length, 1);
  assert.equal(streams[0].codec_name, "h264");
  assert.equal(streams[0].pix_fmt, "yuv420p");
  assert.equal(streams[0].nb_frames, "24");
  assert.equal(streams[0].avg_frame_rate, "24/1");
  await assert.rejects(encodeVideo(body, { executable: "6mang-missing-ffmpeg" }), /未找到 FFmpeg/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(encodeVideo(body, { signal: aborted.signal }));
});

test("export rejects duplicate jobs for a user and releases its slot after failure", async () => {
  const res = new EventEmitter();
  let release;
  const first = exportRequest({}, res, "qa", () => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(exportRequest({}, res, "qa", async () => ({})), (error) => error.statusCode === 409);
  release({});
  await assert.rejects(first, (error) => error.statusCode === 400);
  await assert.rejects(exportRequest({}, res, "qa", async () => ({})), (error) => error.statusCode === 400);
});
