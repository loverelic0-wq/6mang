# 6mang 本地部署与快速启动（给用户和 Codex）

**安装前先确认：这是 `codex/local-comfyui` 分支，本地图像放大需要用户自行安装 ComfyUI 和超分模型。** 仓库不包含 ComfyUI、Python、PyTorch 或模型文件，快速启动脚本只启动画布，不安装超分环境。完整步骤见 [ComfyUI 安装、连接与验收](COMFYUI-SETUP.md)。只运行画布和云端生图可以先不安装 ComfyUI。

本版从 [分支页面](https://github.com/loverelic0-wq/6mang/tree/codex/local-comfyui) 获取，或 [下载本分支 ZIP](https://github.com/loverelic0-wq/6mang/archive/refs/heads/codex/local-comfyui.zip)。尚未合并 master，后续更新继续跟踪本分支。社群更新仍查看原 [固定更新帖](https://6mangaigc.com/content/02a77714-0d4d-4911-98d3-b0cf24378c71)。

本说明面向个人电脑本地运行。画布由 Node 服务提供，默认地址为 `http://127.0.0.1:8787`；不要双击根目录 `index.html`，也不需要前端构建。

## 1. 把这一整段复制给你的 Codex

先让 Codex 打开你准备安装项目的文件夹；如果已经装过，打开原来的项目文件夹。然后复制下面整个代码块。Codex 无法替你点击的系统安装、密码输入或 OAuth 授权，才需要你亲自完成。

```text
请在我的电脑上安装或安全更新 6mang 的 ComfyUI 版本，完成桌面启动入口和本地图像放大配置。仓库 https://github.com/loverelic0-wq/6mang ，指定分支 codex/local-comfyui，ZIP 为 https://github.com/loverelic0-wq/6mang/archive/refs/heads/codex/local-comfyui.zip 。不要下载 master 代替本版。先读取 AGENTS.md、README.md、docs/CODEX-DEPLOY.md、docs/COMFYUI-SETUP.md、package.json 和 quick-start 脚本，按当前实现执行。

请先识别 Windows/macOS/Linux、CPU 架构、实际安装目录和桌面目录，以及 Node 的版本、绝对路径和来源（官方安装包/Homebrew/nvm/fnm 等）。路径可能含空格或中文，所有命令和快捷方式都要正确处理。推荐使用与本机系统和架构对应的 Node.js 24 LTS；已有 Node 22.13+ 且兼容也可继续使用。实际执行 node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(':memory:'); db.close(); console.log('SQLite OK')"，不能只看版本号判断。项目没有 npm 依赖和构建步骤，不安装 sqlite、better-sqlite3、Express 等包。

如果尚未安装，用 git clone --branch codex/local-comfyui --single-branch https://github.com/loverelic0-wq/6mang.git；没有 Git 可完整解压本分支 ZIP，不覆盖已有目录。已有 Git 安装先查看状态、origin 和 fetch refspec，保护本地修改、未跟踪文件与未推送提交。在需要时用 git remote set-branches --add origin codex/local-comfyui 加入拉取范围，修复指向已删除分支的失效 refspec，再 git fetch origin --prune、git switch codex/local-comfyui、git pull --ff-only origin codex/local-comfyui。本地还没有该分支时用 git switch --track origin/codex/local-comfyui。不强制 reset、clean 或覆盖个人改动。已有 ZIP 安装先停服务和备份，再更新源码。

只在 .env 缺失时由 .env.example 创建它。本版默认 HUOBAO_LOCAL_MODE=true，直接进入项目首页，无需登录、注册或管理员密码，不扣画布积分；上游云端 API 仍由我的账号计费。本分支不提供登录和积分界面，false 只兼容旧后端接口。已有 .env 若显式为 false，先查清原有部署用途，说明与本版画布的差异，不直接覆盖。完整保留 .env、.huobao-settings.json、data/、output/ 和浏览器 localStorage/IndexedDB，不输出任何密码、Key、Token。项目 JSON 只保存工作流和素材引用，不是完整素材备份。

已有安装沿用原 HOST、PORT 和浏览器地址；全新安装默认 http://127.0.0.1:8787 。先查 8787 是否已经由此项目运行；如果被占用，查清来源，不随意终止进程或换端口。localhost 与 127.0.0.1、不同端口和不同浏览器的数据彼此独立，不能用“清除网站数据”解决丢项目问题。保持本地回环监听，不自动开公网、防火墙入站或云部署。

使用仓库快速启动入口：Windows 为 quick-start.cmd，macOS 为 quick-start.command，Linux 为 quick-start.sh。Windows 创建当前用户实际桌面的 .lnk，正确设置目标和工作目录；macOS 处理 chmod +x 并创建桌面 .command 包装脚本；Linux 桌面系统创建 Terminal=true 的 .desktop 或可执行启动脚本。发现同名快捷方式时先检查，不覆盖已有文件。macOS/Linux 如果 Finder 或桌面启动的 PATH 找不到 nvm/fnm 安装的 Node，把已验证可用的 Node 绝对路径通过 NODE_BINARY 写入桌面包装脚本或启动项，不猜路径，也不要把 NODE_BINARY 只放在 .env 里。必要时为可灵 CLI 设置实际 KLING_CLI_JS 路径。无图形界面的 Linux 用 bash quick-start.sh --no-browser，在终端前台运行；远程机器只在需要时解释 SSH 隧道，不自动改变监听地址。

实际启动并验证首页、/api/status、本地免登录进入项目、创建空项目与设置面板。不要为验收调用付费云端图片、视频或聊天接口。API Key 由我在本机“API 设置”填写，不能要求我粘贴进聊天；保留已有 Key 和渠道。147 普通生图使用 gpt-image-2.5-flare / gpt-image-2.5-sunburst；不要把普通生图的全局默认渠道改为 ComfyUI。火山、可灵 OAuth、CPRT 是独立可选渠道，未配置则明确说明。

本地图像放大另外需要 ComfyUI、可运行的 Python/PyTorch 环境及 RealESRGAN 模型。先检测我的系统、GPU/驱动、可用磁盘和已有 ComfyUI，不覆盖或升级正在使用的实例，不臆造固定显存门槛；按 docs/COMFYUI-SETUP.md 的官方入口选与硬件兼容的安装方案。Windows 可用便携版；macOS/Linux 或其他布局先手动启动 API。已有主实例 8188 时优先使用空闲的 8190 作为独立超分实例，保留原有服务。

把官方 RealESRGAN_x4plus.pth 放到实际 ComfyUI 的 models/upscale_models/；新配置中超分 Provider 使用 http://127.0.0.1:8190、模型 ID RealESRGAN_x4plus.pth、最大倍数4、最大边4096、工作流 workflows/comfyui/realesrgan-upscale-api.json。已有配置按实际文件名和地址保留，不能把后缀改名当成模型格式转换。只在 Windows 便携布局及本机路径均验证正确后启用自动启动；自动启动不会安装软件或下载模型。Base URL、port、launchArgs 的端口必须一致。不要给 ComfyUI 配云端 Key，也不要把它设成普通图片生成默认渠道。

先检查 /system_stats 和 /object_info，确认 LoadImage、UpscaleModelLoader、ImageUpscaleWithModel、ImageScale、SaveImage 五个节点与模型列表。保存设置后点击“测试 ComfyUI”；它仅检查工作流读取与服务就绪。随后用小图在“添加节点 → 图像放大”真实跑一次2x和4x，检查实际像素、原图保留、结果可下载，刷新后素材仍在。支持时运行 node scripts/check-upscale-live.js <画布地址>，它用独立浏览器数据验证本地超分。没有 GPU、模型或真实输出时，明确哪些未完成，不把 /system_stats 成功写成超分成功。

介绍本版本的实际入口：顶部“创作案例”中有商品主图、详情页切图、SKU整理、视频分镜素材板、设计参考板和大图素材提取，见 docs/canvas-cases.md；创建生成流程后先编辑提示词，再由用户手动点击生成，不自动提交付费请求。图像放大也可从图片右键进入，结果输出为新的普通图片节点。

请持续完成可独立执行的步骤，只有需要本人授权或系统权限时才告诉我具体操作。最后给出画布/ComfyUI/模型的实际路径、Node/Python与GPU信息、桌面入口、两个服务地址、2x/4x实测结果、未配置项、停止/重启/更新方法。画布用 Ctrl+C 停止；托管 ComfyUI 默认保持后台运行，关闭画布不会自动停止它。不要把未实测的平台和付费渠道写成已验收。
```

## 2. 安装运行环境

推荐 **Node.js 24 LTS**，从 [Node.js 官方下载页](https://nodejs.org/en/download) 选择自己的 Windows、macOS 或 Linux，以及 x64 / ARM64 架构。已有合适版本时不必重复安装；macOS 的 Apple 芯片通常选 ARM64，Intel Mac 选 x64，由 Codex 以实际机器为准。

也可使用 **Node.js 22.13+**。项目使用内置 `node:sqlite`，该模块从 Node 22.13.0 起无需 `--experimental-sqlite` 开关，仍可能显示实验性提示；提示本身不等于启动失败。依据：[Node.js SQLite 官方文档](https://nodejs.org/api/sqlite.html)。不要单独安装 SQLite npm 包。

安装后重新打开终端，在 PowerShell、macOS 终端或 Linux 终端检查：

```bash
node --version
node -p "process.execPath + ' | ' + process.platform + ' | ' + process.arch"
node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(':memory:'); db.close(); console.log('SQLite OK')"
```

最后一条出现 `SQLite OK` 才说明当前这份 Node 可用。若机器存在多份 Node，要让快捷方式也使用刚验证过的那一份。项目 `package.json` 无依赖，**无需 `npm install`，无需 `npm run build`**；`node_modules` 不存在是正常的。

## 3. 获取源码与首次配置

### Git 下载

在你选定的安装父目录执行（Windows、macOS、Linux 相同）：

```bash
git clone --branch codex/local-comfyui --single-branch https://github.com/loverelic0-wq/6mang.git
cd 6mang
```

如果此处已经有 `6mang` 文件夹，先检查它是已有安装还是其他文件，不要直接覆盖或删除。后续尽量保留同一个安装位置，避免桌面快捷方式指向旧目录。

### ZIP 下载

下载 [ComfyUI 版 ZIP](https://github.com/loverelic0-wq/6mang/archive/refs/heads/codex/local-comfyui.zip)，完整解压到自己可写的文件夹。进入能同时看到 `package.json`、`server/`、`public/` 和 `quick-start.*` 的那一层。不要在压缩包内直接运行，也不要只复制启动脚本。

### 首次启动前的本机配置

仅当没有 `.env` 时，复制 `.env.example` 并将副本命名为 `.env`；在文件管理器中注意显示扩展名，避免变成 `.env.txt`。快速启动也会在缺失时自动创建，但先手动创建便于在第一次启动前设置密码。

新安装保留 `HOST=127.0.0.1`、`PORT=8787`、`HUOBAO_LOCAL_MODE=true`，直接进入本地项目，无需设置管理员密码。上游 API Key 在画布右上角「API 设置」中自行填写，不发到聊天或提交到 Git。

`HUOBAO_LOCAL_MODE=false` 仅用于旧账户/积分后端接口兼容；本分支已移除对应前端，不提供登录入口，不作为画布正常安装步骤。如果已有集成仍依赖这些接口，应单独保留其部署与客户端，并配置自己的管理员密码；不要删除旧数据库。默认本地模式不会创建 admin。

## 4. 三个系统怎样快速启动

| 系统 | 仓库入口 | 第一次怎么运行 | 建议桌面入口 |
| --- | --- | --- | --- |
| Windows | `quick-start.cmd` | 在项目文件夹双击 | 指向该文件的 `.lnk` 快捷方式 |
| macOS | `quick-start.command` | 先赋予执行权限，再双击；也可 `bash quick-start.command` | 含实际项目和 Node 路径的 `.command` |
| Linux 桌面 | `quick-start.sh` | `bash quick-start.sh`；或赋权后执行 | `Terminal=true` 的 `.desktop` |
| Linux 无桌面 | `quick-start.sh` | `bash quick-start.sh --no-browser` | 前台终端命令，无需伪造桌面入口 |

这些入口会定位自身所在项目目录，检查 `node:sqlite`，仅在缺失时创建 `.env`，启动本地服务；真正监听成功后才尝试打开浏览器。macOS 调用 `open`，Linux 有图形会话时调用 `xdg-open`。自动打开失败时，手动访问终端显示的地址即可。

服务在启动终端的前台运行。**保持终端窗口打开，按 `Ctrl+C` 停止。** 再次启动使用同一个快捷方式即可，不要反复启动多个窗口。也可在项目目录用 `npm start` 或 `node server/server.js` 手动运行；这两条手动命令不会自动创建 `.env` 或打开浏览器。

### Windows：创建桌面快捷方式

可右键 `quick-start.cmd` 创建快捷方式，放到桌面。快捷方式必须指向项目中的原文件，不能只把 `.cmd` 复制到桌面，因为它需要同目录下的 `scripts/`。

也可让 Codex 在已经进入项目目录的 PowerShell 中执行以下命令。它使用当前用户的实际桌面位置（包括重定向的桌面），已有同名文件时停止而不覆盖：

```powershell
$sixmangDir = (Get-Location).Path
$sixmangEntry = Join-Path $sixmangDir 'quick-start.cmd'
if (-not (Test-Path -LiteralPath $sixmangEntry)) { throw '请先进入 6mang 项目目录' }
$sixmangDesktop = [Environment]::GetFolderPath('Desktop')
$sixmangShortcut = Join-Path $sixmangDesktop '6mang 画布.lnk'
if (Test-Path -LiteralPath $sixmangShortcut) { throw '桌面已有同名快捷方式，请先检查其目标' }
$sixmangShell = New-Object -ComObject WScript.Shell
$sixmangLink = $sixmangShell.CreateShortcut($sixmangShortcut)
$sixmangLink.TargetPath = $sixmangEntry
$sixmangLink.WorkingDirectory = $sixmangDir
$sixmangLink.Description = '启动本地 6mang 画布；Ctrl+C 停止'
$sixmangLink.Save()
```

刚安装 Node 后仍显示“没有找到 Node.js”，先关闭旧终端再启动。PowerShell 若仅拦截 `npm.ps1`，快速启动的 `.cmd` 直接调用 Node；手动可用 `npm.cmd start`，不必为此修改系统执行策略。

### macOS：双击 `.command`，处理 Finder 的 Node 路径

在终端进入实际项目目录后执行：

```bash
chmod +x quick-start.command quick-start.sh
./quick-start.command
```

不方便赋权时可用 `bash quick-start.command`。系统拦截下载文件时先确认来自上面的仓库，再按系统给出的“打开”操作处理；不需要关闭整机安全设置。

使用 nvm/fnm 的用户可能出现“终端能启动，Finder 双击找不到 Node”。Finder 的环境与交互终端可能不同。先在可用终端运行 `node -p process.execPath`，将真实的 Node 绝对路径写入桌面的 `6mang 画布.command` 包装脚本。例如以下两条路径都要换成你机器上已核实的值：

```sh
#!/bin/sh
NODE_BINARY="/实际的 Node 绝对路径/node"
export NODE_BINARY
exec /bin/sh "/实际的项目路径/6mang/quick-start.command"
```

给这个桌面文件 `chmod +x` 后再双击。含空格、中文的路径保留引号；Codex 应正确转义实际路径中的特殊字符，并且不要覆盖已有同名文件。`NODE_BINARY` 是启动 shell 读取的环境变量，**只写进项目 `.env` 无法解决启动前找不到 Node 的问题**。以后升级 nvm/fnm Node，若原版本路径被删除，需要同步更新包装脚本。可灵 CLI 如随旧 Node 安装，也要核对它的新路径。

### Linux：桌面启动与无图形界面

终端进入实际项目目录：

```bash
chmod +x quick-start.sh
./quick-start.sh
```

或直接 `bash quick-start.sh`。桌面入口可让 Codex 按实际桌面位置创建 `.desktop` 文件；能用 `xdg-user-dir DESKTOP` 时用它取得桌面路径，不假设所有系统都叫 `~/Desktop`。下面是需替换真实路径的格式示例：

```ini
[Desktop Entry]
Type=Application
Name=6mang 画布
Comment=启动本地画布，Ctrl+C 停止
Exec=env "NODE_BINARY=/实际的 Node 绝对路径/node" /bin/sh "/实际的项目路径/6mang/quick-start.sh"
Path=/实际的项目路径/6mang
Terminal=true
Categories=Graphics;
```

让桌面文件可执行，并在桌面环境有要求时选择“允许启动/信任”。实际转义应遵循 `.desktop` 格式，尤其路径中有引号、反斜杠或 `%` 时；没有桌面启动器支持时，保留终端启动方式即可。`NODE_BINARY` 也可解决 Linux 图形桌面找不到 nvm/fnm Node 的情况。

无图形环境运行：

```bash
bash quick-start.sh --no-browser
```

也支持环境变量 `SIXMANG_NO_BROWSER=1`。在远程 Linux 上仍可保持 `HOST=127.0.0.1`；确需从自己的电脑浏览时，在自己电脑另开终端建立 SSH 隧道（用户名和主机替换为实际值）：

```bash
ssh -N -L 8787:127.0.0.1:8787 用户名@远程主机
```

随后在自己电脑访问 `http://127.0.0.1:8787`，保持服务终端和 SSH 隧道都打开。先确认自己电脑 8787 未占用；不要自动开放公网监听或防火墙。使用隧道也要注意浏览器数据所属地址，避免和另一份本地画布混用。

## 5. 首次进入画布与可选模型渠道

1. 打开启动窗口显示的地址，直接进入项目首页。本版画布保持本地模式；若出现401且环境显式设为 false，先检查旧部署配置，不能寻找已经移除的登录入口。
2. 在项目首页创建项目；打开右上角「API 设置」，按聊天、图片、视频分别配置自己购买的渠道。
3. 保存后回到节点选择相应渠道和模型。设置保存到本机 `.huobao-settings.json`，它已被 Git 忽略；公开状态接口仅返回是否配置和脱敏 Key。不要用别人的配置文件覆盖自己的 Key。

| 渠道 | 如何配置 | 对应能力与条件 |
| --- | --- | --- |
| 147 图片 | Base URL `https://147ai.com/v1`，自己的 147 Key；模型 ID `gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`，Flare 作为默认 | 图片生成、参考图编辑及复用图片编辑链路的节点；真实生成需该账号拥有对应模型权限和余额 |
| 本地 ComfyUI | 另装 ComfyUI 和超分模型；连接本机 API，填写工作流与模型 ID，见 [专门说明](COMFYUI-SETUP.md) | 仅用于图像放大；安装完成后需要实际运行2x/4x验证；不需要云端 Key |
| 火山 Seedream | 图片渠道「火山 Seedream」，Base URL `https://ark.cn-beijing.volces.com/api/v3`，自己的 Ark Key；当前 Pro ID `doubao-seedream-5-0-pro-260628` | Seedream 图片生成、多参考图、精确图片编辑、智能图层分离；需要该模型的实际调用权限，不会本地模拟图层结果 |
| 可灵 CLI | 在运行画布的同一电脑安装 `npm install -g @klingai/cli-cn`，再于「API 设置 → 可灵 CLI」点击登录完成 OAuth | 可用模型和参数来自当前账号 CLI 能力；不填 Base URL/Key。消耗可灵账号额度，不扣画布积分 |
| CPRT 视频 | 视频渠道新增子类，Base URL `https://ai-api.cprt.xyz/v1`，自己的 CPRT Key，按当前渠道提供的模型 ID 配置 | 异步视频、首尾帧和多模态参考；受具体模型限制。本地参考素材需要可下载的公网 URL，使用内置上传路径时需自己配置 `.env` 中的 `COS_*` |

可灵 CLI 属于可选工具安装，不是画布 npm 依赖。默认尝试发现全局安装；非标准路径可在 `.env` 设置 `KLING_CLI_JS` 为实际的 `@klingai/cli-cn/dist/cli.js` 绝对路径。OAuth 需要用户本人在浏览器授权，凭据由 CLI 管理在本机 `~/.kling/.credentials`，不要复制给 Codex 或社群。

**更新源码不会覆盖你已经保存的 147 模型池。** 老用户在「API 设置 → 图片」选中现有 147 渠道，保留 Base URL 和 Key，把模型池中的旧 `gpt-image-2` 替换为上述两个新 ID，并将默认项设为 Flare 或 Sunburst 后保存。只有当这个 147 渠道已移除旧 ID 并配置新模型时，旧节点才会自动跟随新默认模型；其他渠道和仍明确保留的旧 ID 不会被强制替换。新增模型预设只保证全新配置能看到它们。

模型接口可用性以你所选渠道的账号权限和实际响应为准；安装成功、节点可见、状态里 Key 已配置都不等于付费生成已经验收。画布积分也不是上游人民币价格。

## 6. 安全更新本分支

更新前保存工作、停止服务，并完成下节备份。Git 用户先在原项目目录查看状态和来源：

```bash
git status --short --branch
git remote -v
git config --get-all remote.origin.fetch
```

确认 `origin` 指向 `https://github.com/loverelic0-wq/6mang.git`（或该仓库对应的 SSH 地址）。若存在本地修改、未跟踪文件、未推送提交，先让 Codex 保留它们并说明处理方法；不要盲目执行重置。工作区适合更新后再运行：

```bash
git remote set-branches --add origin codex/local-comfyui
git fetch origin --prune
git switch codex/local-comfyui
git pull --ff-only origin codex/local-comfyui
```

`git remote set-branches --add origin codex/local-comfyui` 为只跟踪 master 的克隆追加本分支，不删除本地分支或其他拉取范围；已有对应 refspec 可跳过。如果 fetch 仍引用已经删除的远程分支，先核对并修复失效项，再重新拉取。

如果本地还没有 `codex/local-comfyui`，完成 fetch、确认远程分支存在后，将切换命令换为 `git switch --track origin/codex/local-comfyui`，再 pull。本分支不要自动回到 master。`--ff-only` 失败时请 Codex 检查并保留本地差异，不执行 `reset --hard`。

ZIP 用户下载并解压到临时新目录，确认内容完整，再在服务已停止且备份完成的前提下更新原安装中的源码。**保留原 `.env`、`.huobao-settings.json`、`data/`、`output/`，不能拿新包覆盖它们。** 如改用新的安装目录，应先复制自己的运行数据并更新桌面快捷方式指向；保留原安装备份，直到确认旧项目、素材与设置可用。

更新后使用同一快捷方式启动，访问原浏览器和地址并刷新，不删除站点数据。本版本继续跟踪 `codex/local-comfyui`。ComfyUI 的安装目录、模型和用户数据独立保留，不会由 Git 更新或自动重装；已有超分 Provider 也不会被新的预设覆盖。

## 7. 数据在哪里，怎样备份

| 数据 | 实际位置 | 更新/备份要点 |
| --- | --- | --- |
| 端口、首次管理员参数、可选 COS 配置 | 项目 `.env` | 只在缺失时创建，保留自己的配置 |
| 模型渠道、API Key、默认模型和模型池 | 项目 `.huobao-settings.json` | 保留原文件；不要提交、公开分享 |
| 用户、登录会话、余额流水、用量记录 | 项目 `data/`，主要为 `app.db` | 停止服务后备份整个 `data/`；SQLite 使用 WAL，不要运行中只复制一个 DB 文件 |
| 已归档的生成结果与清单 | 项目 `output/` | 备份完整目录；并非所有本地载入素材都会自动归档到这里 |
| 项目、工作流、模板、偏好 | 当前浏览器当前地址的 localStorage | 保留原浏览器用户资料与站点数据，可额外导出项目 JSON |
| 图片、视频、图层及 3D 模型等 Blob 素材 | 当前浏览器 IndexedDB `huobao-canvas-assets` | 需随浏览器站点数据保留/备份，单独保留原始素材；不会因备份源码而自动备份 |

项目「导出 JSON」序列化工作流和素材引用，不会遍历 IndexedDB 把 Blob 打包进去。部分小型内嵌数据或外链可能随工作流保留，但 `idb-image:...`、图层 assetId、模型 assetId 等仍依赖原浏览器数据；**这不是完整素材迁移包**。换电脑前保留原图、视频、3D 文件和 `output/`，让 Codex 检查浏览器站点数据备份与恢复方案，并在新环境逐项检查素材；不要验证前清空旧电脑。

`http://localhost:8787` 与 `http://127.0.0.1:8787`、不同端口、不同协议都属于不同来源；换浏览器用户资料也会看到另一份数据。看见空项目列表时，先回到原来的浏览器和完整地址。不要清缓存、删 IndexedDB 或反复换端口“修复”。

## 8. 不花钱的部署验收与常见问题

部署验收应实际打开首页，并确认 `GET /api/status` 返回 JSON。可在浏览器打开 `http://127.0.0.1:8787/api/status`；原有自定义地址需替换。检查免登录进入、创建空项目、设置面板和桌面入口，无需点击付费生成。本地图像放大需另按 [ComfyUI 验收步骤](COMFYUI-SETUP.md#4-验收与使用) 跑真实小图，不把 API 连通当作超分成功。

| 现象 | 处理方式 |
| --- | --- |
| `node` 找不到或 `node:sqlite` 报错 | 核对 Node 来源、架构、绝对路径，运行前面的 SQLite 实测；升级到 Node 24 LTS 或合适的 22.13+，重开终端。不要通过安装第三方 SQLite 包修补 |
| macOS 终端可用，Finder 双击不可用 | 给桌面包装脚本设置实际 `NODE_BINARY`；检查脚本可执行权限和项目路径 |
| Linux 双击只打开文本编辑器 | 赋予执行权限，在桌面环境中允许启动，或直接用 `bash quick-start.sh` |
| 无法写入 `.env`、`data/` 或 `output/` | 确认项目完整解压且目录属于当前用户并可写；不要安装在受保护的系统目录，也不要直接对目录执行宽泛的 `chmod 777` |
| `EADDRINUSE` / 8787 被占用 | 先找原 6mang 启动窗口和监听进程归属；原服务已正常运行则访问它。确认后关闭属于此项目的旧服务，不随意 kill；确需改端口时先处理浏览器数据原点问题 |
| 首页能开，API 提示 401 | 本版画布没有登录入口：先检查是否误用了 `HUOBAO_LOCAL_MODE=false` 的旧后端模式。若仅上游调用401，检查对应渠道 Key/权限/模型 ID，不当作 Node 安装故障 |
| 模型找不到、无权限或额度不足 | 核对节点实际选中的渠道、模型池、账号权限及额度；旧安装按上节更新 147 模型池，保留 Key |
| 看见旧页面，按钮调用失败 | 确认访问的是 Node 服务地址，不是 `file://`、根目录旧 `index.html` 或别的静态服务器；实际前端由 `public/` 提供 |
| 更新后项目/素材“消失” | 核对原浏览器、用户资料、协议、主机名和端口；保留 localStorage/IndexedDB，不先清网站数据。JSON 导入缺图需检查原素材是否只存于旧浏览器 |
| CPRT/Ark 本地参考素材不能提交 | 按该渠道要求提供可下载的素材 URL；内置 COS 上传需要自己的 `COS_*` 配置，不能用电脑文件路径代替公网 URL |
| 可灵显示不可用 | 核对同机 CLI 安装、实际 `KLING_CLI_JS` 路径、OAuth 登录和能力刷新；可用参数以当前账号能力为准 |

跨系统脚本采用共享 Node 启动器和各系统入口；macOS/Linux 当前提供脚本设计与自动化覆盖，**不代表已完成这两个系统的实机桌面双击验收**。请让你的 Codex 在你的机器上实际验证快捷方式。部署验收与第三方付费生成验收分开记录，不把本地测试通过写成所有渠道都已生成成功。
