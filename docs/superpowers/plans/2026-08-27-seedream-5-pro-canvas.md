# Seedream 5.0 Pro Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 6mang 中可靠接入 Seedream 5.0 Pro 普通编辑、空间标注编辑和原生图层分离，并让返回图层成为可编辑、可合成、可继续连线的画布资产。

**Architecture:** 保留统一的 `/api/images/generations` 业务入口，服务端按火山 Provider 与通用 OpenAI 兼容 Provider 分流上游协议。前端新增两个配置节点和一个图层文档节点，像素数据继续走 IndexedDB，标注与图层编辑使用挂在 `document.body` 的 Canvas 2D 浮层。

**Tech Stack:** Node.js 22 内置 `http/fetch/node:test`，vanilla JavaScript，Canvas 2D，IndexedDB，手写 CSS；不新增 npm 依赖或构建步骤。

**Spec:** `docs/superpowers/specs/2026-08-27-seedream-5-pro-canvas-design.md`

## Global Constraints

- 真实运行文件是 `server/server.js`、`public/app.js` 和 `public/styles.css`；不修改根目录旧版前端副本。
- 所有付费上游请求保持 `requireUser → 先扣费 → try → 失败退款与失败记账`。
- API Key 永不下发浏览器；火山图片 Provider 继续只在服务端解析凭据。
- 图片二进制写 IndexedDB，localStorage 只保存 `idb-image:<assetId>` 和轻量元数据。
- 中文 UI；前端无框架、无模块、无 bundler；后端零新增依赖。
- 当前 `public/app.js`、`server/server.js` 及若干测试包含用户未提交改动；保留并围绕这些改动编辑。除计划文档外，不提交会混入用户既有内容的文件。
- 自动测试不得发起真实付费生成。
- 可测试的 Seedream 纯逻辑放入 `public/seedream-tools.js`（浏览器全局 + CommonJS 双出口）；服务端路由选择放入 `server/image-routing.js`。测试直接调用真实函数，不用源码字符串匹配代替行为测试。

---

### Task 1: 修正 Seedream Pro 能力与火山图片请求协议

**Files:**
- Modify: `server/seedream-5-sizes.test.js`
- Modify: `server/seedream-5-request.test.js`
- Create: `server/volc-image-request-routing.test.js`
- Create: `server/image-routing.js`
- Create: `public/seedream-tools.js`
- Modify: `public/index.html` to load `seedream-tools.js` before `app.js`
- Modify: `public/app.js` around `seedream5ImageSizes`, `imageSizeOptions`, `buildImageGenerationBody`
- Modify: `server/server.js` inside `POST /api/images/generations`

**Interfaces:**
- Produces: `isSeedream5ProImageModel(model): boolean`
- Produces: `seedream5ProImageSizes: Array<[string,string]>`
- Produces: `seedream5LiteImageSizes: Array<[string,string]>`
- Produces: `buildImageGenerationBody(configNode, prompt, refImages): object` with `output_format` and `optimize_prompt_options`
- Produces: fire-and-forward JSON Ark request when `isVolcArkProvider(provider)` is true

- [ ] **Step 1: Replace the size regression test with separate Pro and Lite assertions**

```js
test("Seedream 5.0 Pro exposes only documented 1K and 2K presets", () => {
  const values = tools.imageSizeOptions("doubao-seedream-5-0-pro-260628").map(([value]) => value);
  assert.deepEqual(values, [
    "1024x1024", "1152x864", "864x1152", "1424x800", "800x1424",
    "1248x832", "832x1248", "1568x672", "2048x2048", "2368x1776",
    "1776x2368", "2816x1584", "1584x2816", "2496x1664", "1664x2496", "3136x1344",
  ]);
  assert.equal(values.includes("3072x3072"), false);
});

test("Seedream 5.0 Lite retains 3K and 4K presets", () => {
  const values = tools.imageSizeOptions("doubao-seedream-5-0-260128").map(([value]) => value);
  assert.equal(values.includes("3072x3072"), true);
  assert.equal(values.includes("4096x2304"), true);
});
```

- [ ] **Step 2: Run the size tests and verify RED**

Run: `node --test server/seedream-5-sizes.test.js`

Expected: Pro test fails because current code returns the shared Lite table.

- [ ] **Step 3: Split Pro/Lite helpers and preserve exact selected dimensions**

```js
function isSeedream5ProImageModel(model) {
  return /^doubao-seedream-5-0-pro-\d+$/.test(normalizeModelValue("image", model));
}

function isSeedream5LiteImageModel(model) {
  return /^doubao-seedream-5-0-(?:lite-)?\d+$/.test(normalizeModelValue("image", model));
}

function imageSizeOptions(model) {
  if (isSeedream5ProImageModel(model)) return seedream5ProImageSizes;
  if (isSeedream5LiteImageModel(model)) return seedream5LiteImageSizes;
  // existing providers unchanged
}
```

- [ ] **Step 4: Extend request-body tests for Pro controls**

```js
test("Seedream 5.0 Pro sends PNG and fast prompt optimization", () => {
  const body = buildBody("doubao-seedream-5-0-pro-260628", {
    outputFormat: "png",
    promptOptimization: "fast",
  });
  assert.equal(body.output_format, "png");
  assert.deepEqual(body.optimize_prompt_options, { mode: "fast" });
  assert.equal(Object.hasOwn(body, "sequential_image_generation"), false);
});
```

- [ ] **Step 5: Run the request test and verify RED**

Run: `node --test server/seedream-5-request.test.js`

Expected: `output_format` or `optimize_prompt_options` is missing.

- [ ] **Step 6: Add Pro controls to node defaults, rendering, field sync and request body**

```js
imageConfig: {
  label: "图片生成",
  model: getDefaultModel("image"),
  quality: "标准画质",
  size: getImageSizeValue(getDefaultModel("image"), "2048x2048"),
  outputFormat: "png",
  promptOptimization: "standard",
}
```

When `isSeedream5ProImageModel(model)` is true, render two selects and add:

```js
body.output_format = configNode.data.outputFormat === "jpeg" ? "jpeg" : "png";
body.optimize_prompt_options = {
  mode: configNode.data.promptOptimization === "fast" ? "fast" : "standard",
};
```

- [ ] **Step 7: Add a real routing unit seam and failing test**

Create `server/image-routing.js` with a pure descriptor builder:

```js
function selectImageUpstreamRequest(provider, body) {
  const model = String(body.model || provider.defaultModel);
  const refs = Array.isArray(body.image) ? body.image.filter(Boolean) : body.image ? [body.image] : [];
  if (isVolcArkProvider(provider)) {
    return {
      mode: "json",
      route: "/images/generations",
      refs,
      payload: compactPayload({ ...body, providerId: undefined, model, image: refs.length ? refs : undefined }),
    };
  }
  return refs.length
    ? { mode: "multipart", route: "/images/edits", refs, payload: null }
    : { mode: "json", route: "/images/generations", refs, payload: compactPayload({ ...body, providerId: undefined, model }) };
}
```

The test imports the real function and asserts its route, encoding, references and literal payload without network access.

- [ ] **Step 8: Run the routing test and verify RED**

Run: `node --test server/volc-image-request-routing.test.js`

Expected: helper is absent or selects `/images/edits` for a Volc provider with references.

- [ ] **Step 9: Implement the routing seam and use it inside the existing billing try/catch**

Keep deduction before the call and existing refund/usage recording unchanged. Validate the reference limit before balance deduction so a client error never spends or refunds credits.

- [ ] **Step 10: Verify Task 1 GREEN and inspect only scoped diffs**

Run:

```powershell
node --test server/seedream-5-sizes.test.js server/seedream-5-request.test.js server/volc-image-request-routing.test.js
node --check public/app.js
node --check server/server.js
git diff -- public/app.js server/server.js server/seedream-5-sizes.test.js server/seedream-5-request.test.js server/volc-image-request-routing.test.js
```

Expected: tests pass; syntax checks exit 0; no unrelated lines are overwritten.

---

### Task 2: Add reusable layer response parsing and image-source collection

**Files:**
- Create: `server/seedream-layer-response.test.js`
- Modify: `public/seedream-tools.js`
- Modify: `public/app.js` near `extractImageSource`

**Interfaces:**
- Produces: `extractImageItems(payload): Array<object>`
- Produces: `parseSeedreamLayerResponse(payload): { background: object, layers: object[] }`
- Consumes: existing `persistImageSource(source): Promise<string>`

- [ ] **Step 1: Write parser tests for ordering and metadata**

```js
test("layer response keeps the base and orders layers by z-index", () => {
  const parsed = parse({ data: [
    { url: "bg.png", z_index: 0 },
    { url: "top.png", z_index: 8, name: "标题", bounding_box: { absolute: [10, 20, 110, 70] } },
    { url: "subject.png", z_index: 2, name: "人物", bounding_box: { absolute: [100, 200, 700, 1200] } },
  ] });
  assert.equal(parsed.background.url, "bg.png");
  assert.deepEqual(parsed.layers.map((layer) => layer.name), ["人物", "标题"]);
  assert.deepEqual(parsed.layers[0].bbox, { x: 100, y: 200, width: 600, height: 1000 });
});
```

Add cases for missing background, no layers, missing bbox, degenerate bbox, numeric-string z-index and missing z-index.

- [ ] **Step 2: Run the parser test and verify RED**

Run: `node --test server/seedream-layer-response.test.js`

Expected: `parseSeedreamLayerResponse` is absent.

- [ ] **Step 3: Implement pure collection and parsing helpers**

```js
function parseSeedreamLayerResponse(payload) {
  const items = extractImageItems(payload);
  if (!items.length || !imageSourceFromItem(items[0])) throw new Error("图层接口未返回背景底板");
  const background = normalizeLayerItem(items[0], 0, true);
  const layers = items.slice(1)
    .map((item, index) => normalizeLayerItem(item, index + 1, false))
    .filter((item) => item.source)
    .sort((a, b) => a.zIndex - b.zIndex || a.responseIndex - b.responseIndex);
  if (!layers.length) throw new Error("模型未返回可编辑图层");
  return { background, layers };
}
```

`normalizeLayerItem` converts `[left,top,right,bottom]` to `{x,y,width,height}`, records `bbox_missing` or `bbox_degenerate`, and never invents a crop outside the canvas.

- [ ] **Step 4: Refactor `extractImageSource` to use the collector without changing existing behavior**

`extractImageSource(payload)` returns the first source from `extractImageItems(payload)` so every existing generation path remains single-image.

- [ ] **Step 5: Verify Task 2 GREEN**

Run:

```powershell
node --test server/seedream-layer-response.test.js
node --test server/seedream-5-request.test.js
node --check public/app.js
```

Expected: all pass and the parser has no DOM or network dependencies.

---

### Task 3: Add the precise image-edit node and annotation editor

**Files:**
- Create: `server/seedream-annotation.test.js`
- Modify: `public/seedream-tools.js`
- Modify: `public/index.html` node menu
- Modify: `public/app.js` node sizing/defaults/rendering/actions/connections/generation
- Modify: `public/styles.css` annotation overlay and node styles

**Interfaces:**
- Produces: node type `seedreamEdit`
- Produces: `openSeedreamAnnotationEditor(nodeId): Promise<void>`
- Produces: `renderAnnotatedImage(baseSource, annotation): Promise<string>`
- Produces: `generateSeedreamEdit(configId): Promise<void>`

- [ ] **Step 1: Write behavior tests for annotation normalization and hit testing**

```js
test("annotation points stay normalized and brush paths are simplified", () => {
  assert.deepEqual(tools.clampNormalizedPoint({ x: -0.1, y: 1.2 }), { x: 0, y: 1 });
  assert.deepEqual(tools.simplifyNormalizedPath([
    { x: 0, y: 0 }, { x: 0.001, y: 0.001 }, { x: 0.5, y: 0.5 },
  ], 0.01), [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }]);
});

test("eraser hit testing selects the topmost matching mark", () => {
  const marks = [
    { type: "box", x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4 },
    { type: "point", x: 0.25, y: 0.25 },
  ];
  assert.equal(tools.findAnnotationMarkAt(marks, { x: 0.25, y: 0.25 }, 0.03), 1);
});
```

These tests catch coordinate overflow, unbounded brush state and deletion of the wrong overlapping mark. Node registration is verified through the browser smoke test, not source text.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `node --test server/seedream-annotation.test.js`

Expected: the node type and editor functions are absent.

- [ ] **Step 3: Register node size, defaults, provider kind, menu item and renderer**

Render the connected base-image status, number of extra references, instruction textarea, model/size/format/optimization fields, “标记区域” and “生成编辑结果” buttons.

- [ ] **Step 4: Add pure annotation drawing helpers**

Use versioned normalized marks:

```js
{ type: "point", x: 0.42, y: 0.36 }
{ type: "box", x1: 0.1, y1: 0.2, x2: 0.45, y2: 0.62 }
{ type: "arrow", x1: 0.2, y1: 0.3, x2: 0.7, y2: 0.6 }
{ type: "brush", points: [[0.1, 0.2], [0.12, 0.24]] }
```

`drawAnnotationMarks(ctx, marks, width, height)` draws all marks in `#8b5cf6`; `renderAnnotatedImage` loads the base, draws a copy, and returns PNG data URL.

- [ ] **Step 5: Add the body-mounted annotation overlay**

The overlay owns its canvas until close. Pointer events map `clientX/clientY` through `getBoundingClientRect()` to normalized image coordinates. “橡皮擦” removes the topmost mark whose hit distance is under 14 display pixels. “应用标注” stores `annotation`; “取消” restores the previous node state.

- [ ] **Step 6: Add generation and output-node reuse**

`generateSeedreamEdit` resolves the first reference as the base, creates an annotated data URL when marks exist, appends extra references, enforces at most 10 total images, and calls `requestImageGeneration` with:

```js
const locationInstruction = marks.length
  ? "紫色标记仅用于定位。完成修改后删除全部紫色标记，并保持未标记区域、构图和比例不变。"
  : "保持未要求修改的区域、构图和比例不变。";
```

Use or create one downstream `image` result node, matching `generateImage` and `generateFaceSwap` loading/error behavior.

- [ ] **Step 7: Add connection labels and quick-create menus**

The first incoming image label is “待编辑原图”, subsequent labels are “参考图2…10”. Outgoing connection to `image` is “编辑结果”. An image node context menu can create and connect a precise-edit node.

- [ ] **Step 8: Verify Task 3 GREEN**

Run:

```powershell
node --test server/seedream-annotation.test.js server/seedream-5-request.test.js
node --check public/app.js
```

Then start the existing app and manually verify the editor can draw, undo, erase, clear, apply, close, reopen and preserve marks without submitting a paid request.

---

### Task 4: Add layer separation and editable layer groups

**Files:**
- Create: `server/seedream-layer-group.test.js`
- Extend: `server/seedream-layer-response.test.js`
- Modify: `public/seedream-tools.js`
- Modify: `public/index.html` node menu
- Modify: `public/app.js` node registration, generation, persistence, layer editor, connections
- Modify: `public/styles.css` layer group and layer editor styles

**Interfaces:**
- Produces: node type `layerSeparation`
- Produces: node type `layerGroup`
- Produces: `buildLayerSeparationBody(node, source): object`
- Produces: `createLayerGroupData(parsed, persistedAssets, sourceNodeId): object`
- Produces: `composeLayerGroup(groupData): Promise<string>`
- Produces: `openLayerGroupEditor(nodeId): Promise<void>`
- Produces: `extractLayerAsImage(layerGroupId, layerId): Promise<string>`

- [ ] **Step 1: Add failing request and layer-transform behavior tests**

```js
test("layer separation body uses the native Pro contract", () => {
  const body = buildLayerBody({ size: "auto", seed: 0, promptOptimization: "standard" }, "data:image/png;base64,AA==");
  assert.equal(body.layer_decomposition, true);
  assert.equal(body.output_format, "png");
  assert.equal(body.image, "data:image/png;base64,AA==");
  assert.deepEqual(body.optimize_prompt_options, { mode: "standard" });
});

test("moving an unlocked layer clamps it to an explicit finite rectangle", () => {
  const layer = { x: 10, y: 20, width: 100, height: 80, locked: false };
  assert.deepEqual(tools.moveLayer(layer, 30, -10), { ...layer, x: 40, y: 10 });
  assert.deepEqual(tools.moveLayer({ ...layer, locked: true }, 30, -10), { ...layer, locked: true });
});

test("layer order operations keep the background at the bottom", () => {
  const layers = [
    { id: "bg", role: "background", zIndex: 0 },
    { id: "subject", zIndex: 1 },
    { id: "title", zIndex: 2 },
  ];
  assert.deepEqual(tools.reorderLayer(layers, "subject", 1).map((v) => v.id), ["bg", "title", "subject"]);
  assert.deepEqual(tools.reorderLayer(layers, "bg", 1).map((v) => v.id), ["bg", "subject", "title"]);
});
```

These tests exercise the same pure functions used by the real layer editor. Node/menu presence and pointer interaction are verified in the browser smoke test.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test server/seedream-layer-group.test.js server/seedream-layer-response.test.js`

Expected: layer request and node functions are absent.

- [ ] **Step 3: Register separation and group nodes**

`layerSeparation` renders source readiness, optional prompt, `auto/1K/1.5K/2K`, standard/fast and seed. `layerGroup` renders composite preview, layer count and “编辑图层”. It has no model provider fields.

- [ ] **Step 4: Build and submit the native layer request**

Resolve exactly one source image, probe dimensions, reject width or height under 512, and call `/api/images/generations` with `layer_decomposition: true`. The server must accept the single `image` string and send Ark JSON rather than multipart.

- [ ] **Step 5: Persist background and layer assets before creating the group**

For each parsed item:

```js
const stored = await persistImageSource(item.source);
const assetId = stored.startsWith("idb-image:") ? stored.slice("idb-image:".length) : "";
```

Probe the background size. Use response bbox for layer placement; if bbox is missing, use the layer's native size at `(0,0)` and attach `bbox_missing`. Store background first with role `background`, `zIndex: 0`, `locked: true`, then sorted foreground layers.

- [ ] **Step 6: Implement pure Canvas 2D composition**

Resolve every visible layer asset, sort by `zIndex`, set `ctx.globalAlpha = layer.opacity`, and draw to `{x,y,width,height}` on a transparent canvas. Restore alpha after every layer and export PNG.

- [ ] **Step 7: Implement the body-mounted layer editor**

Use a stage canvas and right panel. Selecting an unlocked layer enables drag; four corner handles resize proportionally around the opposite corner. UI actions mutate a draft copy for visibility, lock, opacity, rename and up/down order. “应用” persists a new composite and commits the draft; “取消” leaves node data unchanged.

- [ ] **Step 8: Add layer extraction and material references**

“提取为图片节点” creates an `image` node whose URL is `idb-image:<layer.assetId>`. Extend `getReferenceMaterialSlots` so a `layerGroup` with `compositeAssetId` is an image source. Connection rules allow `layerSeparation → layerGroup`, `layerGroup → image`, and layerGroup into image/video config inputs.

- [ ] **Step 9: Add errors without automatic paid retries**

Show explicit messages for: missing input, input under 512px, more than one input, missing background, no layers, failed layer download, invalid bounding box and unavailable Pro Provider. Keep the generated response in the separation node's transient error detail when downloads fail; never resubmit automatically.

- [ ] **Step 10: Verify Task 4 GREEN**

Run:

```powershell
node --test server/seedream-layer-response.test.js server/seedream-layer-group.test.js
node --check public/app.js
```

Use a fixture payload and local data-URL layers to manually verify recomposition, drag, scale, opacity, visibility, order, cancel/apply and extracted image nodes without calling Ark.

---

### Task 5: Full regression, documentation and handoff

**Files:**
- Modify: `CLAUDE.md` Seedream section
- Modify: `E:/AI/AI项目/obstian/Codex/projects/6mang.md` only after the implementation is verified
- Review: every file changed by Tasks 1–4

**Interfaces:**
- Consumes: all prior task outputs
- Produces: verified project state and durable project memory

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm test
node --check server/server.js
node --check public/app.js
```

Expected: zero failed tests and both syntax checks exit 0.

- [ ] **Step 2: Run focused static safety checks**

```powershell
rg -n 'apiKey|Authorization|layer_decomposition|seedreamEdit|layerSeparation|layerGroup' public server
git diff --check
```

Confirm no API key is present in front-end state, `layer_decomposition` is only sent for the layer node, and there are no whitespace errors.

- [ ] **Step 3: Browser smoke test without paid generation**

Start the existing server on registered port 8787. Verify login, old project restore, node menus, model switching, precise annotation editor, layer fixture editor, image upload and ordinary non-generation canvas interactions. Do not press a button that submits a real generation.

- [ ] **Step 4: Review diffs against the spec**

Check every in-scope requirement: Pro/Lite sizes, Ark JSON references, Pro controls, four mark tools, layer native response, background/layer persistence, edit operations, extraction, connection behavior, errors and no automatic retries. Record any gap and fix it through a new RED/GREEN cycle before proceeding.

- [ ] **Step 5: Update project documentation and memory**

Document the three new node types, the Ark layer contract, IndexedDB layer assets, result limitations, and the exact verification commands. Do not store credentials, generation URLs or user content.

- [ ] **Step 6: Final verification after documentation edits**

Run:

```powershell
npm test
node --check server/server.js
node --check public/app.js
git diff --check
git status --short
```

Report the exact test count, remaining user-owned dirty files, changed files, limitations, and whether any paid API call was made.
