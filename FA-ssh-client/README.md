# FA SSH 远程工作台

基于 Tauri 2、React 和 TypeScript 的 VS Code 风格 SSH 工作台。

- 左侧：服务器新增、编辑、删除、分组、搜索及本地保存。首次显示的三台服务器均为示例，需要编辑为真实地址。
- 中间：xterm.js 终端，多会话标签、键盘输入、ANSI 输出、尺寸同步和关闭会话。通过 Rust portable-pty 启动系统 OpenSSH，支持 SSH Agent、密码及指定私钥。
- 右侧：助手左侧、用户右侧的对话布局，发送、智能体选择、新建对话、历史对话及本地保存。当前为明确标注的本地规则助手，**尚未接入真实 AI 模型**；常用命令建议不会自动执行。
- 窄窗口：通过活动栏切换连接管理、终端和对话；桌面端可折叠两侧面板。
- 左下角设置（`Ctrl+,`）：通用提供应用服务端地址与中英文界面；外观提供经典深色、明亮浅色、午夜蓝、静谧森林四套主题预览；终端支持字体及 10–28px 字号；关于显示版本和技术栈。保存后应用并持久化，取消会撤销主题预览。修改终端字体不会重连现有会话。

设置保存在 `fa-ssh.settings.v1`。应用服务端地址当前仅保存为配置，尚未用于发起请求；SSH 仍由本机 OpenSSH 直接连接。语言切换影响界面文案，已有服务器名称、历史聊天内容和远程终端输出保留原文。字体使用本机安装版本，不可用时回退到等宽字体。

SSH 需要在 Tauri 桌面环境运行，并确保 `ssh -V` 可执行。首次连接的主机指纹、密码和私钥口令在终端中交互确认，应用不保存密码或私钥内容。连接配置仅记录私钥路径。状态「会话运行中」表示 OpenSSH 进程运行，认证结果以终端输出为准。

浏览器预览支持配置管理和本地对话，不具备原生 SSH 能力。浏览器与桌面 WebView 的本地存储相互独立。连接和聊天记录以 `fa-ssh.servers.v1`、`fa-ssh.conversations.v1` 保存于当前环境的 localStorage。

快捷键：`Ctrl+K` 搜索服务器，`Ctrl+N` 新建连接，`Ctrl+\`` 聚焦终端；对话框中 `Enter` 发送，`Shift+Enter` 换行。

## 验证

```powershell
.\npm22.cmd run build
& "$env:USERPROFILE/.cargo/bin/cargo.exe" test --manifest-path src-tauri/Cargo.toml --lib
```

Rust 测试覆盖 SSH 参数校验，以及 Windows 原生终端的光标握手、输出、尺寸变化和进程退出。浏览器回归使用 Playwright + 本机 Edge，覆盖连接增删改、刷新持久化、对话切换、表单校验和 390–1586px 布局。

尚未使用真实服务器账号完成远程登录联调；AI 模型服务需要在后续接入。终端组件位于 `src/components/SshTerminal.tsx`，桌面通道位于 `src-tauri/src/ssh.rs`，当前助手逻辑位于 `src/types.ts` 的 `localReply`。

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
