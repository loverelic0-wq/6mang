(function exposeLayerPsd(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LayerPsd = api;
})(typeof window !== "undefined" ? window : globalThis, function createLayerPsd() {
  // 限制原始像素预算，避免浏览器在分配多个大图层时耗尽内存。
  const MAX_PIXELS = 64 * 1024 * 1024;
  const MAX_DOCUMENT_PIXELS = 16 * 1024 * 1024;

  function dimension(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 30000) {
      throw new Error(`${name}必须在 1～30000 像素之间`);
    }
    return number;
  }

  function exportPlan(group) {
    const width = Math.round(dimension(group?.width, "画布宽度"));
    const height = Math.round(dimension(group?.height, "画布高度"));
    if (!width || !height || width * height > MAX_DOCUMENT_PIXELS) {
      throw new Error("PSD 画布过大，请将画布控制在 1600 万像素以内");
    }
    if (!Array.isArray(group?.layers) || !group.layers.length) throw new Error("暂无可导出的图层");
    if (group.layers.length > 256) throw new Error("一次最多导出 256 个图层");
    let pixels = width * height;
    const layers = group.layers.map((layer, index) => {
      const name = String(layer?.name || `图层 ${index + 1}`);
      if (!layer?.assetId) throw new Error(`「${name}」的图片资源缺失，请重新导入图层`);
      const x = Number(layer.x ?? 0);
      const y = Number(layer.y ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1000000 || Math.abs(y) > 1000000) {
        throw new Error(`「${name}」的位置无效`);
      }
      const drawWidth = dimension(layer.width ?? layer.nativeWidth, `「${name}」宽度`);
      const drawHeight = dimension(layer.height ?? layer.nativeHeight, `「${name}」高度`);
      // PSD 使用整数边界；在局部位图内保留小数偏移和画布外像素。
      const left = Math.floor(x);
      const top = Math.floor(y);
      const pixelWidth = Math.ceil(x + drawWidth) - left;
      const pixelHeight = Math.ceil(y + drawHeight) - top;
      pixels += pixelWidth * pixelHeight;
      if (pixels > MAX_PIXELS || pixelWidth > 30000 || pixelHeight > 30000) {
        throw new Error("图层像素总量过大，请缩小图层或分成多个图层组导出");
      }
      const opacity = Number(layer.opacity);
      return {
        name, assetId: layer.assetId, x, y, drawWidth, drawHeight, left, top, pixelWidth, pixelHeight,
        zIndex: Number(layer.zIndex) || 0,
        opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1,
        hidden: layer.visible === false,
        locked: Boolean(layer.locked),
      };
    }).sort((a, b) => a.zIndex - b.zIndex);
    return { width, height, layers };
  }

  async function buildDocument(group, { loadImage, createCanvas, onProgress = () => {} }) {
    const plan = exportPlan(group);
    const composite = createCanvas(plan.width, plan.height);
    const children = [];
    try {
      const context = composite.getContext("2d");
      if (!context) throw new Error("浏览器无法创建图层画布");
      for (let index = 0; index < plan.layers.length; index += 1) {
        const layer = plan.layers[index];
        onProgress(`正在读取图层 ${index + 1}/${plan.layers.length}…`);
        let image;
        try { image = await loadImage(layer.assetId); }
        catch { throw new Error(`「${layer.name}」的图片读取失败，请重新导入图层后重试`); }
        if (!image || !(image.naturalWidth || image.width) || !(image.naturalHeight || image.height)) {
          throw new Error(`「${layer.name}」的图片资源不可用`);
        }
        const canvas = createCanvas(layer.pixelWidth, layer.pixelHeight);
        try {
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("浏览器无法创建图层画布");
          ctx.drawImage(image, layer.x - layer.left, layer.y - layer.top, layer.drawWidth, layer.drawHeight);
          children.push({
            name: layer.name, left: layer.left, top: layer.top,
            opacity: layer.opacity, hidden: layer.hidden, blendMode: "normal",
            protected: { position: layer.locked },
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
          });
          if (!layer.hidden) {
            context.globalAlpha = layer.opacity;
            context.drawImage(image, layer.x, layer.y, layer.drawWidth, layer.drawHeight);
          }
        } finally {
          canvas.width = canvas.height = 0;
        }
      }
      // 固定 ag-psd 31.0.2 实际 writer 以底层在前写入；独立读取器验证其叠放顺序。
      return {
        width: plan.width, height: plan.height, children,
        imageData: context.getImageData(0, 0, plan.width, plan.height),
      };
    } finally {
      composite.width = composite.height = 0;
    }
  }

  function encodeInWorker(psd, workerUrl = "./layer-psd-worker.js") {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl);
      const finish = (error, bytes) => {
        clearTimeout(timer);
        worker.terminate();
        if (error) reject(error);
        else resolve(bytes);
      };
      const timer = setTimeout(() => finish(new Error("PSD 导出超时，请缩小图层后重试")), 120000);
      worker.onmessage = ({ data }) => data?.error
        ? finish(new Error(data.error)) : finish(null, data.bytes);
      worker.onerror = () => finish(new Error("PSD 导出组件加载失败，请刷新页面后重试"));
      worker.onmessageerror = () => finish(new Error("PSD 图层数据传输失败，请重试"));
      try {
        const buffers = [psd.imageData, ...psd.children.map((layer) => layer.imageData)].map((item) => item.data.buffer);
        worker.postMessage(psd, buffers);
      } catch (error) { finish(error); }
    });
  }

  return { exportPlan, buildDocument, encodeInWorker };
});
