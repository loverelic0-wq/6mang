# 6mang

前端 + 后端结构的 AI Canvas 原型。

## 快速启动

Windows 用户可以直接双击：

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

画布会自动识别 `cprt.xyz` 地址，改用 CPRT 的异步创建/查询协议；文本、连接的参考图片与参考视频会被转换为多模态输入。若素材来自本地节点，CPRT 需要其可从公网下载：请在 `.env` 配置 `COS_*`，画布会在提交前上传并使用临时签名 URL。普通远程 HTTPS 素材无需额外处理。
