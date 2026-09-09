const http = require("node:http");
const https = require("node:https");

function requestText(url, options = {}) {
  const target = url instanceof URL ? url : new URL(String(url));
  const transport = target.protocol === "https:" ? https : target.protocol === "http:" ? http : null;
  if (!transport) {
    return Promise.reject(Object.assign(new Error(`Unsupported upstream protocol: ${target.protocol}`), { code: "UNSUPPORTED_PROTOCOL" }));
  }

  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 15 * 60 * 1000);
  const body = options.body == null
    ? null
    : Buffer.isBuffer(options.body)
      ? options.body
      : Buffer.from(String(options.body));
  const headers = { ...(options.headers || {}) };
  if (body && !Object.keys(headers).some((name) => name.toLowerCase() === "content-length")) {
    headers["Content-Length"] = String(body.length);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = transport.request(target, {
      method: options.method || "GET",
      headers,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        if (settled) return;
        settled = true;
        const status = Number(response.statusCode || 0);
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: response.statusMessage || "",
          headers: response.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        });
      });
      response.on("error", finishReject);
    });

    request.setTimeout(timeoutMs, () => {
      const error = new Error(`Upstream request timed out after ${timeoutMs}ms`);
      error.code = "UPSTREAM_TIMEOUT";
      request.destroy(error);
    });
    request.on("error", finishReject);
    if (body) request.write(body);
    request.end();
  });
}

module.exports = { requestText };
