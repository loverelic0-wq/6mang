const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

function harness(fetch) {
  const app = vm.createContext({ Blob, Uint8Array, Date, fetch, makeId: () => "download-id",
    getIndexedImageId: (url) => url.startsWith("idb-image:") ? url.slice(10) : "",
    getImageAsset: async () => null,
    imageDisplaySource: (url) => /^https?:/.test(url) ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url,
    historyVideoSrc: (project, item) => `/api/history/file?projectId=${project.id}&historyId=${item.id}`,
  });
  for (const name of ["mediaDownloadExtension", "readMediaDownloadBlob"]) {
    const from = new RegExp(`^async function ${name}\\(`, "m").exec(source).index;
    const next = /\n(?:(?:async )?function |(?:const|let|class) )/.exec(source.slice(from));
    vm.runInContext(source.slice(from, next ? from + next.index : source.length), app);
  }
  return app;
}

test("downloads reject missing assets and HTML error pages instead of saving invalid media", async () => {
  const app = harness(async () => new Response("<html>expired</html>", { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(app.readMediaDownloadBlob("idb-image:missing", "image"), /本地素材已丢失/);
  await assert.rejects(app.readMediaDownloadBlob("/result.png", "image"), /不是有效的图片/);
  await assert.rejects(app.mediaDownloadExtension(new Blob([]), "video"), /素材为空/);
  await assert.rejects(app.mediaDownloadExtension(new Blob(["oops"], { type: "application/octet-stream" }), "video"), /不是有效的视频/);
});

test("binary storage responses keep real image/video formats without recoding bytes", async () => {
  const app = harness();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFwoAAAAASUVORK5CYII=", "base64");
  const blob = new Blob([png], { type: "application/octet-stream" });
  assert.equal(await app.mediaDownloadExtension(blob, "image"), "png");
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), png);
  assert.equal(await app.mediaDownloadExtension(new Blob(["\0\0\0\x18ftypisom\0\0\0\0"], { type: "application/octet-stream" }), "video"), "mp4");
  assert.equal(await app.mediaDownloadExtension(new Blob(["\0\0\0\x18ftypavif\0\0\0\0"], { type: "application/octet-stream" }), "image"), "avif");
  await assert.rejects(app.mediaDownloadExtension(new Blob(["\0\0\0\x18ftypavif\0\0\0\0"], { type: "application/octet-stream" }), "video"), /不是有效的视频/);
});

test("CORS-blocked remote videos use the archive endpoint and original project context", async () => {
  const calls = [];
  const project = { id: "project-a", name: "汽车", history: [] };
  const remote = "https://media.example/result.mp4?token=test";
  const app = harness(async (url, options) => {
    calls.push({ url, options });
    if (url === remote) throw new TypeError("Failed to fetch");
    if (url === "/api/history/save") return Response.json({ ok: true, fileUrl: "/api/history/file?folder=car&name=result.mp4" });
    return new Response("video-bytes", { headers: { "Content-Type": "video/mp4" } });
  });
  const blob = await app.readMediaDownloadBlob(remote, "video", project);
  assert.equal(await blob.text(), "video-bytes");
  assert.equal(calls.length, 3);
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.projectId, "project-a");
  assert.equal(payload.remoteUrl, remote);
  assert.equal(payload.type, "video");
});

test("an existing video archive is downloaded before trying an expired remote URL", async () => {
  const calls = [];
  const url = "https://media.example/expired.mp4";
  const app = harness(async (url) => {
    calls.push(url);
    return new Response("archived", { headers: { "Content-Type": "video/mp4" } });
  });
  const blob = await app.readMediaDownloadBlob(url, "video", { id: "p", history: [{ id: "h", type: "video", url }] });
  assert.equal(await blob.text(), "archived");
  assert.deepEqual(calls, ["/api/history/file?projectId=p&historyId=h"]);
});
