# 6mang：给用户电脑上的 Codex

本分支为 `codex/local-comfyui`。先读 `README.md`、`docs/CODEX-DEPLOY.md` 和 `docs/COMFYUI-SETUP.md`，再处理安装、更新和使用问题。用户选了这个版本时，后续更新继续跟踪本分支，不自动切回 `master`。

- Node.js 需支持内置 `node:sqlite`，实际运行 SQLite 探测。项目无需 `npm install`、无需构建；运行 `quick-start.cmd` / `.command` / `.sh`，默认 `http://127.0.0.1:8787`。
- 默认本地单用户：无需登录、注册或管理员密码，不扣画布积分。上游云端模型仍由用户自己的账号计费。`HUOBAO_LOCAL_MODE=false` 只保留旧账户/积分后端接口，本分支不提供旧登录界面；不能把它作为本版画布的正常启动配置。
- 本地图像放大需要另外安装 ComfyUI 和超分模型；仓库只包含 API 工作流，不捆绑 Python、PyTorch 或模型。按用户的系统、GPU 和实际路径配置，不复用发布者电脑路径。
- 普通生图保持用户自己的云端图片渠道。ComfyUI 只用于独立的 `imageUpscale` 节点，不能设为普通图片生成的全局默认渠道。
- 新配置默认连接 `http://127.0.0.1:8190`，模型 `RealESRGAN_x4plus.pth`，工作流 `workflows/comfyui/realesrgan-upscale-api.json`。已有配置不自动覆盖；保留用户的端口、模型、工作流和 Key。
- 自动启动默认关闭；内置启动参数面向 Windows 便携版。其他布局先手动启动并验证 API。安装完成不等于超分完成，必须检查节点、模型和实际输出尺寸。
- 前端是 `public/`，根目录历史 `index.html` 不是当前入口。复用现有节点、连线、IndexedDB、历史和 provider 边界。创作案例使用方法见 `docs/canvas-cases.md`，创建案例不应自动调用付费生成。
- 保护 `.env`、`.huobao-settings.json`、`data/`、`output/`、浏览器 localStorage/IndexedDB；项目 JSON 不是完整素材备份。更新保持原浏览器地址，不清站点数据，不执行强制 reset/clean。
- 密钥只在用户本机输入，不要求粘贴到聊天，不输出完整配置或凭据。发布不包含运行数据、模型、日志、浏览器资料和本地成本/账单草案。
- 代码改动按范围运行 `npm test`、`npm run test:canvas`。本地超分实测可运行 `node scripts/check-upscale-live.js <画布地址>`，需先配置 ComfyUI 和 Chrome/Edge；该脚本使用独立浏览器数据，测试真实本地超分，不调用云端生图。
