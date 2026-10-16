# 6mang

把文本、图片、视频和 3D 参考画面连成工作流的本地 AI 画布。

**新用户先看：[给 Codex 的完整部署说明](docs/CODEX-DEPLOY.md)**，包含可直接复制的安装任务、Windows / macOS / Linux 桌面快速启动、安全更新和数据备份。

**以后更新统一在这篇 [社群固定更新帖](https://6mangaigc.com/content/02a77714-0d4d-4911-98d3-b0cf24378c71) 查看。**

## 下载最新版本

**`master` 是唯一维护的分支，仓库首页展示的就是最新版本。** 所有功能更新统一合入这里。

- 不熟悉 Git：点击 **[下载最新版 ZIP](https://github.com/loverelic0-wq/6mang/archive/refs/heads/master.zip)**，解压后按下面步骤启动。
- 使用 Git：运行 `git clone --branch master --single-branch https://github.com/loverelic0-wq/6mang.git`，进入 `6mang` 目录即可。

当前版本包含 GPT Image 2.5 Flare / Sunburst、可灵 CLI、Seedream 专业图片编辑、CPRT 视频、产品换背景、3D 导演台和爆款视频复刻。

图片和视频节点在素材就绪后显示「下载图片 / 下载视频」，生成历史中也可直接下载。保留原始文件内容与格式，支持浏览器本地素材、已归档文件和远程结果；文件保存位置遵循浏览器下载设置。

### 图层组导出 PSD

智能图层分离完成后，在输出的「图层组」卡片点击 **导出 PSD**，或在「编辑图层」窗口中点击 **导出 PSD**（导出当前编辑结果）。右键图层组也可导出。

- 每个元素保留为独立像素图层，包含图层名称、前后顺序、移动与缩放后的画面、透明度、显隐和位置锁定；画布外的图层像素也会保留。
- 图片中的文字仍是像素图层；导出的是分离结果，不会自动转换成可编辑文字或矢量形状。
- 导出在浏览器本地完成，无需安装 Photoshop、配置额外 API 或消耗生成积分。文件由浏览器下载到本机；缺失图片时会提示重新导入，不会输出缺层文件。
- 当前支持 RGB / 8 位 PSD，画布最多约 1600 万像素、256 层，画布与图层合计最多约 6700 万像素。图层较大时需要更多内存，超限会提示缩小后重试。

### 2026-09-13 更新

- **爆款视频复刻**：连接一张人物图和一段原视频，使用智算谷 SD2.0 多模态模型生成；支持整人替换或仅换脸与发型，以及中断任务继续查询。详细限制见下文。
- **图片生成独立输入端口**：提示词与各张参考图分行显示端口、编号和缩略图，悬停可定位来源；修复素材加载、旧画布恢复和缺图时的参考图编号错位。
- **四套画布皮肤**：新增带独立背景的「战术终端」「符文峡谷」，与「暖纸棕」「石墨夜」一起从顶部主题菜单选择，按项目保存。

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

产品换背景和材质迁移节点也提供独立的「分辨率」选项，新节点默认 `2K`，选择会随画布保存。GPT Image 2 / 2.5 可选 `1K` / `2K` / `4K`；Seedream 5.0 Pro 可选 `1K` / `2K`，不支持的 `4K` 显示为禁用。其他模型沿用现有尺寸处理并显示「由模型决定」。生成时按所选档位匹配输入比例：材质迁移跟随主体图，产品换背景跟随所选的产品图或背景图。

所有 21 个组合都满足 147 的限制：最大边不超过 3840px、宽高均为 16px 的倍数、长短边比例不超过 3:1、总像素位于 655,360–8,294,400 之间。例如 `16:9 + 4K` 为 `3840x2160`，`2:3 + 1K` 为 `672x1008`，`1:1 + 4K` 为 `2880x2880`。

GPT Image 2 / 2.5 的高清 4K 请求可能超过 Node 原生 `fetch` 的五分钟等待上限，因此服务端对这些模型的 JSON 和参考图请求使用独立的 15 分钟长连接，并把连接拒绝、DNS 和超时错误转换为明确提示。图片 provider 的默认回退项应保持为已配置的 147 上游。

147 的 Nano Banana 2 已同步为 Nano Banana 2.1，API 模型 ID 为 `gemini-nano-banana-2.1`。画布会把已有 147 Banana 2 节点迁移到新 ID，并继续通过 `/chat/completions` 生成图片；Nano Banana 2.1 沿用原 Banana 2 的 6 积分画布费率。

图片扩展节点会在不改变用户所选画面比例的前提下，自动把 GPT Image 2 的输出吸附到合法的 16px 网格；例如 16:9 的上限输出为 `3840x2160`。

## 产品换背景

从「添加节点 → 产品换背景」或图片右键「创建产品换背景」进入。点击节点内的两个上传槽位，分别上传产品图和背景图，也可以把画布里的图片连接进来。普通连线先连产品、再连背景；直接上传可任意顺序，角色会固定保存。

选择 GPT Image 2 等支持双图编辑的模型，按需填写补充要求，点击「更换背景」。节点会把产品原图作为第一张输入、背景作为第二张输入，在一次模型编辑中完成背景替换与光影统一；输出比例可跟随产品图或背景图。提示词要求保留产品轮廓、部件、Logo、文字、配色和材质纹理，同时匹配新环境的受光、反射、接触阴影和投影。

结果输出到普通图片节点，可继续连接后续工作流。未配置模型或输入不完整时不会发起生成；生成期间阻止重复提交，失败后可以重试。此功能直接使用模型编辑，不包含抠图合成或像素锁定，细小文字和复杂产品结构应对照原图检查。

## 爆款视频复刻

从「添加节点 → 爆款视频复刻」或右键「视频创作」进入，也可从图片、视频的输出端拖线到空白处创建。上传一段原视频和一张人物参考图（肖像或人物三视图），或把已有素材连入节点。图片固定提供人物形象，视频提供动作、表情、口型、场景和运镜，连线顺序不会交换角色。

节点只显示已配置的智算谷 SD2.0 多模态视频模型，默认替换脸、发型和服装；也可仅换脸与发型、保留原服装。多人视频可填写「替换谁」，补充要求会编入可查看的复刻指令。参考视频需为 2–15 秒，视频最多 50MB、图片最多 30MB；本地素材编码后合计需小于请求上限，超限时提示压缩。

输出为 720p，自动匹配最接近原片的受支持画幅，时长向上取整到 4–15 秒。不足 4 秒的原片会生成更长的视频。任务使用现有上传、鉴权、计费、异步查询和历史归档流程；已有任务仍在生成时，点击「继续查询」只查询原任务。

音频、字幕、动作和场景保留由提示词约束，当前没有原音轨回贴、字幕提取或逐像素锁定；生成后需对照原片检查。模型限制依据 [智算谷 SD2.0 多模态文档](https://ai-cprt-xyz.apifox.cn/497080549e0)。本次实现验证使用隔离测试，未提交付费真人复刻任务。

## 3D 模型预览

载入首个模型后，点击节点上的「继续载入」或取景窗口顶部的「继续载入模型」，即可把其他 GLB/GLTF/OBJ/FBX/STL 模型加入同一场景；也可以一次多选文件。追加模型会保留已有摆放和取景，在右侧「场景对象」中分别选择模型，可修改名称、位置、旋转、缩放和材质，或删除选中模型。

模型与变换会随节点保存，关闭窗口或刷新后可继续编辑。「更换模型」会用新选择的模型替换全部已载入模型；追加或更换成功后请重新截取画面。模型文件仍保存在当前浏览器的 IndexedDB 中，旧版单模型节点可直接继续使用。

## 3D 导演台

在画布顶部点击「3D 导演台」，或从添加节点、右键「视频创作」进入。无需准备模型即可打开人物摄影棚；支持添加站姿/坐姿角色占位、双人对话或产品展台布置，摆放几何体、灯光，并通过移动/旋转/缩放工具或坐标输入调整对象。

- **机位库**：为当前取景相机命名并保存位置、焦段与比例；最多保存 24 个机位，点击即可恢复。自由观察视角用于摆场景，输出始终来自取景相机。
- **运镜排练**：选择推进、拉远、横移、升降或环绕，记录起点后自动建立路径；自定义模式分别记录起点与终点。支持 1–30 秒预览、匀速/缓入缓出和进度条检查。
- **输出参考画面**：「输出当前参考帧」创建普通图片节点；「输出首尾帧」分别创建首帧、尾帧图片，可按顺序连接现有视频生成配置。输出会隐藏网格、灯标与操作轴，并按取景比例裁切。
- **输出预演视频**：逐帧渲染为 24 FPS、最长边 960 像素的无声 MP4，保存到画布视频节点。需要本机 FFmpeg（可通过 `FFMPEG_PATH` 指定）。可随时取消；导出期间锁定场景，完成后恢复原机位。2–15 秒预演在存在已配置的 Seedance 2.0 视频参考渠道时，自动创建并连接视频生成配置和提示词；补充参考图片与要求后再手动生成。
- **跟随预演镜头**：连接预演视频后默认开启，自动应用机位、景别、运镜和默认成片规则（保留主体、真实材质与自然光影），无需写入画面要求。画面要求只需补充场景、动作或风格，也可留空；明确指定的外观、环境与风格优先于默认要求。可展开查看或关闭；旧项目同样生效。预演视频不能用于首尾帧模式，素材丢失会在提交前报错。预演节点的「下载预演 MP4」可把浏览器中保存的视频下载到本机。
- **视频输入插槽**：镜头控制、环境场景、主体外观和提示词分别有独立连线入口，可直接上传、替换和断开；其他参考可继续添加。环境与主体图片按插槽用途附加到生成要求中，素材编号跟随实际请求。旧连线保持原有素材顺序，首尾帧模式则显示独立首帧、尾帧插槽。
- **导演台卡片**：显示实际取景封面、运镜类型、时长、对象数与机位摘要。关闭导演台时更新封面；旧节点尚无封面时可显示已有预演。封面只用于卡片展示，不自动变成生成参考图。
- **坐标控制**：「世界坐标」沿场景固定轴移动，「本地坐标」沿对象旋转后的自身轴移动。拖动操作轴时镜头保持不动；放开后可继续旋转或平移视角。
- **保存**：场景、对象名称、变换、机位和运镜参数随节点自动保存；图像仍存 IndexedDB。新节点沿用 `model3dPreview`，以 `data.director` 区分导演台，不改变已有 3D 模型预览的入口。

角色是用于构图与站位的几何占位，当前运镜预演不含骨骼或对象关键帧动画；可继续导入多个 GLB/GLTF/OBJ/FBX/STL 场景模型。预览、截图和预演编码均在本地完成，只有后续点击图片/视频生成时才调用模型。Seedance 对预演的跟随程度仍需按镜头检查。

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
