(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasCases = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const catalog = [
    { id: "product", title: "商品主图方案", description: "同一商品探索多个方向，接好参考图与提示词，生成后继续迭代。" },
    { id: "split", title: "详情页切图", description: "按行列分割长图，拖动分割线避开标题和商品，生成独立图片。" },
    { id: "sku", title: "SKU 图片整理", description: "统一尺寸、留白与底色，按规格分组，批量导出。" },
    { id: "storyboard", title: "视频分镜素材板", description: "每行脚本建立一组镜头，连接画面与视频生成，整理音视频素材。" },
    { id: "moodboard", title: "设计参考板", description: "按方向整理参考图，记录色彩、构图和材质，建立对比节点。" },
    { id: "extract", title: "大图素材提取", description: "框选局部或按网格提取，保留原图，结果可继续连线使用。" },
  ];
  function integer(value, min, max, label) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}须为 ${min}–${max} 的整数`);
    return n;
  }
  function dimensions(width, height) {
    width = integer(width, 1, 16384, "宽度");
    height = integer(height, 1, 16384, "高度");
    // Bound one decoded output buffer to 64 MiB.
    if (width * height > 16777216) throw new Error("单张输出请控制在 1600 万像素以内");
    return { width, height };
  }
  function evenCuts(count) {
    count = integer(count, 1, 20, "行列数");
    return Array.from({ length: count - 1 }, (_, i) => (i + 1) / count);
  }
  function gridRects(width, height, xs = [], ys = []) {
    integer(width, 1, 100000, "原图宽度");
    integer(height, 1, 100000, "原图高度");
    function axis(cuts, length) {
      if (!Array.isArray(cuts) || cuts.some((n) => !Number.isFinite(n) || n <= 0 || n >= 1)) throw new Error("分割线必须在图片内部");
      return [0, ...new Set(cuts.map((n) => Math.round(n * length)).filter((n) => n > 0 && n < length).sort((a, b) => a - b)), length];
    }
    const x = axis(xs, width), y = axis(ys, height);
    if ((x.length - 1) * (y.length - 1) > 100) throw new Error("一次最多切出 100 张，请减少行列数");
    return y.slice(1).flatMap((bottom, row) => x.slice(1).map((right, col) => ({
      x: x[col], y: y[row], width: right - x[col], height: bottom - y[row], row: row + 1, col: col + 1,
    })));
  }
  function cropRect(width, height, rect) {
    if (!rect || [rect.x, rect.y, rect.width, rect.height].some((v) => !Number.isFinite(v))) throw new Error("请在预览上框选需要的区域");
    const x = Math.max(0, Math.min(width - 1, Math.round(rect.x * width)));
    const y = Math.max(0, Math.min(height - 1, Math.round(rect.y * height)));
    const right = Math.max(x + 1, Math.min(width, Math.round((rect.x + rect.width) * width)));
    const bottom = Math.max(y + 1, Math.min(height, Math.round((rect.y + rect.height) * height)));
    return { x, y, width: right - x, height: bottom - y };
  }
  function fitRect(sw, sh, width, height, mode = "contain") {
    dimensions(width, height);
    if (!(sw > 0 && sh > 0)) throw new Error("原图尺寸无效");
    const scale = (mode === "cover" ? Math.max : Math.min)(width / sw, height / sh);
    return { x: (width - sw * scale) / 2, y: (height - sh * scale) / 2, width: sw * scale, height: sh * scale };
  }
  const lines = (text) => String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  function productPrompt(direction, brief, refCount) {
    return [
      "为同一款商品制作一张可用于电商展示的主图。",
      "@图片1 是唯一商品身份依据：保留商品外形、比例、结构、颜色、材质、已有包装与可辨识标识，不增加不存在的配件或功能。",
      ...Array.from({ length: Math.max(0, refCount - 1) }, (_, i) => `@图片${i + 2} 只用于视觉风格、光线与场景参考，不复制其中的商品、人物、商标或文案。`),
      `本次视觉方向：${direction}。`,
      "商品轮廓完整、细节清晰，接触阴影与光线一致。只生成一张完整构图，不做拼图或对比图。不擅自添加价格、促销语、参数或功效承诺。",
      brief ? `用户要求（具体构图和文案以此为准）：${brief}` : "画面中不添加新的文字。",
    ].join("\n");
  }
  function plan(kind, sources, options = {}) {
    const nodes = [], edges = [], groups = [];
    let sequence = 0;
    const add = (type, x, y, data) => {
      const id = `case-${++sequence}`;
      nodes.push({ id, type, position: { x, y }, data });
      return id;
    };
    const edge = (source, target, type = "default", data = {}) => edges.push({ source, target, type, data });
    const copy = (source, x, y, fallbackLabel) => add(source?.type || "image", x, y, {
      label: source?.data?.label || fallbackLabel, url: source?.data?.url || false,
      ...(source?.data?.ratio ? { ratio: source.data.ratio } : {}),
      ...(source?.data?.originalName ? { originalName: source.data.originalName } : {}),
      sourceNodeId: source?.id || "",
    });
    const group = (label, ids) => groups.push({ label, nodeIds: ids });
    const images = sources.filter((n) => ["image", "layerGroup"].includes(n.type));
    if (kind === "product") {
      const directions = lines(options.directions);
      if (!directions.length || directions.length > 8) throw new Error("请填写 1–8 个主图方向，每行一个");
      const refs = (images.length ? images : [null]).map((n, i) => copy(n && { ...n, type: "image" }, i * 320, 0, "上传商品原图"));
      group("商品与风格参考 · 第一张为商品", refs.concat(add("text", refs.length * 320, 0, { label: "参考图用途", content: "第一张是商品，后续图片只参考风格。可修改下方提示词，再逐个点击生成。选中结果后用「图生图」继续细化。" })));
      directions.forEach((direction, i) => {
        const y = 680 + i * 650;
        const prompt = add("text", 0, y, { label: `${direction} · 提示词`, content: productPrompt(direction, options.brief, refs.length) });
        const config = add("imageConfig", 330, y, { label: `${direction} · 生成` });
        const output = add("image", 710, y, { label: `${direction} · 结果`, url: false });
        edge(prompt, config);
        refs.forEach((id) => edge(id, config, "imageOrder", { label: "参考图" }));
        edge(config, output, "output", { label: "输出" });
        group(direction, [prompt, config, output]);
      });
    } else if (kind === "storyboard") {
      const shots = lines(options.shots);
      if (!shots.length || shots.length > 12) throw new Error("请填写 1–12 个镜头，每行一个");
      shots.forEach((shot, i) => {
        const y = i * 1000, label = `镜头 ${String(i + 1).padStart(2, "0")}`;
        const text = add("text", 0, y, { label: `${label} · 画面提示词`, content: `为视频分镜生成单张关键画面，不要分格。\n${images.length ? "@图片1 是主体外观参考，保持身份、服装或商品细节一致。" : ""}\n镜头内容：${shot}\n整体要求：${options.brief || "统一色调与视觉风格，明确景别、主体动作与空间关系。"}` });
        const config = add("imageConfig", 320, y, { label: `${label} · 关键画面` });
        const img = add("image", 700, y, { label: `${label} · 画面`, url: false });
        const motion = add("text", 1020, y, { label: `${label} · 运镜提示词`, content: `@图片1 是本镜头主体和场景的视觉依据，保持一致。\n镜头：${shot}\n${options.brief || ""}\n单个连续镜头，动作自然，运镜平稳，保持空间连续，不增加未要求的字幕。` });
        const videoConfig = add("videoConfig", 1350, y, { label: `${label} · 视频`, videoMode: "reference" });
        const video = add("video", 1780, y, { label: `${label} · 成片`, url: false });
        const ids = [text, config, img, motion, videoConfig, video];
        if (images.length) {
          const ref = copy({ ...images[0], type: "image" }, 0, y + 300, `${label} · 主体参考`);
          ids.push(ref); edge(ref, config, "imageOrder");
        }
        edge(text, config); edge(config, img, "output");
        edge(img, videoConfig, "default", { videoRole: "subject" });
        edge(motion, videoConfig, "default", { videoRole: "prompt" });
        edge(videoConfig, video, "output");
        group(label, ids);
      });
      const media = sources.filter((s) => ["audio", "video"].includes(s.type));
      if (media.length) {
        const ids = media.map((s, i) => copy(s, i * 360, shots.length * 1000, "音视频素材"));
        ids.push(add("text", media.length * 360, shots.length * 1000, { label: "剪辑备注", content: "音频和参考视频保留在素材板，可预览并随镜头素材导出，用于后续剪辑。音频不会自动发送到视频生成接口。" }));
        group("声音与视频参考", ids);
      }
    } else if (kind === "moodboard") {
      const titles = lines(options.directions);
      if (!titles.length || titles.length > 8) throw new Error("请填写 1–8 个设计方向，每行一个");
      titles.forEach((title, i) => {
        const x = i * 1050, subset = images.filter((_, n) => n % titles.length === i);
        const refs = (subset.length ? subset : [null]).map((s, n) => copy(s && { ...s, type: "image" }, x + (n % 3) * 320, 400 + Math.floor(n / 3) * 620, "上传参考图"));
        const note = add("text", x, 0, { label: `${title} · 设计笔记`, content: `${options.brief || "记录这个方向要保留和舍弃的视觉元素。"}\n色彩：\n构图：\n材质：\n光线：\n可借鉴的局部：\n下一步：` });
        if (refs.length >= 2) {
          const compare = add("imageCompare", x + 350, 0, { label: `${title} · 对比`, split: 50 });
          edge(refs[0], compare); edge(refs[1], compare); refs.push(compare);
        }
        group(title, [note, ...refs]);
      });
    } else throw new Error("未知案例");
    return { nodes, edges, groups };
  }
  function imageResults(items, title, labels = []) {
    const nodes = [], groups = [], byLabel = new Map();
    items.forEach((item, i) => {
      const label = labels[i] || title;
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push(item);
    });
    let y = 0;
    for (const [label, images] of byLabel) {
      const ids = [];
      images.forEach((item, i) => {
        const id = `result-${nodes.length}`;
        ids.push(id);
        nodes.push({ id, type: "image", position: { x: (i % 4) * 330, y: y + Math.floor(i / 4) * 620 }, data: item });
      });
      const noteId = `note-${nodes.length}`;
      nodes.push({ id: noteId, type: "text", position: { x: 4 * 330, y }, data: { label: `${label} · 备注`, content: "选中本组素材后，在「批量导出」中下载。原始图片保留，可以撤销本次操作。" } });
      groups.push({ label, nodeIds: [...ids, noteId] });
      y += Math.ceil(images.length / 4) * 620 + 100;
    }
    return { nodes, edges: [], groups };
  }
  return { catalog, dimensions, evenCuts, gridRects, cropRect, fitRect, productPrompt, plan, imageResults, lines };
});
