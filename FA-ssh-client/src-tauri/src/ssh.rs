use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
};
use tauri::{ipc::Channel, State};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    host: String,
    port: u16,
    username: String,
    auth: String,
    private_key: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "lowercase")]
pub enum TerminalEvent {
    Output(Vec<u8>),
    Exit(String),
}

struct Session {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}
impl Session {
    fn stop(&self) {
        if let Ok(mut killer) = self.killer.lock() {
            let _ = killer.kill();
        }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Clone, Default)]
pub struct Sessions(Arc<Mutex<HashMap<String, Arc<Session>>>>);
impl Sessions {
    pub fn close_all(&self) {
        let sessions: Vec<_> = self
            .0
            .lock()
            .map(|mut all| all.drain().map(|(_, session)| session).collect())
            .unwrap_or_default();
        for session in sessions {
            session.stop();
        }
    }
    fn get(&self, id: &str) -> Result<Arc<Session>, String> {
        self.0
            .lock()
            .map_err(|_| "会话锁不可用")?
            .get(id)
            .cloned()
            .ok_or_else(|| "会话已结束".into())
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.clamp(1, 500),
        cols: cols.clamp(2, 1000),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn ssh_command(server: &ServerConfig) -> Result<CommandBuilder, String> {
    if server.host.is_empty()
        || server.host.len() > 253
        || !server.host.starts_with(|c: char| c.is_ascii_alphanumeric())
        || !server
            .host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".:%_-".contains(c))
    {
        return Err("主机地址格式无效".into());
    }
    if server.username.is_empty()
        || server.username.len() > 128
        || server.username.starts_with('-')
        || !server
            .username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
    {
        return Err("SSH 用户名格式无效".into());
    }
    if server.port == 0 {
        return Err("端口必须在 1–65535 之间".into());
    }
    // Pass arguments directly to OpenSSH, never through a command shell.
    let mut command = CommandBuilder::new("ssh");
    command.args([
        "-tt",
        "-o",
        "StrictHostKeyChecking=ask",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
    ]);
    command.args(["-p", &server.port.to_string(), "-l", &server.username]);
    match server.auth.as_str() {
        "agent" => {}
        "password" => command.args([
            "-o",
            "PubkeyAuthentication=no",
            "-o",
            "PreferredAuthentications=keyboard-interactive,password",
        ]),
        "key" => {
            if server.private_key.trim().is_empty()
                || !std::path::Path::new(&server.private_key).is_file()
            {
                return Err("私钥文件不存在，请检查完整路径".into());
            }
            command.args(["-o", "IdentitiesOnly=yes", "-i", &server.private_key]);
        }
        _ => return Err("不支持的认证方式".into()),
    }
    command.arg(&server.host);
    command.env("TERM", "xterm-256color");
    Ok(command)
}

#[tauri::command]
pub async fn ssh_connect(
    id: String,
    server: ServerConfig,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    state: State<'_, Sessions>,
) -> Result<(), String> {
    let sessions = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let command = ssh_command(&server)?;
        let mut all = sessions.0.lock().map_err(|_| "会话锁不可用")?;
        if id.is_empty() || id.len() > 100 || all.contains_key(&id) {
            return Err("会话标识无效或已存在".into());
        }
        let pair = native_pty_system()
            .openpty(size(cols, rows))
            .map_err(|e| format!("无法创建终端：{e}"))?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("无法启动系统 OpenSSH，请确认 ssh 已安装：{e}"))?;
        drop(pair.slave);
        let killer = child.clone_killer();
        all.insert(
            id.clone(),
            Arc::new(Session {
                master: Mutex::new(pair.master),
                writer: Mutex::new(writer),
                killer: Mutex::new(killer),
            }),
        );
        drop(all);
        let mut reader_killer = child.clone_killer();
        let output_channel = on_event.clone();
        let reader_thread = std::thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            let mut channel_open = true;
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        if channel_open
                            && output_channel
                                .send(TerminalEvent::Output(buffer[..count].to_vec()))
                                .is_err()
                        {
                            channel_open = false;
                            let _ = reader_killer.kill();
                            // Keep draining until the waiter closes ConPTY.
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => break,
                }
            }
            let _ = reader_killer.kill();
        });
        std::thread::spawn(move || {
            let status = child
                .wait()
                .map(|status| status.to_string())
                .unwrap_or_else(|e| e.to_string());
            // On Windows, ConPTY keeps its output pipe open after child exit.
            // Close the master from this thread while the reader drains it.
            let session = sessions.0.lock().ok().and_then(|mut all| all.remove(&id));
            drop(session);
            let _ = reader_thread.join();
            let _ = on_event.send(TerminalEvent::Exit(status));
        });
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ssh_write(id: String, data: String, state: State<'_, Sessions>) -> Result<(), String> {
    let sessions = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = sessions.get(&id)?;
        let mut writer = session.writer.lock().map_err(|_| "终端输入锁不可用")?;
        writer
            .write_all(data.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ssh_resize(
    id: String,
    cols: u16,
    rows: u16,
    state: State<'_, Sessions>,
) -> Result<(), String> {
    let session = state.get(&id)?;
    let master = session.master.lock().map_err(|_| "终端尺寸锁不可用")?;
    master.resize(size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ssh_disconnect(id: String, state: State<'_, Sessions>) -> Result<(), String> {
    let session = state.0.lock().map_err(|_| "会话锁不可用")?.remove(&id);
    if let Some(session) = session {
        session.stop();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server() -> ServerConfig {
        ServerConfig {
            host: "127.0.0.1".into(),
            port: 22,
            username: "root".into(),
            auth: "agent".into(),
            private_key: String::new(),
        }
    }
    #[test]
    fn rejects_argument_injection() {
        for host in [
            "-oProxyCommand=calc",
            "host;calc",
            "host name",
            "user@host",
            "",
        ] {
            let mut config = server();
            config.host = host.into();
            assert!(ssh_command(&config).is_err());
        }
        let mut config = server();
        config.username = "-oProxyCommand=calc".into();
        assert!(ssh_command(&config).is_err());
    }
    #[test]
    fn accepts_ipv6_and_password_auth() {
        let mut config = server();
        config.host = "2001:db8::1".into();
        config.auth = "password".into();
        assert!(ssh_command(&config).is_ok());
    }
    #[test]
    fn validates_port_auth_and_key_file() {
        let mut config = server();
        config.port = 0;
        assert!(ssh_command(&config).is_err());
        config.port = 22;
        config.auth = "unsupported".into();
        assert!(ssh_command(&config).is_err());
        config.auth = "key".into();
        assert!(ssh_command(&config).is_err());
    }

    // Exercises the same native PTY transport as SSH without a remote account.
    #[test]
    #[cfg(windows)]
    fn native_terminal_cursor_handshake_and_resize() {
        let pair = native_pty_system().openpty(size(80, 24)).unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        let mut command = CommandBuilder::new("cmd.exe");
        command.args(["/D", "/Q", "/C", "echo FA_SSH_PTY_OK"]);
        let mut child = pair.slave.spawn_command(command).unwrap();
        let mut killer = child.clone_killer();
        drop(pair.slave);
        let (sender, receiver) = std::sync::mpsc::channel();
        let (cursor_sender, cursor_receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut output = Vec::new();
            let mut buffer = [0u8; 4096];
            let mut cursor_requested = false;
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        output.extend_from_slice(&buffer[..count]);
                        if !cursor_requested && output.windows(4).any(|part| part == b"\x1b[6n") {
                            cursor_requested = true;
                            let _ = cursor_sender.send(());
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = sender.send(output);
        });
        pair.master.resize(size(100, 30)).unwrap();
        // xterm.js supplies this cursor response in the application.
        cursor_receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("missing ConPTY cursor query");
        writer.write_all(b"\x1b[1;1R").unwrap();
        writer.flush().unwrap();
        let (exit_sender, exit_receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = exit_sender.send(child.wait());
        });
        let exit = exit_receiver.recv_timeout(std::time::Duration::from_secs(10));
        if exit.is_err() {
            let _ = killer.kill();
        }
        assert!(exit.expect("child did not exit").unwrap().success());
        drop(writer);
        drop(pair.master);
        let received = receiver.recv_timeout(std::time::Duration::from_secs(10));
        if received.is_err() {
            let _ = killer.kill();
        }
        let output = received.expect("native PTY timed out");
        assert!(String::from_utf8_lossy(&output).contains("FA_SSH_PTY_OK"));
    }
}
