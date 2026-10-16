(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Director3D = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const clamp = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
  const motions = { dollyIn: "推进", dollyOut: "拉远", truck: "横移", crane: "升降", orbit: "环绕", custom: "自定义首尾" };
  function camera(value) {
    if (!value || ![value.position, value.target].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return null;
    if (Math.hypot(...value.position.map((v, i) => v - value.target[i])) < 0.01) return null;
    return { position: [...value.position], target: [...value.target], fov: clamp(value.fov, 10, 90, 35) };
  }
  function normalize(value = {}) {
    const m = value?.motion || {};
    const seen = new Set();
    return {
      shots: (Array.isArray(value?.shots) ? value.shots : []).filter((s) => {
        if (!s || typeof s.id !== "string" || seen.has(s.id) || !camera(s.camera)) return false;
        seen.add(s.id); return true;
      }).slice(0, 24).map((s) => ({ id: s.id, name: String(s.name || "未命名机位").slice(0, 80), camera: camera(s.camera), aspect: ["16:9", "9:16", "1:1", "4:3", "3:4", "2:3", "3:2", "21:9"].includes(s.aspect) ? s.aspect : "16:9" })),
      motion: { kind: Object.hasOwn(motions, m.kind) ? m.kind : "dollyIn", duration: clamp(m.duration, 1, 30, 4), easing: m.easing === "linear" ? "linear" : "smooth", start: camera(m.start), end: camera(m.end) },
    };
  }
  function endpoint(startValue, kind) {
    const start = camera(startValue);
    if (!start) throw new Error("机位数据无效，请重新记录起点");
    const end = copy(start);
    const delta = start.position.map((v, i) => v - start.target[i]);
    const distance = Math.hypot(...delta);
    if (kind === "dollyIn" || kind === "dollyOut") {
      const factor = kind === "dollyIn" ? 0.65 : 1.4;
      end.position = start.target.map((v, i) => v + delta[i] * factor);
    } else if (kind === "truck") {
      const horizontal = Math.hypot(delta[0], delta[2]) || 1;
      const offset = [delta[2] / horizontal * distance * 0.35, 0, -delta[0] / horizontal * distance * 0.35];
      end.position = start.position.map((v, i) => v + offset[i]);
      end.target = start.target.map((v, i) => v + offset[i]);
    } else if (kind === "crane") {
      end.position[1] += distance * 0.3;
      end.target[1] += distance * 0.3;
    } else if (kind === "orbit") {
      const a = Math.PI / 4;
      end.position = [start.target[0] + delta[0] * Math.cos(a) + delta[2] * Math.sin(a), start.position[1], start.target[2] - delta[0] * Math.sin(a) + delta[2] * Math.cos(a)];
    }
    return end;
  }
  function sample(motion, progress) {
    const start = camera(motion.start);
    const end = camera(motion.end);
    if (!start || !end) throw new Error("请先记录运镜起点和终点");
    let t = clamp(progress, 0, 1, 0);
    if (motion.easing !== "linear") t = t * t * (3 - 2 * t);
    const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * t);
    const result = { position: lerp(start.position, end.position), target: lerp(start.target, end.target), fov: start.fov + (end.fov - start.fov) * t };
    if (motion.kind === "orbit") {
      const d = start.position.map((v, i) => v - start.target[i]);
      const a = Math.PI / 4 * t;
      result.position = [start.target[0] + d[0] * Math.cos(a) + d[2] * Math.sin(a), start.position[1], start.target[2] - d[0] * Math.sin(a) + d[2] * Math.cos(a)];
      result.target = [...start.target];
    }
    if (!camera(result)) throw new Error("运镜经过对焦点，请调整首尾机位的位置");
    return result;
  }
  function validateMotion(motion) {
    const start = camera(motion?.start), end = camera(motion?.end);
    if (!start || !end) throw new Error("请先记录运镜起点和终点");
    if (motion.kind !== "orbit") {
      const a = start.position.map((v, i) => v - start.target[i]);
      const d = end.position.map((v, i) => v - end.target[i] - a[i]);
      const length = d.reduce((sum, v) => sum + v * v, 0);
      const t = length ? clamp(-a.reduce((sum, v, i) => sum + v * d[i], 0) / length, 0, 1, 0) : 0;
      if (Math.hypot(...a.map((v, i) => v + t * d[i])) < 0.01) throw new Error("运镜经过对焦点，请调整首尾机位的位置");
    }
  }
  function exportSettings(duration, aspect) {
    const ratio = String(aspect).split(":").map(Number);
    const ar = ratio[0] / ratio[1];
    if (!(ar >= 1 / 4 && ar <= 4) || !Number.isFinite(duration) || duration < 1 || duration > 30) throw new Error("预演时长需为 1–30 秒，请检查画面比例");
    const width = ar >= 1 ? 960 : Math.round(960 * ar / 2) * 2;
    const height = ar >= 1 ? Math.round(960 / ar / 2) * 2 : 960;
    return { width, height, fps: 24, count: Math.round(duration * 24) };
  }
  function seedanceTarget(group) {
    const entries = Object.entries(group?.items || {});
    entries.sort(([a], [b]) => Number(b === group?.default) - Number(a === group?.default));
    for (const [providerId, provider] of entries) {
      if (!provider.configured) continue;
      const models = [...(provider.models || [])].sort((a, b) => Number(b.id === provider.defaultModel) - Number(a.id === provider.defaultModel));
      const model = models.find((m) => /^doubao-seedance-2-0(?:-fast|-mini)?-\d+$/i.test(m.id)
        || (/cprt\./i.test(provider.baseUrl || "") && /^free-video-2\.0(?:-fast|-mini)?-multimodal-video$/i.test(m.id)));
      if (model) return { providerId, model: model.id };
    }
    return null;
  }
  function previsSlots(slots) {
    return slots.filter((slot) => slot.kind === "video" && (slot.edge?.data?.videoRole === "camera" || (slot.node?.data?.directorSource && slot.node.data.directorMotion)));
  }
  const defaultSceneRule = "保留预演中的主体，呈现真实材质与自然光影。";
  function migratePromptNodes(workflow) {
    const nodes = workflow.nodes || [], edges = workflow.edges || [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const targets = new Set(edges.filter((edge) => {
      const source = byId.get(edge.source), target = byId.get(edge.target);
      return source?.type === "video" && source.data?.directorSource && source.data.directorMotion
        && target?.type === "videoConfig" && target.data?.directorFollow !== false && target.data?.videoMode !== "first_last";
    }).map((edge) => edge.target));
    return { ...workflow, nodes: nodes.map((node) => {
      if (node.type !== "text" || node.data?.directorPromptVersion || !["画面要求", "预演成片要求"].includes(node.data?.label)) return node;
      const content = node.data.content;
      if (typeof content !== "string" || !content.trimStart().startsWith(defaultSceneRule)) return node;
      const outputs = edges.filter((edge) => edge.source === node.id);
      // Shared prompts must retain their content for workflows without the built-in rule.
      if (!outputs.length || outputs.some((edge) => !targets.has(edge.target))) return node;
      return { ...node, data: { ...node.data, content: content.trimStart().slice(defaultSceneRule.length).trimStart(), directorPromptVersion: 1 } };
    }) };
  }
  function cameraGuidance(slots) {
    const refs = previsSlots(slots);
    if (!refs.length) return "";
    if (refs.length > 1) throw new Error("跟随预演镜头时只连接一段预演视频，请断开多余的预演连线");
    const ref = refs[0];
    return `以 ${ref.token} 为镜头设计依据，按时间顺序复现其起始机位、结束机位、拍摄方向、景别、主体在画面中的位置与占比，以及相机运动的路径、方向和节奏。保持连续镜头，不自行切镜或改成另一条运镜路线。\n默认成片要求：${defaultSceneRule}若画面要求或参考素材明确指定主体外观、环境或风格，则以指定内容为准。\n主体动作、场景和外观按画面要求呈现；主体运动时，仍保持预演中相机相对主体的视角变化。预演中的灰模材质、空白背景和辅助线不作为成片风格。${slots.some((slot) => slot.kind === "image") ? "参考图片按各自指定的主体或环境用途使用，不以静态图片构图替代预演的镜头变化。" : ""}`;
  }
  function videoPrompt(prompt, slots, data = {}) {
    const refs = previsSlots(slots);
    if (refs.length && data.videoMode === "first_last") throw new Error("首尾帧模式不会使用预演视频，请切回智能多参，或断开预演视频并连接首尾帧图片");
    const guidance = data.directorFollow !== false ? cameraGuidance(slots) : "";
    const scene = String(prompt || "").trim();
    return guidance ? `【预演节点规则】\n${guidance}${scene ? `\n\n【画面要求】\n${scene}` : ""}` : prompt || "make animate";
  }
  function scenePreset(kind = "studio") {
    const object = (kind, name, position, scale, color, rotation = [0, 0, 0]) => ({ kind, name, position, scale, color, rotation });
    const floor = object("plane", "摄影棚地面", [0, 0, 0], [4, 4, 4], "#d9d7d1", [-Math.PI / 2, 0, 0]);
    if (kind === "dialogue") return [floor,
      object("actor", "角色 A", [-0.85, 0, 0], [1, 1, 1], "#6988a1", [0, Math.PI / 3, 0]),
      object("actor", "角色 B", [0.85, 0, 0], [1, 1, 1], "#bb846a", [0, -Math.PI / 3, 0]),
    ];
    if (kind === "product") return [floor,
      object("cylinder", "产品展台", [0, 0.45, 0], [1.8, 0.9, 1.8], "#b6b0a2"),
      object("box", "产品占位", [0, 1.3, 0], [0.5, 0.8, 0.4], "#6988a1"),
    ];
    return [floor, object("actor", "主角", [0, 0, 0], [1, 1, 1], "#6988a1"),
      object("box", "背景墙", [0, 1.5, -2], [8, 3, 0.15], "#cbc8c1")];
  }
  function initialView() {
    return { renderMode: "material", aspect: "16:9", background: "#e3e1dc", shot: { position: [3.3, 2.2, 6], target: [0, 0.95, 0], fov: 35 }, primitives: scenePreset(), showGrid: true };
  }

  // UI 只编排已有 Model3D 控制器；机位、运镜元数据与节点一起保存。
  function mountUI({ overlay, controller, data, getAspect, applyAspect, syncCamera, save, exportFrames, exportVideo, notice, importModel, escapeHtml }) {
    let state = normalize(data);
    let raf = 0;
    let playing = false;
    let exporting = false;
    let disposed = false;
    let progress = 0;
    let exportAbort = null;
    let restoreExportView = null;
    const side = overlay.querySelector(".model3d-side");
    const body = overlay.querySelector(".model3d-body");
    const shelf = document.createElement("div");
    shelf.className = "director-shelf";
    shelf.innerHTML = `<div><b>布置现场</b><span>角色 · 场景 · 灯光</span></div>
      <button data-director="actor">＋ 站姿角色</button><button data-director="seatedActor">＋ 坐姿角色</button>
      <select aria-label="场景布置" data-director-field="set"><option value="dialogue">双人对话</option><option value="product">产品展台</option><option value="studio">人物摄影棚</option></select>
      <button data-director="set">添加布置</button><button data-director="import">导入场景模型</button>`;
    body.before(shelf);
    const cameras = document.createElement("section");
    cameras.className = "director-cameras";
    cameras.innerHTML = `<div class="director-section-head"><strong>机位库</strong><span data-director-count>0 / 24</span></div>
      <div class="director-save-row"><input data-director-field="name" aria-label="机位名称" placeholder="例如：主角近景" maxlength="80"><button data-director="save-shot">保存机位</button></div>
      <div class="director-shot-list"></div><p>保存摄像机的位置、焦段和画面比例。</p>`;
    side.append(cameras);
    const timeline = document.createElement("section");
    timeline.className = "director-timeline";
    timeline.innerHTML = `<div class="director-motion-head"><strong>运镜排练</strong><span>先确定起点，再预览镜头运动</span></div>
      <div class="director-motion-controls">
        <select aria-label="运镜方式" data-director-field="kind">${Object.entries(motions).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
        <button data-director="start">记录起点</button><button data-director="end">记录终点</button>
        <label>时长 <input aria-label="运镜时长" data-director-field="duration" type="number" min="1" max="30" step="1"> 秒</label>
        <select aria-label="运镜速度" data-director-field="easing"><option value="smooth">缓入缓出</option><option value="linear">匀速</option></select>
        <button data-director="play">▶ 预览运镜</button><button data-director="reset-motion">回到起点</button>
        <button data-director="export">输出首尾帧</button>
        <button class="director-primary" data-director="export-video">输出预演视频</button>
        <button data-director="cancel-export" hidden>取消导出</button>
      </div><div class="director-scrub"><span>起点</span><input aria-label="运镜进度" data-director-field="progress" type="range" min="0" max="1000" value="0"><output>0.0s / 4.0s</output><span>终点</span></div>
      <div class="director-motion-status" role="status"></div>`;
    body.after(timeline);
    const field = (name) => overlay.querySelector(`[data-director-field="${name}"]`);
    const button = (name) => overlay.querySelector(`[data-director="${name}"]`);
    const report = (text) => { timeline.querySelector(".director-motion-status").textContent = text; };
    function changed() { if (!disposed) save(copy(state)); }
    function stop() {
      const wasPlaying = playing;
      cancelAnimationFrame(raf); raf = 0; playing = false;
      // 外层 pointerdown 也会调用 stop；只有预览持有的锁才在此释放。
      if (wasPlaying && !exporting) controller.setInteractionEnabled(true);
      button("play").textContent = "▶ 预览运镜";
    }
    function showCamera(shot) {
      controller.setViewMode("shot"); controller.setShot(shot); syncCamera();
    }
    function scrub(t) {
      const shot = sample(state.motion, t);
      showCamera(shot); progress = t;
      field("progress").value = String(Math.round(t * 1000));
      timeline.querySelector("output").textContent = `${(t * state.motion.duration).toFixed(1)}s / ${state.motion.duration.toFixed(1)}s`;
    }
    function refresh() {
      field("kind").value = state.motion.kind;
      field("duration").value = state.motion.duration;
      field("easing").value = state.motion.easing;
      button("end").disabled = state.motion.kind !== "custom";
      const ready = Boolean(state.motion.start && state.motion.end);
      for (const name of ["play", "reset-motion", "export", "export-video"]) button(name).disabled = !ready || exporting;
      field("progress").disabled = !ready || exporting;
      button("save-shot").disabled = state.shots.length >= 24;
      cameras.querySelector("[data-director-count]").textContent = `${state.shots.length} / 24`;
      cameras.querySelector(".director-shot-list").innerHTML = state.shots.length ? state.shots.map((shot, i) => `<div class="director-shot">
        <button data-director="recall" data-shot="${escapeHtml(shot.id)}"><span>${String(i + 1).padStart(2, "0")}</span><b>${escapeHtml(shot.name)}</b><small>${escapeHtml(shot.aspect)} · ${shot.camera.fov.toFixed(0)}°</small></button>
        <button data-director="remove-shot" data-shot="${escapeHtml(shot.id)}" aria-label="删除机位 ${escapeHtml(shot.name)}" title="删除机位">×</button></div>`).join("") : `<div class="director-empty">摆好摄像机，保存你的第一个机位。</div>`;
      timeline.querySelector("output").textContent = `${(progress * state.motion.duration).toFixed(1)}s / ${state.motion.duration.toFixed(1)}s`;
      report(ready ? `${motions[state.motion.kind]} · ${state.motion.duration} 秒 · 可拖动进度条检查构图` : state.motion.start ? "起点已记录；调整摄像机后记录终点。" : "在摄像机视角中调整构图，点击「记录起点」。");
    }
    async function onClick(event) {
      const target = event.target.closest("[data-director]");
      if (target?.dataset.director === "cancel-export") { exportAbort?.abort(); return; }
      if (!target || disposed || exporting) return;
      const action = target.dataset.director;
      try {
        if (action !== "play") stop();
        if (action === "actor" || action === "seatedActor") {
          controller.addPrimitive(action);
          const count = controller.getState().primitives.filter((p) => /actor/i.test(p.kind)).length;
          controller.setSelectedTransform("position", 0, (count - 1) * 0.75);
          controller.setPrimitiveColor(count % 2 ? "#6988a1" : "#bb846a");
          controller.renameSelected(`角色 ${count}`);
        } else if (action === "set") {
          const view = controller.getState();
          controller.setState({ primitives: [...view.primitives, ...scenePreset(field("set").value)] });
          controller.deselect();
        } else if (action === "import") { importModel();
        } else if (action === "save-shot") {
          if (state.shots.length >= 24) return;
          state.shots.push({ id: crypto.randomUUID(), name: field("name").value.trim() || `机位 ${state.shots.length + 1}`, camera: controller.getShot(), aspect: getAspect() });
          field("name").value = "";
        } else if (action === "remove-shot") {
          state.shots = state.shots.filter((s) => s.id !== target.dataset.shot);
        } else if (action === "recall") {
          const shot = state.shots.find((s) => s.id === target.dataset.shot);
          if (shot) { applyAspect(shot.aspect); showCamera(shot.camera); }
        } else if (action === "start") {
          state.motion.start = controller.getShot();
          state.motion.end = state.motion.kind === "custom" ? null : endpoint(state.motion.start, state.motion.kind);
          progress = 0; field("progress").value = "0";
        } else if (action === "end") {
          state.motion.end = controller.getShot();
        } else if (action === "reset-motion") { scrub(0);
        } else if (action === "play") {
          if (playing) { stop(); return; }
          // 预先检查整条路径，避免相机穿过对焦点后翻转。
          validateMotion(state.motion);
          playing = true; controller.deselect(); controller.setInteractionEnabled(false);
          button("play").textContent = "Ⅱ 停止预览";
          const started = performance.now() - (progress >= 1 ? 0 : progress * state.motion.duration * 1000);
          const frame = (now) => {
            if (disposed || !playing) return;
            try {
              const t = Math.min(1, (now - started) / (state.motion.duration * 1000));
              scrub(t);
              if (t < 1) raf = requestAnimationFrame(frame);
              else { stop(); changed(); }
            } catch (error) { stop(); report(error.message); }
          };
          raf = requestAnimationFrame(frame); return;
        } else if (action === "export-video") {
          if (typeof exportVideo !== "function") throw new Error("预演导出未就绪，请刷新页面");
          validateMotion(state.motion);
          const aspect = getAspect(), motion = { ...copy(state.motion), aspect, title: motions[state.motion.kind] };
          const settings = exportSettings(motion.duration, aspect);
          changed();
          const current = controller.getShot(), mode = controller.getViewMode();
          const disabled = [...overlay.querySelectorAll("button, input, select")].map((el) => [el, el.disabled]);
          exporting = true; exportAbort = new AbortController();
          const signal = exportAbort.signal;
          restoreExportView = () => { controller.setShot(current); controller.setViewMode(mode); syncCamera(); };
          disabled.forEach(([el]) => { if (el.dataset.m3d !== "cancel" && el.dataset.director !== "cancel-export") el.disabled = true; });
          button("cancel-export").hidden = false;
          controller.setInteractionEnabled(false);
          try {
            const frames = [];
            let bytes = 0;
            for (let i = 0; i < settings.count; i++) {
              signal.throwIfAborted();
              controller.setShot(sample(motion, i / (settings.count - 1)));
              const frame = controller.captureCanvas(settings.width / settings.height, settings).toDataURL("image/jpeg", 0.88);
              bytes += frame.length;
              if (bytes > 48 * 1024 * 1024) throw new Error("预演素材过大，请缩短运镜时长后重试");
              frames.push(frame);
              report(`正在渲染预演 ${i + 1} / ${settings.count} 帧`);
              // 让界面和取消按钮能及时响应；时间由帧编号决定，不依赖机器帧率。
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            restoreExportView(); restoreExportView = null;
            signal.throwIfAborted(); report("正在编码 MP4…");
            await exportVideo({ ...settings, frames }, motion, signal);
            if (!disposed) notice("预演视频已输出到画布");
          } catch (error) {
            if (!disposed) notice(signal.aborted ? "已取消预演导出" : `预演导出失败：${error.message}`);
          } finally {
            if (!disposed) {
              restoreExportView?.();
              controller.setInteractionEnabled(true);
              disabled.forEach(([el, value]) => { el.disabled = value; });
              button("cancel-export").hidden = true;
            }
            exporting = false; exportAbort = null; restoreExportView = null;
            if (!disposed) refresh();
          }
          return;
        } else if (action === "export") {
          validateMotion(state.motion);
          const current = controller.getShot();
          const currentMode = controller.getViewMode();
          exporting = true; refresh(); report("正在保存首尾帧…");
          try {
            let frames;
            try {
              frames = [0, 1].map((t) => {
                controller.setShot(sample(state.motion, t));
                return { label: t ? "运镜尾帧" : "运镜首帧", url: controller.capture("image/png", getAspect().split(":").reduce((a, b) => Number(a) / Number(b))), camera: controller.getShot() };
              });
            } finally {
              controller.setShot(current); controller.setViewMode(currentMode); syncCamera();
            }
            await exportFrames(frames, { ...copy(state.motion), aspect: getAspect(), title: motions[state.motion.kind] });
            if (!disposed) notice("首尾帧已输出到画布，可连接视频生成节点");
          } finally {
            exporting = false;
            if (!disposed) refresh();
          }
          return;
        }
        changed(); refresh();
      } catch (error) { if (!disposed) { report(error.message); notice(error.message); } }
    }
    function onInput(event) {
      const name = event.target.dataset.directorField;
      if (!name || disposed || exporting || name === "name" || name === "set") return;
      stop();
      try {
        if (name === "progress") { scrub(Number(event.target.value) / 1000); return; }
        if (name === "kind") {
          state.motion.kind = event.target.value;
          state.motion.end = state.motion.start && state.motion.kind !== "custom" ? endpoint(state.motion.start, state.motion.kind) : null;
        } else if (name === "duration") state.motion.duration = clamp(event.target.value, 1, 30, 4);
        else if (name === "easing") state.motion.easing = event.target.value;
        changed(); refresh();
      } catch (error) { report(error.message); }
    }
    overlay.addEventListener("click", onClick);
    overlay.addEventListener("input", onInput);
    refresh();
    return {
      getData: () => copy(state),
      isBusy: () => exporting,
      cancelExport() { exportAbort?.abort(); restoreExportView?.(); restoreExportView = null; },
      stop,
      dispose() { exportAbort?.abort(); disposed = true; stop(); overlay.removeEventListener("click", onClick); overlay.removeEventListener("input", onInput); },
    };
  }
  return { camera, normalize, endpoint, sample, validateMotion, exportSettings, seedanceTarget, previsSlots, migratePromptNodes, cameraGuidance, videoPrompt, scenePreset, initialView, mountUI };
});
