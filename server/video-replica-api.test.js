const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Readable } = require("node:stream");

const MODEL = "free-video-2.0-multimodal-video";
const serverPath = path.join(__dirname, "server.js");
const serverSource = fs.readFileSync(serverPath, "utf8");

// Run the production HTTP handler with isolated configuration, session, billing
// and upstream boundaries. No real settings, database, socket or API is used.
function createHarness({ providerOverrides = {}, upstream } = {}) {
  const requests = [];
  const transactions = [];
  const usage = [];
  let balance = 100;
  let handler;
  const provider = {
    label: "Test CPRT",
    baseUrl: "https://ai-api.cprt.xyz/v1",
    apiKey: "test-key-not-a-real-credential",
    defaultModel: MODEL,
    models: [MODEL, "free-video-2.0-fast-multimodal-video", "free-video-2.5-multimodal-video"].map((id) => ({ id, label: id })),
    ...providerOverrides,
  };
  const settings = JSON.stringify({ providers: { video: { default: "cprt", items: { cprt: provider } } } });
  const boundaries = {
    http: { createServer(callback) { handler = callback; return { listen() {} }; } },
    fs: {
      existsSync: () => false,
      readFileSync(filePath) {
        assert.equal(path.basename(filePath), ".huobao-settings.json");
        return settings;
      },
      appendFileSync() {},
    },
    path,
    crypto: require("node:crypto"),
    "./db": {
      userCount: () => 1,
      lookupSession: (token) => token === "test-session" ? { user: { id: 7 } } : null,
      adjustBalance(entry) { balance += entry.delta; transactions.push({ ...entry }); return balance; },
      recordApiUsage(entry) { usage.push({ ...entry }); },
    },
    "./kling-cli": { createKlingCli: () => ({}), isKlingProvider: (item) => item.adapter === "kling-cli" },
    "./cprt-provider": require("./cprt-provider"),
    "./image-routing": require("./image-routing"),
    "../public/gpt-image-models": require("../public/gpt-image-models"),
    "../public/video-replica": require("../public/video-replica"),
    "./upstream-http": {
      async requestText(url, options) {
        requests.push({ url, ...options });
        return upstream ? upstream(url, options) : { ok: true, status: 200, text: JSON.stringify({ taskId: "replica-task", status: "QUEUED" }) };
      },
    },
  };
  vm.runInNewContext(serverSource, {
    require(id) { assert.ok(Object.hasOwn(boundaries, id), `Unexpected dependency: ${id}`); return boundaries[id]; },
    __dirname,
    __filename: serverPath,
    process: { env: {} },
    console: { log() {}, error() {} },
    Buffer, URL, Blob, FormData, Response,
    fetch: async (url, options) => {
      assert.equal(url, "https://ai-api.cprt.xyz/v1/chat/asyncTask", "only the configured CPRT creation route may be called");
      const result = await boundaries["./upstream-http"].requestText(url, options);
      return { ok: result.ok, status: result.status, text: async () => result.text };
    },
  }, { filename: serverPath });
  assert.equal(typeof handler, "function");
  return {
    requests, transactions, usage,
    get balance() { return balance; },
    async create(body, authenticated = true) {
      const req = Readable.from([Buffer.from(JSON.stringify(body))]);
      req.method = "POST";
      req.url = "/api/video/create";
      req.headers = { host: "unit.test", ...(authenticated ? { cookie: "huobao_session=test-session" } : {}) };
      let result;
      const res = {
        writeHead(status) { this.status = status; },
        end(value) { result = { status: this.status, body: JSON.parse(value) }; },
      };
      await handler(req, res);
      assert.ok(result, "HTTP response completed");
      return result;
    },
  };
}

function input(overrides = {}) {
  return {
    workflow: "video-replica", providerId: "cprt", model: MODEL,
    prompt: "编辑参考视频，按图片替换人物形象并保持场景和动作。",
    videoMode: "reference", seconds: 8, resolution: "720p", ratio: "9:16",
    images: ["https://cdn.example.test/character.png"], videos: ["https://cdn.example.test/reference.mp4"],
    generateAudio: true, realPersonMode: true, conversionSlots: ["all"],
    ...overrides,
  };
}

test("replica creation sends both ordered media inputs through CPRT and charges once", async () => {
  const harness = createHarness();
  const result = await harness.create(input({ seconds: 9, duration: 1 }));
  assert.equal(result.status, 200, result.body.error);
  assert.equal(result.body.id, "replica-task");
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, "https://ai-api.cprt.xyz/v1/chat/asyncTask");
  const payload = JSON.parse(harness.requests[0].body);
  assert.equal(payload.model, MODEL);
  assert.equal(payload.duration, 9, "unvalidated duration alias cannot change the selected duration");
  assert.deepEqual(payload.imageUrls, input().images);
  assert.deepEqual(payload.videoUrls, input().videos);
  assert.deepEqual(payload.audioUrls, []);
  assert.equal(payload.generateAudio, true);
  assert.equal(payload.realPersonMode, true);
  assert.deepEqual(payload.conversionSlots, ["all"]);
  assert.equal(harness.balance, 40);
  assert.deepEqual(harness.transactions.map(({ delta, type }) => ({ delta, type })), [{ delta: -60, type: "spend" }]);
  assert.equal(harness.usage.length, 1);
});

const invalidRequests = [
  ["missing provider id", { providerId: "" }],
  ["unknown provider id cannot fall back", { providerId: "missing" }],
  ["inherited provider property cannot fall back", { providerId: "toString" }],
  ["missing model cannot use its default", { model: "" }],
  ["SD2.5 model is not SD2.0", { model: "free-video-2.5-multimodal-video" }],
  ["unsupported route", { model: "free-video-2.0-image-to-video" }],
  ["model missing from provider pool", { model: "free-video-2.0-mini-multimodal-video" }],
  ["missing character", { images: [] }],
  ["multiple characters", { images: ["one", "two"] }],
  ["empty character", { images: ["  "] }],
  ["invalid video value", { videos: [{}] }],
  ["missing video", { videos: [] }],
  ["multiple videos", { videos: ["one", "two"] }],
  ["first-last mode", { videoMode: "first_last" }],
  ["short duration", { seconds: 3 }],
  ["long duration", { seconds: 16 }],
  ["fractional duration", { seconds: 7.5 }],
  ["string duration", { seconds: "8" }],
  ["unsupported resolution", { resolution: "1080p" }],
  ["unsupported ratio", { ratio: "2:3" }],
  ["audio disabled", { generateAudio: false }],
  ["real person disabled", { realPersonMode: false }],
  ["partial conversion slots", { conversionSlots: ["image1"] }],
  ["missing prompt", { prompt: "" }],
  ["oversized prompt", { prompt: "a".repeat(20481) }],
];
for (const [name, patch] of invalidRequests) {
  test(`replica rejects ${name} before any charge or upstream request`, async () => {
    const harness = createHarness();
    const result = await harness.create(input(patch));
    assert.equal(result.status, 400, result.body.error);
    assert.equal(harness.balance, 100);
    assert.deepEqual(harness.transactions, []);
    assert.deepEqual(harness.usage, []);
    assert.deepEqual(harness.requests, []);
  });
}

for (const [name, providerOverrides] of [
  ["another provider host", { baseUrl: "https://147ai.com/v1" }],
  ["deceptive provider host", { baseUrl: "https://ai-api.cprt.xyz.attacker.test/v1" }],
  ["provider URL not handled by the existing CPRT router", { baseUrl: "https://ai-api.cprt.xyz:9443/v1" }],
  ["missing key", { apiKey: "" }],
]) {
  test(`replica rejects ${name} before billing`, async () => {
    const harness = createHarness({ providerOverrides });
    assert.equal((await harness.create(input())).status, 400);
    assert.equal(harness.balance, 100);
    assert.deepEqual(harness.transactions, []);
    assert.deepEqual(harness.requests, []);
  });
}

test("replica still requires an authenticated canvas user", async () => {
  const harness = createHarness();
  assert.equal((await harness.create(input(), false)).status, 401);
  assert.deepEqual(harness.transactions, []);
  assert.deepEqual(harness.requests, []);
});

test("replica refunds the single charge when CPRT creation fails", async () => {
  const harness = createHarness({ upstream: () => ({ ok: false, status: 503, text: JSON.stringify({ error: { message: "mock unavailable" } }) }) });
  const result = await harness.create(input());
  assert.equal(result.status, 503, result.body.error);
  assert.equal(harness.balance, 100);
  assert.deepEqual(harness.transactions.map(({ delta, type }) => ({ delta, type })), [
    { delta: -60, type: "spend" }, { delta: 60, type: "refund" },
  ]);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.usage[0].cost, 0);
});

test("ordinary video requests retain their existing provider fallback and model routing", async () => {
  const harness = createHarness();
  const body = input({ model: "free-video-2.5-multimodal-video", providerId: "missing" });
  delete body.workflow;
  const result = await harness.create(body);
  assert.equal(result.status, 200, result.body.error);
  assert.equal(JSON.parse(harness.requests[0].body).model, "free-video-2.5-multimodal-video");
});
