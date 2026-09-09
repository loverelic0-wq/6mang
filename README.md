# 6mang

前端 + 后端结构的 AI Canvas 原型。

## 下载最新版本

**`master` 是唯一维护的分支，仓库首页展示的就是最新版本。** 所有功能更新统一合入这里。

- 不熟悉 Git：点击 **[下载最新版 ZIP](https://github.com/loverelic0-wq/6mang/archive/refs/heads/master.zip)**，解压后按下面步骤启动。
- 使用 Git：运行 `git clone https://github.com/loverelic0-wq/6mang.git`，进入 `6mang` 目录即可。

当前版本包含 GPT Image 2.5 Flare / Sunburst、可灵 CLI、Seedream 专业图片编辑、CPRT 视频、产品换背景和 3D 导演台。

## 快速启动

先安装 **Node.js 22 或更新版本**。项目后端使用 Node 内置 SQLite，无需运行 `npm install`。

Windows 用户在解压后的项目目录中双击：

```text
quick-start.cmd
```

这个脚本会自动：

- 检查本机是否安装 Node.js 和 npm
- 在缺少 `.env` 时，从 `.env.example` 创建一份
- 启动本地服务
- 打开浏览器访问应用

默认访问地址：

```text
http://127.0.0.1:8787
```

关闭快速启动窗口即可停止服务。

首次登录后，在「API 设置」配置自己的图片、视频或聊天渠道，再创建项目。可灵 CLI 渠道按下文完成安装与登录。

## 更新已有安装

Git 用户在项目目录执行：

```bash
git fetch origin --prune
git switch master
git pull --ff-only
```

完成后重启服务并刷新浏览器。此前使用开发分支的用户也按上述步骤切换到 `master`。

ZIP 用户可从上面的固定链接重新下载。更新前保留本机 `.env`、`.huobao-settings.json`、`data/` 和 `output/`；浏览器里的项目数据也应通过「导出 JSON」备份。这些个人配置和素材不包含在源码下载中。

## 手动启动

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:8787
```

首次启动会自动创建 admin 账户（用户名 `admin`，密码取 `process.env.ADMIN_PASSWORD || "admin1234"`）。部署到服务器时，可以把 `HOST` 设置为 `0.0.0.0`，再通过反向代理或服务器端口访问。

## 可灵 CLI 渠道（OAuth）

可灵已作为画布内置的托管图片/视频 provider 接入，不需要填写 Base URL 或 API Key。先在运行 6mang 的同一台电脑安装官方中国版 CLI：

```bash
npm install -g @klingai/cli-cn
```

然后打开右上角「API 设置」，在「图片模型」或「视频模型」中选择「可灵 CLI」，点击「登录」。CLI 会在浏览器中完成 OAuth，凭据只保存在本机 `~/.kling/.credentials`，画布不会读取或保存 Token。

- 模型、命令、参数和素材槽位都来自 CLI `who_am_i`，刷新能力后会自动同步。
- 现有图片生成、故事板、换脸、图片扩展和视频生成节点会根据是否连接参考图自动选择文生图/图生图/文生视频/图生视频。
- 生成任务仍在原输出节点中轮询并落结果；临时签名视频链接会立即沿用现有历史归档逻辑落到本地持久地址。可灵调用不扣画布积分，也不写画布计费流水。
- 如果 CLI 安装在非标准位置，可设置 `KLING_CLI_JS` 指向 `dist/cli.js` 的绝对路径。

只做本地验证时可运行：

```bash
npm test
```

## GPT Image 2.5 模型与尺寸

147 图片模型池使用 `gpt-image-2.5-flare`（默认）和 `gpt-image-2.5-sunburst`，节点下拉可切换。模型名本身就是 API 的 `model` ID。原来使用 147 `gpt-image-2` 的节点，在旧 ID 已从该渠道模型池移除后会自动跟随该渠道的新默认模型；其他渠道及仍明确配置的旧模型保持原选择。已有安装需在「API 设置」同步替换模型池，源码预设仅用于首次配置。

两种模型复用文生图 JSON `/images/generations` 与参考图 multipart `/images/edits`，画布积分沿用每次 15（不是 147 上游人民币价格）。2026-09-09 已通过本机 147 `/models` 核对两个 ID；参数兼容性依据 [OpenAI 图片生成文档](https://developers.openai.com/api/docs/guides/image-generation)，尚未进行 147 付费生图验证。

图片生成、故事板和营销物料节点在选择 GPT Image 2 / 2.5 时使用两级尺寸预设：先选 `16:9`、`9:16`、`2:3`、`3:2`、`3:4`、`4:3` 或 `1:1`，再选 `1K`、`2K` 或 `4K`。画布会自动换算并显示实际输出像素，无需用户手算。

所有 21 个组合都满足 147 的限制：最大边不超过 3840px、宽高均为 16px 的倍数、长短边比例不超过 3:1、总像素位于 655,360–8,294,400 之间。例如 `16:9 + 4K` 为 `3840x2160`，`2:3 + 1K` 为 `672x1008`，`1:1 + 4K` 为 `2880x2880`。

GPT Image 2 / 2.5 的高清 4K 请求可能超过 Node 原生 `fetch` 的五分钟等待上限，因此服务端对这些模型的 JSON 和参考图请求使用独立的 15 分钟长连接，并把连接拒绝、DNS 和超时错误转换为明确提示。图片 provider 的默认回退项应保持为已配置的 147 上游。

图片扩展节点会在不改变用户所选画面比例的前提下，自动把 GPT Image 2 的输出吸附到合法的 16px 网格；例如 16:9 的上限输出为 `3840x2160`。

## 产品换背景

从「添加节点 → 产品换背景」或图片右键「创建产品换背景」进入。点击节点内的两个上传槽位，分别上传产品图和背景图，也可以把画布里的图片连接进来。普通连线先连产品、再连背景；直接上传可任意顺序，角色会固定保存。

选择 GPT Image 2 等支持双图编辑的模型，按需填写补充要求，点击「更换背景」。节点会把产品原图作为第一张输入、背景作为第二张输入，在一次模型编辑中完成背景替换与光影统一；输出比例可跟随产品图或背景图。提示词要求保留产品轮廓、部件、Logo、文字、配色和材质纹理，同时匹配新环境的受光、反射、接触阴影和投影。

结果输出到普通图片节点，可继续连接后续工作流。未配置模型或输入不完整时不会发起生成；生成期间阻止重复提交，失败后可以重试。此功能直接使用模型编辑，不包含抠图合成或像素锁定，细小文字和复杂产品结构应对照原图检查。

## 3D 导演台

在画布顶部点击「3D 导演台」，或从添加节点、右键「视频创作」进入。无需准备模型即可打开人物摄影棚；支持添加站姿/坐姿角色占位、双人对话或产品展台布置，摆放几何体、灯光，并通过移动/旋转/缩放工具或坐标输入调整对象。

- **机位库**：为当前取景相机命名并保存位置、焦段与比例；最多保存 24 个机位，点击即可恢复。自由观察视角用于摆场景，输出始终来自取景相机。
- **运镜排练**：选择推进、拉远、横移、升降或环绕，记录起点后自动建立路径；自定义模式分别记录起点与终点。支持 1–30 秒预览、匀速/缓入缓出和进度条检查。
- **输出参考画面**：「输出当前参考帧」创建普通图片节点；「输出首尾帧」分别创建首帧、尾帧图片，可按顺序连接现有视频生成配置。输出会隐藏网格、灯标与操作轴，并按取景比例裁切。
- **保存**：场景、对象名称、变换、机位和运镜参数随节点自动保存；图像仍存 IndexedDB。新节点沿用 `model3dPreview`，以 `data.director` 区分导演台，不改变已有 3D 模型预览的入口。

角色是用于构图与站位的几何占位，第一版不含骨骼动画或视频渲染；可导入一个 GLB/GLTF/OBJ/FBX/STL 场景模型（多角色可包含在同一模型文件内），并以占位角色补充场景。预览和截图在本地运行，后续点击图片/视频生成时使用现有模型调用流程。

## 目录

```text
public/          # 前端静态文件
server/          # Node 后端代理 + SQLite 用户/计费
package.json     # 启动脚本
quick-start.cmd  # Windows 快速启动脚本
```

## 后端接口

- `GET /api/status`、`POST /api/settings`（providers 配置；apiKey 在 status 里脱敏）
- `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`
- `POST /api/chat/polish`、`POST /api/chat/optimize-prompt`
- `POST /api/images/generations`、`POST /api/images/mj/create`、`GET /api/images/mj/query?id=...`
- `POST /api/video/create`、`GET /api/video/query?id=...`
- `GET /api/kling/status`、`POST /api/kling/login`、`POST /api/kling/logout`、`POST /api/kling/refresh`（admin only）
- `GET /api/kling/account`、`GET /api/kling/tools`（admin only）、`GET /api/kling/tasks/:id`（登录用户）
- `GET /api/billing/transactions`、`GET /api/billing/usage`
- `GET /api/admin/users`、`POST /api/admin/credit`（admin only）

## 配置 API（providers 模型）

在应用右上角设置面板里编辑：三个 Tab（聊天 / 图片 / 视频），每个 Tab 下可建多个**子类（provider）**，每个 provider 独立配置 Base URL、API Key、默认模型、模型池。

典型用法：同一类下用多个 key（如图片下挂一个走 OpenAI 系的 key + 一个走 nano banana 的 key），节点上选模型时按子类分组（`<optgroup>`），后端按 `providerId` 路由到对应上游。

保存后写入 `.huobao-settings.json`（gitignored，不会提交）。**API key 永不下发到浏览器**，`/api/status` 只返回脱敏的 `apiKeyMasked` + `configured` 标志。

### 智算谷 CPRT / Seedance 视频渠道

在「API 设置 → 视频模型」点击「+ 新增子类」，填写：

- 显示名：`智算谷 CPRT Seedance`
- Base URL：`https://ai-api.cprt.xyz/v1`
- API Key：你的 CPRT Key
- 模型：例如 `free-video-2.5-multimodal-video`（也可按智算谷当前模型表添加更多模型）

画布会自动识别 `cprt.xyz` 地址，改用 CPRT 的异步创建/查询协议。两种输入模式使用不同的官方合同：首尾帧把所选 free-video multimodal 模型切换到同版本的 image-to-video 路由，并提交 `firstFrameUrl` / `lastFrameUrl`；“智能多参（全能参考）”按扁平 multimodal 合同提交 `imageUrls`（最多 9 张）和 `videoUrls`（最多 3 个）。两者都会传递 `prompt`、`resolution`、`generateAudio`、`realPersonMode`、`conversionSlots`、`returnLastFrame`、`seed` 与 `returnOriginData`，素材顺序与画布连线顺序一致。其他使用 `content[]` 的 CPRT 视频模型仍保留原协议。

CPRT 查询采用 10 秒注册缓冲和最长约 20 分钟的轮询窗口；短暂的“任务不存在”、限流或网关错误会自动重试。若窗口结束时任务仍未完成，输出节点保留任务 ID 并显示“继续查询”，不会重新创建或重复扣费；上游确认失败时则直接显示真实错误。

若素材来自本地节点，CPRT 需要其可从公网下载：请在 `.env` 配置 `COS_*`，画布会在提交前上传并使用临时签名 URL。普通远程 HTTPS 素材无需额外处理。
