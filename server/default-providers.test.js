const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("default image provider includes the official Doubao Seedream 5.0 Pro model", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

  assert.match(
    serverSource,
    /\{ id: "doubao-seedream-5-0-pro-260628", label: "豆包 Seedream 5\.0 Pro（火山引擎）" \}/,
  );
});
