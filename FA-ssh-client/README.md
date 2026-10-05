# FA SSH 远程工作台

基于 Tauri 2、React 和 TypeScript 的 VS Code 风格 SSH 工作台。

- 左侧：通过服务端接口查询、新增、编辑、删除、搜索连接；支持密码和私钥内容认证，展示实际连接状态。
- 中间：基于 xterm.js 的远程终端，支持初始欢迎信息、实时输出轮询、键盘输入、中文粘贴、Ctrl+C、窗口大小同步和多连接标签切换；底部命令栏支持执行单条命令。会话错误后可重新连接，关闭标签先释放终端再断开 SSH。
- 右侧：助手左侧、用户右侧的对话布局，发送、智能体选择、新建对话、历史对话及本地保存。当前为明确标注的本地规则助手，**尚未接入真实 AI 模型**；常用命令建议不会自动执行。
- 窄窗口：通过活动栏切换连接管理、终端和对话；桌面端可折叠两侧面板。
- 左下角设置（`Ctrl+,`）：通用提供应用服务端地址与中英文界面；外观提供经典深色、明亮浅色、午夜蓝、静谧森林四套主题预览；终端支持字体及 10–28px 字号；关于显示版本和技术栈。保存后应用并持久化，取消会撤销主题预览。修改终端字体不会重连现有会话。

设置保存在 `fa-ssh.settings.v1`。通用设置中的服务端地址直接用于 SSH 请求，默认 `http://localhost:8091`，不含 `/api/v1/ssh`。旧版保存的 `8080` 地址需要改为实际服务地址；保存后立即重新加载连接列表。切换服务或离开页面时会尝试释放终端通道，但页面退出时请求不保证完成，底层 SSH 连接仍需通过断开按钮关闭。终端字体及主题即时应用，不会重建会话。

浏览器和 Tauri 桌面端均通过 HTTP 管理服务端 SSH 会话，不需要本机 OpenSSH。密码/私钥仅在提交表单时发送给服务端，不写入 localStorage，也不会随详情接口返回。编辑凭据留空表示保留旧值。服务端使用私钥内容，不支持本机文件路径、SSH Agent 或私钥口令字段。

连接列表以服务端为准，每 15 秒、窗口重新聚焦及操作完成后同步，也可手动刷新。旧 `fa-ssh.servers.v1` 数据不再读取或写入，不自动上传；聊天记录仍保存在 `fa-ssh.conversations.v1`。列表加载失败会显示重试入口，并标注已有数据可能过期。

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

尚未使用真实服务器账号完成远程登录联调；AI 模型服务需要在后续接入。连接 HTTP 请求位于 `src/api/ssh.ts`，终端接口位于 `src/api/terminal.ts`，终端轮询和生命周期位于 `src/api/terminalSession.ts`，连接管理位于 `src/hooks/useSshConnections.ts`，当前助手逻辑位于 `src/types.ts` 的 `localReply`。

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
