(function () {
  "use strict";
  const C = window.CanvasCases;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const field = (label, name, value, type = "text", extra = "") => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const area = (label, name, value, rows = 3) => `<label>${label}<textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;
  const select = (label, name, choices) => `<label>${label}<select name="${name}">${choices.map(([id, text]) => `<option value="${id}">${text}</option>`).join("")}</select></label>`;
  let active = null;
  function open(host, initial = "product") {
    if (active) { active.focus(); return; }
    const snapshot = host.snapshot();
    const dialog = document.createElement("dialog");
    dialog.className = "canvas-cases-dialog";
    dialog.setAttribute("aria-label", "创作案例");
    active = dialog;
    let kind = initial, busy = false, closed = false, committed = false, generation = 0;
    let staged = [], loadedImage = null, loadedSource = "", crop = null, xs = [], ys = [], dragging = null;
    let sources = snapshot.nodes.filter((n) => ["image", "layerGroup", "video", "audio"].includes(n.type) && typeof n.data.url === "string" && n.data.url && !n.data.loading);
    const selected = new Set(snapshot.selected);
    let checked = new Set(sources.filter((n) => selected.has(n.id)).map((n) => n.id));
    dialog.innerHTML = `
      <header><div><strong>创作案例</strong><p>选素材，填写要求，添加到当前画布。</p></div><button type="button" class="case-close" aria-label="关闭创作案例">×</button></header>
      <div class="case-layout">
        <nav aria-label="案例类型"></nav>
        <main class="case-main"><h2></h2><p class="case-description"></p><div class="case-fields"></div><div class="case-preview" hidden><canvas aria-label="切图和裁切预览"></canvas></div><p class="case-preview-hint"></p></main>
        <aside><strong>素材</strong><p class="case-source-help">勾选已有素材，或从电脑添加。</p><div class="case-source-actions"><button type="button" class="case-import">添加文件</button><button type="button" class="case-all">全选</button><button type="button" class="case-none">清空选择</button></div><input class="case-files" type="file" accept="image/*,video/*,audio/*" multiple hidden><div class="case-sources"></div></aside>
      </div>
      <footer><output class="case-status" aria-live="polite"></output><button type="button" class="case-run">添加到画布</button></footer>`;
    document.body.append(dialog);
    const $ = (query) => dialog.querySelector(query);
    const value = (name) => $(`[name="${name}"]`)?.value || "";
    const chosen = () => sources.filter((s) => checked.has(s.id));
    const images = () => chosen().filter((s) => ["image", "layerGroup"].includes(s.type));
    const setStatus = (text, error = false) => {
      $(".case-status").textContent = text;
      $(".case-status").classList.toggle("error", error);
    };
    const assertActive = () => {
      if (closed) throw new Error("操作已取消");
      host.assertProject(snapshot.projectId);
    };
    async function discardUnused(keep = new Set()) {
      const unused = staged.filter((url) => !keep.has(url));
      if (unused.length) await host.discard(unused);
      staged = staged.filter((url) => keep.has(url));
    }
    async function cleanup() {
      if (!committed) {
        try { await discardUnused(); } catch { host.toast("未使用素材的本地清理失败，请检查浏览器存储空间"); }
      }
    }
    dialog.addEventListener("close", () => { closed = true; generation++; active = null; dialog.remove(); if (!busy) void cleanup(); });
    $(".case-close").onclick = () => dialog.close();
    dialog.addEventListener("keydown", (e) => e.stopPropagation());
    const navItems = [...C.catalog, { id: "export", title: "批量导出", description: "把选中素材与文本备注打包为 ZIP，便于交付或继续剪辑。" }];
    $("nav").innerHTML = navItems.map((c, i) => `<button type="button" data-case-tab="${c.id}"><span>${i < 6 ? `0${i + 1}` : "↗"}</span>${c.title}</button>`).join("");
    $("nav").onclick = (event) => {
      const tab = event.target.closest("[data-case-tab]");
      if (tab && !busy) { kind = tab.dataset.caseTab; renderFields(); }
    };
    function refreshSourceSelector() {
      const selector = $('[name="source"]');
      if (!selector) return;
      const previous = selector.value;
      selector.innerHTML = images().map((s) => `<option value="${esc(s.id)}">${esc(s.data.label)}</option>`).join("");
      if (images().some((s) => s.id === previous)) selector.value = previous;
      if (kind === "split" || kind === "extract") void preview();
    }
    async function renderSources() {
      $(".case-sources").innerHTML = sources.map((s) => `<label class="case-source"><input type="checkbox" data-case-source="${esc(s.id)}" ${checked.has(s.id) ? "checked" : ""}><span class="case-thumb">${s.type === "audio" ? "♫" : s.type === "video" ? "▶" : ""}</span><span>${esc(s.data.label || "未命名")}<small>${s.type === "audio" ? "音频" : s.type === "video" ? "视频" : "图片"}</small></span></label>`).join("") || '<p class="case-empty">还没有素材。可先添加文件，也可以创建空的生成流程。</p>';
      refreshSourceSelector();
      for (const s of sources.filter((n) => ["image", "layerGroup"].includes(n.type))) {
        try {
          const url = await host.display(s.data.url);
          if (closed) return;
          const input = [...dialog.querySelectorAll("[data-case-source]")].find((el) => el.dataset.caseSource === s.id);
          if (input && url) {
            const img = document.createElement("img"); img.src = url; img.alt = ""; img.loading = "lazy";
            input.nextElementSibling.replaceChildren(img);
          }
        } catch { /* Processing and export report missing assets precisely. */ }
      }
    }
    $(".case-sources").onchange = (event) => {
      if (busy) return;
      const id = event.target.dataset.caseSource;
      if (id) { event.target.checked ? checked.add(id) : checked.delete(id); refreshSourceSelector(); }
    };
    $(".case-all").onclick = () => { if (!busy) { checked = new Set(sources.map((s) => s.id)); void renderSources(); } };
    $(".case-none").onclick = () => { if (!busy) { checked.clear(); void renderSources(); } };
    $(".case-import").onclick = () => { if (!busy) $(".case-files").click(); };
    $(".case-files").onchange = async (event) => {
      if (busy) return;
      setBusy(true);
      try {
        const files = [...event.target.files];
        if (files.length + sources.length > 200) throw new Error("素材面板一次最多保留 200 项，请分批整理");
        for (const file of files) {
          assertActive();
          if (!/^(image|video|audio)\//.test(file.type)) throw new Error(`${file.name} 不是支持的媒体文件`);
          if (file.size > 256 * 1024 * 1024) throw new Error(`${file.name} 超过 256 MiB，请先压缩`);
          const url = await host.persist(file); staged.push(url);
          assertActive();
          const node = { id: `upload-${crypto.randomUUID()}`, type: file.type.split("/")[0], data: { url, label: file.name, originalName: file.name } };
          sources.push(node); checked.add(node.id);
        }
        void renderSources(); setStatus(`已添加 ${files.length} 个文件`);
      } catch (e) { if (!closed) { void renderSources(); setStatus(e.message, true); } }
      finally { event.target.value = ""; setBusy(false); if (closed) void cleanup(); }
    };
    function setBusy(next) {
      busy = next;
      dialog.querySelectorAll("button, input, select, textarea").forEach((el) => { if (!el.classList.contains("case-close")) el.disabled = next; });
      $(".case-run").textContent = next ? "处理中…" : kind === "export" ? "导出 ZIP" : "添加到画布";
    }
    function renderFields() {
      generation++; loadedImage = null; crop = null; loadedSource = "";
      const entry = navItems.find((c) => c.id === kind);
      $("h2").textContent = entry.title; $(".case-description").textContent = entry.description;
      dialog.querySelectorAll("[data-case-tab]").forEach((el) => el.setAttribute("aria-current", String(el.dataset.caseTab === kind)));
      $(".case-preview").hidden = true; $(".case-preview-hint").textContent = "";
      const source = select("选择原图", "source", []);
      const grid = `<div class="case-grid-controls" ${kind === "extract" ? "hidden" : ""}><div class="case-row">${field("行数", "rows", kind === "split" ? 4 : 2, "number", 'min="1" max="20"')}${field("列数", "cols", kind === "split" ? 1 : 2, "number", 'min="1" max="20"')}</div><button type="button" class="case-reset-grid">重置等分线</button></div>`;
      const resize = `<div class="case-row">${field("输出宽度", "width", 1200, "number", 'min="1" max="16384"')}${field("输出高度", "height", 1200, "number", 'min="1" max="16384"')}</div>${select("适配方式", "fit", [["contain", "完整保留 · 四周留白"], ["cover", "铺满尺寸 · 居中裁切"]])}${select("留白底色", "background", [["transparent", "透明"], ["#ffffff", "白色"], ["#000000", "黑色"], ["custom", "自选颜色"]])}${field("自选颜色", "color", "#f4f1eb", "color")}`;
      let html = "";
      if (kind === "product") html = select("商品原图 · 其余勾选图片为风格参考", "source", []) + area("主图方向 · 每行一个", "directions", "干净棚拍，浅色背景\n自然生活场景，柔和日光\n材质细节，微距质感", 4) + area("商品与画面要求", "brief", "", 4);
      if (kind === "split") html = source + grid + '<p class="case-note">拖动分割线调整位置，双击分割线删除。按原图像素输出 PNG。</p>';
      if (kind === "extract") html = source + select("提取方式", "mode", [["crop", "框选局部"], ["grid", "网格提取"]]) + grid + '<p class="case-note">框选模式：在图片上按住拖动。网格模式：拖动分割线，双击删除。</p>';
      if (kind === "sku") html = resize + area("规格分组 · 每张图片对应一行", "labels", "", 4) + '<p class="case-note">留空则统一放入 SKU 分组。底色用于留白和透明区域；图片中已有的背景会保留。</p>';
      if (kind === "storyboard") html = area("分镜脚本 · 每行一个镜头", "shots", "远景：展示场景，镜头缓慢推进\n中景：主体完成关键动作\n特写：展示细节，缓慢拉近", 5) + area("统一视觉与运镜要求", "brief", "", 3) + '<p class="case-note">第一张勾选图片作为主体参考；音视频放入素材组。先生成关键画面，再生成对应视频。</p>';
      if (kind === "moodboard") html = area("设计方向 · 每行一个", "directions", "方向 A · 色彩与情绪\n方向 B · 构图与材质", 3) + area("项目目标与备注", "brief", "", 3) + '<p class="case-note">按素材列表顺序轮流分配到各个方向。创建后可拖动、重新分组及修改笔记。</p>';
      if (kind === "export") html = select("图片格式", "format", [["original", "保留原格式"], ["png", "PNG"], ["jpeg", "JPEG · 白色底"]]) + '<label class="case-check"><input name="includeText" type="checkbox" checked>同时导出画布文本与分组说明</label><p class="case-note">导出勾选的媒体；勾选文本选项后，还包含画布的文本节点。文件名含序号，避免同名覆盖。单包媒体总计上限 256 MiB。</p>';
      $(".case-fields").innerHTML = html;
      $(".case-fields").onchange = () => {
        try {
          if (kind === "split" || kind === "extract") {
            if (kind === "extract") $(".case-grid-controls").hidden = value("mode") === "crop";
            xs = C.evenCuts(value("cols")); ys = C.evenCuts(value("rows"));
            void preview();
          }
        } catch (e) { setStatus(e.message, true); }
      };
      $(".case-reset-grid")?.addEventListener("click", () => {
        try { xs = C.evenCuts(value("cols")); ys = C.evenCuts(value("rows")); drawPreview(); }
        catch (e) { setStatus(e.message, true); }
      });
      xs = []; ys = [];
      if (kind === "split" || kind === "extract") { xs = C.evenCuts(value("cols")); ys = C.evenCuts(value("rows")); }
      refreshSourceSelector();
      setStatus(kind === "product" || kind === "storyboard" ? "创建后在节点上点击生成，使用当前画布的模型和 API。" : "");
      setBusy(false);
    }
    async function preview() {
      const source = images().find((s) => s.id === value("source"));
      const version = ++generation;
      loadedImage = null; $(".case-preview").hidden = true;
      if (!source) { setStatus("先勾选一张图片，或添加文件"); return; }
      try {
        const image = await host.drawable(source.data.url);
        if (version !== generation || closed) return;
        if (loadedSource !== source.id) crop = null;
        loadedSource = source.id; loadedImage = image;
        $(".case-preview").hidden = false;
        drawPreview();
        $(".case-preview-hint").textContent = `原图 ${image.naturalWidth} × ${image.naturalHeight} · 长图可在预览内滚动`;
        setStatus("");
      } catch (e) { if (version === generation && !closed) setStatus(e.message, true); }
    }
    const canvas = $("canvas"), ctx = canvas.getContext("2d");
    function drawPreview() {
      if (!loadedImage) return;
      const scale = Math.min(1, 700 / loadedImage.naturalWidth, 4096 / loadedImage.naturalHeight);
      canvas.width = Math.max(1, Math.round(loadedImage.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(loadedImage.naturalHeight * scale));
      ctx.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ff6549"; ctx.lineWidth = 2;
      if (kind === "extract" && value("mode") === "crop") {
        if (crop) {
          ctx.fillStyle = "#ff654933";
          ctx.fillRect(crop.x * canvas.width, crop.y * canvas.height, crop.width * canvas.width, crop.height * canvas.height);
          ctx.strokeRect(crop.x * canvas.width, crop.y * canvas.height, crop.width * canvas.width, crop.height * canvas.height);
        }
      } else {
        for (const x of xs) { ctx.beginPath(); ctx.moveTo(x * canvas.width, 0); ctx.lineTo(x * canvas.width, canvas.height); ctx.stroke(); }
        for (const y of ys) { ctx.beginPath(); ctx.moveTo(0, y * canvas.height); ctx.lineTo(canvas.width, y * canvas.height); ctx.stroke(); }
      }
    }
    function point(event) {
      const r = canvas.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) };
    }
    function hit(p) {
      const r = canvas.getBoundingClientRect();
      const x = xs.findIndex((v) => Math.abs(v - p.x) * r.width < 9);
      if (x >= 0) return { axis: "x", index: x };
      const y = ys.findIndex((v) => Math.abs(v - p.y) * r.height < 9);
      return y >= 0 ? { axis: "y", index: y } : null;
    }
    canvas.onpointerdown = (event) => {
      if (busy || !loadedImage) return;
      const p = point(event);
      dragging = kind === "extract" && value("mode") === "crop" ? { start: p } : hit(p);
      if (dragging) { canvas.setPointerCapture(event.pointerId); event.preventDefault(); }
    };
    canvas.onpointermove = (event) => {
      if (!dragging || busy) return;
      const p = point(event);
      if (dragging.start) {
        crop = { x: Math.min(p.x, dragging.start.x), y: Math.min(p.y, dragging.start.y), width: Math.abs(p.x - dragging.start.x), height: Math.abs(p.y - dragging.start.y) };
      } else {
        const cuts = dragging.axis === "x" ? xs : ys;
        const min = dragging.index ? cuts[dragging.index - 1] + 0.001 : 0.001;
        const max = dragging.index < cuts.length - 1 ? cuts[dragging.index + 1] - 0.001 : 0.999;
        cuts[dragging.index] = Math.max(min, Math.min(max, p[dragging.axis]));
      }
      drawPreview();
    };
    canvas.onpointerup = canvas.onpointercancel = () => { dragging = null; };
    canvas.ondblclick = (event) => {
      if (busy || (kind === "extract" && value("mode") === "crop")) return;
      const line = hit(point(event));
      if (line) { (line.axis === "x" ? xs : ys).splice(line.index, 1); drawPreview(); }
    };
    async function encode(image, rect, target, background, fit, format = "image/png") {
      C.dimensions(target.width, target.height);
      const out = document.createElement("canvas"); out.width = target.width; out.height = target.height;
      const context = out.getContext("2d");
      if (background !== "transparent") { context.fillStyle = background; context.fillRect(0, 0, out.width, out.height); }
      const d = C.fitRect(rect.width, rect.height, out.width, out.height, fit);
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height, d.x, d.y, d.width, d.height);
      try { return await new Promise((resolve, reject) => out.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片编码失败，请减小尺寸")), format, 0.94)); }
      finally { out.width = out.height = 1; }
    }
    async function processImages() {
      const output = [];
      const input = kind === "sku" ? images() : images().filter((s) => s.id === value("source"));
      if (!input.length) throw new Error("请先选择需要处理的图片");
      if (input.length > 100) throw new Error("一次最多处理 100 张图片");
      const labels = kind === "sku" ? C.lines(value("labels")) : [];
      if (labels.length && labels.length !== input.length) throw new Error("规格分组的行数需要与所选图片数量一致");
      for (const source of input) {
        assertActive();
        const image = await host.drawable(source.data.url);
        assertActive();
        const w = image.naturalWidth, h = image.naturalHeight;
        const rects = kind === "sku" ? [{ x: 0, y: 0, width: w, height: h }]
          : kind === "extract" && value("mode") === "crop" ? [C.cropRect(w, h, crop)]
            : C.gridRects(w, h, xs, ys);
        for (const rect of rects) {
          assertActive();
          const size = kind === "sku" ? C.dimensions(Number(value("width")), Number(value("height"))) : C.dimensions(rect.width, rect.height);
          const background = kind === "sku" ? (value("background") === "custom" ? value("color") : value("background")) : "transparent";
          const blob = await encode(image, rect, size, background, kind === "sku" ? value("fit") : "contain");
          const url = await host.persist(blob); staged.push(url);
          assertActive();
          output.push({ label: `${source.data.label || "图片"} · ${kind === "sku" ? "整理" : rect.row ? `${rect.row}-${rect.col}` : "局部"}`, url,
            sourceNodeId: source.id, sourceRect: rect, imageWidth: size.width, imageHeight: size.height });
          setStatus(`已处理 ${output.length} 张图片`);
        }
      }
      const recipe = C.imageResults(output, kind === "sku" ? "SKU 图片" : kind === "split" ? "详情页切图" : "提取素材", labels);
      // Files imported in this dialog need an original node as well. Existing
      // canvas sources already survive because the transaction only appends.
      const originals = input.filter((s) => s.id.startsWith("upload-"));
      if (originals.length) {
        const y = Math.max(...recipe.nodes.map((n) => n.position.y)) + 700;
        for (const [i, source] of originals.entries()) {
          recipe.nodes.push({ id: source.id, type: "image", position: { x: (i % 4) * 330, y: y + Math.floor(i / 4) * 620 }, data: { ...source.data, label: `${source.data.label} · 原图` } });
        }
        const note = "originals-note";
        recipe.nodes.push({ id: note, type: "text", position: { x: 1320, y }, data: { label: "原始素材", content: "保留导入的完整图片，处理结果位于上方。可再次选择原图进行裁切或调整尺寸。" } });
        recipe.groups.push({ label: "原始素材", nodeIds: [...originals.map((s) => s.id), note] });
      }
      return recipe;
    }
    function saveBlob(blob, name) {
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    async function exportZip() {
      const input = chosen();
      const textNodes = $('[name="includeText"]').checked ? snapshot.nodes.filter((n) => n.type === "text") : [];
      if (!input.length && !textNodes.length) throw new Error("请勾选媒体素材或包含画布文本");
      const files = {}, manifest = [], errors = [];
      let bytes = 0;
      for (let i = 0; i < input.length; i++) {
        assertActive();
        const node = input[i], type = node.type === "layerGroup" ? "image" : node.type;
        setStatus(`准备素材 ${i + 1} / ${input.length}`);
        try {
          let blob = await host.readBlob(node.data.url, type, snapshot.project);
          if (type === "image" && value("format") !== "original") {
            const image = await host.drawable(node.data.url);
            const rect = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
            blob = await encode(image, rect, rect, value("format") === "jpeg" ? "#ffffff" : "transparent", "contain", `image/${value("format")}`);
          }
          if (bytes + blob.size > 256 * 1024 * 1024) throw new Error("超过单包 256 MiB 上限，请分批导出");
          const extension = await host.extension(blob, type);
          const name = `${String(i + 1).padStart(3, "0")}-${String(node.data.label || type).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80)}.${extension}`;
          files[name] = new Uint8Array(await blob.arrayBuffer()); bytes += blob.size;
          manifest.push({ file: name, label: node.data.label, type, nodeId: node.id });
        } catch (e) { errors.push(`${node.data.label || node.id}：${e.message}`); }
      }
      assertActive();
      if (!manifest.length && !textNodes.length) throw new Error(errors.join("\n") || "没有可导出的文件");
      const encoder = new TextEncoder();
      files["素材清单.json"] = encoder.encode(JSON.stringify({ project: snapshot.project?.name, files: manifest, groups: snapshot.groups, failed: errors }, null, 2));
      if (textNodes.length) files["画布文本.txt"] = encoder.encode(textNodes.map((n) => `${n.data.label}\n${n.data.content || ""}`).join("\n\n────────\n\n"));
      if (errors.length) files["未导出说明.txt"] = encoder.encode(errors.join("\n"));
      const { zip } = await import("./vendor/three/jsm/libs/fflate.module.js");
      const result = await new Promise((resolve, reject) => zip(files, { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
      assertActive();
      saveBlob(new Blob([result], { type: "application/zip" }), `${String(snapshot.project?.name || "画布素材").replace(/[<>:"/\\|?*]/g, "_")}-素材.zip`);
      setStatus(`已导出 ${manifest.length} 个素材${textNodes.length ? `和 ${textNodes.length} 条文本` : ""}${errors.length ? `；${errors.length} 项失败，详见包内说明` : ""}`, errors.length > 0);
    }
    $(".case-run").onclick = async () => {
      if (busy) return;
      setBusy(true);
      try {
        assertActive();
        if (kind === "export") { await exportZip(); return; }
        let recipe;
        if (["split", "extract", "sku"].includes(kind)) {
          if ((kind === "split" || kind === "extract") && (!loadedImage || loadedSource !== value("source"))) throw new Error("请等待图片预览加载完成");
          if (kind === "extract" && value("mode") === "crop" && (!crop || crop.width < 0.001 || crop.height < 0.001)) throw new Error("请在预览图片上拖动框选区域");
          recipe = await processImages();
        } else {
          const input = chosen();
          if (kind === "product" && value("source")) input.sort((a, b) => a.id === value("source") ? -1 : b.id === value("source") ? 1 : 0);
          recipe = C.plan(kind, input, { directions: value("directions"), brief: value("brief"), shots: value("shots") });
        }
        assertActive();
        const keep = new Set(recipe.nodes.map((n) => n.data.url).filter(Boolean));
        await discardUnused(keep);
        assertActive();
        host.commit(recipe, snapshot.projectId); committed = true;
        dialog.close();
      } catch (e) {
        if (!closed) {
          // Keep only uploaded sources when a partial processing attempt fails.
          try { await discardUnused(new Set(sources.map((n) => n.data.url))); } catch { /* Preserve evidence and surface the original processing error. */ }
          setStatus(e.message || "操作失败，请重试", true);
        }
      } finally { setBusy(false); if (closed) void cleanup(); }
    };
    renderFields(); void renderSources(); dialog.showModal();
  }
  window.CanvasCasesUI = { open };
})();
