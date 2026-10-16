const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const director = require("../public/director3d");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const server = fs.readFileSync(require.resolve("./server.js"), "utf8");
const cprt = require("./cprt-provider");

function load(context, name, text = source) {
  const from = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(text)?.index;
  assert.notEqual(from, undefined, name);
  const next = /\n(?:(?:async )?function |(?:const|let|class) )/.exec(text.slice(from));
  vm.runInContext(text.slice(from, next ? from + next.index : text.length), context);
}

function harness() {
  const state = { nodes: [{ id: "director", type: "model3dPreview", position: { x: 0, y: 0 }, data: {} }], edges: [] };
  const requests = [], messages = [];
  let serial = 0;
  const context = vm.createContext({
    state, window: { Director3D: director, VideoInputs: require("../public/video-inputs") }, nodeId: "director",
    projectLibrary: { activeProjectId: "qa" },
    backendConfig: { providers: { video: { default: "volc", items: { volc: {
      configured: true, models: [{ id: "doubao-seedance-2-0-fast-260128" }],
    } } } } },
    videoAspectOptions: ["16:9"], videoSecondsMin: 4, videoSecondsMax: 15,
    fetch: async () => ({ ok: true, blob: async () => new Blob(["qa"], { type: "video/mp4" }) }),
    persistVideoBlob: async () => "idb-image:previs",
    isCurrentEditor: () => true,
    addNode: (type, position, data) => {
      const id = `node-${++serial}`;
      state.nodes.push({ id, type, position, data: { ...(type === "text" ? { content: "" } : {}), ...data } });
      return id;
    },
    makeId: () => `edge-${++serial}`,
    updateNode: (id, patch) => Object.assign(state.nodes.find((n) => n.id === id).data, patch),
    resolveImageForApi: async (url) => url === "missing" ? "" : `resolved:${url}`,
    klingContextForNode: () => null, getKlingRequestParams: () => null,
    getVideoRatioValue: (d) => d.ratio, getVideoResolutionValue: (d) => d.resolution,
    getVideoMode: (d) => d.videoMode || "reference", normalizeModelValue: (_, m) => m,
    getNodeSize: () => ({ width: 360, height: 280 }),
    clamp: (n, lo, hi) => Math.min(hi, Math.max(lo, n)), hasApiKey: () => true,
    apiFetch: async (_, options) => { requests.push(JSON.parse(options.body)); return { id: "test-task" }; },
    pollVideoTask: async (id) => context.updateNode(id, { loading: false }),
    handleVideoPollingError: (_, error) => messages.push(error.message),
    showToast: (text) => messages.push(text),
    commitHistory() {}, saveState() {}, render() {}, saveScene() {}, showProcessing() {}, hideProcessing() {},
    cloneJson: (value) => JSON.parse(JSON.stringify(value)), Blob, Date,
  });
  vm.runInContext("const activeVideoRuns = new Set();", context);
  for (const name of ["getNode", "incomingNodes", "outgoingNodes", "getReferenceMaterialSlots", "getVideoInputRows", "connectVideoInput", "getNodePrompt", "normalizePromptReferenceMentions", "addEdge", "findOutputVideoNode", "generateVideo", "requestVideoCreate"]) load(context, name);
  for (const name of ["volcVideoCreatePayload", "compactPayload"]) load(context, name, server);
  const from = source.indexOf("  const exportDirectorVideo = async");
  const to = source.indexOf("  const onResize =", from);
  vm.runInContext(source.slice(from, to) + "\nthis.exportVideo = exportDirectorVideo;", context);
  return { context, state, requests, messages, async exported() {
    await context.exportVideo({ count: 96, fps: 24 }, { kind: "custom", title: "自定义首尾", duration: 4, aspect: "16:9" }, { throwIfAborted() {} });
    return {
      config: state.nodes.find((n) => n.type === "videoConfig"),
      text: state.nodes.find((n) => n.type === "text"),
      video: state.nodes.find((n) => n.type === "video"),
    };
  } };
}

test("export → editable scene text → generateVideo → Ark and CPRT retain camera instructions and video reference", async () => {
  const h = harness();
  const { config, text, video } = await h.exported();
  assert.equal(text.data.content, "");
  assert.equal(text.data.directorPromptVersion, 1);
  assert.equal(text.data.text, undefined);
  text.data.content = "汽车在尘土飞扬的越野赛道飞驰";
  assert.equal(h.context.getNodePrompt(config.id), text.data.content);
  await h.context.generateVideo(config.id);
  assert.equal(h.requests.length, 1);
  const request = h.requests[0];
  assert.match(request.prompt, /以 视频1 为镜头设计依据/);
  assert.match(request.prompt, /结束机位/);
  assert.match(request.prompt, /汽车在尘土飞扬的越野赛道飞驰/);
  assert.equal(text.data.content, "汽车在尘土飞扬的越野赛道飞驰");
  assert.deepEqual(request.videos, [`resolved:${video.data.url}`]);
  assert.equal(request.videoMode, "reference");
  const ark = h.context.volcVideoCreatePayload(request.model, request);
  assert.equal(ark.content[0].text, request.prompt);
  assert.equal(ark.content[1].role, "reference_video");
  assert.equal(ark.content[1].video_url.url, request.videos[0]);
  const alternate = cprt.buildCprtCreatePayload("free-video-2.0-multimodal-video", request);
  assert.equal(alternate.prompt, request.prompt);
  assert.deepEqual(alternate.videoUrls, request.videos);
  assert.equal(h.context.findOutputVideoNode(config.id).data.generationPrompt, request.prompt);
});

test("existing workflows get camera guidance without overwriting user text; explicit off remains off", async () => {
  const h = harness();
  const { config, text } = await h.exported();
  delete config.data.directorFollow;
  text.data.text = "旧版隐藏的要求";
  text.data.content = "用户修改后的场景";
  await h.context.generateVideo(config.id);
  assert.match(h.requests[0].prompt, /预演节点规则/);
  assert.match(h.requests[0].prompt, /用户修改后的场景/);
  config.data.directorFollow = false;
  await h.context.generateVideo(config.id);
  assert.equal(h.requests[1].prompt, "用户修改后的场景");
});

test("previs rules reach the provider with empty or disconnected text, and respect a custom style", async () => {
  const h = harness();
  const { config, text } = await h.exported();
  await h.context.generateVideo(config.id);
  assert.match(h.requests[0].prompt, /以 视频1 为镜头设计依据/);
  assert.match(h.requests[0].prompt, /保留预演中的主体，呈现真实材质与自然光影。/);
  assert.doesNotMatch(h.requests[0].prompt, /【画面要求】/);
  text.data.content = "汽车在赛道上飞驰，使用手绘动画风格";
  await h.context.generateVideo(config.id);
  assert.match(h.requests[1].prompt, /明确指定主体外观、环境或风格，则以指定内容为准/);
  assert.match(h.requests[1].prompt, /【画面要求】\n汽车在赛道上飞驰，使用手绘动画风格$/);
  h.state.edges = h.state.edges.filter((edge) => edge.source !== text.id);
  await h.context.generateVideo(config.id);
  assert.equal(h.requests[2].prompt, h.requests[0].prompt);
});

test("legacy auto-filled text migrates once without losing scene descriptions or altering shared prompts", () => {
  const prefix = "保留预演中的主体，呈现真实材质与自然光影。";
  const scene = "汽车在赛道上飞驰，使用手绘动画风格";
  const workflow = {
    nodes: [
      { id: "v", type: "video", data: { directorSource: "d", directorMotion: {} } },
      { id: "c", type: "videoConfig", data: {} },
      { id: "image", type: "imageConfig", data: {} },
      { id: "prompt", type: "text", data: { label: "画面要求", content: `${prefix}\n${scene}` } },
    ],
    edges: [{ source: "v", target: "c" }, { source: "prompt", target: "c" }],
  };
  const original = JSON.stringify(workflow);
  const migrated = director.migratePromptNodes(workflow);
  assert.equal(migrated.nodes.at(-1).data.content, scene);
  assert.equal(migrated.nodes.at(-1).data.directorPromptVersion, 1);
  assert.equal(JSON.stringify(workflow), original);
  assert.deepEqual(director.migratePromptNodes(migrated), migrated);
  // A user can deliberately type the sentence again after the one-time migration.
  migrated.nodes.at(-1).data.content = `${prefix}${scene}`;
  assert.equal(director.migratePromptNodes(migrated).nodes.at(-1).data.content, `${prefix}${scene}`);
  workflow.edges.push({ source: "prompt", target: "image" });
  assert.deepEqual(director.migratePromptNodes(workflow), workflow);
  workflow.edges.pop();
  workflow.nodes[1].data.directorFollow = false;
  assert.deepEqual(director.migratePromptNodes(workflow), workflow);
  delete workflow.nodes[1].data.directorFollow;
  workflow.nodes.at(-1).data.content = `${scene}。${prefix}`;
  assert.deepEqual(director.migratePromptNodes(workflow), workflow);
  workflow.nodes.at(-1).data.content = prefix;
  assert.equal(director.migratePromptNodes(workflow).nodes.at(-1).data.content, "");
});

test("camera reference follows actual video slot after inserting image and video references", async () => {
  const h = harness();
  const { config } = await h.exported();
  h.state.nodes.push({ id: "image", type: "image", data: { url: "image.png" } }, { id: "other", type: "video", data: { url: "other.mp4" } });
  h.state.edges.unshift({ source: "other", target: config.id }, { source: "image", target: config.id });
  await h.context.generateVideo(config.id);
  assert.match(h.requests[0].prompt, /以 视频2 为镜头设计依据/);
  assert.deepEqual(h.requests[0].videos, ["resolved:other.mp4", "resolved:idb-image:previs"]);
  assert.deepEqual(h.requests[0].images, ["resolved:image.png"]);
});

for (const kind of ["missing", "first_last", "multiple"]) {
  test(`${kind} prevents submitting or destroying the previous result`, async () => {
    const h = harness();
    const { config, video } = await h.exported();
    const result = h.context.addNode("video", {}, { url: "existing-result.mp4", loading: false });
    h.context.addEdge(config.id, result, "output");
    if (kind === "missing") video.data.url = "missing";
    if (kind === "first_last") config.data.videoMode = "first_last";
    if (kind === "multiple") {
      const second = h.context.addNode("video", {}, { ...video.data });
      h.context.addEdge(second, config.id, "input");
    }
    await h.context.generateVideo(config.id);
    assert.equal(h.requests.length, 0);
    assert.equal(h.messages.length, 1);
    assert.equal(h.context.getNode(result).data.url, "existing-result.mp4");
  });
}

test("concurrent clicks while assets resolve submit only one video task", async () => {
  const h = harness();
  const { config } = await h.exported();
  let release;
  h.context.resolveImageForApi = () => new Promise((r) => { release = r; });
  const first = h.context.generateVideo(config.id);
  await h.context.generateVideo(config.id);
  release("video.mp4");
  await first;
  assert.equal(h.requests.length, 1);
});

test("ordinary reference videos do not receive director camera requirements", async () => {
  const h = harness();
  const { config, text, video } = await h.exported();
  delete video.data.directorSource;
  h.state.edges.find((e) => e.source === video.id && e.target === config.id).data.videoRole = "reference";
  text.data.content = "普通视频参考";
  await h.context.generateVideo(config.id);
  assert.equal(h.requests[0].prompt, "普通视频参考");
});

test("switching projects during asset reads cancels before creating output or submitting", async () => {
  const h = harness();
  const { config } = await h.exported();
  h.context.resolveImageForApi = async () => {
    h.context.projectLibrary.activeProjectId = "another-project";
    return "video.mp4";
  };
  await h.context.generateVideo(config.id);
  assert.equal(h.requests.length, 0);
  assert.equal(h.context.findOutputVideoNode(config.id), undefined);
  assert.match(h.messages[0], /项目或节点已切换/);
});

test("independent input roles survive replacement and serialization and reach the chosen provider", async () => {
  const h = harness();
  const { config } = await h.exported();
  const image = (name) => h.context.addNode("image", {}, { url: `${name}.png`, label: name });
  const environment = image("environment"), subject = image("subject"), replacement = image("new-environment");
  assert.ok(h.context.connectVideoInput(subject, config.id, "subject"));
  assert.ok(h.context.connectVideoInput(environment, config.id, "environment"));
  assert.ok(h.context.connectVideoInput(replacement, config.id, "environment"));
  assert.ok(h.context.getNode(environment), "replacing a slot must retain the original asset node");
  assert.equal(h.state.edges.some((e) => e.source === environment && e.target === config.id), false);
  const serialized = JSON.parse(JSON.stringify(h.state.edges));
  h.state.edges = serialized;
  const rows = h.context.getVideoInputRows(config.id);
  assert.equal(rows.find((r) => r.role === "subject").node.id, subject);
  assert.equal(rows.find((r) => r.role === "environment").node.id, replacement);
  await h.context.generateVideo(config.id);
  assert.match(h.requests[0].prompt, /图片1 用作主体外观参考/);
  assert.match(h.requests[0].prompt, /图片2 用作环境场景参考/);
  assert.deepEqual(h.requests[0].images, ["resolved:subject.png", "resolved:new-environment.png"]);
  const before = JSON.stringify(h.state.edges);
  assert.equal(h.context.connectVideoInput(subject, config.id, "camera"), false);
  assert.equal(JSON.stringify(h.state.edges), before);
});

test("first/last image slots preserve their roles when connected in reverse order", async () => {
  const h = harness();
  const { config, video } = await h.exported();
  h.state.edges = h.state.edges.filter((e) => e.source !== video.id);
  config.data.videoMode = "first_last";
  const last = h.context.addNode("image", {}, { url: "last.png" });
  const first = h.context.addNode("image", {}, { url: "first.png" });
  h.context.connectVideoInput(last, config.id, "last");
  h.context.connectVideoInput(first, config.id, "first");
  await h.context.generateVideo(config.id);
  assert.deepEqual(h.requests[0].images, ["resolved:first.png", "resolved:last.png"]);
  const payload = h.context.volcVideoCreatePayload(h.requests[0].model, h.requests[0]);
  assert.equal(payload.content[1].role, "first_frame");
  assert.equal(payload.content[1].image_url.url, "resolved:first.png");
  assert.equal(payload.content[2].role, "last_frame");
});

test("a lone last-frame input is never submitted as a first frame", async () => {
  const h = harness();
  const { config, video } = await h.exported();
  h.state.edges = h.state.edges.filter((e) => e.source !== video.id);
  config.data.videoMode = "first_last";
  const last = h.context.addNode("image", {}, { url: "last.png" });
  h.context.connectVideoInput(last, config.id, "last");
  await h.context.generateVideo(config.id);
  assert.equal(h.requests.length, 0);
  assert.match(h.messages.at(-1), /请先连接首帧图片/);
});
