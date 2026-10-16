const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const layerPsd = require("../public/layer-psd");
const agPsd = require("../public/vendor/ag-psd/bundle");

const publicDir = path.join(__dirname, "..", "public");

function pixels(width, height, color = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset);
  return { width, height, data };
}

function image(width, height, color) {
  return { ...pixels(width, height, color), naturalWidth: width, naturalHeight: height };
}

function pixel(data, x, y) {
  return Array.from(data.data.slice((y * data.width + x) * 4, (y * data.width + x + 1) * 4));
}

// An integer-pixel raster canvas keeps the tests independent of native canvas packages.
// Fractional placement is checked against recorded draw calls, not this simplified sampler.
function canvasFactory() {
  const canvases = [];
  function createCanvas(width, height) {
    const bitmap = pixels(width, height);
    const draws = [];
    const context = {
      globalAlpha: 1,
      drawImage(source, x, y, drawWidth = source.width, drawHeight = source.height) {
        draws.push({ source, x, y, width: drawWidth, height: drawHeight, alpha: this.globalAlpha });
        for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + drawHeight)); py += 1) {
          for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + drawWidth)); px += 1) {
            const sx = Math.floor((px + 0.5 - x) * source.width / drawWidth);
            const sy = Math.floor((py + 0.5 - y) * source.height / drawHeight);
            if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
            const from = (sy * source.width + sx) * 4;
            const to = (py * width + px) * 4;
            const sourceAlpha = source.data[from + 3] / 255 * this.globalAlpha;
            const destAlpha = bitmap.data[to + 3] / 255;
            const alpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
            for (let channel = 0; channel < 3; channel += 1) {
              bitmap.data[to + channel] = alpha ? Math.round((source.data[from + channel] * sourceAlpha
                + bitmap.data[to + channel] * destAlpha * (1 - sourceAlpha)) / alpha) : 0;
            }
            bitmap.data[to + 3] = Math.round(alpha * 255);
          }
        }
      },
      getImageData() {
        return { width, height, data: new Uint8ClampedArray(bitmap.data) };
      },
    };
    const canvas = { width, height, draws, getContext: (type) => type === "2d" ? context : null };
    canvases.push(canvas);
    return canvas;
  }
  return { createCanvas, canvases };
}

agPsd.initializeCanvas(() => { throw new Error("Unexpected native canvas allocation"); }, pixels);

function layer(overrides = {}) {
  return { assetId: "image", name: "图层", x: 0, y: 0, width: 4, height: 4, zIndex: 0, ...overrides };
}

function group(layers = [layer()], overrides = {}) {
  return { width: 8, height: 8, layers, ...overrides };
}

function roundTrip(document) {
  const bytes = agPsd.writePsdUint8Array(document, { noBackground: true, trimImageData: false });
  return agPsd.readPsd(bytes, { useImageData: true, skipThumbnail: true });
}

test("PSD plan preserves document size, negative fractional bounds, hidden layers and zero opacity", () => {
  const input = group([
    layer({ name: "隐藏层", zIndex: 7, visible: false }),
    layer({ name: "透明层", zIndex: 2, opacity: 0 }),
    layer({ name: "背景", zIndex: 0, x: -1.25, y: 2.5, width: 3.5, height: 2.25 }),
  ], { width: 721.4, height: 900, nodeWidth: 340, nodeHeight: 430 });
  const original = structuredClone(input);
  const plan = layerPsd.exportPlan(input);
  assert.equal(plan.width, 721);
  assert.equal(plan.height, 900);
  assert.deepEqual(plan.layers.map((item) => item.name), ["背景", "透明层", "隐藏层"]);
  assert.equal(plan.layers[1].opacity, 0);
  assert.equal(plan.layers[2].hidden, true);
  assert.equal(plan.layers[0].opacity, 1);
  assert.deepEqual({
    x: plan.layers[0].x, y: plan.layers[0].y,
    left: plan.layers[0].left, top: plan.layers[0].top,
    width: plan.layers[0].pixelWidth, height: plan.layers[0].pixelHeight,
    drawWidth: plan.layers[0].drawWidth, drawHeight: plan.layers[0].drawHeight,
  }, { x: -1.25, y: 2.5, left: -2, top: 2, width: 5, height: 3, drawWidth: 3.5, drawHeight: 2.25 });
  assert.deepEqual(input, original);
});

test("PSD plan handles legacy dimensions and opacity without changing equal-z stacking", () => {
  const plan = layerPsd.exportPlan(group([
    layer({ name: "先绘制", width: undefined, height: undefined, nativeWidth: 6, nativeHeight: 3, opacity: 5 }),
    layer({ name: "后绘制", opacity: -0.5 }),
  ]));
  assert.deepEqual(plan.layers.map((item) => [item.name, item.opacity]), [["先绘制", 1], ["后绘制", 0]]);
  assert.equal(plan.layers[0].drawWidth, 6);
  assert.equal(plan.layers[0].drawHeight, 3);
});

test("PSD plan rejects missing assets, invalid geometry and excessive pixel allocations", () => {
  for (const width of [0, -1, Infinity, NaN, 30001]) {
    assert.throws(() => layerPsd.exportPlan(group(undefined, { width })), /画布宽度/);
  }
  assert.throws(() => layerPsd.exportPlan(group([], {})), /暂无可导出/);
  assert.throws(() => layerPsd.exportPlan(group([layer({ name: "缺失的隐藏层", visible: false, assetId: "" })])), /缺失的隐藏层.*资源缺失/);
  assert.throws(() => layerPsd.exportPlan(group([layer({ x: NaN })])), /位置无效/);
  assert.throws(() => layerPsd.exportPlan(group([layer({ height: 0 })])), /高度/);
  assert.throws(() => layerPsd.exportPlan(group(undefined, { width: 5000, height: 5000 })), /画布过大/);
  assert.throws(() => layerPsd.exportPlan(group([layer({ width: 8192, height: 8192 })])), /像素总量过大/);
  assert.throws(() => layerPsd.exportPlan(group([
    layer({ width: 5800, height: 5800 }), layer({ width: 5800, height: 5800, visible: false }),
  ], { width: 1024, height: 1024 })), /像素总量过大/);
  assert.throws(() => layerPsd.exportPlan(group(Array.from({ length: 257 }, () => layer()))), /256/);
});

test("PSD document preserves fractional transforms locally and retains pixels outside the document", async () => {
  const factory = canvasFactory();
  const source = image(4, 4, [240, 20, 30, 255]);
  const input = group([layer({ x: -1.25, y: -0.5, width: 3.5, height: 2.25, opacity: 0.25 })]);
  const document = await layerPsd.buildDocument(input, { ...factory, loadImage: async () => source });
  const local = factory.canvases[1].draws[0];
  assert.deepEqual({ x: local.x, y: local.y, width: local.width, height: local.height, alpha: local.alpha },
    { x: 0.75, y: 0.5, width: 3.5, height: 2.25, alpha: 1 });
  const composite = factory.canvases[0].draws[0];
  assert.deepEqual({ x: composite.x, y: composite.y, alpha: composite.alpha }, { x: -1.25, y: -0.5, alpha: 0.25 });
  assert.equal(document.children[0].left, -2);
  assert.equal(document.children[0].top, -1);
  assert.equal(document.children[0].imageData.width, 5);
  assert.equal(document.children[0].imageData.height, 3);
  assert.ok(factory.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
});

test("real PSD round trip retains Chinese names, stacking, geometry, opacity, visibility, locks and alpha", async () => {
  const factory = canvasFactory();
  const sources = {
    bg: image(4, 4, [0, 0, 255, 255]),
    red: image(2, 2, [255, 0, 0, 255]),
    hidden: image(2, 2, [0, 255, 0, 255]),
    zero: image(1, 1, [255, 255, 255, 128]),
  };
  const loaded = [];
  const progress = [];
  const document = await layerPsd.buildDocument(group([
    layer({ assetId: "hidden", name: "隐藏标题✨", x: -1, y: -1, width: 2, height: 2, zIndex: 3, visible: false }),
    layer({ assetId: "red", name: "半透明人物", x: 1, y: 1, width: 2, height: 2, zIndex: 1, opacity: 0.5 }),
    layer({ assetId: "bg", name: "蓝色背景", zIndex: 0, locked: true }),
    layer({ assetId: "zero", name: "零不透明度", width: 1, height: 1, zIndex: 2, opacity: 0 }),
  ], { width: 4, height: 4 }), {
    ...factory,
    loadImage: async (id) => { loaded.push(id); return sources[id]; },
    onProgress: (message) => progress.push(message),
  });
  assert.deepEqual(loaded, ["bg", "red", "zero", "hidden"]);
  assert.equal(progress.length, 4);
  assert.deepEqual(pixel(document.imageData, 1, 1), [128, 0, 128, 255]);
  assert.equal(factory.canvases[0].draws.length, 3);
  assert.deepEqual(pixel(document.children[1].imageData, 0, 0), [255, 0, 0, 255], "opacity must remain editable rather than being baked into pixels");

  const decoded = roundTrip(document);
  assert.deepEqual(decoded.children.map((item) => item.name), ["蓝色背景", "半透明人物", "零不透明度", "隐藏标题✨"]);
  assert.deepEqual([decoded.children[1].left, decoded.children[1].top, decoded.children[1].right, decoded.children[1].bottom], [1, 1, 3, 3]);
  assert.equal(decoded.children[1].opacity, 128 / 255);
  assert.equal(decoded.children[2].opacity, 0);
  assert.equal(decoded.children[3].hidden, true);
  assert.equal(decoded.children[3].left, -1);
  assert.deepEqual(decoded.children[0].protected, { transparency: false, composite: false, position: true });
  assert.deepEqual(pixel(decoded.children[2].imageData, 0, 0), [255, 255, 255, 128]);
  assert.deepEqual(pixel(decoded.imageData, 1, 1), [128, 0, 128, 255]);
  assert.ok(factory.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
});

test("single-layer PSD keeps transparency and an editable layer even with no opaque background", async () => {
  const factory = canvasFactory();
  const source = image(2, 1, [0, 0, 0, 0]);
  source.data.set([255, 0, 0, 128], 4);
  const document = await layerPsd.buildDocument(group([layer({ width: 2, height: 1 })], { width: 2, height: 1 }), {
    ...factory, loadImage: async () => source,
  });
  const decoded = roundTrip(document);
  assert.equal(decoded.channels, 4);
  assert.equal(decoded.children.length, 1);
  assert.deepEqual(pixel(decoded.children[0].imageData, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(decoded.children[0].imageData, 1, 0), [255, 0, 0, 128]);
  assert.equal(pixel(decoded.imageData, 0, 0)[3], 0);
  assert.equal(pixel(decoded.imageData, 1, 0)[3], 128);
});

test("a missing hidden image aborts the entire document and frees canvases", async () => {
  const factory = canvasFactory();
  let result;
  await assert.rejects(async () => {
    result = await layerPsd.buildDocument(group([
      layer({ assetId: "ok", name: "已载入背景" }),
      layer({ assetId: "missing", name: "缺失标题", zIndex: 1, visible: false }),
    ]), { ...factory, loadImage: async (id) => {
      if (id === "missing") throw new Error("IndexedDB asset not found");
      return image(4, 4, [255, 255, 255, 255]);
    } });
  }, /缺失标题.*图片读取失败/);
  assert.equal(result, undefined, "a partial document must never reach the encoder");
  assert.ok(factory.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  await assert.rejects(() => layerPsd.buildDocument(group(), {
    ...factory, loadImage: async () => ({ naturalWidth: 0, naturalHeight: 0 }),
  }), /图片资源不可用/);
});

test("document creation releases allocated canvases when the browser cannot provide a 2D context", async () => {
  for (const failedCanvasIndex of [0, 1]) {
    const factory = canvasFactory();
    const createCanvas = (width, height) => {
      const canvas = factory.createCanvas(width, height);
      if (factory.canvases.length - 1 === failedCanvasIndex) canvas.getContext = () => null;
      return canvas;
    };
    await assert.rejects(() => layerPsd.buildDocument(group(), {
      createCanvas, loadImage: async () => image(4, 4, [255, 255, 255, 255]),
    }), /无法创建图层画布/);
    assert.equal(factory.canvases.length, failedCanvasIndex + 1);
    assert.ok(factory.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
  }
});

function loadWorker() {
  const posts = [];
  const imports = [];
  const context = vm.createContext({ console, postMessage: (message, transfers) => posts.push({ message, transfers }) });
  context.self = context;
  context.importScripts = (url) => {
    assert.equal(url, "./vendor/ag-psd/bundle.js");
    imports.push(url);
    vm.runInContext(fs.readFileSync(path.join(publicDir, url), "utf8"), context, { filename: url });
  };
  vm.runInContext(fs.readFileSync(path.join(publicDir, "layer-psd-worker.js"), "utf8"), context);
  return { context, posts, imports };
}

test("export worker encodes real PSD bytes with all layers and a transferable buffer", () => {
  const { context, posts, imports } = loadWorker();
  context.onmessage({ data: {
    width: 2, height: 2, imageData: pixels(2, 2, [255, 0, 0, 255]),
    children: [
      { name: "背景", imageData: pixels(2, 2, [0, 0, 255, 255]) },
      { name: "前景", imageData: pixels(2, 2, [255, 0, 0, 255]), protected: { position: true } },
    ],
  } });
  assert.equal(imports.length, 1);
  assert.equal(posts.length, 1);
  const { message, transfers } = posts[0];
  assert.equal(message.error, undefined);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0], message.bytes.buffer);
  assert.equal(Buffer.from(message.bytes).subarray(0, 4).toString("ascii"), "8BPS");
  const decoded = agPsd.readPsd(Uint8Array.from(message.bytes), { useImageData: true });
  assert.deepEqual(decoded.children.map((item) => item.name), ["背景", "前景"]);
  assert.deepEqual(pixel(decoded.children[0].imageData, 0, 0), [0, 0, 255, 255]);
  assert.equal(decoded.children[1].protected.position, true);
});

test("export worker reports encoding failure without returning a corrupt PSD", () => {
  const { context, posts } = loadWorker();
  context.onmessage({ data: { width: 0, height: 0, children: [] } });
  assert.equal(posts.length, 1);
  assert.match(posts[0].message.error, /PSD 文件生成失败/);
  assert.equal(posts[0].message.bytes, undefined);
  assert.equal(posts[0].transfers, undefined);
});

test("export worker retains composite alpha for narrow PSD documents", () => {
  const { context, posts } = loadWorker();
  for (const width of [1, 2, 3, 4, 8]) {
    for (const height of [1, 2, 8]) {
      const source = pixels(width, height);
      for (let offset = 0; offset < source.data.length; offset += 4) {
        source.data.set([255, 30, 20, offset % 12 === 0 ? 0 : 128], offset);
      }
      context.onmessage({ data: {
        width, height, imageData: source, children: [{ name: "透明像素层", imageData: source }],
      } });
      const { message } = posts.at(-1);
      assert.equal(message.error, undefined);
      const decoded = agPsd.readPsd(Uint8Array.from(message.bytes), { useImageData: true });
      const alpha = (data) => Array.from(data.data).filter((_, index) => index % 4 === 3);
      assert.deepEqual(alpha(decoded.imageData), alpha(source), `${width}x${height} composite alpha`);
      assert.deepEqual(alpha(decoded.children[0].imageData), alpha(source), `${width}x${height} layer alpha`);
    }
  }
});

test("PSD encoder transfers each pixel buffer and terminates its worker after success or failure", async () => {
  const workers = [];
  class FakeWorker {
    constructor(url) { this.url = url; workers.push(this); }
    postMessage(document, transfers) { this.document = document; this.transfers = transfers; }
    terminate() { this.terminated = true; }
  }
  const context = vm.createContext({ Worker: FakeWorker, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(publicDir, "layer-psd.js"), "utf8"), context);
  const document = {
    width: 2, height: 2, imageData: pixels(2, 2),
    children: [{ imageData: pixels(1, 1) }, { imageData: pixels(1, 1) }],
  };
  const promise = context.LayerPsd.encodeInWorker(document);
  assert.equal(workers[0].url, "./layer-psd-worker.js");
  assert.equal(workers[0].document, document);
  assert.equal(workers[0].transfers.length, 3);
  assert.equal(workers[0].transfers[0], document.imageData.data.buffer);
  assert.equal(workers[0].transfers[1], document.children[0].imageData.data.buffer);
  assert.equal(workers[0].transfers[2], document.children[1].imageData.data.buffer);
  const bytes = Uint8Array.from([56, 66, 80, 83]);
  workers[0].onmessage({ data: { bytes } });
  assert.equal(await promise, bytes);
  assert.equal(workers[0].terminated, true);

  const failure = context.LayerPsd.encodeInWorker(document);
  workers[1].onmessage({ data: { error: "PSD 文件生成失败：内存不足" } });
  await assert.rejects(failure, /PSD 文件生成失败：内存不足/);
  assert.equal(workers[1].terminated, true);
});
