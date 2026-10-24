// Opt-in real ComfyUI acceptance test. No cloud generation; isolated browser storage.
// node scripts/check-upscale-live.js [http://127.0.0.1:8787]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { deflateSync } = require("node:zlib");

const base = process.argv[2] || "http://127.0.0.1:8787";
const outputDir = path.resolve(__dirname, "../outputs/upscale-live");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function smallPng() {
  const chunk = (type, data) => {
    const bytes = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4), footer = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    footer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, bytes, footer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(96, 0); header.writeUInt32BE(64, 4);
  header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc((96 * 3 + 1) * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) {
    const i = y * 289 + 1 + x * 3;
    const circle = (x - 30) ** 2 + (y - 32) ** 2 < 19 ** 2;
    const stripe = x > 59 && (y % 12 < 6);
    pixels.set(circle ? [245, 130, 80] : stripe ? [40, 150, 170] : [240, 235, 220], i);
  }
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const png = smallPng();
  fs.writeFileSync(path.join(outputDir, "source-96x64.png"), png);
  const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && fs.existsSync(p));
  assert.ok(chrome, "Chrome or Edge is required");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "6mang-upscale-live-"));
  const child = spawn(chrome, ["--headless=new", "--no-first-run", "--disable-background-networking",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--window-size=1600,1000",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
  { windowsHide: true, stdio: "ignore" });
  const report = { base, source: { width: 96, height: 64, bytes: png.length }, runs: [], requests: [], pageErrors: [] };
  let ws;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await delay(100);
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
    await once(ws, "open");
    let counter = 0, corruptNext = false;
    const pending = new Map(), requestMap = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++counter;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 30000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener("message", async ({ data }) => {
      const msg = JSON.parse(data);
      if (pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      }
      if (msg.method === "Runtime.exceptionThrown") report.pageErrors.push(msg.params.exceptionDetails.text);
      if (msg.method === "Fetch.requestPaused") {
        const { requestId, request } = msg.params;
        const body = JSON.parse(request.postData);
        const row = { scale: body.scale, targetWidth: body.targetWidth, targetHeight: body.targetHeight,
          providerId: body.providerId, model: body.model, injectedFailure: corruptNext };
        report.requests.push(row);
        requestMap.set(msg.params.networkId, row);
        if (corruptNext) {
          corruptNext = false;
          body.image = `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`;
          await send("Fetch.continueRequest", { requestId, postData: Buffer.from(JSON.stringify(body)).toString("base64") });
        } else await send("Fetch.continueRequest", { requestId });
      }
      if (msg.method === "Network.responseReceived" && requestMap.has(msg.params.requestId)) {
        requestMap.get(msg.params.requestId).httpStatus = msg.params.response.status;
      }
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression, timeout = 180000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await evaluate(expression)) return;
        await delay(300);
      }
      throw new Error(`Timed out: ${expression}`);
    };
    const screenshot = async (name) => {
      const result = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(outputDir, name), Buffer.from(result.data, "base64"));
    };
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/images/upscale", requestStage: "Request" }] });
    await send("Page.navigate", { url: base });
    await waitFor("typeof backendConfig !== 'undefined' && !!backendConfig.providers?.image?.items?.['comfyui-local']", 30000);
    report.defaults = await evaluate("({image:backendConfig.providers.image.default,upscale:getDefaultUpscaleProviderAndModel()})");
    assert.equal(report.defaults.upscale.providerId, "comfyui-local");
    await evaluate(`(async () => {
      state = {nodes:[],edges:[],groups:[],theme:"light",view:{x:40,y:60,zoom:0.9}};
      getActiveProject().name = "图像放大实测";
      showEditor();
      const bytes = Uint8Array.from(atob(${JSON.stringify(png.toString("base64"))}), c=>c.charCodeAt(0));
      window.liveInput = await createUploadedImageNode(new File([bytes],"source-96x64.png",{type:"image/png"}),{x:50,y:100});
      window.liveConfig = addNode("imageUpscale",{x:400,y:100});
      addEdge(liveInput,liveConfig,"imageOrder",{label:"原图"});
      saveState(); render();
    })()`);
    const run = async (scale, fail = false) => {
      await evaluate(`(() => {
        const select=document.querySelector('[data-id="'+liveConfig+'"] select[data-field="scale"]');
        select.value=${JSON.stringify(String(scale))}; select.dispatchEvent(new Event("change",{bubbles:true}));
      })()`);
      corruptNext = fail;
      const started = Date.now();
      await evaluate(`document.querySelector('[data-id="'+liveConfig+'"] [data-node-action="generate-upscale"]').click()`);
      await waitFor("!activeImageUpscaleRuns.has(liveConfig)");
      const result = await evaluate(`(async () => {
        const config=getNode(liveConfig), out=findOutputImageNode(liveConfig);
        const img=document.querySelector('[data-id="'+out.id+'"] img.generated-image');
        if (img) await img.decode().catch(()=>{});
        const asset=out.data.url ? await getImageAsset(getIndexedImageId(out.data.url)):null;
        return {configId:config.id, outputId:out.id,status:config.data.upscaleStatus,loading:out.data.loading,
          url:out.data.url,error:out.data.error,
          dimensions:img?{width:img.naturalWidth,height:img.naturalHeight}:null,
          bytes:asset?.blob?.size,
          visibleError:!!out.data.error && document.querySelector('[data-id="'+out.id+'"]')?.textContent.includes(out.data.error),
          toast:document.querySelector(".toast")?.textContent,
          edge:state.edges.some(e=>e.source===config.id&&e.target===out.id),
          sourceUnchanged:getNode(liveInput).data.url.startsWith("idb-image:")};
      })()`);
      result.scale = scale; result.failure = fail; result.ms = Date.now() - started;
      report.runs.push(result);
      console.log(JSON.stringify(result));
      if (fail) await screenshot("failure.png");
      if (!fail) {
        assert.equal(result.status, "done");
        assert.match(result.url, /^idb-image:/);
        assert.deepEqual(result.dimensions, { width: 96 * scale, height: 64 * scale });
        assert.equal(result.edge, true); assert.equal(result.sourceUnchanged, true);
        const dataUrl = await evaluate("resolveImageForApi(findOutputImageNode(liveConfig).data.url)");
        const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
        assert.equal(bytes.readUInt32BE(16), 96 * scale);
        assert.equal(bytes.readUInt32BE(20), 64 * scale);
        fs.writeFileSync(path.join(outputDir, `result-${scale}x.png`), bytes);
        await screenshot(`canvas-${scale}x.png`);
      } else {
        assert.equal(result.status, "error");
        assert.equal(result.loading, false);
        assert.ok(result.error && result.error !== "[object Object]", "Failure must contain a useful message");
        assert.equal(result.visibleError, true, "Failure must remain visible on the result node");
      }
    };
    await run(2);
    await run(4);
    assert.equal(report.runs[0].outputId, report.runs[1].outputId, "Rerun reuses its result node");
    await run(4, true);
    await run(2);
    report.persistence = await evaluate(`(() => {
      saveState();
      const workflow=JSON.stringify(cloneWorkflowState());
      const projects=localStorage.getItem(projectStorageKey);
      const current=localStorage.getItem(storageKey);
      const containsBinary=value=>/data:image\\/|;base64,|"b64_json"|"dataBase64"|"type":"Buffer"/i.test(value);
      return {workflow:JSON.parse(workflow), workflowChars:workflow.length,projectChars:projects.length,
        workflowHasBinary:containsBinary(workflow),projectsHaveBinary:containsBinary(projects),currentHasBinary:containsBinary(current),
        references:state.nodes.filter(n=>n.type==="image").map(n=>n.data.url)};
    })()`);
    for (const key of ["workflowHasBinary", "projectsHaveBinary", "currentHasBinary"]) assert.equal(report.persistence[key], false);
    fs.writeFileSync(path.join(outputDir, "workflow-state.json"), JSON.stringify(report.persistence.workflow, null, 2));
    delete report.persistence.workflow;
    const downloads = path.join(profile, "downloads");
    fs.mkdirSync(downloads);
    await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    await evaluate(`(() => {
      showProjectHome();
      document.querySelector('[data-project-action="export"][data-project-id="'+getActiveProject().id+'"]').click();
    })()`);
    const exported = path.join(downloads, "图像放大实测.project.json");
    for (let i = 0; !fs.existsSync(exported) && i < 100; i++) await delay(100);
    const exportedText = fs.readFileSync(exported, "utf8");
    assert.equal(JSON.parse(exportedText).schema, "canvas-project");
    assert.doesNotMatch(exportedText, /data:image\/|;base64,|"b64_json"|"dataBase64"|"type":\s*"Buffer"/i);
    assert.match(exportedText, /idb-image:/);
    report.persistence.exportBytes = Buffer.byteLength(exportedText);
    report.persistence.exportHasBinary = false;
    fs.writeFileSync(path.join(outputDir, "project.json"), exportedText);
    const configId = report.runs[0].configId;
    await send("Page.reload", { ignoreCache: true });
    await waitFor("typeof backendConfig !== 'undefined' && !!backendConfig.providers?.image?.items?.['comfyui-local']", 30000);
    await evaluate("showEditor()");
    await waitFor(`!!document.querySelector('[data-id="${report.runs[0].outputId}"] img')?.naturalWidth`, 10000);
    report.reload = await evaluate(`(async () => {
      const node=findOutputImageNode(${JSON.stringify(configId)});
      const dimensions=await probeImageDimensions(node.data.url);
      return {url:node.data.url,...dimensions,nodes:state.nodes.length,edges:state.edges.length};
    })()`);
    assert.equal(report.reload.width, 192); assert.equal(report.reload.height, 128);
    assert.equal(report.reload.nodes, 3); assert.equal(report.reload.edges, 2);
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.requests.map((entry) => entry.httpStatus), [200, 200, 502, 200]);
    report.ok = true;
  } catch (error) {
    report.ok = false; report.error = error.message;
    throw error;
  } finally {
    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    ws?.close(); child.kill();
    console.log(`Report: ${path.join(outputDir, "report.json")}`);
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
