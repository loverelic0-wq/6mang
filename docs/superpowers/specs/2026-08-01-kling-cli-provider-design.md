# 6mang 可灵 CLI Provider 集成设计

## 目标

在不新建重复节点的前提下，把本机 `@klingai/cli-cn` 的完整能力接入 6mang：

- 复用现有“图片生成”和“视频生成”节点。
- 可灵作为图片、视频两类中的内置 Provider，和现有 HTTP Provider 并存。
- 设置页内完成 CLI OAuth 登录、退出、账户查询和能力刷新。
- 通过 `who_am_i` 动态读取模型、参数和素材输入定义，不在画布里硬编码可灵模型表。
- 支持 `text_to_image`、`image_to_image`、`text_to_video`、`image_to_video`、`query_tasks`、`file_upload`、`account`、`tool_list`、`who_am_i`、`login`、`logout` 的相关能力。
- 可灵调用不经过画布现有余额、扣费、退款和 `api_usage` 记账；仍保留画布现有登录保护。
- 生成成功后沿用现有历史落盘流程，避免可灵结果 URL 过期后素材失效。

## 方案比较

### 方案 A：Node 后端按请求启动 CLI 子进程（采用）

后端使用 `node <kling-cli.js> <command> --quiet ...`，解析单行 JSON。OAuth 登录使用一个受控的长生命周期子进程，其余命令使用有超时的短进程。

优点：完全复用 CLI OAuth、上传、能力发现和协议更新；零新增 npm 依赖；符合“使用可灵 CLI”的目标。缺点：每次调用有子进程启动开销，需要严格处理超时、并发和输出解析。

### 方案 B：额外启动常驻 CLI Bridge 服务

单独进程持有 OAuth 和任务状态，画布通过 HTTP 调用。

优点：进程启动成本低、任务管理集中。缺点：新增端口、部署和生命周期管理；对当前本地原型过重。

### 方案 C：绕过 CLI，直接实现可灵 MCP/OAuth 客户端

优点：控制最细。缺点：重复实现 CLI 已提供的 OAuth、刷新、上传、能力发现和错误语义，维护成本最高，也偏离用户明确要求。

## 架构

新增 `server/kling-cli.js`，只负责可灵 CLI：

1. 安全定位 CLI JavaScript 入口，不通过 shell 拼接用户输入。
2. 执行短命令并解析 `--quiet` JSON。
3. 管理单例 OAuth 登录进程和登录状态。
4. 缓存、归一化 `who_am_i` 能力声明。
5. 把 data URL 参考素材写入独立临时目录，交给 CLI 自动上传，提交结束后清理。
6. 归一化生成 ID、任务状态、错误和媒体 URL。

`server/server.js` 负责 HTTP 路由和现有业务编排：

- 在图片和视频 Provider 中注入受管理的 `kling-cli` 项。
- 可灵分支绕过现有余额操作，HTTP Provider 分支保持原样。
- OAuth/账户控制接口只允许管理员调用；生成接口仍要求画布用户登录。
- 图片和视频继续使用现有创建与查询入口，减少前端分叉。

`public/app.js` 负责界面和节点映射：

- 设置页为受管理的可灵 Provider 渲染 OAuth/账户面板，不显示 Base URL、API Key 和手工模型表。
- 生成节点根据连接素材判断当前 CLI 工具，并按模型声明渲染动态参数。
- 节点把参数按 Provider + 模型保存，切换模型不会丢失其他模型的配置。
- 图片和视频统一轮询可灵任务；成功结果继续进入现有历史落盘。

## Provider 数据结构

图片和视频分组都包含同一个受管理 Provider：

```json
{
  "id": "kling-cli",
  "label": "可灵 CLI",
  "adapter": "kling-cli",
  "managed": true,
  "configured": true,
  "models": []
}
```

`configured` 表示 CLI 已安装且 OAuth 有效。`models` 由能力缓存动态覆盖，不接受设置页手工编辑。

模型项保留现有 `id/label`，并增加：

```json
{
  "id": "模型 ID",
  "label": "模型别名或 ID",
  "tools": ["text_to_video", "image_to_video"],
  "specs": {
    "image_to_video": {
      "arguments": [],
      "inputs": []
    }
  }
}
```

受管理 Provider 在服务端强制注入，不能被设置保存或删除操作破坏，但允许被设为图片或视频默认渠道。

## 工具选择与素材映射

- 图片节点无参考图：`text_to_image`。
- 图片节点有参考图：`image_to_image`。
- 视频节点无参考图：`text_to_video`。
- 视频节点有参考图：`image_to_video`。
- 可灵 CLI 当前未声明参考视频输入；连接参考视频时阻止提交并显示明确错误，不静默忽略。
- `first_image` 使用第 1 张参考图。
- `tail_image` 使用第 2 张参考图，并通过 CLI 的 `--tailImage` 传递。
- `image_1` 到 `image_7` 按画布连线槽位顺序映射，通过重复 `--image` 传递。
- 输入数量、必填项和格式在提交前按当前模型的 `inputs` 声明校验。
- 本地 IndexedDB/data URL 素材转换为临时文件；CLI 内部 `file_upload` 完成上传。远程可访问 URL 可直接传递。

## 动态参数

参数面板完全基于当前工具、模型的 `arguments` 声明：

- `prompt` 使用画布现有提示词输入，不重复显示。
- 有 `allowedValues` 时显示下拉框。
- `true/false` 参数显示布尔选择。
- 无枚举时显示文本输入。
- 显示默认值、必填状态和说明。
- 未修改的可选参数不传给 CLI，让服务端默认值生效。
- 参数值以字符串传递，保持 CLI 的 1:1 契约。
- 模型或 CLI 更新后，能力刷新即可获得新增参数；旧节点中已经失效的值会提示并要求改成当前合法值。

节点状态使用：

```json
{
  "dynamicParams": {
    "kling-cli": {
      "模型 ID": {
        "duration": "5"
      }
    }
  }
}
```

## HTTP 接口

现有接口保持：

- `POST /api/images/generations`
- `POST /api/video/create`
- `GET /api/video/query?id=...&providerId=kling-cli`

新增：

- `GET /api/kling/status`：管理员查看 CLI 安装、OAuth、登录进程和脱敏身份状态。
- `POST /api/kling/login`：管理员启动 OAuth；重复点击返回现有登录进程状态，不并发启动。
- `POST /api/kling/logout`：管理员退出并清理服务端缓存。
- `POST /api/kling/refresh`：管理员刷新 `who_am_i` 和账户信息。
- `GET /api/kling/account`：管理员查看会员和积分。
- `GET /api/kling/tools`：管理员读取 `tool_list` 原始工具摘要，用于诊断 CLI/服务端能力差异。
- `GET /api/kling/tasks/:id`：已登录画布用户查询并归一化任务结果，图片和视频共用。

生成提交统一返回：

```json
{
  "adapter": "kling-cli",
  "id": "generation_id",
  "status": "submitted"
}
```

任务查询统一返回：

```json
{
  "adapter": "kling-cli",
  "id": "generation_id",
  "status": "processing|succeeded|failed",
  "urls": ["完整媒体 URL"],
  "video_url": "首个视频 URL（如有）",
  "error": "失败原因（如有）"
}
```

## OAuth 流程

1. 管理员在设置页点击“登录可灵”。
2. 后端启动 `kling login --quiet`；CLI 使用 PKCE 打开系统浏览器。
3. 6mang 已占用 8787 时，CLI 自动尝试其后续 loopback 回调端口。
4. 前端轮询 `/api/kling/status`，展示等待授权、成功、失败或五分钟超时。
5. 成功后立即刷新能力和账户，并更新图片/视频 Provider 模型池。
6. Token 仅由 CLI 保存在 `~/.kling/.credentials`；画布不读取、不返回、不复制 Token。

## 错误与并发

- 所有非登录 CLI 命令设置超时和 stdout/stderr 大小上限。
- CLI 未安装、未登录、登录过期、参数无效、积分不足、内容审核和服务错误分别显示可理解的错误。
- 不自动重提任何付费生成任务。
- 同一时间只允许一个 OAuth 登录进程；生成任务可并发提交。
- CLI 返回非零退出码、无 JSON 或畸形 JSON 时返回 502，并保留不含凭据的诊断摘要。
- 任务轮询超时只停止前端等待，不取消可灵任务，并保留 generation ID。

## 安全与兼容

- 使用 `spawn(process.execPath, [cliJs, ...args])`，不启用 shell，防止提示词或参数注入命令。
- CLI 路径优先读取 `KLING_CLI_JS`，然后查找当前 Windows 全局 npm 安装路径；找不到时给出安装提示。
- OAuth、退出和账户接口使用 `requireAdmin`；能力的公开 Provider 视图不含账户积分和身份详情。
- HTTP Provider 的 API Key、先扣费、失败退款、SSRF 防护与现有路由行为不变。
- 可灵 Provider 的所有调用不读写 `transactions` 和 `api_usage`。
- 远程结果 URL 在成功后立即沿用现有 `output/` 落盘与 `/api/history/file` 回流。

## 测试与验收

使用 Node 内置 `node:test` 和假 CLI 脚本，不新增依赖：

1. CLI 定位、JSON 解析、非零退出、畸形输出和超时。
2. OAuth 单例状态、成功、失败和超时。
3. `who_am_i` 模型/工具/参数归一化和缓存失效。
4. 文生图、参考图生图、文生视频、首帧/尾帧、多参考图命令参数映射。
5. data URL 临时文件创建、大小限制和清理。
6. 任务状态、generation ID、媒体 URL 与错误归一化。
7. 可灵分支不调用画布余额调整；原 HTTP Provider 分支仍保持原扣费退款结构。
8. 设置页 OAuth 状态、账户信息、动态参数渲染和 Provider 切换。
9. 实机只执行只读 `who_am_i`/`account` 验证；不为测试自动提交付费生成。

验收结果：管理员可在设置页完成 OAuth；图片/视频节点选择可灵后能按实时模型声明展示参数并提交全部受支持生成方式；任务成功后节点显示结果且历史文件可持久播放；现有 HTTP 渠道和用户未提交修改无回归。
