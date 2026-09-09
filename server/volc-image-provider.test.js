const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

test("direct Volcengine image provider targets Ark with Seedream 5.0 Pro", () => {
  assert.match(serverSource, /volc: \{[\s\S]*label: "火山 Seedream"/);
  assert.match(serverSource, /baseUrl: "https:\/\/ark\.cn-beijing\.volces\.com\/api\/v3"/);
  assert.match(serverSource, /defaultModel: "doubao-seedream-5-0-pro-260628"/);
});

test("direct Volcengine image provider inherits the local Ark credential server-side", () => {
  assert.match(serverSource, /function resolveProviderApiKey\(kind, id, item\)/);
  assert.match(serverSource, /kind === "image" && id === "volc"/);
  assert.match(serverSource, /apiKey: resolveProviderApiKey\(kind, id, item\)/);
});
