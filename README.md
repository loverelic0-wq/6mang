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
- `GET /api/billing/transactions`、`GET /api/billing/usage`
- `GET /api/admin/users`、`POST /api/admin/credit`（admin only）

## 配置 API（providers 模型）

在应用右上角设置面板里编辑：三个 Tab（聊天 / 图片 / 视频），每个 Tab 下可建多个**子类（provider）**，每个 provider 独立配置 Base URL、API Key、默认模型、模型池。

典型用法：同一类下用多个 key（如图片下挂一个走 OpenAI 系的 key + 一个走 nano banana 的 key），节点上选模型时按子类分组（`<optgroup>`），后端按 `providerId` 路由到对应上游。

保存后写入 `.huobao-settings.json`（gitignored，不会提交）。**API key 永不下发到浏览器**，`/api/status` 只返回脱敏的 `apiKeyMasked` + `configured` 标志。
