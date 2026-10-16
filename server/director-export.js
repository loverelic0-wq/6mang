"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

function invalid(message) { const error = new Error(message); error.statusCode = 400; throw error; }
function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) invalid("预演帧必须为完整 JPEG 图片");
  for (let i = 2; i + 4 < buffer.length;) {
    if (buffer[i++] !== 0xff) invalid("预演 JPEG 帧格式无效");
    while (buffer[i] === 0xff) i++;
    const marker = buffer[i++];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(i);
    if (length < 2 || i + length > buffer.length) invalid("预演 JPEG 帧不完整");
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) return { height: buffer.readUInt16BE(i + 3), width: buffer.readUInt16BE(i + 5) };
    i += length;
  }
  invalid("无法读取预演图片尺寸");
}
function validatePayload(body) {
  const { width, height, fps, count, frames } = body || {};
  if (![width, height].every((v) => Number.isInteger(v) && v >= 64 && v <= 960 && v % 2 === 0)) invalid("预演尺寸需为 64–960 的偶数像素");
  if (fps !== 24 || !Number.isInteger(count) || count < 24 || count > 720 || !Array.isArray(frames) || frames.length !== count) invalid("预演需要 24 FPS、1–30 秒的完整帧序列");
  let bytes = 0;
  const buffers = frames.map((frame) => {
    if (typeof frame !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(frame)) invalid("预演帧必须为 JPEG 数据");
    bytes += frame.length;
    if (bytes > 48 * 1024 * 1024 || frame.length > 2 * 1024 * 1024) invalid("预演素材过大，请缩短运镜时长");
    const buffer = Buffer.from(frame.slice(23), "base64");
    const size = jpegSize(buffer);
    if (size.width !== width || size.height !== height) invalid("预演帧尺寸不一致，请重新导出");
    return buffer;
  });
  return { width, height, fps, count, buffers };
}

async function encodeVideo(body, { signal, executable = process.env.FFMPEG_PATH || "ffmpeg" } = {}) {
  const { fps, count, buffers } = validatePayload(body);
  signal?.throwIfAborted();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "6mang-previs-"));
  try {
    const output = path.join(directory, "preview.mp4");
    await new Promise((resolve, reject) => {
      const child = spawn(executable, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", String(fps), "-i", "pipe:0",
        "-an", "-frames:v", String(count), "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-color_range", "tv",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "", aborted = false, timeout = false, spawnError = null;
      const cancel = () => { aborted = true; child.kill(); };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      const timer = setTimeout(() => { timeout = true; child.kill(); }, 90000);
      child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-2000); });
      child.on("error", (error) => { spawnError = error; });
      child.stdin.on("error", () => {}); // 由 close 统一报告编码失败，并等待进程释放文件。
      child.on("close", (code) => {
        clearTimeout(timer); signal?.removeEventListener("abort", cancel);
        if (aborted) reject(new Error("已取消预演导出"));
        else if (timeout) reject(new Error("预演编码超时，请缩短时长后重试"));
        else if (spawnError?.code === "ENOENT") reject(new Error("未找到 FFmpeg，请安装 FFmpeg 或配置 FFMPEG_PATH"));
        else if (spawnError || code !== 0) reject(new Error(`预演编码失败：${spawnError?.message || stderr || code}`));
        else resolve();
      });
      child.stdin.end(Buffer.concat(buffers));
    });
    signal?.throwIfAborted();
    const video = await fs.readFile(output);
    if (video.length < 32 || video.toString("ascii", 4, 8) !== "ftyp") throw new Error("编码未产生有效 MP4");
    return video;
  } finally {
    // directory 仅来自 mkdtemp，不接受调用方传入的路径。
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const jobs = new Set();
async function exportRequest(req, res, userId, readJson) {
  if (jobs.has(userId)) { const error = new Error("已有预演正在导出，请等待完成"); error.statusCode = 409; throw error; }
  jobs.add(userId);
  const abort = new AbortController();
  const cancel = () => { if (!res.writableEnded) abort.abort(); };
  res.on("close", cancel);
  try {
    const body = await readJson(req);
    const video = await encodeVideo(body, { signal: abort.signal });
    if (abort.signal.aborted) return;
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": video.length,
      "Content-Disposition": 'inline; filename="previs.mp4"', "Cache-Control": "no-store" });
    res.end(video);
  } finally {
    res.removeListener("close", cancel);
    jobs.delete(userId);
  }
}
module.exports = { validatePayload, encodeVideo, exportRequest };
