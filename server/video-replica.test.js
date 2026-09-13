const test = require("node:test");
const assert = require("node:assert/strict");
const replica = require("../public/video-replica");

const standard = "free-video-2.0-multimodal-video";
const fast = "free-video-2.0-fast-multimodal-video";
const mini = "free-video-2.0-mini-multimodal-video";

function slot(type, id, data = {}) {
  return {
    node: { id, type, data: { url: `https://media.example.com/${id}.${type === "image" ? "png" : "mp4"}`, ...data } },
    edge: { id: `edge-${id}`, source: id, target: "replica" },
  };
}

function group() {
  return {
    default: "other",
    items: {
      unconfigured: { baseUrl: "https://api.cprt.xyz/v1", label: "智算谷 A", configured: false, models: [{ id: standard, label: "标准" }] },
      other: { baseUrl: "https://video.example.com/v1", label: "其他平台", configured: true, models: [{ id: standard }] },
      configured: { baseUrl: "https://cprt.xyz/v1", label: "智算谷 B", configured: true, models: [{ id: fast }, { id: mini }, { id: fast }] },
    },
  };
}

test("人物与原片角色由类型确定，交换连线顺序仍引用同一素材", () => {
  const character = slot("image", "character");
  const video = slot("video", "source");
  character.edge.data = { label: "原视频" };
  video.edge.data = { label: "人物图" };
  for (const inputs of [[character, video], [video, character]]) {
    const assigned = replica.validateInputs(inputs);
    assert.equal(assigned.character, character);
    assert.equal(assigned.video, video);
    assert.deepEqual(assigned.extras, []);
  }
});

test("缺失素材、多余同类素材和不受支持的节点均拒绝提交", () => {
  const character = slot("image", "character");
  const video = slot("video", "source");
  assert.deepEqual(replica.assignInputs(), { character: null, video: null, extras: [] });
  for (const inputs of [[], [character], [video]]) assert.throws(() => replica.validateInputs(inputs), /请连接/);
  for (const extra of [slot("image", "extra"), slot("video", "extra"), slot("text", "extra"), slot("model3dPreview", "extra"), slot("layerGroup", "extra")]) {
    const assigned = replica.assignInputs([video, extra, character]);
    assert.equal(assigned.extras.length, 1);
    assert.throws(() => replica.validateInputs([video, extra, character]), /多余或类型不符/);
  }
});

test("空态、模拟、加载中及失败素材不能被当成有效参考", () => {
  for (const type of ["image", "video"]) {
    for (const data of [{ url: true }, { url: false }, { url: "" }, { url: "  " }, { url: "not-a-url" }, { url: "javascript:alert(1)" }, { url: "idb-image:" }, { url: "blob:" }, { url: `data:${type}/png;base64,` }, { loading: true }, { error: "读取失败" }]) {
      const inputs = [slot("image", "character"), slot("video", "source")];
      inputs[type === "image" ? 0 : 1] = slot(type, "invalid", data);
      assert.throws(() => replica.validateInputs(inputs), /尚未载入完成或已失效/);
    }
  }
});

test("本地持久化、浏览器对象、嵌入媒体和HTTP素材可正常连接", () => {
  for (const [image, video] of [
    ["idb-image:character-1", "idb-image:video-1"],
    ["blob:http://localhost:8787/image-id", "blob:null/video-id"],
    ["data:image/png;base64,YQ==", "data:video/mp4;base64,Yg=="],
    ["/output/project/character.png", "/output/project/video.mp4"],
    ["https://cdn.example.com/image.png", "http://cdn.example.com/video.mp4"],
  ]) {
    const result = replica.validateInputs([slot("image", "character", { url: image }), slot("video", "source", { url: video })]);
    assert.equal(result.character.node.data.url, image);
    assert.equal(result.video.node.data.url, video);
  }
  assert.throws(() => replica.validateInputs([slot("image", "character", { url: "data:video/mp4;base64,YQ==" }), slot("video", "source")]), /人物参考图/);
});

test("智算谷识别使用URL主机边界，不能靠标签、路径或相似域名命中", () => {
  for (const baseUrl of ["https://cprt.xyz/v1", "https://api.cprt.xyz/v1", "https://VIDEO.CPRT.XYZ/v1", "http://cprt.xyz/v1"]) {
    assert.equal(replica.isSupportedProvider({ baseUrl }), true, baseUrl);
  }
  for (const baseUrl of [undefined, "", "cprt.xyz", "https://notcprt.xyz/v1", "https://cprt.xyz.evil.example/v1", "https://example.com/cprt.xyz", "https://cprt.xyz@example.com/v1", "ftp://cprt.xyz/v1"]) {
    assert.equal(replica.isSupportedProvider({ label: "智算谷", baseUrl }), false, String(baseUrl));
  }
});

test("模型白名单严格限定三个SD2视频参考型号", () => {
  for (const model of [standard, fast, mini]) assert.equal(replica.isSupportedModel(model), true);
  for (const model of ["seedance-2.0", "free-video-2.0", "free-video-2.0-text-to-video", "free-video-2.0-first-frame", `${standard}-extra`, ` ${standard}`, `${standard}\n`, standard.toUpperCase(), "toString", null, true]) {
    assert.equal(replica.isSupportedModel(model), false, String(model));
  }
  const providers = group();
  providers.items.configured.models.push({ id: "free-video-2.0-text-to-video" }, null);
  assert.deepEqual(replica.availableModels(providers), [
    { providerId: "unconfigured", model: standard, label: "标准", providerLabel: "智算谷 A", configured: false },
    { providerId: "configured", model: fast, label: "SD 2.0 Fast · 视频参考", providerLabel: "智算谷 B", configured: true },
    { providerId: "configured", model: mini, label: "SD 2.0 Mini · 视频参考", providerLabel: "智算谷 B", configured: true },
  ]);
  assert.deepEqual(replica.availableModels(), []);
});

test("选择保留有效显式渠道与模型，否则优先已配置的兼容渠道", () => {
  const providers = group();
  assert.deepEqual(replica.selectModel(providers), { providerId: "configured", model: fast });
  assert.deepEqual(replica.selectModel(providers, { providerId: "unconfigured", model: standard }), { providerId: "unconfigured", model: standard });
  assert.deepEqual(replica.selectModel(providers, { providerId: "configured", model: mini }), { providerId: "configured", model: mini });
  assert.deepEqual(replica.selectModel(providers, { providerId: "other", model: standard }), { providerId: "configured", model: fast });
  assert.deepEqual(replica.selectModel(providers, { providerId: "configured", model: standard }), { providerId: "configured", model: fast });
  providers.items.configured.configured = false;
  assert.deepEqual(replica.selectModel(providers), { providerId: "unconfigured", model: standard });
  assert.deepEqual(replica.selectModel({ items: {} }), { providerId: "", model: "" });
});

test("整人替换和面部替换对服装的要求不同，两个模式均保留原片时序", () => {
  const person = replica.buildPrompt();
  assert.match(person, /面部特征、发型和服装以 @图片1 为准/);
  const face = replica.buildPrompt({ replacementMode: "face" });
  assert.match(face, /保留 @视频1 中目标人物的原服装/);
  assert.match(face, /不要使用参考图中的服装/);
  assert.doesNotMatch(face, /面部特征、发型和服装以 @图片1 为准/);
  for (const prompt of [person, face]) {
    assert.match(prompt, /@视频1：原始参考视频/);
    assert.match(prompt, /@图片1：新人物的外观参考/);
    assert.match(prompt, /动作、表情、口型/);
    assert.match(prompt, /手持产品的角度/);
    assert.match(prompt, /场景背景、构图、景别、机位、运镜/);
    assert.match(prompt, /尽量保持原片音频、口播内容、字幕/);
    assert.doesNotMatch(prompt, /完全不变|保证|爆款分析|拆解/);
  }
  assert.equal(replica.buildPrompt({ replacementMode: "unknown" }), person);
});

test("多人指向和补充要求进入提示词，空白补充不会创建无内容段落", () => {
  const prompt = replica.buildPrompt({ targetPerson: "  画面左侧穿黄色上衣的人  ", extra: "  保持手中的红色杯子  " });
  assert.match(prompt, /目标人物：画面左侧穿黄色上衣的人。/);
  assert.match(prompt, /保留其他人物/);
  assert.match(prompt, /补充要求[^\n]+保持手中的红色杯子$/);
  assert.doesNotMatch(replica.buildPrompt({ extra: "  " }), /补充要求/);
});

test("参考视频2至15秒可用，生成时长向上取整且最短4秒有明确提示", () => {
  for (const [duration, seconds] of [[2, 4], [3.99, 4], [4, 4], [4.01, 5], [14.5, 15], [15, 15]]) {
    const result = replica.validateMetadata({ duration, width: 1080, height: 1920 });
    assert.equal(result.seconds, seconds);
    assert.equal(result.duration, duration);
    assert.equal(Boolean(result.warning), duration < 4);
  }
  assert.match(replica.validateMetadata({ duration: 2, width: 1080, height: 1920 }).warning, /时长将长于原片/);
  for (const duration of [0, 1.99, 15.01, -1]) assert.throws(() => replica.validateMetadata({ duration, width: 1080, height: 1920 }), /2～15 秒/);
  for (const duration of [undefined, "5", NaN, Infinity]) assert.throws(() => replica.validateMetadata({ duration, width: 1080, height: 1920 }), /无法读取参考视频时长/);
});

test("元数据需可读取，但不虚构上游未公布的参考分辨率或比例限制", () => {
  for (const [width, height] of [[0, 1920], [1080, -1], [NaN, 1920], [1080, Infinity], ["1080", 1920]]) {
    assert.throws(() => replica.validateMetadata({ duration: 5, width, height }), /无法读取参考视频尺寸/);
  }
  for (const [width, height] of [[640, 360], [3840, 2160], [100, 3000]]) {
    const result = replica.validateMetadata({ duration: 5, width, height });
    assert.equal(result.width, width);
    assert.equal(result.height, height);
  }
});
