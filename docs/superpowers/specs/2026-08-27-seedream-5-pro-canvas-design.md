# 6mang Seedream 5.0 Pro 专业图片工作流设计

## 目标

把火山方舟 `doubao-seedream-5-0-pro-260628` 的专业图片能力完整接入 6mang 画布，形成三条可组合工作流：

1. 现有图片节点可靠使用 Seedream 5.0 Pro 文生图、单图编辑和最多 10 张参考图融合。
2. 新增“精确图片编辑”节点，允许用户在原图上用点、矩形、箭头和画笔标记编辑位置。
3. 新增“智能图层分离”和“图层组”节点，把一张图片拆成补全背景及最多 16 个带透明度、坐标、层级、名称和描述的可编辑图层。

生成图片及图层素材继续保存在 IndexedDB，画布和项目状态只保存 `idb-image:<assetId>` 引用及轻量元数据，不把 base64 写入 localStorage。

## 设计分类与范围

这是架构级改动，因为它新增两个节点类型、一套画布外图片标注编辑器、一种图层文档数据结构，并扩展图片接口的 Provider 协议分流。

本期包含：

- 修正 Seedream 5.0 Pro 请求协议和尺寸。
- 添加 PNG/JPEG、提示词优化模式等 Pro 参数。
- 精确图片编辑节点及标注编辑器。
- 原生图层分离请求、响应解析、图层组编辑器和合成输出。
- 图层显隐、锁定、顺序、不透明度、位置与缩放。
- 将单个图层或图层组合成的新图片继续连接到图片/视频节点。

本期不包含：

- OCR 后将文字还原成可编辑字体。
- PSD 文件导出。
- 本地 SAM/分割模型兜底。
- 旋转、混合模式和图层蒙版绘制。
- 自动提交真实付费生成作为测试。

这些能力可以在图层文档格式稳定后增量增加，不阻塞当前可用版本。

## 方案比较

### 方案 A：复用统一图片接口，新增画布原生编辑与图层节点（采用）

所有 Seedream 调用仍走现有 `POST /api/images/generations`。服务端仅按 Provider 能力选择 JSON `/images/generations` 或通用 multipart `/images/edits`；前端负责标注图生成、图层响应解析与 IndexedDB 持久化。

优点：保持现有鉴权、计费、退款和历史归档链路；不新增依赖或服务；新节点可以与现有图像、视频和 3D 节点直接连线。缺点：`public/app.js` 仍然较大，需要用小而纯的辅助函数控制复杂度。

### 方案 B：把图层能力做成独立后端子服务

新建专用图层 API，负责下载、裁切、合成和文件导出。

优点：前端更薄，未来做 PSD 更自然。缺点：当前阶段会引入不必要的服务边界、端口和资产同步问题，也违背项目零依赖、单服务的既有结构。

### 方案 C：只给现有图片节点增加几个 Seedream 开关

不新增节点，仅在图片生成节点中加入编辑和分层选项。

优点：改动最少。缺点：标注工具、图层面板和普通生图参数混在一个节点中，工作流语义不清楚，也无法让图层作为长期可编辑资产存在。

采用方案 A。

## Seedream 5.0 Pro 协议

### 普通生成与图片编辑

火山方舟 Provider 使用：

```text
POST {baseUrl}/images/generations
Content-Type: application/json
```

请求结构：

```json
{
  "model": "doubao-seedream-5-0-pro-260628",
  "prompt": "编辑或生成指令",
  "image": ["第一张参考图", "第二张参考图"],
  "size": "2048x2048",
  "response_format": "url",
  "output_format": "png",
  "optimize_prompt_options": { "mode": "standard" },
  "watermark": false
}
```

`image` 在没有参考图时省略；有一张或多张时仍然使用 JSON `/images/generations`。Seedream 5.0 Pro 最多接收 10 张参考图，不发送 `sequential_image_generation`，不请求流式输出。

对非火山 Provider 保持现有兼容行为：有参考图时继续使用 multipart `/images/edits`，避免改变 GPT Image、Gemini 和 NewAPI 渠道。

### 尺寸与输出参数

Pro 与 Lite 使用独立尺寸表：

- Pro：1K、2K，默认 `1024x1024`；精确尺寸总像素在 921,600 到 4,624,220 之间，宽高比在 1:16 到 16:1。
- Lite：保留现有 2K、3K、4K 尺寸表。

Pro 预设包括：

```text
1K: 1024x1024, 1152x864, 864x1152, 1424x800, 800x1424,
    1248x832, 832x1248, 1568x672
2K: 2048x2048, 2368x1776, 1776x2368, 2816x1584, 1584x2816,
    2496x1664, 1664x2496, 3136x1344
```

Seedream 5.0 Pro 节点显示：

- 输出格式：PNG / JPEG，默认 PNG。
- 提示词优化：标准 / 快速，默认标准。
- 水印：默认关闭；本期沿用固定关闭，不增加常驻 UI。

### 原生图层分离

图层分离使用相同接口，额外发送：

```json
{
  "model": "doubao-seedream-5-0-pro-260628",
  "image": "单张原图",
  "prompt": "可选的分层说明",
  "size": "auto",
  "seed": 0,
  "response_format": "url",
  "output_format": "png",
  "layer_decomposition": true,
  "watermark": false,
  "optimize_prompt_options": { "mode": "standard" }
}
```

约束：

- 只接收一张输入图。
- 输入至少 512×512，宽高比为 1:16 到 16:1。
- `size` 可选 `auto`、`1K`、`1.5K`、`2K`，默认 `auto`。
- 空提示词表示自动识别主要元素；也可以用自然语言指定拆分对象。

响应 `data` 的解析规则：

1. `data[0]` 是补全后的背景底板，正常情况下没有 `bounding_box`，按 `z_index: 0` 保存。
2. 后续项目是透明 PNG 图层。
3. `bounding_box.absolute` 为 `[left, top, right, bottom]`，右边和下边按排他边界计算。
4. `z_index` 决定从下到上的顺序；缺失或非法时保持响应顺序。
5. `name` 和 `description` 保存为图层名称及说明。
6. 图层原生尺寸与 bounding box 不一致时，前端按 bounding box 显示尺寸缩放，保留异常标记供诊断。

若响应没有背景或没有任何透明图层，节点进入错误状态，不把普通扁平图片伪装成图层组。

## 节点与数据结构

### 精确图片编辑节点

内部类型：`seedreamEdit`

默认状态：

```json
{
  "label": "精确图片编辑",
  "providerId": "volc",
  "model": "doubao-seedream-5-0-pro-260628",
  "size": "2048x2048",
  "outputFormat": "png",
  "promptOptimization": "standard",
  "prompt": "",
  "annotation": {
    "version": 1,
    "width": 0,
    "height": 0,
    "marks": []
  }
}
```

输入规则：

- 第 1 张图片是待编辑底图。
- 第 2–10 张图片是人物、商品、风格或材质参考。
- 没有第 1 张图片时不能执行。

标注工具使用画布外浮层，避免主画布 `render()` 重建 DOM 时销毁编辑状态。工具包括：

- 点：保存归一化坐标。
- 矩形：保存起点和终点。
- 箭头：保存起点、终点和箭头方向。
- 画笔：保存归一化路径点。
- 橡皮擦：删除命中的完整标记。
- 撤销、清空、取消、应用标注。

标记使用高可见紫色；提交时把标记绘制到原图副本，并在提示词尾部加入“紫色标记仅用于定位，请删除所有标记并保持未标记区域不变”。标注原始数据保留在节点状态中，生成用的合成图只临时存在，不写 localStorage。

执行结果沿用普通 `image` 输出节点。

### 智能图层分离节点

内部类型：`layerSeparation`

默认状态：

```json
{
  "label": "智能图层分离",
  "providerId": "volc",
  "model": "doubao-seedream-5-0-pro-260628",
  "prompt": "",
  "size": "auto",
  "promptOptimization": "standard",
  "seed": 0
}
```

只允许一张原图输入。生成成功后创建或更新一个 `layerGroup` 输出节点。

### 图层组节点

内部类型：`layerGroup`

数据结构：

```json
{
  "label": "图层组",
  "width": 2048,
  "height": 2048,
  "sourceNodeId": "原图节点 ID",
  "compositeAssetId": "当前合成预览资产 ID",
  "selectedLayerId": "当前选中图层 ID",
  "layers": [
    {
      "id": "layer-id",
      "name": "人物",
      "description": "主体人物",
      "role": "subject",
      "assetId": "IndexedDB 资产 ID",
      "x": 240,
      "y": 180,
      "width": 720,
      "height": 1440,
      "nativeWidth": 720,
      "nativeHeight": 1440,
      "zIndex": 2,
      "visible": true,
      "opacity": 1,
      "locked": false,
      "generatedHiddenPixels": true,
      "flags": []
    }
  ]
}
```

背景底板也是 `layers[0]`，角色为 `background`，位置为 `(0,0)`，默认锁定。所有图层按 `zIndex` 从小到大合成。

图层组节点内显示缩略预览和简化图层列表；点击“编辑图层”打开画布外浮层：

- 左侧为合成舞台。
- 右侧为图层列表。
- 点击图层后可拖动和从四角等比缩放。
- 可切换显隐、锁定、调整不透明度和上下移动层级。
- 可重命名图层。
- “应用”把当前合成结果绘制成 PNG，写入 IndexedDB 并更新 `compositeAssetId`。

本期不直接让同一节点拥有多个输出端口。右键图层可以“提取为图片节点”，创建普通 `image` 节点并复用同一个 IndexedDB 资产；图层组本身作为参考图时使用当前 `compositeAssetId`。

## 图片标注与图层合成

所有像素处理使用浏览器原生 Canvas 2D：

- `resolveImageSource()` 把 `idb-image:`、data URL 和远程 URL 统一解析成浏览器可加载地址。
- 标注坐标存为 0–1 的归一化值，显示或生成时映射到真实像素。
- 图层合成时按 `zIndex` 排序，使用 `globalAlpha` 和每层矩形位置绘制。
- 透明图层保持 PNG alpha；不为透明区域填黑或白。
- 背景层缺失时拒绝创建图层组。

每次生成新的合成预览时创建新的 IndexedDB 资产。合成预览和原始图层资产都不自动删除，避免 Undo/Redo 或其他节点引用失效；后续如需清理，由独立的资产引用扫描负责。

## 连线规则

- `image → seedreamEdit`：底图或参考图，按连线顺序编号。
- `seedreamEdit → image`：编辑结果。
- `image → layerSeparation`：待分层原图，只允许一张。
- `layerSeparation → layerGroup`：图层文档输出。
- `layerGroup → imageConfig / seedreamEdit / videoConfig`：使用当前合成预览作为参考图片。
- `layerGroup → image`：创建合成结果图片节点。

`getReferenceMaterialSlots()` 将具有 `compositeAssetId` 的 `layerGroup` 视作图片素材，但不把整个图层文档发送给上游。

## 错误、计费与安全

- 所有 Seedream 请求继续经过 `requireUser`、先扣费、失败退款和失败记账。
- 不增加未鉴权的调试接口。
- 火山 Provider 只改变上游请求格式，不改变 API Key 的服务端存储和脱敏规则。
- 参考图最多 10 张，客户端和服务端都做数量校验。
- 图层分离只接受单图；尺寸和宽高比先在客户端验证，服务端再次验证请求结构。
- 远程图层 URL 在返回后立即下载并写入 IndexedDB，避免 24 小时过期；下载失败时保留生成响应中的 URL 和错误信息，允许用户在有效期内重试导入。
- 不自动重试任何可能重复计费的生成请求。

## 兼容性

- 旧画布没有新字段时使用默认值。
- 现有 `imageConfig`、`faceSwapConfig`、`imageExpand` 和模板图片节点继续工作。
- 只有 `isVolcArkProvider(provider)` 的图片请求使用 JSON 参考图协议；其他 Provider 不变。
- 现有 Seedream Lite 尺寸和 `sequential_image_generation: "disabled"` 保持不变。
- `layerGroup` 的未知字段在保存/恢复时保留，便于未来增加旋转、混合模式、蒙版和 PSD 导出。

## 文件边界

- `server/server.js`：火山图片协议分流、图片数量和分层请求校验。
- `public/app.js`：模型能力、节点、请求体、标注编辑器、图层解析、图层编辑器、连线和 IndexedDB 持久化。
- `public/styles.css`：精确编辑浮层、图层组节点和图层编辑器样式。
- `server/seedream-5-request.test.js`：Pro/Lite 请求字段和参数测试。
- `server/seedream-5-sizes.test.js`：Pro/Lite 独立尺寸测试。
- 新增 `server/volc-image-request-routing.test.js`：火山 JSON 编辑与通用 multipart 编辑路由测试。
- 新增 `server/seedream-layer-response.test.js`：图层响应解析和排序测试。
- 新增 `server/seedream-editor-ui.test.js`：新节点、工具和连线契约的静态测试。

## 测试与验收

自动测试：

1. Pro 精确尺寸只有 1K/2K，Lite 继续包含 3K/4K。
2. Pro 请求不包含 `sequential_image_generation`，包含正确的输出格式和优化模式。
3. 火山 Provider 有参考图时调用 JSON `/images/generations`，其他 Provider 仍调用 multipart `/images/edits`。
4. 火山请求保留一张或多张 `image`，超过 10 张时返回 400 且不扣费。
5. 分层请求包含 `layer_decomposition: true`、PNG 和单张图片。
6. 图层响应将 `data[0]` 识别为背景，并按 `z_index` 排序剩余图层。
7. 缺少背景、图层或合法 bounding box 时产生可理解错误或诊断标记。
8. 新节点类型、默认状态、菜单、连线规则和执行入口存在。
9. JavaScript 语法检查和完整 `npm test` 通过。

浏览器验收：

1. Seedream 5.0 Pro 图片节点只显示正确尺寸，并可选择 PNG/JPEG 与标准/快速模式。
2. 精确编辑节点能打开原图、绘制四种标记、保存后恢复标记并生成普通图片结果。
3. 智能图层分离节点能把固定模拟响应转换成图层组。
4. 图层编辑器能移动、缩放、显隐、锁定、调透明度、改顺序并保存合成图。
5. 提取图层创建普通图片节点，图层组合成图能继续连接图片或视频节点。
6. 旧项目加载、现有图片生成、换脸、扩图和视频流程没有回归。

真实 API 验收只做用户主动触发的付费调用；自动化验证不提交真实生成任务。

## 参考契约

- ByteDance Seedream 5.0 Pro 发布说明：<https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro>
- BytePlus ModelArk 图片生成教程：<https://docs.byteplus.com/api/docs/ModelArk/1824121>
- ComfyUI ByteDance 图层分离客户端实现：<https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_bytedance.py>
- ComfyUI ByteDance 请求模型：<https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/apis/bytedance.py>
