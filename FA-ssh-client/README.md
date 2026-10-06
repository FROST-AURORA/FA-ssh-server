# FA SSH 远程工作台

基于 Tauri 2、React 和 TypeScript 的 VS Code 风格 SSH 工作台。

- 左侧：通过服务端接口查询、新增、编辑、删除、搜索连接；支持密码和私钥内容认证，展示实际连接状态。
- 中间：基于 xterm.js 的远程终端，支持初始欢迎信息、实时输出轮询、键盘输入、中文粘贴、Ctrl+C、窗口大小同步和多连接标签切换；底部命令栏支持执行单条命令。会话错误后可重新连接，关闭标签先释放终端再断开 SSH。
- 右侧：从后端加载智能体，创建会话并接收 AI 流式回复。发送时绑定当前 SSH 终端，AI 执行的命令与输出显示在终端，工具结果及最终回复显示在对话栏；支持新建对话、历史对话及本地保存。
- 窄窗口：通过活动栏切换连接管理、终端和对话；桌面端可折叠两侧面板。
- 左下角设置（`Ctrl+,`）：通用提供应用服务端地址与中英文界面；外观提供经典深色、明亮浅色、午夜蓝、静谧森林四套主题预览；终端支持字体及 10–28px 字号；关于显示版本和技术栈。保存后应用并持久化，取消会撤销主题预览。修改终端字体不会重连现有会话。

设置保存在 `fa-ssh.settings.v1`。通用设置中的服务端地址直接用于 SSH 请求，默认 `http://localhost:8091`，不含 `/api/v1/ssh`。旧版保存的 `8080` 地址需要改为实际服务地址；保存后立即重新加载连接列表。切换服务或离开页面时会尝试释放终端通道，但页面退出时请求不保证完成，底层 SSH 连接仍需通过断开按钮关闭。终端字体及主题即时应用，不会重建会话。

浏览器和 Tauri 桌面端均通过 HTTP 管理服务端 SSH 会话，不需要本机 OpenSSH。密码/私钥仅在提交表单时发送给服务端，不写入 localStorage，也不会随详情接口返回。编辑凭据留空表示保留旧值。服务端使用私钥内容，不支持本机文件路径、SSH Agent 或私钥口令字段。

连接列表以服务端为准，每 15 秒、窗口重新聚焦及操作完成后同步，也可手动刷新。旧 `fa-ssh.servers.v1` 数据不再读取或写入，不自动上传；新的 AI 聊天记录按服务地址保存在 `fa-ssh.agent-conversations.v1:<serverUrl>`。旧本地规则聊天记录保留在原键中，不混入真实 AI 会话。列表加载失败会显示重试入口，并标注已有数据可能过期。

## SSH 接口对接

启动 `FA-SSH-server`（默认端口 8091），确保数据库等依赖可用，再运行下方前端启动命令。服务端控制器已有跨域配置；远程部署时前后端协议及 CORS 需允许请求。可复制 `.env.example` 为 `.env.local` 设置默认服务地址和用户，已有界面设置的地址优先。

| 操作 | 方法及路径（前缀 `/api/v1/ssh`） | 参数 |
| --- | --- | --- |
| 列表 | GET `connection_list` | 查询参数 `userId`，默认 `default` |
| 详情 | GET `get_connection` | 查询参数 `connectionId` |
| 新增 | POST `create_connection` | JSON 请求 DTO |
| 修改 | POST `update_connection` | JSON 请求 DTO，含 `connectionId` |
| 删除 | POST `delete_connection` | 查询参数 `connectionId` |
| 连接 | POST `connect` | 查询参数 `connectionId` |
| 断开 | POST `disconnect` | 查询参数 `connectionId` |
| 打开终端 | POST `terminal/open` | JSON：`connectionId`, `cols`, `rows`；返回 `sessionId`, `initialOutput` |
| 输入 | POST `terminal/write` | JSON：`sessionId`, `input`（原始按键或粘贴内容） |
| 输出 | GET `terminal/read` | 查询参数 `sessionId`；返回 `output` |
| 执行单条命令 | POST `terminal/exec` | JSON：`sessionId`, `command`；返回 `output` |
| 调整尺寸 | POST `terminal/resize` | JSON：`sessionId`, `cols`, `rows` |
| 关闭终端 | POST `terminal/close` | 查询参数 `sessionId` |

打开终端前先建立 SSH 连接；已连接的服务器可双击打开终端。后端每个连接只允许一个终端，前端重复打开会激活已有标签。首次输出使用 `initialOutput`，随后串行读取（有输出时约 50ms、空闲时约 200ms 后发起下一次请求）。输入短暂合并并按序提交，避免每个按键同时发起请求。单条命令会显式追加回车；执行时暂停原始输入，并等待进行中的读取完成，防止 `exec` 与 `read` 消费同一输出缓冲区；后续输出仍由轮询接收。

打开、读取、写入或调整尺寸失败会停止输入和轮询，并提供重新连接入口；不会自动重发命令。关闭期间会等待在途打开请求，拿到会话 ID 后再释放资源。编辑及删除也先关闭终端，关闭失败保留标签并显示错误，允许重试。列表刷新、标签切换和字体修改不会重建终端。

只有响应业务码 `0000` 表示成功；其他业务码、HTTP 错误、网络错误及 45 秒超时均显示错误。失败不会提前删除连接或关闭标签；同一连接操作期间禁用重复操作。`VITE_SSH_USER_ID` 仅为列表用户筛选，不是身份认证。

当前后端契约限制：

- 删除接口不会关闭 SSH 会话，前端先成功断开，再删除；修改前也先断开，避免旧会话继续使用旧配置。
- 更新会保留空密码/私钥，且连接时优先使用已有私钥，因此编辑时固定认证类型；切换类型需新建连接。
- 详情不返回高级配置，但更新会完整覆盖配置。前端明确提示并提交默认值（超时 10 秒、保活 60 秒、压缩关闭、主机密钥检查开启），避免非空数据库字段报错；原启动命令和 known_hosts 会清空。现有会话实现尚未读取这些高级配置。需要无损编辑时，后端需补充配置查询及局部更新能力。
- `read` 暂无结构化会话状态；当前后端以固定 ANSI 文本 `[连接已断开]` 报告 Shell 结束，前端识别该完整响应后停止轮询。若后端修改此约定，需同步更新 `terminalSession.ts`，建议后续提供显式状态字段。
- `exec` 只写入命令并立即读取已有输出，不保证命令已执行完成，也不返回退出码；界面随后继续轮询。长时间运行或需要交互的命令直接在终端中输入。
- Rust 本地 SSH 通道仍保留，当前页面使用后端 HTTP 终端接口。

快捷键：`Ctrl+K` 搜索服务器，`Ctrl+N` 新建连接，`Ctrl+\`` 聚焦终端；对话框中 `Enter` 发送，`Shift+Enter` 换行。

## 验证

```powershell
.\npm22.cmd run build
& "$env:USERPROFILE/.cargo/bin/cargo.exe" test --manifest-path src-tauri/Cargo.toml --lib
```

Rust 测试覆盖 SSH 参数校验，以及 Windows 原生终端的光标握手、输出、尺寸变化和进程退出。浏览器回归使用 Playwright + 本机 Edge，覆盖连接增删改、刷新持久化、对话切换、表单校验和 390–1586px 布局。

尚未使用真实 AI 模型及服务器账号完成端到端联调。连接 HTTP 请求位于 `src/api/ssh.ts`，终端接口位于 `src/api/terminal.ts`，终端轮询和生命周期位于 `src/api/terminalSession.ts`，连接管理位于 `src/hooks/useSshConnections.ts`，AI 接口及流解析位于 `src/api/agent.ts`，聊天会话状态位于 `src/hooks/useAgentChat.ts`。

## AI 对话与终端联动

1. 启动后端，确保已配置可用的智能体、模型及 SSH 执行工具。在前端设置中填写后端基础地址（默认 `http://localhost:8091`）。
2. 连接服务器并选中其终端标签，等待终端就绪。在右侧选择后端返回的智能体，输入例如「查看磁盘使用情况并总结」。
3. 前端先调用 `POST /api/v1/create_session`，再调用 `POST /api/v1/chat_stream`，请求包含 `agentId`、`userId`、`sessionId`、`terminalSessionId`、`message`。这里的 `terminalSessionId` 是 `terminal/open` 返回的 ID，不能替换成服务器连接 ID。
4. 命令只由后端智能体执行。前端持续调用 `terminal/read` 展示命令回显及输出，不会解析 AI 文本并再次执行命令。`text` 更新回复，`tool_call` / `tool_result` 展示工具结果，`done` 收尾，`error` 显示错误并保留已有回复。

智能体列表来自 `GET /api/v1/query_ai_agent_config_list`。流解析兼容当前控制器的逐行 JSON、`: heartbeat` 心跳以及单行 `data:` 事件，支持跨网络分片的 UTF-8 字符和末行没有换行符。AI 流最长等待 10 分钟；普通接口继续使用 45 秒超时。

每个窗口同一时间只发送一个 AI 请求。执行期间锁定目标终端的手动输入、单条命令及断开/编辑/删除操作，输出轮询继续运行；切换终端标签不改变已发送请求的目标，回复始终写回发起请求的对话。断流、错误和断连不会自动重发请求；已提交命令可能仍在后端执行，应先检查终端状态。

会话按「本地对话 + 智能体 + 终端会话」隔离。当前后端 `createSession` 只按 `userId` 缓存，因此前端为每个上下文生成独立的匿名 `userId`（以 `VITE_SSH_USER_ID` 为前缀），避免新对话和不同智能体共用历史。这个 ID 不是身份认证。页面刷新后保留可见聊天记录，但不复用后端内存会话，模型上下文重新开始。

后端现有约束：工具卡片依赖控制器实际发出的 `tool_call` / `tool_result`；当前控制器从 `stateDelta` 生成这些事件，不保证每次 SSH 工具调用都产生卡片，终端回显和 AI 文本不依赖它。`SshExecuteAdkTool` 仍有进程级静态终端回退变量；本次前端串行限制仅覆盖当前窗口，多个窗口/用户并发的终端隔离需后端改成按请求或 ADK 会话绑定。

## Local development

Use Node.js 22.22.1 (see `.nvmrc`) with its bundled npm 10.9.4 or newer.
Vite 8 requires Node.js 20.19+ or 22.12+; Node.js 18 is unsupported.

On Windows, use the project wrapper to select Node.js from `.nvmrc` for this
command and its child processes only. It uses `NVM_HOME` and does not change
the Node.js version used by other terminals or projects:

```powershell
.\npm22.cmd install
.\npm22.cmd run dev
# Desktop application:
.\npm22.cmd run tauri dev
# Production frontend build:
.\npm22.cmd run build
```

Node.js 22.22.1 must already be installed with nvm-windows. If missing, run
`nvm install 22.22.1` once. No `nvm use` is needed; that command changes the
shared Windows symlink. `.nvmrc` alone does not automatically switch versions
in nvm-windows.

Use `.\npm22.cmd` in place of `npm` for this project. Regular `node` and `npm`
commands in your terminal continue using your existing default version.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
