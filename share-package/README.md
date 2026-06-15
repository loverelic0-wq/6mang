# Huobao Canvas Prototype

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

1. 复制 `.env.example` 为 `.env`
2. 在 `.env` 里填写 `N1N_API_KEY`
3. 启动服务：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:8787
```

部署到服务器时，可以把 `HOST` 设置为 `0.0.0.0`，再通过反向代理或服务器端口访问。

## 目录

```text
public/          # 前端静态文件
server/          # Node 后端代理
.env.example     # 环境变量示例
package.json     # 启动脚本
quick-start.cmd  # Windows 快速启动脚本
```

## 后端接口

- `GET /api/status`
- `POST /api/settings`
- `POST /api/chat/polish`
- `POST /api/images/generations`
- `POST /api/video/create`
- `GET /api/video/query?id=...`

API key 只由后端环境变量或本地运行时设置读取，前端不会把用户输入的 key 提交到仓库。默认情况下，文本、图像、视频都会复用 `N1N_BASE_URL` 和 `N1N_API_KEY`。

如果不同能力需要走不同供应商，可以分别配置：

- `N1N_CHAT_BASE_URL` / `N1N_CHAT_API_KEY`
- `N1N_IMAGE_BASE_URL` / `N1N_IMAGE_API_KEY`
- `N1N_VIDEO_BASE_URL` / `N1N_VIDEO_API_KEY`

未单独配置的服务会自动回退到共享的 `N1N_BASE_URL` / `N1N_API_KEY`。

也可以在应用的设置面板里编辑运行时配置。保存后会写入本地 `.huobao-settings.json`，该文件已经加入 `.gitignore`，不会被提交到仓库。
