const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Readable } = require("node:stream");

const serverPath = path.join(__dirname, "server.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
const INPUT = `data:image/png;base64,${Buffer.from("upscale-input").toString("base64")}`;
const OUTPUT = Buffer.from("upscale-output");
const UPSCALE_MODEL = {
  id: "upscale-model",
  label: "超分模型",
  capabilities: ["upscale"],
  maxScale: 4,
  maxEdge: 4096,
  maxPixels: 12_000_000,
};

function createHarness({ adapter = "http", providerOverrides = {}, upstream } = {}) {
  const requests = [];
  const transactions = [];
  const usage = [];
  let balance = 100;
  let handler;
  const provider = {
    label: adapter === "comfyui" ? "ComfyUI test provider" : "HTTP upscale test provider",
    adapter,
    baseUrl: adapter === "comfyui" ? "http://127.0.0.1:8188" : "https://upscale.example.com/v1",
    apiKey: adapter === "comfyui" ? "" : "test-upscale-key",
    defaultModel: UPSCALE_MODEL.id,
    models: [{ ...UPSCALE_MODEL }],
    ...(adapter === "comfyui" ? {
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: "__IMAGE_FILENAME__", subfolder: "__IMAGE_SUBFOLDER__", type: "__IMAGE_TYPE__" } },
        "2": { class_type: "Upscale", inputs: { image: ["1", 0], scale: "__SCALE__", width: "__TARGET_WIDTH__", height: "__TARGET_HEIGHT__", model: "__MODEL__" } },
      },
    } : {}),
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
      return balance;
    },
    recordApiUsage: (entry) => usage.push({ ...entry }),
  };
  const defaultUpstream = async (url, options) => {
    return { ok: true, status: 200, text: JSON.stringify({ data: [{ b64_json: "http-result", mime: "image/png" }] }) };
  };
  const boundaries = {
    http: { createServer: (callback) => { handler = callback; return { listen() {} }; } },
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
    "./kling-cli": { createKlingCli: () => ({}), isKlingProvider: (item) => item.adapter === "kling-cli" },
    "./cprt-provider": {},
    "./image-routing": require("./image-routing"),
    "./comfyui-manager": {
      createComfyUiManager: () => ({
        ensureReady: async () => ({ ready: true, started: false, reused: true }),
        status: async () => ({ ready: true, managed: false, starting: false }),
      }),
    },
    "../public/gpt-image-models": require("../public/gpt-image-models"),
    "./upstream-http": {
      requestText: async (url, options) => {
        const result = await (upstream || defaultUpstream)(url, options);
        requests.push({ url, ...options, response: result });
        return result;
      },
    },
  };
  const fetchStub = async (url, options = {}) => {
    requests.push({ url, ...options });
    const result = await (upstream || defaultUpstream)(url, options);
    const raw = result.body instanceof Uint8Array ? Buffer.from(result.body) : Buffer.from(String(result.text || ""));
    return {
      ok: result.ok,
      status: result.status,
      text: async () => result.text || "",
      arrayBuffer: async () => raw,
      headers: { get: (name) => result.headers?.[String(name).toLowerCase()] || result.headers?.[name] || "" },
    };
  };
  vm.runInNewContext(serverSource, {
    require: (id) => {
      assert.ok(Object.hasOwn(boundaries, id), `Unexpected dependency: ${id}`);
      return boundaries[id];
    },
    __dirname,
    __filename: serverPath,
    process: { env: { HUOBAO_LOCAL_MODE: "false" } },
    console: { log() {}, error() {} },
    Buffer,
    URL,
    URLSearchParams,
    Blob,
    FormData,
    Response,
    fetch: fetchStub,
    setTimeout,
  }, { filename: serverPath });
  assert.equal(typeof handler, "function");

  return {
    requests,
    transactions,
    usage,
    get balance() { return balance; },
    async upscale(body) {
      const request = Readable.from([Buffer.from(JSON.stringify(body))]);
      request.method = "POST";
      request.url = "/api/images/upscale";
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

function body(overrides = {}) {
  return {
    providerId: "test",
    model: UPSCALE_MODEL.id,
    image: INPUT,
    scale: 2,
    targetWidth: 2048,
    targetHeight: 1365,
    outputFormat: "png",
    ...overrides,
  };
}

test("HTTP upscale adapter sends multipart fields and charges the image rate", async () => {
  const harness = createHarness({
    upstream: async (url, options) => {
      assert.equal(url, "https://upscale.example.com/v1/images/upscale");
      assert.equal(options.method, "POST");
      assert.equal(options.timeoutMs, 15 * 60 * 1000);
      assert.equal(options.headers.Authorization, "Bearer test-upscale-key");
      assert.match(options.headers["Content-Type"], /^multipart\/form-data; boundary=/);
      const form = await new Response(options.body, { headers: { "Content-Type": options.headers["Content-Type"] } }).formData();
      assert.equal(form.get("model"), UPSCALE_MODEL.id);
      assert.equal(form.get("scale"), "2");
      assert.equal(form.get("target_width"), "2048");
      assert.equal(form.get("target_height"), "1365");
      assert.equal(form.get("output_format"), "png");
      assert.equal(form.get("image").type, "image/png");
      return { ok: true, status: 200, text: JSON.stringify({ data: [{ b64_json: "http-result", mime: "image/png" }] }) };
    },
  });
  const result = await harness.upscale(body());
  assert.deepEqual(result, { status: 200, body: { data: [{ b64_json: "http-result", mime: "image/png" }] } });
  assert.equal(harness.balance, 92);
  assert.deepEqual(harness.transactions.map(({ delta, type }) => ({ delta, type })), [{ delta: -8, type: "spend" }]);
  assert.deepEqual(harness.usage, [{ userId: 7, route: "images/upscale", model: UPSCALE_MODEL.id, cost: 8, status: "ok" }]);
});

test("HTTP upscale failure refunds the charge and records an error", async () => {
  const harness = createHarness({
    upstream: async () => ({ ok: false, status: 503, text: JSON.stringify({ error: { message: "超分服务不可用" } }) }),
  });
  const result = await harness.upscale(body());
  assert.equal(result.status, 503);
  assert.match(result.body.error, /超分服务不可用/);
  assert.equal(harness.balance, 100);
  assert.deepEqual(harness.transactions.map(({ delta, type }) => ({ delta, type })), [
    { delta: -8, type: "spend" },
    { delta: 8, type: "refund" },
  ]);
  assert.deepEqual(harness.usage, [{ userId: 7, route: "images/upscale", model: UPSCALE_MODEL.id, cost: 0, status: "error: 超分服务不可用" }]);
});

test("HTTP JSON upscale adapter sends a base64 data URL", async () => {
  const harness = createHarness({
    providerOverrides: { upscaleProtocol: "json", upscalePath: "v1/sr" },
    upstream: async (url, options) => {
      assert.equal(url, "https://upscale.example.com/v1/v1/sr");
      assert.equal(options.headers["Content-Type"], "application/json");
      const payload = JSON.parse(options.body);
      assert.equal(payload.model, UPSCALE_MODEL.id);
      assert.equal(payload.scale, 2);
      assert.equal(payload.target_width, 2048);
      assert.equal(payload.target_height, 1365);
      assert.equal(payload.output_format, "png");
      assert.match(payload.image, /^data:image\/png;base64,/);
      return { ok: true, status: 200, text: JSON.stringify({ data: [{ b64_json: "json-result", mime: "image/png" }] }) };
    },
  });
  const result = await harness.upscale(body());
  assert.equal(result.status, 200);
  assert.equal(harness.balance, 92);
});

test("capability, scale, and size limits reject before charging or calling upstream", async () => {
  const unsupported = createHarness({ providerOverrides: { models: [{ id: "ordinary", label: "普通模型" }], defaultModel: "ordinary" } });
  const unsupportedResult = await unsupported.upscale(body({ model: "ordinary" }));
  assert.equal(unsupportedResult.status, 400);
  assert.match(unsupportedResult.body.error, /未声明支持超分/);
  assert.equal(unsupported.balance, 100);
  assert.deepEqual(unsupported.transactions, []);
  assert.deepEqual(unsupported.requests, []);

  const unsupportedAdapter = createHarness({ adapter: "kling-cli" });
  const adapterResult = await unsupportedAdapter.upscale(body());
  assert.equal(adapterResult.status, 400);
  assert.match(adapterResult.body.error, /不支持超分适配器/);
  assert.equal(unsupportedAdapter.balance, 100);
  assert.deepEqual(unsupportedAdapter.transactions, []);

  for (const overrides of [
    { scale: 3 },
    { scale: 4, targetWidth: 4097, targetHeight: 2048 },
    { scale: 4, targetWidth: 4096, targetHeight: 2048 },
  ]) {
    const harness = createHarness();
    const result = await harness.upscale(body(overrides));
    assert.equal(result.status, overrides.targetWidth === 4096 ? 200 : 400);
    assert.equal(harness.balance, overrides.targetWidth === 4096 ? 92 : 100);
    assert.equal(harness.requests.length, overrides.targetWidth === 4096 ? 1 : 0);
  }
});

test("ComfyUI adapter uploads, submits, polls, and returns a local result without billing", async () => {
  let promptPayload;
  const harness = createHarness({
    adapter: "comfyui",
    upstream: async (url, options = {}) => {
      const route = new URL(url).pathname;
      if (route === "/upload/image") {
        assert.match(options.body.get("image").name, /^6mang-upscale-[a-f0-9]{24}\.png$/);
        assert.equal(options.body.get("overwrite"), "false");
        return { ok: true, status: 200, text: JSON.stringify({ name: "uploaded.png", subfolder: "", type: "input" }) };
      }
      if (route === "/prompt") {
        promptPayload = JSON.parse(options.body);
        return { ok: true, status: 200, text: JSON.stringify({ prompt_id: "prompt-1" }) };
      }
      if (route === "/history/prompt-1") return { ok: true, status: 200, text: JSON.stringify({ "prompt-1": { outputs: { "2": { images: [{ filename: "result.png", subfolder: "", type: "output" }] } } } }) };
      if (route === "/view") return { ok: true, status: 200, body: OUTPUT, headers: { "content-type": "image/png" } };
      throw new Error(`unexpected Comfy route ${route}`);
    },
  });
  const result = await harness.upscale(body({ scale: 4, targetWidth: 4096, targetHeight: 2730 }));
  assert.equal(result.status, 200);
  assert.equal(result.body.data[0].mime, "image/png");
  assert.equal(Buffer.from(result.body.data[0].b64_json, "base64").toString(), OUTPUT.toString());
  assert.equal(promptPayload.prompt["1"].inputs.image, "uploaded.png");
  assert.equal(promptPayload.prompt["2"].inputs.scale, "4");
  assert.equal(promptPayload.prompt["2"].inputs.width, "4096");
  assert.equal(promptPayload.prompt["2"].inputs.height, "2730");
  assert.equal(promptPayload.prompt["2"].inputs.model, UPSCALE_MODEL.id);
  assert.equal(harness.balance, 100);
  assert.deepEqual(harness.transactions, []);
  assert.deepEqual(harness.usage, [{ userId: 7, route: "images/upscale", model: UPSCALE_MODEL.id, cost: 0, status: "ok" }]);
});

test("ComfyUI rejects a canvas blueprint and asks for Save API Format", async () => {
  const harness = createHarness({
    adapter: "comfyui",
    providerOverrides: { workflow: { nodes: [], definitions: { subgraphs: [] }, version: 0.4 } },
    upstream: async () => { throw new Error("ComfyUI should not be called"); },
  });
  const result = await harness.upscale(body());
  assert.equal(result.status, 400);
  assert.match(result.body.error, /画布格式.*Save API Format/);
  assert.equal(harness.balance, 100);
  assert.deepEqual(harness.requests, []);
});

test("ComfyUI prompt validation returns useful structured error details", async () => {
  const harness = createHarness({ adapter: "comfyui", upstream: async (url) => {
    if (url.endsWith("/upload/image")) return { ok: true, status: 200, text: '{"name":"test.png"}' };
    return { ok: false, status: 400, text: JSON.stringify({
      error: { message: "Prompt outputs failed validation" },
      node_errors: { "2": { errors: [{ message: "Model does not exist" }] } },
    }) };
  } });
  const result = await harness.upscale(body());
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Prompt outputs failed validation.*Model does not exist/);
  assert.doesNotMatch(result.body.error, /\[object Object\]/);
});

test("ComfyUI execution failure takes precedence over partial image outputs", async () => {
  const harness = createHarness({ adapter: "comfyui", upstream: async (url) => {
    if (url.endsWith("/upload/image")) return { ok: true, status: 200, text: '{"name":"test.png"}' };
    if (url.endsWith("/prompt")) return { ok: true, status: 200, text: '{"prompt_id":"failed"}' };
    assert.ok(url.endsWith("/history/failed"), "Must not fetch a partial result from /view");
    return { ok: true, status: 200, text: JSON.stringify({ failed: {
      status: { status_str: "error", completed: false,
        messages: [["execution_error", { exception_message: "cannot identify image file 'test.png'" }]] },
      outputs: { preview: { images: [{ filename: "partial.png" }] } },
    } }) };
  } });
  const result = await harness.upscale(body());
  assert.equal(result.status, 502);
  assert.match(result.body.error, /无法解码输入图片/);
  assert.equal(harness.usage[0].status.startsWith("error:"), true);
});

test("ComfyUI interrupted jobs fail promptly instead of polling until timeout", async () => {
  const harness = createHarness({ adapter: "comfyui", upstream: async (url) => {
    if (url.endsWith("/upload/image")) return { ok: true, status: 200, text: '{"name":"test.png"}' };
    if (url.endsWith("/prompt")) return { ok: true, status: 200, text: '{"prompt_id":"stopped"}' };
    return { ok: true, status: 200, text: JSON.stringify({ stopped: {
      status: { completed: false, messages: [["execution_interrupted", {}]] },
    } }) };
  } });
  const result = await harness.upscale(body());
  assert.equal(result.status, 502);
  assert.match(result.body.error, /任务被中断/);
});
