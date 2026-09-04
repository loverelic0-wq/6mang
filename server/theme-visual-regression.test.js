const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

function findChrome() {
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

test("text-node overlay stays transparent so highlighted text remains visible in both themes", (t) => {
  const chrome = findChrome();
  if (!chrome) return t.skip("Chrome or Edge is required for the CSS cascade regression test");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "6mang-theme-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const stylesUrl = pathToFileURL(path.resolve(__dirname, "../public/styles.css")).href;
  const fixturePath = path.join(tempDir, "theme-fixture.html");
  fs.writeFileSync(fixturePath, `<!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="${stylesUrl}">
        <style>* { transition: none !important; }</style>
      </head>
      <body data-theme="studio-paper">
        <div class="node" data-type="text">
          <div class="prompt-editor">
            <div class="prompt-highlight">可读文字</div>
            <textarea>可读文字</textarea>
          </div>
        </div>
        <output id="computed-styles"></output>
        <script>
          const textarea = document.querySelector("textarea");
          const highlight = document.querySelector(".prompt-highlight");
          const read = () => ({
            textareaBackground: getComputedStyle(textarea).backgroundColor,
            highlightColor: getComputedStyle(highlight).color,
          });
          const paper = read();
          document.body.dataset.theme = "graphite-night";
          document.body.classList.add("dark");
          const graphite = read();
          document.querySelector("#computed-styles").textContent = JSON.stringify({ paper, graphite });
        </script>
      </body>
    </html>`);

  const result = spawnSync(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${path.join(tempDir, "chrome-profile")}`,
    "--virtual-time-budget=1000",
    "--dump-dom",
    pathToFileURL(fixturePath).href,
  ], { encoding: "utf8", timeout: 15000 });

  assert.equal(result.status, 0, result.stderr);
  const match = result.stdout.match(/<output id="computed-styles">([^<]+)<\/output>/);
  assert.ok(match, "headless browser did not return computed theme styles");
  const styles = JSON.parse(match[1].replaceAll("&quot;", '"'));
  assert.deepEqual(styles, {
    paper: {
      textareaBackground: "rgba(0, 0, 0, 0)",
      highlightColor: "rgb(33, 30, 25)",
    },
    graphite: {
      textareaBackground: "rgba(0, 0, 0, 0)",
      highlightColor: "rgb(240, 241, 243)",
    },
  });
});
