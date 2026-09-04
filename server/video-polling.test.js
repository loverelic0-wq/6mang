const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const polling = require("../public/video-polling");

test("CPRT polling waits for task registration and allows a twenty minute window", () => {
  assert.deepEqual(polling.policyFor("custom-cprt", {
    baseUrl: "https://ai-api.cprt.xyz/v1",
  }), {
    initialDelayMs: 10000,
    intervalMs: 10000,
    maxAttempts: 120,
  });
});

test("CPRT polling retries eventual-consistency and transient gateway failures", () => {
  assert.equal(polling.isRetryableError({ status: 503, message: "任务不存在" }), true);
  assert.equal(polling.isRetryableError({ status: 429, message: "请求过于频繁" }), true);
  assert.equal(polling.isRetryableError(new Error("任务不存在")), true);
  assert.equal(polling.isRetryableError({ status: 503, message: "任务失败，未扣金额" }), false);
  assert.equal(polling.isRetryableError({ status: 400, message: "参数错误" }), false);
});

test("failed video nodes can resume polling without creating another paid task", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(source, /data-node-action="resume-video-task"/);
  assert.match(source, /if \(nodeAction === "resume-video-task"\) resumeVideoTask\(id\)/);
  assert.doesNotMatch(source, /function resumeVideoTask[\s\S]*?requestVideoCreate/);
});
