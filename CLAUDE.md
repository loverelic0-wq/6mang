# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库中工作时提供指引。

## 项目定位

**6mang** —— 浏览器无限画布。用户把 文本 / LLM / 提示词优化 / 文生图配置 / 故事板 / 视频配置 / 图片 / 视频 等节点连成工作流，后端把调用代理到 OpenAI 兼容上游（在应用设置面板里配置 providers，持久化到 `.huobao-settings.json`），并完成 **登录 → 余额扣减 → 调用 → 失败退款 → 用量记账** 的闭环。

## 启动

- `npm run dev` / `npm start` —— 两条都是 `node server/server.js`，没有构建步骤；`npm test` 运行 `node --test server/*.test.js`。
- `quick-start.cmd` —— Windows 一键启动：缺 `.env` 时从 `.env.example` 生成，启动后浏览器自动打开 `http://${HOST}:${PORT}`（默认 `127.0.0.1:8787`）。
- **Node 22+ 必需**：`server/db.js` 使用 `require("node:sqlite")`（Node 22 起内置）。之前 README 说的 "Node 18+" 已经不准确。
- **`node_modules` 不存在也是对的**：项目零 npm 依赖，所有功能用 Node 内置模块（`http` / `node:sqlite` / `crypto` / 全局 `fetch`）。不要加 Express、dotenv、bcrypt、better-sqlite3 等。
- **首次启动会自动创建 admin 账户**：用户名 `admin`，密码取 `process.env.ADMIN_PASSWORD || "admin1234"`，初始余额 100000。控制台会打印一行 `[bootstrap] created default admin`。该账户写入 `data/app.db`，仅在表为空时创建一次。

## 架构

代码量分布：`public/app.js` ~5300 行 + `server/server.js` ~1150 行 + `server/db.js` ~250 行。`public/styles.css` 是手写的 2600 行。**几乎所有工作都在这三个文件里**。

### 后端（`server/`）

- **`server.js`** —— 单文件原生 `http` 服务器（无任何框架）。负责：
  1. 静态服务 `public/`（无扩展名 path 回落到 `public/index.html`）。
  2. 路由所有 `/api/*` 请求（手写 if 链，没有 router）。
  3. 通过 `n1nFetch(provider, route, opts)` / `n1nFetchForm(provider, route, form)` 转发到上游，`provider` 由 `getProvider(kind, providerId)` 拿到。**API key 永不下发到浏览器**。
- **`server/db.js`** —— SQLite 层（`node:sqlite`），DB 落在 `data/app.db`。四张表：`users`、`sessions`、`transactions`（余额变动流水）、`api_usage`（调用记录）。密码用 `scryptSync` + 16B salt；会话用 32B 随机 hex token + HttpOnly cookie（`huobao_session`），默认 30 天 TTL。

### 鉴权 + 计费（核心，文档之前完全没写）

**所有调用生成服务的 API 都必须先 `requireUser(req)`**（401 if 没登录）。普通 HTTP provider 的处理流程是固定三段式：

```
db.adjustBalance(-cost)   // 先扣，不够会抛 402
try {
  data = await n1nFetch(...)
  db.recordApiUsage(..., status: "ok")
  sendJson(res, 200, data)
} catch (error) {
  db.adjustBalance(+cost, type: "refund", ...)   // 失败必须退款
  db.recordApiUsage(..., cost: 0, status: `error: ...`)
  throw error
}
```

**修改普通 HTTP provider 的接口时，必须保持「先扣 → try → 失败退款 + 失败记账」结构。** 漏退款 = 用户白付钱；漏 try/catch = 调用失败但钱已扣。唯一例外是托管的 `adapter: "kling-cli"` provider：它使用用户本机可灵 OAuth/灵感值，必须在扣画布余额前分流，不写 `transactions` / `api_usage`。

**计费表** 写死在 `server.js` 顶部 `modelCostRules`：
- `chat`: 默认 1（覆盖 `/api/chat/polish` 和 `/api/chat/optimize-prompt`）
- `image`: 按模型 6–15（`gpt-image-2`=15，`gemini-3-pro-image-preview`=10，`gemini-3.1-flash-image-preview`=6，`midjourney`/`niji-journey`=15，默认 8）
- `video`: 默认 60

加新模型时同时更新这张表，否则会走 `default`。注意计费按 **model id** 查表，不按 provider —— 同一个 model id 在不同 provider 下费率一致。

**接口清单**

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/auth/register` `/login` `/logout` `/me` | POST/POST/POST/GET | — | Cookie session |
| `/api/billing/transactions` `/usage` | GET | 用户 | 自己的流水 |
| `/api/admin/users` | GET | admin | 用户列表 |
| `/api/admin/users/:id/transactions` `/usage` | GET | admin | 看任意用户流水 |
| `/api/admin/credit` | POST | admin | `{username, amount, note}` 调余额（正充值、负扣减） |
| `/api/status` | GET | — | 返回 `{providers: {chat, image, video}}`，apiKey 脱敏（只回 `configured` + `apiKeyMasked`） |
| `/api/settings` | POST | admin | 全量覆盖 providers schema 持久化；apiKey 字段传 `"__keep__"` 表示保留原值 |
| `/api/chat/polish` | POST | 用户 | 单次润色，body 接 `{providerId, model, text}` |
| `/api/chat/optimize-prompt` | POST | 用户 | 6 维度 JSON 提示词（`subject/structure/material/lighting/style/composition`），body 接 `{providerId, model, text}` |
| `/api/images/generations` | POST | 用户 | OpenAI 兼容；body 接 `{providerId, model, prompt, ...}`；有参考图自动走 `/images/edits`（multipart，多图用 `image[]` 字段） |
| `/api/images/mj/create` `/mj/query` | POST/GET | 用户/— | Midjourney 异步，create body 和 query 都带 `providerId` |
| `/api/video/create` `/video/query` | POST/GET | 用户/— | Sora / 其他视频，异步，create body 和 query 都带 `providerId` |
| `/api/history/save` | POST | — | 保存生成结果到本机 `output/<projectName>_<id>/` |
| `/api/image-proxy?url=...` | GET | — | 给 canvas 用的 SSRF-guarded 图片回流 |

**Admin 鉴权双通道**：所有 `/api/admin/*` 走 `requireAdmin(req)`，要么 session user 的 `is_admin=1`，要么请求头带 `X-Admin-Token: $ADMIN_TOKEN`（环境变量配置，运维通道）。

### 上游适配的分支

所有图像/视频上游统一走 OpenAI 兼容协议（`/images/generations` + `/images/edits` + `/video/*`）。`server.js` 里 `/api/images/generations` 和 `/api/video/create` 做的模型嗅探：

1. **图像 - 文生图（默认）** —— JSON body 打到 `/images/generations`。
2. **图像 - 有参考图** —— 通用 Provider 改走 `/images/edits`（multipart，`imageSourceToBlob` 把 data URL / http URL 转 Blob）；火山方舟 Provider 仍以 JSON `image` 字段走 `/images/generations`，由 `server/image-routing.js` 统一选择协议。通用多图用 `image[]` 字段，单图用 `image`。
3. **视频 - Sora**（`isSoraModel`，模型名以 `sora` 开头）—— 用 `{prompt, size, seconds, input_reference}`（参考图取 `images[0]`）。
4. **视频 - 其他**（如 Veo、可灵等）—— 用 `{prompt, aspect_ratio, duration, images[], enable_upsample, enhance_prompt}`。`sizeToAspectRatio()` 把 `1280x720` 这种尺寸转成 `16:9`。

**模型→上游的分配靠 providerId 显式路由**（不再按模型名前缀嗅探）。前端调任何花钱接口都必须在 body / query 里带上节点选中的 `providerId`，后端 `getProvider(kind, providerId)` 据此挑出 baseUrl/apiKey；`providerId` 为空回退到该 kind 的 `default` 子类。**不要再加 `pickXxxService` 这种按模型名硬编码路由的函数。**

**Midjourney** 是它自己的提交-轮询协议：`POST /mj/submit/imagine` 返回 `code` + `result`（taskId），前端轮询 `GET /mj/task/<id>/fetch`。响应 `code` 中 `1` 和 `22` 都算成功（22 是排队中），`24` 映射成 HTTP 402（额度不足）。MJ 路由同样接 `providerId`。

### 可灵 CLI 托管 provider

`server/kling-cli.js` 是 `@klingai/cli-cn` 的安全进程适配器：直接 `spawn(process.execPath, [cliScript, ...args])`，不经过 shell；统一处理超时、JSON、OAuth 单例、data URL 临时文件、任务查询和错误。默认自动发现全局 npm 安装，也可用 `KLING_CLI_JS` 指定入口。

- 图片/视频配置中始终注入 id 为 `kling-cli`、`adapter: "kling-cli"`、`managed: true` 的 provider；它不允许在设置页修改 Base URL/API Key 或删除。
- `who_am_i --quiet` 是能力真源，`publicProvidersStatus()` 把当前账号的模型、工具、参数、默认值、枚举值和素材槽位动态合并给前端；不要写死可灵模型表。
- OAuth 由 `/api/kling/login|logout|status|refresh` 驱动。Token 只由 CLI 写入 `~/.kling/.credentials`，服务端和前端都不读取、不复制、不落库。
- `/api/images/generations` 根据参考图选择 `text_to_image` / `image_to_image`；`/api/video/create` 选择 `text_to_video` / `image_to_video`；结果统一经 `/api/kling/tasks/:id` 轮询回现有输出节点。
- 可灵请求仍要求画布用户登录，但必须在 `db.adjustBalance()` 前分支；`usesCanvasBilling(provider)` 是计费边界的显式判定。
- `public/kling-provider.js` 是无构建 UMD helper，负责能力过滤、动态字段、参数序列化和必填素材验证；`public/app.js` 只负责把它接到既有节点与设置面板。

### Seedream 5.0 Pro 图片工作流

- 火山图片 Provider `volc` 固定使用 Ark `/images/generations` JSON 协议；普通文生图、单图编辑和最多 10 张参考图融合都不切到 multipart `/images/edits`。协议选择和服务端前置校验集中在 `server/image-routing.js`。
- `doubao-seedream-5-0-pro-260628` 只使用官方 1K/2K 精确像素尺寸；支持 `png/jpeg` 与 `optimize_prompt_options.mode=standard|fast`，必须省略 `sequential_image_generation`。Seedream 5.0 Lite 保留原 2K/3K/4K 尺寸和 `sequential_image_generation:"disabled"`。
- `seedreamEdit` 是 Pro 专用的空间标注编辑节点。标记数据用归一化矢量坐标保存；生成时才把紫色点/框/箭头/画笔烘焙到第一张参考图，最多再接 9 张额外参考图。
- `layerSeparation` 发送 `layer_decomposition:true`、单张 `image`、`size=auto|1K|1.5K|2K`、PNG 输出；服务端在扣费前验证必须是火山 Provider、Pro 模型和恰好一张图。
- 图层响应首项是补全背景，其余项按 `z_index` 与 `bounding_box.absolute` 转为 `layerGroup`。背景及透明 PNG 立即下载到 IndexedDB，节点状态只保存 `idb-image:<assetId>` 和坐标/显隐/锁定/透明度等轻量元数据。
- `public/seedream-tools.js` 是无构建 UMD helper，也是 Node 行为测试的真实入口；请求参数、响应解析、标注命中和图层变换优先在这里实现，避免用源码字符串测试替代行为测试。
- 图层分离没有本地模拟结果：未配置火山图片 Key 时必须明确报错，不能把扁平占位图伪装成可编辑图层。

### `/api/image-proxy`（SSRF 保护）

前端常需要把上游图片画到 `canvas`（跨域会污染），所以走服务器回流。`isBlockedHost()` 拦截 `localhost` / `127.0.0.0/8` / `169.254/16` / RFC1918（10/8、172.16-31、192.168/16）。**改这个 proxy 时务必保留这张拦截表**，否则会变成 SSRF 跳板。`saveHistoryFile` 下载远程图时也走同一个 `isBlockedHost` 检查。

### providers 配置（kind → providers → models）

服务配置是**三层**结构，全部存在 `.huobao-settings.json`（gitignored），结构如下：

```js
{
  providers: {
    chat:  { default: <providerId>, items: { <providerId>: {label, baseUrl, apiKey, defaultModel, models:[{id,label}]} } },
    image: { default: <providerId>, items: { ... } },
    video: { default: <providerId>, items: { ... } },
  }
}
```

每个 **kind**（chat / image / video）下可以挂多个 **provider**（"子类"），每个 provider 自带 baseUrl + apiKey + 默认模型 + 模型池。同一个 kind 下可以有多个 provider 用不同的 key（典型场景：OpenAI 系一个 key，Gemini/nano banana 一个 key）。

**改服务配置逻辑时记住这条链**：
1. `loadRuntimeSettings()` 启动时读 `.huobao-settings.json`：检测到老 schema (`services.{chat,image,video,imageBanana}` 扁平结构) 会自动迁移成新 providers schema，备份原文件为 `.huobao-settings.json.bak.<timestamp>`
2. `getProvider(kind, providerId)` 是**唯一**入口：providerId 空或不存在时回退到该 kind 的 `default`
3. `applyProvidersUpdate(incoming)` 处理 `/api/settings` 全量覆盖；apiKey 字段值为哨兵 `__keep__` 时保留原值不动（前端编辑时不需要重输 key）
4. `publicProvidersStatus()` 给前端的脱敏视图：只回 `{label, baseUrl, defaultModel, models, configured, apiKeyMasked}`，**永不下发 apiKey 明文**
5. 服务配置完全走 `.huobao-settings.json` + 设置面板，**不再读任何上游相关的环境变量**。`.env` 只用来配 `HOST` / `PORT` / `ADMIN_PASSWORD` / `ADMIN_TOKEN`。

**`DEFAULT_PROVIDERS`** 常量定义初始模型池（首次启动或迁移失败时用）。新增预设模型时改它。

**`/api/settings`** 是 admin-only（普通用户改不了 key），鉴权双通道沿用 `requireAdmin`。

## 前端（`public/app.js`，单文件 vanilla JS，无 bundler）

### 节点类型（内部名 vs UI）

| 内部 `node.type` | UI 显示 | 备注 |
|---|---|---|
| `text` | 文本节点 / 提示词 | 支持 `@` mention 引用图像 |
| `llmConfig` | LLM 文本生成 | `runLlmNode` |
| `promptOptimizer` | 提示词优化 | 调 `/api/chat/optimize-prompt`，输出 6 字段 |
| `imageConfig` | 文生图配置 | `generateImage` |
| `storyboardConfig` | 故事板生成 | `generateStoryboard`，会展开多帧 |
| `faceSwapConfig` | 换脸 | `generateFaceSwap`；接两张图片，按连线顺序 ①底图(保留)/②脸源(取脸)；指令式编辑（复用 `/api/images/generations` 多参考图 + `FACE_SWAP_PROMPT`，让模型在底图光照下重生成脸而非抠图粘贴），输出尺寸用 `nearestByAspect` 跟随底图比例；零后端改动，按 image 费率计费 |
| `styleTransferConfig` | 风格迁移 | `generateStyleTransfer`；严格接两张图片，按连线顺序 ①内容图(保留主体/构图)/②风格参考(只取画风)；轻度/标准/强烈三档提示词由 `public/style-transfer.js` 生成，输出比例跟随内容图；复用现有图片生成、鉴权、计费、失败退款与历史归档链路 |
| `materialTransferConfig` | 材质迁移 | `generateMaterialTransfer`；严格接两路素材，按连线顺序 ①主体/结构(锁定形体、视角、细节与场景)/②材质参考(只取颜色、纹理、粗糙度、光泽、反射与透光等材质属性)；轻度/标准/强烈三档提示词由 `public/material-transfer.js` 生成，输出比例跟随主体输入；支持图片、图层组和 3D 模型预览截图，复用现有图片生成、鉴权、计费、失败退款与历史归档链路 |
| `seedreamEdit` | 精确图片编辑 | Seedream 5.0 Pro 专用；空间标注 + 最多 10 图参考编辑 |
| `productBackgroundConfig` | 产品换背景 | `generateProductBackground`；双图直接编辑，一次完成背景替换与光影统一。输入可节点内上传或连线；`public/product-background.js` 按边标签“产品图/背景图”固定角色，普通无角色连线按顺序填空位。请求始终产品在前、背景在后；比例可跟随任一输入。复用现有鉴权、计费、编辑接口和结果/历史存储；没有抠图、mask 或本地模拟结果。运行集合防止同一节点重复提交，异常后释放重试。 |
| `layerSeparation` | 智能图层分离 | Seedream 5.0 Pro 原生图层分离配置；只接单图 |
| `layerGroup` | 图层组 | IndexedDB 图层文档；支持移动、等比缩放、排序、显隐、锁定、透明度、重命名、合成与提取 |
| `videoConfig` | 视频生成配置 | `generateVideo` |
| `image` | 图片节点 / 载入图像 / 历史图片 | `data.url=false` 是待上传状态 |
| `video` | 视频节点 / 载入视频 | 异步任务 `taskId` 轮询；空态支持 点击/拖入/粘贴 载入本地视频（blob 走 IndexedDB，`idb-image:` 哨兵） |
| `model3dPreview` | 3D 模型预览 | 见下方「3D 模型预览节点」 |

#### 3D 模型预览节点（`model3dPreview`）

载入 glb/gltf/obj/fbx/stl 模型，在浮层里用 OrbitControls 调角度/焦段(fov)/渲染风格(原始材质·素模·深度·法线·线框)，截取当前帧作**结构参考图**喂给文生图节点。

- **three.js 经 importmap 引入**：`index.html` 里 importmap 把 `three` / `three/addons/` 指向本地 `public/vendor/three/`（离线，不依赖 CDN）。**唯一**碰 three 的文件是 `public/model-preview.js`（`type=module`），它把控制器挂到全局 `window.Model3D`。`app.js`（普通 `<script>`）只通过 `window.Model3D.mount()` 调用——**不要在 app.js 里写 `import`**。
- **live canvas 必须在 `world` 之外**：`render()` 每次 `world.innerHTML=""` 全量重建节点 DOM，会冲掉挂在节点里的 canvas。所以取景用独立浮层 `.model3d-overlay`（挂 `document.body`），由 `openModel3dEditor()` 开关；节点本体只显示截取后的静态帧。
- **同一时刻只开一个浮层**（一个 WebGL 上下文），关闭时 `controller.dispose()` 释放 GPU。
- **模型文件存 IndexedDB**：复用图片那套 `putImageAsset`/`getImageAsset`（`images` store 是通用 blob 存储），节点只存 `modelAssetId`；视角/渲染模式存 `node.data.view` / `node.data.renderMode`（localStorage 可还原）。
- **截图即参考图**：截帧走 `persistImageSource()` 写 `node.data.url`（`idb-image:` 哨兵）。`getImageReferenceSlots()` 已扩展为「`type:"image"` 或 有 `url` 的 `model3dPreview`」，所以连线到文生图节点即被当参考图，**后端/计费零改动**。
- **双相机（Blender 式取景）**：`shotCamera`（取景，决定截图）+ `freeCamera`（自由观察，不影响取景）。OrbitControls 始终控制「当前活动相机」，切换视角时换 `controls.object`+target，并把 `gizmo.camera` 同步成活动相机。`capture()` **永远渲染 `shotCamera`**，无论当前在哪个视角。自由视角下用 `CameraHelper` 画取景视锥，**放独立 `overlayScene` 第二趟 `autoClear=false` 渲染**。加载时模型几何中心被移到世界原点（pivot 外壳），旋转/平移才绕模型中心。
- **场景搭建（DCC 式）**：可往场景加基础几何体（box/sphere/cone/cylinder/plane/torus，挂在 `primitivesGroup`），用 `TransformControls` 做 gizmo——移动/旋转/缩放（缩放拖轴=单轴、拖中心=等比）、世界/本地坐标系。**导入的模型（`modelRoot`）和零件一样可选中/可变换**，各有独立 transform；`topSelectable()` 把命中的子网格爬升到可选根（零件→`primitivesGroup` 直接子，模型→整个 `modelRoot`）。`deleteSelected()` 只删零件、不删模型主体。拖 gizmo 时 `dragging-changed` 禁用 OrbitControls；点选用 raycaster（pointerdown→up 位移<5px 才算点选，避开转视角；命中 `gizmo.axis` 或正在拖则跳过）。零件默认中性灰，可选中后单独自定义颜色（`setPrimitiveColor`，改其 `srcMat.color`，仅原始材质模式可见、随 primitives 的 `color` 持久化），跟随渲染模式。
- **渲染模式 = 逐网格换材质，不是 `scene.overrideMaterial`**：`overrideMaterial` 会把 gizmo 控件、`CameraHelper` 线条一起涂成素模/法线材质。所以改成只遍历「模型 + 零件」逐 mesh 换材质（原材质存 `mesh.userData.srcMat`，模式材质 `modeMaterials` 缓存）。新加 gizmo/helper 想正常显示就靠这个。
- **状态结构**：`getState()` → `{mode, renderMode, shot:{fov,position,target}, model:{position,rotation,scale}, primitives:[{kind,position,rotation,scale}]}`，`setState` 兼容旧的单相机 `{fov,position,target}`。app 侧再往 `view` 里塞 `{aspect, maskAlpha, showGrid}`（这三个是浮层 UI 状态，不在控制器里）。零件随项目持久化（存进 `node.data.view`）。**关闭编辑器即保存场景**（取消/截取都存 `view`，只有「截取并应用」才更新 `url` 参考图）——见 `openModel3dEditor` 的 `cleanup`。`截图截取景相机`时会临时隐藏 `gizmoHelper` 和地面网格。
- **地面网格**：`GridHelper` 按模型尺寸建、放模型脚下（`groundY = -size.y/2`），`setGrid()` 开关，editor-only 不进截图。
- **取景比例 + 黑边遮罩 + 与文生图双向同步**：取景视角下用 DOM 遮罩（`.model3d-mask`，一个 `box-shadow: 0 0 0 9999px rgba(0,0,0,α)` 的居中窗）按所选比例 letterbox，透明度 α 可调；自由视角隐藏遮罩。`shotCamera.aspect` 始终 = canvas 宽高比（不形变），比例只影响遮罩 + 截图裁剪。`capture(type, ratio)` 从满幅渲染结果**中心裁出目标比例**输出（所见即所得）。比例与下游文生图节点双向同步：打开时 `aspectLabelFromImageConfigs()` 读连接的文生图比例作初值；用户改比例时 `applyAspectToImageConfigs()` 按模型类型（MJ 写 `mjAr`、其余写 `size`，用 `nearestByAspect` 选最接近的合法值）写回**所有**连接的文生图。比例/尺寸串解析见 `parseAspect`。
- **浮层全屏**：header 的全屏按钮给 `.model3d-dialog` 加 `.fullscreen` 类铺满，切换后 `requestAnimationFrame` 里 `controller.resize()` + 重算遮罩。
- **IBL 环境光 + 默认 HDR**：先用 `RoomEnvironment` 兜底（HDR 加载前不发黑），随后 `RGBELoader` 异步加载默认 HDR（`public/vendor/hdr/studio_1k.hdr`，~1.7MB，离线打包）→ `PMREMGenerator.fromEquirectangular` → 替换 `scene.environment`。强度 `scene.environmentIntensity`（`setEnvIntensity`，footer「环境」滑块 0–3）；`setEnvBackground` 切换是否把 HDR 当天空盒背景（gizmo 条「背景」按钮，默认关、保持纯色利于构图，开了截图会带 HDR 背景）。基础灯（hemi + 两盏 directional）保留作底、不可选/删、强度调低。`.hdr` 经静态服务按 `application/octet-stream` 返回，RGBELoader 以 arraybuffer 读取不受 MIME 影响。换默认 HDR 改 `DEFAULT_HDR_URL`。env 强度/背景开关随 `getState()` 持久化。
- **灯光系统（可增删 + gizmo）**：`lightsGroup` 挂 light rig（Group）= 灯 + 可拾取灯标小球（`userData.lightIcon`）。平行光/聚光的 `light.target` 固定在世界原点，移动灯位即自动对准模型中心；点光无 target。灯和零件、模型共用同一套 `topSelectable`/gizmo/`deleteSelected`（删灯/零件、不删模型）。灯参数 `setLightParam('intensity'|'color')`。每盏灯按类型挂内置 helper 做可见外形——聚光 `SpotLightHelper`(锥，给了有限 `distance` 让锥可见)/平行光 `DirectionalLightHelper`(方向线)/点光 `PointLightHelper`(圆球线)，helper 必须挂 scene 顶层（不能进 rig，否则变换叠加），每帧 `update()` 跟随灯位/朝向、颜色跟随灯色。截图时灯标 + helper 都隐藏（`setLightIconsVisible(false)`），但灯光效果保留。
- **材质通道（模型级）**：`setMaterialChannel(ch,val)` 遍历模型的 `MeshStandardMaterial`（从 `userData.srcMat` 取）统一调 metalness/roughness/envMapIntensity/emissiveIntensity/color，记进 `materialOverride`。**只在「原始材质」渲染模式可见**（其它模式被模式材质覆盖）。`getState().materialOverride` 持久化，`setState` 在模型就位后套用。零件不调材质（保持结构灰）。
- **C4D 式取景相机裁剪 + 对焦平面**：取景相机 near/far 不再自动贴紧，而是以「对焦点」为中心、由用户调的前景(near=focus-front)/背景(far=focus+back)范围决定——`getCameraClip()`/`setCameraClip({focus,front,back})`，`applyShotClip()` 算 near/far + 更新 `camHelper` + `updateFocusPlane()`。自由相机 near/far 固定放宽(`maxSize*1000`)只为观察不裁。对焦平面 `focusPlane`（橙色矩形线框，放 overlayScene）在自由视角显示在相机前方 `focusDist` 处、尺寸=该处视锥。`frameModel(shotCamera)` 设默认 focus/front/back；持久化 `cameraClip`。UI：属性区**未选中对象时**显示「取景相机」的对焦/前景/背景滑块（`buildProps` 的 null 分支）。深度图模式对比度也靠这个 near/far 可控。
- **对象列表 + 属性（DCC 停靠侧栏）**：浮层结构是 `header / .model3d-body(.model3d-stage + .model3d-side) / footer`。右侧 `.model3d-side` 上半 `.model3d-outliner`（`controller.getObjects()` 列出 模型/零件/灯，点行 `controller.selectById(uuid)` 选中、高亮），下半 `.model3d-props`（选中对象属性：灯→强度/颜色，模型→材质通道，零件→提示）。`mount({onSelectionChange})` 回调触发 `refreshPanel()`（重建列表 + 属性），选中变化（点 3D 视图或点列表、增删对象）都会刷新。`getState()` 现含 `lights[]` + `materialOverride` + `background`。
- **环境色**：footer「环境色」色盘 → `controller.setBackground(hex)` 自定义纯色背景；HDR 背景开启时只存值、关闭时显示该色（`setBackground` 内部判断 `envBackground`）。
- **投影（阴影）**：`renderer.shadowMap.enabled`(PCFSoft)；基础主灯 + 用户灯 `castShadow`，shadow camera 按 `modelMaxSize` 配（`configureLightShadow`）；模型/零件 mesh `castShadow+receiveShadow`。**不自动加承接地面**——投影落在模型自身 + 用户添加的 `plane` 零件上（`plane` 新建时默认落到 `groundY` 模型脚下，才接得到投影）。`setShadow(on)` 切换 `shadowMap.enabled`（切后给可编辑 mesh 材质 `needsUpdate`）。gizmo 条「投影」按钮，默认开。
- **AO（GTAO 后处理）**：`EffectComposer`(RenderPass → GTAOPass → OutputPass)。`aoOn` 时 tick/capture 走 `composer.render()`（每帧把 `renderPass.camera`/`gtaoPass.camera` 设成当前活动相机），否则走普通 `renderer.render`；自由视角取景框第二 pass 照旧叠加。AO「宽度」= GTAO `radius`（`setAORadius` 归一化 0..1 × `modelMaxSize`，`applyAoParams` 写 `updateGtaoMaterial`）。gizmo 条「AO」开关默认**关**、footer「AO宽」滑块。`resize` 要同步 `composer.setSize`/`gtaoPass.setSize`。postprocessing addon 全在 `vendor/three/jsm/postprocessing` + `shaders` + `math/SimplexNoise.js`。shadow/ao/aoRadius 随 `getState()` 持久化。

### 状态分层（多种持久化，**不要混用**）

| 数据 | 存储 | 键 / 路径 |
|---|---|---|
| 当前工作流（节点/边/组/视图/主题） | localStorage | `huobao-canvas-static:v1` |
| 多项目库 | localStorage | `huobao-canvas-projects:v1` |
| 模板库 | localStorage | `huobao-canvas-templates:v1` |
| 模型默认值（新建节点用） | localStorage | `huobao-canvas-model-defaults:v1` |
| **生成的图片 base64** | **IndexedDB**（不是 localStorage） | object store via `openImageAssetDb()` |
| 后端服务/模型状态镜像 | 内存 | 全局 `backendConfig` 对象，`loadBackendStatus()` 刷新 |
| 本地历史归档 | 后端文件系统 | `output/<sanitizedName>_<projectId>/{<ts>_<type>_<id>.<ext>, manifest.json}` |

**图片存储约束**：节点 `data.url` 永远不要直接放完整 base64 —— localStorage 会被几张图就撑爆配额。生成图必须走 `persistImageSource()` 写入 IndexedDB，节点里只存 `idb-image:<assetId>` 哨兵串，渲染时通过 `imageDisplaySource()` / `loadImageAssetObjectUrl()` 解析成 Object URL。

**Undo/Redo** 是整张画布的 JSON 快照栈（`history` / `future`），见 `snapshot()` / `commitHistory()` / `restore()`。

### 视频是异步的

`POST /api/video/create` 只返回 taskId；前端走 `pollVideoTask` 轮询 `GET /api/video/query?id=...` 直到上游标记完成。**不要把视频流程重构成同步**。Midjourney 同样规则。

### `storyboard-blacklist.json`

`public/storyboard-blacklist.json` 是故事板节点的「题材级反向约束」字典（避免上游 stock 训练偏好），按题材 key（`classical-dance` / `anime-sport` / ...）查出 `constraints[]` 拼到提示词里。`buildStoryboardPrompt` 会读它，`loadStoryboardBlacklist()` 懒加载并缓存。新增题材时往这个 JSON 里加。

### 用户/管理员 UI

`authOverlay` / `userBadge` / `accountDialog` / `adminDialog` 是动态 `createElement` 注入的（不在 `index.html` 里）。`refreshAuthUser()` 决定显示登录覆盖层还是主应用。

### 设置面板（providers 编辑器）

`#settingsModal` 在 `index.html` 里只是空 `<dialog>` 容器，全部内容由 `openSettingsModal()` 动态注入。结构：三个 Tab（聊天/图片/视频）→ 左侧 provider 列表 → 右侧表单编辑（label/baseUrl/apiKey/defaultModel/models 池）。状态机变量：`settingsDraft`（编辑期副本）、`settingsActiveKind`、`settingsActiveProviderId`。事件委托挂在 `settingsModal` 上，靠 `[data-settings-action]` / `[data-settings-field]` / `[data-settings-model-field]` 路由。

**节点上模型下拉是两级 `<optgroup>`**：`modelOptionsForNode(kind, providerId, model)` 按 `backendConfig.providers[kind].items` 分组渲染，option value 是复合 key `"<providerId>::<modelId>"`，`syncNodeFieldControl` 处理 `field === "model"` 时拆开存到 `node.data.providerId` 和 `node.data.model`。

**旧画布兼容**：`renderNode()` 入口调 `ensureNodeProvider(node)`，无 `providerId` 时按 model 嗅探所属 provider，找不到则填该 kind 的 default。所以旧画布 JSON 无需手动迁移。

**快速切换平台**：header「切换 API 平台」按钮（`data-action="provider-switch"`）→ `openProviderSwitch()` 弹浮层，三个 kind 各一个下拉选当前 provider。`switchKindProvider(kind, providerId)`：改本地镜像 `default` + **把画布上该 kind 的现有节点 `providerId` 一起切到新平台**（model 映射：新平台有同名 model 则保留，否则用其 `defaultModel`）+ POST `/api/settings` 持久化（用 `buildProvidersKeepPayload()`，apiKey 一律 `__keep__` 哨兵，因为前端镜像无明文 key）。设计前提：用户把各平台预先存成同一 kind 下的多个 provider 子类（架构本就支持并存），切换只是改 default + 迁移节点。第三方上游不稳定时频繁切平台用。

## 文件清单速查（哪些重要、哪些不要碰）

**真实运行的代码**
- `server/server.js`、`server/db.js`、`public/index.html`、`public/app.js`、`public/styles.css`、`public/storyboard-blacklist.json`、`public/image-templates.js`、`public/model-preview.js`（three.js 封装，3D 模型预览节点专用）
- `public/vendor/three/`：本地化的 three@0.169 build + addon（OrbitControls / GLTFLoader / OBJLoader+MTLLoader / FBXLoader / STLLoader 及内部依赖 fflate·NURBS·BufferGeometryUtils）。importmap 指向它，离线可用。**这是第三方库副本，不要手改**；升级 three 时整体替换并保持 `jsm/` 目录结构（addon 间靠相对路径互相引用）。

**运行时产物（不要提交，已在 `.gitignore`）**
- `data/app.db`（SQLite，用户/会话/流水/用量）—— 用户数据，谨慎处理
- `.huobao-settings.json`（运行时写入的服务配置）
- `output/<project>/`（用户保存的历史素材 + manifest.json）

**看起来重要其实不是**
- **根目录的 `app.js` / `index.html` / `styles.css`** —— 老的「file:// 直开」独立版前端。服务器只服务 `public/`，**改文件请改 `public/` 下的副本**。除非你是在刻意同步独立版构建。
- **`huobao-canvas-prototype-share.zip` / `share-package/`** —— 分发包快照，不参与运行。
- **`docs/codex-ai-canvas-tutorial.md`** —— 教程文档，不是规范。
- **`启动claude code.bat`** —— 本地启动 Claude Code 的便利脚本，跟项目无关。

## 项目惯例

- **后端零依赖原则**：用 Node 22 自带的一切（`http` 不用 Express，`node:sqlite` 不用 better-sqlite3，`crypto.scrypt` 不用 bcrypt，`loadDotEnv()` 不用 dotenv 包）。这是刻意选择，**不要装包**除非用户明确要求。
- **前端无构建**：纯 DOM + `querySelector` + 事件委托 + `localStorage`/IndexedDB。不要引入框架、模块系统、bundler、TS。新代码沿用现风格。
- **中文 UI**：用户文案、节点标签、错误提示、注释都用简体中文。新加面向用户的字符串保持中文。
- **不要给后端调用面"开后门"**：所有调用上游 = 花钱 = 必走 `requireUser` + 扣费 + 失败退款。不要为了方便调试加未鉴权的"开发口"接口。
