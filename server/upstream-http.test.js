const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { requestText } = require("./upstream-http");

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("long-running upstream requests can wait beyond a shorter fetch-style deadline", async () => {
  const server = await listen((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    }, 80);
  });
  try {
    const address = server.address();
    const response = await requestText(`http://127.0.0.1:${address.port}/images/generations`, { timeoutMs: 500 });
    assert.equal(response.status, 200);
    assert.equal(response.text, '{"ok":true}');
  } finally {
    await close(server);
  }
});

test("long-running upstream requests report an explicit timeout code", async () => {
  const server = await listen(() => {});
  try {
    const address = server.address();
    await assert.rejects(
      requestText(`http://127.0.0.1:${address.port}/images/generations`, { timeoutMs: 30 }),
      (error) => error?.code === "UPSTREAM_TIMEOUT",
    );
  } finally {
    await close(server);
  }
});
