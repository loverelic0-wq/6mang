const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let klingModule = {};
try {
  klingModule = require("./kling-cli");
} catch {}

const {
  createKlingCli,
  normalizeCapabilities,
  normalizeTask,
  buildGenerationArgs,
  isKlingProvider,
  usesCanvasBilling,
} = klingModule;

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kling-cli-test-"));
  const script = path.join(dir, "fake-kling.js");
  fs.writeFileSync(script, `
const args = process.argv.slice(2).filter((arg) => arg !== "--quiet");
const command = args[0];
if (command === "echo") {
  console.error("diagnostic line");
  console.log(JSON.stringify({ ok: true, status: 200, body: { value: args[1] } }));
} else if (command === "malformed") {
  console.log("not-json");
} else if (command === "fail") {
  console.error("账户积分不足");
  process.exitCode = 7;
} else if (command === "hang") {
  setTimeout(() => {}, 10000);
} else if (command === "who_am_i") {
  console.log(JSON.stringify({ ok: true, status: 200, body: {
    user: { userId: 42 },
    availableModels: {
      image_to_video: { models: [{
        model: "kling-v3",
        alias: "可灵3.0, v3",
        arguments: [{ name: "prompt", required: false }, { name: "duration", required: true, default: "5", allowedValues: ["5", "10"] }],
        inputs: [{ name: "first_image", required: true }, { name: "tail_image", required: false }]
      }] }
    }
  }}));
} else if (command === "account") {
  console.log(JSON.stringify({ ok: true, status: 200, body: { membershipType: "VIP", availableRemainCredits: 100 } }));
} else if (command === "tool_list") {
  console.log(JSON.stringify({ ok: true, status: 200, body: { tools: [{ name: "image_to_video" }] } }));
} else if (command === "image_to_video") {
  if (process.env.FAKE_LOG) require("node:fs").writeFileSync(process.env.FAKE_LOG, JSON.stringify(args), "utf8");
  console.log(JSON.stringify({ ok: true, status: 200, body: { generation_id: "generated-123" } }));
} else if (command === "query_tasks") {
  console.log(JSON.stringify({ ok: true, status: 200, body: { status: "succeeded", works: [{ resource: { urlWithoutWatermark: "https://cdn.example/final.mp4?token=abc" } }] } }));
} else if (command === "login") {
  setTimeout(() => console.log(JSON.stringify({ ok: true, loggedIn: true })), 40);
} else if (command === "logout") {
  console.log(JSON.stringify({ ok: true, loggedOut: true }));
}
`, "utf8");
  return { dir, script };
}

test("runner parses the final quiet JSON line", async (t) => {
  assert.equal(typeof createKlingCli, "function", "createKlingCli should be exported");
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  const result = await cli.run(["echo", "ok"], { timeoutMs: 1000 });

  assert.deepEqual(result, { ok: true, status: 200, body: { value: "ok" } });
});

test("runner rejects malformed JSON output", async (t) => {
  assert.equal(typeof createKlingCli, "function", "createKlingCli should be exported");
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  await assert.rejects(() => cli.run(["malformed"], { timeoutMs: 1000 }), /未返回有效 JSON/);
});

test("runner reports stderr when the CLI exits unsuccessfully", async (t) => {
  assert.equal(typeof createKlingCli, "function", "createKlingCli should be exported");
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  await assert.rejects(() => cli.run(["fail"], { timeoutMs: 1000 }), /账户积分不足/);
});

test("runner terminates commands that exceed their timeout", async (t) => {
  assert.equal(typeof createKlingCli, "function", "createKlingCli should be exported");
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  await assert.rejects(() => cli.run(["hang"], { timeoutMs: 30 }), /执行超时/);
});

test("capability normalization merges the same model across tools", () => {
  assert.equal(typeof normalizeCapabilities, "function", "normalizeCapabilities should be exported");
  const result = normalizeCapabilities({
    user: { userId: 42 },
    availableModels: {
      text_to_video: {
        models: [{ model: "kling-v3", alias: "可灵3.0, v3", description: "text", arguments: [], inputs: [] }],
      },
      image_to_video: {
        models: [{
          model: "kling-v3",
          alias: "可灵3.0, v3",
          description: "image",
          arguments: [{ name: "duration", default: "5", allowedValues: ["5", "10"] }],
          inputs: [{ name: "first_image", required: true }],
        }],
      },
    },
  });

  assert.deepEqual(result.user, { userId: 42 });
  assert.deepEqual(result.providers.video.models[0].tools, ["text_to_video", "image_to_video"]);
  assert.deepEqual(result.providers.video.models[0].specs.image_to_video.arguments[0].allowedValues, ["5", "10"]);
  assert.equal(result.providers.video.models[0].specs.image_to_video.inputs[0].name, "first_image");
});

test("generation arguments map a tail frame to the dedicated CLI flag", () => {
  assert.equal(typeof buildGenerationArgs, "function", "buildGenerationArgs should be exported");
  const args = buildGenerationArgs({
    tool: "image_to_video",
    model: "kling-v3",
    prompt: "镜头缓慢推进",
    params: { duration: "5", enable_audio: "false" },
    images: ["first.png", "tail.png"],
    inputNames: ["first_image", "tail_image"],
  });

  assert.deepEqual(args, [
    "image_to_video", "--model", "kling-v3",
    "--duration", "5", "--enable_audio", "false",
    "--image", "first.png", "--tailImage", "tail.png",
    "镜头缓慢推进",
  ]);
});

test("generation arguments repeat image flags for numbered reference inputs", () => {
  const args = buildGenerationArgs({
    tool: "image_to_image",
    model: "kling-image-o1",
    prompt: "保持图片1主体",
    params: {},
    images: ["one.png", "two.png"],
    inputNames: ["image_1", "image_2"],
  });

  assert.deepEqual(args, [
    "image_to_image", "--model", "kling-image-o1",
    "--image", "one.png", "--image", "two.png",
    "保持图片1主体",
  ]);
});

test("task normalization prefers unwatermarked media URLs and maps terminal status", () => {
  assert.equal(typeof normalizeTask, "function", "normalizeTask should be exported");
  const result = normalizeTask({
    status: "succeed",
    works: [{ resource: {
      url: "https://cdn.example/watermarked.mp4?token=full",
      urlWithoutWatermark: "https://cdn.example/clean.mp4?token=full",
      coverUrl: "https://cdn.example/cover.jpg?token=cover",
    } }],
  }, "generation-1");

  assert.equal(result.status, "succeeded");
  assert.equal(result.id, "generation-1");
  assert.equal(result.video_url, "https://cdn.example/clean.mp4?token=full");
  assert.equal(result.urls[0], "https://cdn.example/clean.mp4?token=full");
});

test("task normalization keeps upstream failure details", () => {
  const result = normalizeTask({ status: "failed", error: { message: "内容审核未通过" } }, "generation-2");

  assert.equal(result.status, "failed");
  assert.equal(result.error, "内容审核未通过");
  assert.deepEqual(result.urls, []);
});

test("capabilities, account and tool discovery use the CLI contracts", async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  const capabilities = await cli.capabilities();
  const account = await cli.account();
  const tools = await cli.tools();

  assert.equal(capabilities.user.userId, 42);
  assert.equal(capabilities.providers.video.models[0].id, "kling-v3");
  assert.equal(account.membershipType, "VIP");
  assert.equal(tools.tools[0].name, "image_to_video");
});

test("submit materializes a data URL only for the duration of CLI upload", async (t) => {
  const fixture = createFixture();
  const logPath = path.join(fixture.dir, "args.json");
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script, env: { FAKE_LOG: logPath } });

  const result = await cli.submit({
    tool: "image_to_video",
    model: "kling-v3",
    prompt: "镜头推进",
    params: { duration: "5" },
    images: ["data:image/png;base64,aGVsbG8="],
  });
  const submittedArgs = JSON.parse(fs.readFileSync(logPath, "utf8"));
  const imagePath = submittedArgs[submittedArgs.indexOf("--image") + 1];

  assert.deepEqual(result, { adapter: "kling-cli", id: "generated-123", status: "submitted" });
  assert.match(imagePath, /kling-canvas-/);
  assert.equal(fs.existsSync(imagePath), false, "temporary upload file should be removed after submission");
});

test("submit rejects parameter values not declared by the selected model", async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  await assert.rejects(() => cli.submit({
    tool: "image_to_video",
    model: "kling-v3",
    prompt: "镜头推进",
    params: { duration: "99" },
    images: ["https://cdn.example/input.png"],
  }), /duration.*99.*可选值/);
});

test("submit accepts an omitted required argument when the CLI declares a default", async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  const result = await cli.submit({
    tool: "image_to_video",
    model: "kling-v3",
    prompt: "使用模型默认时长",
    params: {},
    images: ["https://cdn.example/input.png"],
  });

  assert.equal(result.id, "generated-123");
});

test("queryTask returns the normalized completed resource", async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  const result = await cli.queryTask("generated-123");

  assert.equal(result.status, "succeeded");
  assert.equal(result.video_url, "https://cdn.example/final.mp4?token=abc");
});

test("OAuth login is a singleton and reaches a successful terminal snapshot", async (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));
  const cli = createKlingCli({ cliScriptPath: fixture.script });

  const first = cli.startLogin();
  const second = cli.startLogin();
  assert.equal(first.status, "waiting");
  assert.equal(second.startedAt, first.startedAt);
  for (let attempt = 0; attempt < 20 && cli.loginSnapshot().status === "waiting"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.equal(cli.loginSnapshot().status, "succeeded");
});

test("only the managed Kling CLI provider bypasses canvas billing", () => {
  assert.equal(typeof isKlingProvider, "function", "isKlingProvider should be exported");
  assert.equal(typeof usesCanvasBilling, "function", "usesCanvasBilling should be exported");

  assert.equal(isKlingProvider({ adapter: "kling-cli" }), true);
  assert.equal(usesCanvasBilling({ adapter: "kling-cli" }), false);
  assert.equal(usesCanvasBilling({ adapter: "http", apiKey: "secret" }), true);
  assert.equal(usesCanvasBilling({ apiKey: "secret" }), true);
});
