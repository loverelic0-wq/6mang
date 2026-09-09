const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Readable } = require("node:stream");

const serverPath = path.join(__dirname, "server.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
const MODEL_IDS = ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"];
const TIMEOUT_MS = 15 * 60 * 1000;
const IMAGE_RESULT = { data: [{ b64_json: "test-image-result" }] };
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=",
  "base64",
);
const IMAGE_URL = `data:image/png;base64,${PNG.toString("base64")}`;
const INPUT_MODES = [
  { name: "JSON generation", references: undefined, route: "generations", count: 0 },
  { name: "single-image multipart edit", references: IMAGE_URL, route: "edits", count: 1 },
  { name: "multiple-image multipart edit", references: [IMAGE_URL, IMAGE_URL], route: "edits", count: 2 },
];

// Execute the production HTTP handler, including handleApi, routing, encoding, and
// billing. Only external boundaries are replaced: no real config, DB, socket,
// environment variables, CLI process, or upstream request is touched.
function createApiHarness({ upstream, providerOverrides = {} } = {}) {
  const requests = [];
  const transactions = [];
  const usage = [];
  const events = [];
  let balance = 100;
  let handler;
  const provider = {
    label: "147 test provider",
    baseUrl: "https://147ai.com/v1",
    apiKey: "test-key-not-a-real-credential",
    defaultModel: MODEL_IDS[0],
    models: MODEL_IDS.map((id) => ({ id, label: id })),
    ...providerOverrides,
  };
  const settings = JSON.stringify({
    providers: { image: { default: "test", items: { test: provider } } },
  });
  const db = {
    userCount: () => 1,
    lookupSession: (token) => token === "test-session" ? { user: { id: 7 } } : null,
    adjustBalance: (entry) => {
      assert.equal(entry.userId, 7);
      balance += entry.delta;
      transactions.push({ ...entry });
      events.push(entry.type);
      return balance;
    },
    recordApiUsage: (entry) => {
      usage.push({ ...entry });
      events.push("usage");
    },
  };
  const boundaries = {
    http: {
      createServer: (callback) => {
        handler = callback;
        return { listen() {} };
      },
    },
    fs: {
      existsSync: () => false,
      readFileSync: (filePath) => {
        assert.equal(path.basename(filePath), ".huobao-settings.json");
        return settings;
      },
    },
    path,
    crypto: require("node:crypto"),
    "./db": db,
    "./kling-cli": {
      createKlingCli: () => ({}),
      isKlingProvider: (item) => item.adapter === "kling-cli",
    },
    "./cprt-provider": {},
    "./image-routing": require("./image-routing"),
    "../public/gpt-image-models": require("../public/gpt-image-models"),
    "./upstream-http": {
      requestText: async (url, options) => {
        requests.push({ url, ...options });
        events.push("upstream");
        return upstream
          ? upstream(url, options)
          : { ok: true, status: 200, text: JSON.stringify(IMAGE_RESULT) };
      },
    },
  };
  vm.runInNewContext(serverSource, {
    require: (id) => {
      assert.ok(Object.hasOwn(boundaries, id), `Unexpected dependency: ${id}`);
      return boundaries[id];
    },
    __dirname,
    __filename: serverPath,
    process: { env: {} },
    console: { log() {}, error() {} },
    Buffer,
    URL,
    Blob,
    FormData,
    Response,
    fetch: async () => { throw new Error("Unexpected fetch: external network is disabled in this test"); },
  }, { filename: serverPath });
  assert.equal(typeof handler, "function");

  return {
    requests,
    transactions,
    usage,
    events,
    get balance() { return balance; },
    async generate(body) {
      const request = Readable.from([Buffer.from(JSON.stringify(body))]);
      request.method = "POST";
      request.url = "/api/images/generations";
      request.headers = { host: "unit.test", cookie: "huobao_session=test-session" };
      let result;
      const response = {
        writeHead(status, headers) { this.status = status; this.headers = headers; },
        end(bodyText) { result = { status: this.status, body: JSON.parse(bodyText) }; },
      };
      await handler(request, response);
      assert.ok(result, "The API must finish the response");
      return result;
    },
  };
}

function input(model, mode, extra = {}) {
  return {
    providerId: "test",
    model,
    prompt: "Preserve the reference subject in a watercolor scene",
    size: "2048x1152",
    quality: "high",
    n: 1,
    output_format: "png",
    ...(mode.references === undefined ? {} : { image: mode.references }),
    ...extra,
  };
}

async function assertUpstreamRequest(harness, model, mode, body) {
  assert.equal(harness.requests.length, 1);
  const request = harness.requests[0];
  assert.equal(request.url, `https://147ai.com/v1/images/${mode.route}`);
  assert.equal(request.method, "POST");
  assert.equal(request.timeoutMs, TIMEOUT_MS);
  assert.equal(request.headers.Authorization, "Bearer test-key-not-a-real-credential");
  if (!mode.count) {
    assert.equal(request.headers["Content-Type"], "application/json");
    const payload = JSON.parse(request.body);
    const { providerId, ...expected } = body;
    assert.deepEqual(payload, { ...expected, model });
    return;
  }

  assert.ok(Buffer.isBuffer(request.body));
  assert.match(request.headers["Content-Type"], /^multipart\/form-data; boundary=/);
  const form = await new Response(request.body, {
    headers: { "Content-Type": request.headers["Content-Type"] },
  }).formData();
  for (const key of ["prompt", "size", "quality", "n", "output_format"]) {
    assert.equal(form.get(key), String(body[key]), key);
  }
  assert.equal(form.get("model"), model);
  assert.equal(form.has("providerId"), false);
  const field = mode.count === 1 ? "image" : "image[]";
  assert.equal(form.has(mode.count === 1 ? "image[]" : "image"), false);
  const files = form.getAll(field);
  assert.equal(files.length, mode.count);
  for (const file of files) {
    assert.equal(file.type, "image/png");
    assert.equal(file.name, "ref.png");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);
  }
}

function assertSuccessfulBilling(harness, model) {
  assert.equal(harness.balance, 85);
  assert.deepEqual(harness.transactions.map(({ delta, type }) => ({ delta, type })), [
    { delta: -15, type: "spend" },
  ]);
  assert.deepEqual(harness.usage, [
    { userId: 7, route: "images/generations", model, cost: 15, status: "ok" },
  ]);
  assert.deepEqual(harness.events, ["spend", "upstream", "usage"]);
}

for (const model of MODEL_IDS) {
  for (const mode of INPUT_MODES) {
    test(`${model}: ${mode.name} preserves model, size, quality, timeout, and 15-credit billing`, async () => {
      const harness = createApiHarness();
      const body = input(model, mode, { quality: model.endsWith("flare") ? "xhigh" : "max" });
      const result = await harness.generate(body);
      assert.deepEqual(result, { status: 200, body: IMAGE_RESULT });
      await assertUpstreamRequest(harness, model, mode, body);
      assertSuccessfulBilling(harness, model);
    });
  }

  for (const mode of [INPUT_MODES[0], INPUT_MODES[2]]) {
    for (const failure of ["timeout", "HTTP error"]) {
      test(`${model}: ${mode.name} refunds all 15 credits after ${failure}`, async () => {
        const harness = createApiHarness({
          upstream: () => {
            if (failure === "timeout") {
              throw Object.assign(new Error("mock timeout"), { code: "UPSTREAM_TIMEOUT" });
            }
            return { ok: false, status: 503, text: JSON.stringify({ error: { message: "mock upstream unavailable" } }) };
          },
        });
        const body = input(model, mode);
        const result = await harness.generate(body);
        assert.equal(result.status, failure === "timeout" ? 504 : 503);
        assert.match(result.body.error, failure === "timeout" ? /15 分钟/ : /mock upstream unavailable/);
        await assertUpstreamRequest(harness, model, mode, body);
        assert.equal(harness.balance, 100);
        assert.deepEqual(harness.transactions.map(({ delta, type }) => ({ delta, type })), [
          { delta: -15, type: "spend" },
          { delta: 15, type: "refund" },
        ]);
        assert.equal(harness.usage.length, 1);
        assert.deepEqual(harness.usage[0], {
          userId: 7, route: "images/generations", model, cost: 0, status: `error: ${result.body.error}`,
        });
        assert.deepEqual(harness.events, ["spend", "upstream", "refund", "usage"]);
      });
    }

    test(`${model}: ${mode.name} rejects invalid size before charging or calling upstream`, async () => {
      const harness = createApiHarness();
      const result = await harness.generate(input(model, mode, { size: "4096x4096" }));
      assert.equal(result.status, 400);
      assert.match(result.body.error, /尺寸无效/);
      assert.equal(harness.balance, 100);
      assert.deepEqual(harness.transactions, []);
      assert.deepEqual(harness.requests, []);
      assert.deepEqual(harness.usage, []);
    });
  }
}

for (const defaultModel of MODEL_IDS) {
  for (const mode of [INPUT_MODES[0], INPUT_MODES[1]]) {
    test(`147 legacy Image 2 ${mode.name} migrates to configured default ${defaultModel}`, async () => {
      const harness = createApiHarness({ providerOverrides: { defaultModel } });
      const body = input("gpt-image-2", mode);
      const result = await harness.generate(body);
      assert.deepEqual(result, { status: 200, body: IMAGE_RESULT });
      await assertUpstreamRequest(harness, defaultModel, mode, body);
      assertSuccessfulBilling(harness, defaultModel);
    });
  }
}

test("147 preserves explicitly configured legacy Image 2 instead of migrating it", async () => {
  const harness = createApiHarness({
    providerOverrides: { models: [...MODEL_IDS, "gpt-image-2"].map((id) => ({ id, label: id })) },
  });
  const body = input("gpt-image-2", INPUT_MODES[0]);
  const result = await harness.generate(body);
  assert.deepEqual(result, { status: 200, body: IMAGE_RESULT });
  await assertUpstreamRequest(harness, "gpt-image-2", INPUT_MODES[0], body);
  assertSuccessfulBilling(harness, "gpt-image-2");
});
