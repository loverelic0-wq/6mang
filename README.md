# 6mang

把文本、图片、视频和 3D 参考画面连成工作流的本地 AI 画布。

**新用户先看：[给 Codex 的完整部署说明](docs/CODEX-DEPLOY.md)**，包含可直接复制的安装任务、Windows / macOS / Linux 桌面快速启动、安全更新和数据备份。

**以后更新统一在这篇 [社群固定更新帖](https://6mangaigc.com/content/02a77714-0d4d-4911-98d3-b0cf24378c71) 查看。**

## 下载最新版本

**`master` 是唯一维护的分支，仓库首页展示的就是最新版本。** 所有功能更新统一合入这里。

- 不熟悉 Git：点击 **[下载最新版 ZIP](https://github.com/loverelic0-wq/6mang/archive/refs/heads/master.zip)**，解压后按下面步骤启动。
- 使用 Git：运行 `git clone --branch master --single-branch https://github.com/loverelic0-wq/6mang.git`，进入 `6mang` 目录即可。

当前版本包含 GPT Image 2.5 Flare / Sunburst、可灵 CLI、Seedream 专业图片编辑、CPRT 视频、产品换背景和 3D 导演台。

## 快速启动

推荐安装 **[Node.js 24 LTS](https://nodejs.org/en/download)**，已有 **Node.js 22.13+** 也可使用。后端使用内置 `node:sqlite`，从 22.13 起无需实验开关；请实际检查 SQLite 能否加载。依据：[Node.js SQLite 文档](https://nodejs.org/api/sqlite.html)。项目无需 `npm install`，无需构建。

```bash
node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(':memory:'); db.close(); console.log('SQLite OK')"
```

**首次启动前**，仅在 `.env` 缺失时复制 `.env.example` 为 `.env`，自行设置 `ADMIN_PASSWORD`。首次启动创建用户名 `admin`；已有账户不会因以后修改 `.env` 而改密码。

| 系统 | 快速启动 | 桌面快捷启动 |
| --- | --- | --- |
| Windows | 双击 `quick-start.cmd` | 创建指向原文件的 `.lnk`，保留项目工作目录 |
| macOS | `chmod +x quick-start.command quick-start.sh` 后双击 `.command`，或 `bash quick-start.command` | 创建桌面 `.command`；nvm/fnm 用户用 `NODE_BINARY` 固定已验证的 Node 绝对路径 |
| Linux | `bash quick-start.sh` | 创建 `Terminal=true` 的 `.desktop`；无图形环境用 `bash quick-start.sh --no-browser` |

脚本检查 Node SQLite、仅在缺失时生成 `.env`，真正监听成功后才尝试打开浏览器。默认地址为 **`http://127.0.0.1:8787`**；已有安装保留原来的地址和端口。终端需保持打开，按 **`Ctrl+C` 停止**。快捷方式的完整步骤和路径问题见 [部署说明](docs/CODEX-DEPLOY.md#4-三个系统怎样快速启动)。

首次登录后创建项目，在右上角「API 设置」配置自己的图片、视频或聊天渠道。可灵 CLI 渠道按下文完成安装与 OAuth 登录。macOS/Linux 提供脚本设计和自动化覆盖，仍需在用户实机验证桌面双击；部署验收不需要付费生成调用。

## 更新已有安装

先保存工作、停止服务并备份。Git 用户在原项目目录先运行 `git status --short --branch`、`git remote -v` 和 `git config --get-all remote.origin.fetch`，确认 `origin` 是本仓库，并保护本地修改、未跟踪文件和未推送提交，再执行：

```bash
git remote set-branches origin master
git fetch origin --prune
git switch master
git pull --ff-only origin master
```

第一条将拉取范围设为 `master`，也可修复过去 `--single-branch` 只克隆已删除开发分支导致的 `couldn't find remote ref`；它不会删除本地分支。若本地尚无 `master`，在 `fetch` 成功后将 `git switch master` 换为 `git switch --track origin/master`。

完成后重启服务，在原浏览器和地址刷新页面。此前使用开发分支的用户也切换到 `master`；切分支冲突或无法快进时先检查原因，不使用 `reset --hard` 或 `git clean` 覆盖个人改动。详见 [完整更新步骤](docs/CODEX-DEPLOY.md#6-安全更新始终回到-master)。

ZIP 用户从固定链接重新下载，解压检查后更新源码，完整保留本机 `.env`、`.huobao-settings.json`、`data/` 和 `output/`。浏览器项目可额外「导出 JSON」，但它主要保存工作流与素材引用，**不是包含全部图片、视频、图层和 3D 模型的完整素材包**；还需保留原浏览器 localStorage/IndexedDB 和原始素材。`localhost`、`127.0.0.1`、不同端口属于不同数据来源，更新时不要随意换地址或清除网站数据。详见 [数据与备份](docs/CODEX-DEPLOY.md#7-数据在哪里怎样备份)。

## 手动启动

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:8787
```

手动命令不会自动创建 `.env` 或打开浏览器，请先完成上面的首次配置。个人电脑使用默认回环地址即可；端口占用时先检查是否已有此项目运行，不自动终止未知进程或开放公网。

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
quick-start.cmd  # Windows 快速启动
quick-start.command # macOS 快速启动
quick-start.sh   # Linux / POSIX 快速启动
scripts/quick-start.js # 三系统共享 Node 启动器
docs/CODEX-DEPLOY.md # 可复制给 Codex 的完整部署与更新说明
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
