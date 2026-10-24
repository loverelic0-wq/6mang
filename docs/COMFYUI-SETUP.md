# ComfyUI 版本：安装、连接与图像放大

**本版分支是 `codex/local-comfyui`。使用本地图像放大前，必须在自己的电脑另外装好 ComfyUI 和超分模型。** 本仓库只提供画布、连接代码和 API 工作流，不含 ComfyUI、Python、PyTorch、显卡驱动或模型权重。画布能打开，不代表超分已配置完成。

普通云端生图、视频生成和创作案例仍走各自原有渠道；不使用本地图像放大时，可以先只安装画布。把整个部署任务交给自己电脑上的 Codex，复制 [部署说明第1节](CODEX-DEPLOY.md#1-把这一整段复制给你的-codex)。

## 1. 安装前检查

请 Codex 确认操作系统、GPU/驱动、Python 环境、可用磁盘、已有 ComfyUI 和端口占用。不要直接照搬别人的 CUDA/PyTorch 安装命令，也不要覆盖正在使用的 ComfyUI。

| 情况 | 安装与启动方式 |
| --- | --- |
| Windows 便携版 | 从 [ComfyUI 官方便携版说明](https://docs.comfy.org/installation/comfyui_portable_windows) 选择与硬件兼容的包，完整解压；内置 Python，无需为画布另装系统 Python。填好本机实际路径后，可用画布自动启动 |
| Windows 手动安装、macOS、Linux | 按 [官方手动安装说明](https://docs.comfy.org/installation/manual_install) 配好独立 Python 环境和硬件依赖，先自行启动 ComfyUI，再让画布连接 API |
| 已装 ComfyUI | 先确认现有安装和 API 正常；可以连接现有实例，或配置独立超分实例。不要为了本版自动升级、重装或停掉原实例 |
| 无可用 GPU | 可按安装包说明尝试 CPU 模式，速度可能很慢；需以真实小图运行结果判断，不能承诺实时处理 |

本版没有规定统一最低显存，内存消耗随模型和图片尺寸变化。先用小图验收；初次安装需要下载环境和权重，预留对应存储空间。不要为了这条超分工作流下载 SD、Flux 等文生图大模型或一整套自定义节点。

## 2. 安装模型与启动 API

### 超分模型

从 [Real-ESRGAN 官方发布页](https://github.com/xinntao/Real-ESRGAN/releases) 下载 `RealESRGAN_x4plus.pth`（[官方模型文件](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth)），放到**实际运行的 ComfyUI** 的 `models/upscale_models/`。这是 ComfyUI [官方超分教程](https://docs.comfy.org/tutorials/basic/upscale) 指定的模型目录。

Windows 便携版目录示意：

```text
<用户选择的便携包根目录>/
  python_embeded/python.exe
  ComfyUI/main.py
  ComfyUI/models/upscale_models/RealESRGAN_x4plus.pth
```

模型 ID 必须与 ComfyUI 模型列表中的实际文件名完全一致。如果已有可用的 `RealESRGAN_x4plus.safetensors`，可以保留该文件，并在 Provider 模型池及默认模型中填写这个实际文件名。**不能把 `.pth` 改后缀当作转换格式**，也不要覆盖已有模型。

### 启动地址

新配置的超分实例建议使用 **`http://127.0.0.1:8190`**，画布使用 **`http://127.0.0.1:8787`**。若已有主实例占用 8188，保留它；先确认 8190 空闲再启动。若选择复用已有服务，画布中的 Base URL 和端口跟随实际服务，不强行改端口。

Windows 便携版，在便携包根目录的 PowerShell 执行：

```powershell
& '.\python_embeded\python.exe' -s '.\ComfyUI\main.py' --windows-standalone-build --listen 127.0.0.1 --port 8190
```

CPU 模式需按实际安装加 `--cpu`。手动安装版在 ComfyUI 源码目录、激活其 Python 环境后执行：

```bash
python main.py --listen 127.0.0.1 --port 8190
```

`python` 必须是刚验证过的 ComfyUI 环境，不能随意调用系统中的另一份 Python。不使用 Windows 的 `--windows-standalone-build` 参数。手动启动时保持终端打开；用这个终端的 `Ctrl+C` 停止该实例。

打开 `http://127.0.0.1:8190/system_stats` 应返回 JSON；再检查 `http://127.0.0.1:8190/object_info` 中是否包含 `LoadImage`、`UpscaleModelLoader`、`ImageUpscaleWithModel`、`ImageScale`、`SaveImage`，以及 `UpscaleModelLoader` 的模型列表是否包含实际权重文件名。API 可访问和模型已列出，只是提交前检查。

## 3. 在画布中配置

先启动画布，在右上角「API 设置 → 图片模型」选择本地 ComfyUI 渠道。新安装已提供以下预设；旧安装会保留原设置，需要核对差异。

| 设置项 | 新配置值或填写规则 |
| --- | --- |
| 适配器 | 本地 ComfyUI（`comfyui`） |
| Base URL | `http://127.0.0.1:8190`，已有服务按实际地址填写 |
| API Key | 本机标准 ComfyUI 留空；不要填写云端渠道 Key |
| 默认模型、模型池 ID | `RealESRGAN_x4plus.pth`，或 ComfyUI 模型列表中的实际文件名 |
| 模型池「超分」 | 勾选；最大倍数 `4`，最大边 `4096`，机器资源不足可降低 |
| ComfyUI 工作流路径 | `workflows/comfyui/realesrgan-upscale-api.json`，相对于 6mang 项目根目录 |
| 自动启动 | 默认关闭。手动启动 API 后即可使用；Windows 便携版验证路径后可开启 |
| 安装目录 | 自动启动时填便携包根目录，目录下应有 `ComfyUI/main.py` 和 `python_embeded/`；不是只填内部 `ComfyUI/` |
| Python 路径 | 自动启动时填该包内 `python_embeded/python.exe` 的绝对路径；便携版可留空按安装目录推导 |
| 端口 | 与 Base URL 一致，例如 `8190`；只改这个数字不会自动改 Base URL |
| 保持后台运行 | 默认开启。关闭画布不会自动退出 ComfyUI |

**普通图片生成的全局默认渠道继续用自己的云端渠道。** ComfyUI 不提供本版普通文生图、人物生成或视频生成，仅用于「图像放大」。新建超分节点会优先选择声明了 `upscale` 能力的 ComfyUI，已有节点保留其原选择。

保存设置，再点击「测试 ComfyUI」。它会检查 API 工作流可读取，以及 `/system_stats` 是否就绪；不会验证权重能加载，也不会执行超分，需要继续完成下一节。

自动启动只会启动已安装的程序，不下载环境和模型。内置默认命令面向 Windows 便携版。其他目录布局、虚拟环境及 macOS/Linux 优先手动启动；需要特殊参数时由 Codex 检查后在本机 Provider 配置 `launchArgs` 数组，并保持 `installDir/ComfyUI/main.py` 的检查条件成立，不在界面中猜填不可见字段。

后台启动日志位于 `data/comfyui/comfyui-<端口>.log`。自动启动的 ComfyUI 默认独立于画布运行；如要停止，由 Codex 先根据实际 Python 路径、命令行和端口确认进程归属，再关闭该实例，不按进程名称批量终止 Python。

### 内置工作流做了什么

[`realesrgan-upscale-api.json`](../workflows/comfyui/realesrgan-upscale-api.json) 使用五个内置节点：加载上传原图 → 加载超分模型 → 模型放大 → 缩放到节点的目标宽高 → 保存 PNG。无需自定义节点、ComfyUI Manager 或额外文生图模型。

`__MODEL__` 使用节点选中的模型文件名，`__TARGET_WIDTH__` / `__TARGET_HEIGHT__` 使用画布计算的目标尺寸。原图先经4倍模型超分，再按最终目标尺寸缩放，所以2x和4x都可使用同一权重。最大边等限制可能使结果小于名义倍数，以节点显示及实际像素为准。内置 SaveImage 固定输出 PNG；需要其他格式需另行配置支持的 API 工作流。

自定义工作流必须是 ComfyUI **Save (API Format)** 节点映射，不能是带 `nodes`、连线和布局信息的画布 JSON。不要把内置模板当作可直接在 ComfyUI 编辑器中打开的画布文件。

## 4. 验收与使用

1. 在画布创建空项目，载入一张小 PNG，例如 `96×64`。
2. 从「添加节点 → 图像放大」创建节点，或从图片右键进入；连接一张图片，选择本地 ComfyUI 和实际模型。
3. 选择 `2x`，点「生成放大图」。应产生新的普通图片节点，例图结果为 `192×128`；原图仍保留。
4. 改为 `4x` 再运行，例图应得到 `384×256`。下载并检查文件真实像素；刷新页面后结果应仍能显示。
5. 记录实际机器、安装路径、服务端口、模型、工作流及验证结果。失败时保留原图/旧结果，修正模型、路径或环境后重试；不会自动改走云端收费生成。

有 Node 和 Chrome/Edge 时，可由 Codex 在画布运行且 Provider 配好后执行：

```bash
node scripts/check-upscale-live.js http://127.0.0.1:8787
```

脚本使用独立浏览器资料，验证2x、4x、坏图失败/恢复及 IndexedDB/项目引用；结果写到 `outputs/upscale-live/`，不进入 Git。它会执行真实本地推理、占用本机资源，不调用云端生图。现有脚本面向本地单用户模式，检查 Provider ID `comfyui-local`；自定义过渠道 ID 的安装应先检查脚本适用条件，不能为跑脚本覆盖用户配置。

## 5. 常见问题

| 现象 | 检查 |
| --- | --- |
| 连接拒绝、服务未运行 | ComfyUI 是否启动、Base URL/端口是否一致；开启自动启动前核对安装目录与 Python |
| 自动启动提示找不到主程序 | 安装目录应是便携包根目录，不能指到内部 `ComfyUI/`；其他布局先手动启动 |
| 模型不在列表 / value not in list | 文件是否在当前运行实例的 `models/upscale_models/`，模型 ID 是否与实际文件名一致；刷新或重启该实例后重查 `/object_info` |
| 缺少节点 | 检查上面五个内置节点是否注册，不默认安装一套自定义节点来绕过错误 |
| 工作流解析失败 | 使用仓库 API 模板或 Save API Format，不填写普通画布 JSON |
| 测试通过，生成失败 | 查看 ComfyUI 日志和任务错误；服务就绪不证明模型能加载或输入能解码 |
| CUDA / Torch / 显存错误 | 核对驱动和硬件对应的安装包、当前 Python 环境；降低输入尺寸/目标上限，排查其他占显存任务 |
| 更新后仍是旧的模型/路径 | 已有 `.huobao-settings.json` 会保留，按实际机器核对这一个 Provider，保留其他渠道与 Key |
| 原项目或素材看不见 | 回到原浏览器、原主机名和端口，保留 localStorage/IndexedDB；不要清站点数据 |

macOS/Linux 的 ComfyUI 接入方式是连接手动启动的 API；本仓库不把 Windows 便携版的实测结果视为其他平台的超分验收。
