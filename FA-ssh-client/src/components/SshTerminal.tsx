import { useEffect, useRef } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { Session, SessionStatus } from "../types";
import "@xterm/xterm/css/xterm.css";
import { fonts, themes, useSettings } from "../settings";
type TerminalEvent =
  | { event: "output"; data: number[] }
  | { event: "exit"; data: string };
export default function SshTerminal({
  session,
  active,
  onStatus,
}: {
  session: Session;
  active: boolean;
  onStatus: (id: string, status: SessionStatus) => void;
}) {
  const { settings, currentTheme } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const terminalRef = useRef<Terminal | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => {});
  const resizeRef = useRef<() => void>(() => {});
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  useEffect(() => {
    if (!container.current) return;
    const connectionId = crypto.randomUUID();
    let disposed = false;
    let ready = false;
    let exited = false;
    let inputQueue = Promise.resolve();
    const pendingInput: string[] = [];
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: settingsRef.current.terminalFontSize,
      fontFamily: fonts[settingsRef.current.terminalFont],
      lineHeight: 1.3,
      scrollback: 5000,
      theme: {
        background: "#1f1f1f",
        foreground: "#cccccc",
        cursor: "#dddddd",
        selectionBackground: "#264f78",
        blue: "#569cd6",
        green: "#6a9955",
      },
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    const fitTerminal = () => {
      if (
        disposed ||
        !container.current?.clientWidth ||
        !container.current.clientHeight
      )
        return;
      fit.fit();
      if (ready && !exited)
        void invoke("ssh_resize", {
          id: connectionId,
          cols: terminal.cols,
          rows: terminal.rows,
        }).catch(() => {});
    };
    fitRef.current = () => {
      fitTerminal();
      terminal.focus();
    };
    resizeRef.current = fitTerminal;
    fitTerminal();
    const observer = new ResizeObserver(fitTerminal);
    observer.observe(container.current);
    const onMessage = (message: TerminalEvent) => {
      if (disposed) return;
      if (message.event === "output")
        terminal.write(new Uint8Array(message.data));
      else {
        exited = true;
        ready = false;
        terminal.writeln(`\r\n\x1b[90m[会话结束：${message.data}]\x1b[0m`);
        statusRef.current(session.id, "closed");
      }
    };
    terminal.writeln(
      `\x1b[90m正在启动 SSH：${session.server.username}@${session.server.host}:${session.server.port}\r\n请在终端中完成主机指纹确认与认证。\x1b[0m\r\n`,
    );
    const writeInput = (data: string) => {
      if (disposed || exited) return;
      if (!ready) {
        pendingInput.push(data);
        return;
      }
      inputQueue = inputQueue
        .then(() => {
          if (!disposed && !exited)
            return invoke<void>("ssh_write", { id: connectionId, data });
        })
        .catch((error) => {
          if (!disposed) terminal.writeln(`\r\n输入失败：${String(error)}`);
        });
    };
    const input = terminal.onData(writeInput);
    // StrictMode cleans up its probe mount before this microtask runs.
    void Promise.resolve()
      .then(() => {
        if (disposed) return;
        const channel = new Channel<TerminalEvent>(onMessage);
        return invoke("ssh_connect", {
          id: connectionId,
          server: session.server,
          cols: terminal.cols,
          rows: terminal.rows,
          onEvent: channel,
        });
      })
      .then(() => {
        if (disposed) {
          void invoke("ssh_disconnect", { id: connectionId }).catch(() => {});
          return;
        }
        if (!exited) {
          ready = true;
          pendingInput.splice(0).forEach(writeInput);
          statusRef.current(session.id, "running");
          fitTerminal();
          terminal.focus();
        }
      })
      .catch((error) => {
        if (!disposed) {
          terminal.writeln(`\r\n\x1b[31m启动失败：${String(error)}\x1b[0m`);
          statusRef.current(session.id, "error");
        }
      });
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      terminal.dispose();
      terminalRef.current = null;
      void invoke("ssh_disconnect", { id: connectionId }).catch(() => {});
    };
  }, [session.id, session.server]);
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const palette = themes[currentTheme];
    terminal.options.fontFamily = fonts[settings.terminalFont];
    terminal.options.fontSize = settings.terminalFontSize;
    terminal.options.theme = {
      background: palette.surface,
      foreground: palette.text,
      cursor: palette.strong,
      selectionBackground: palette.selection,
      blue: palette.icon,
      green: palette.scheme === "light" ? "#287553" : "#73c991",
    };
    const frame = requestAnimationFrame(() => resizeRef.current());
    return () => cancelAnimationFrame(frame);
  }, [currentTheme, settings.terminalFont, settings.terminalFontSize]);
  useEffect(() => {
    if (active) requestAnimationFrame(() => fitRef.current());
  }, [active]);
  return (
    <div
      className="terminal-container"
      ref={container}
      aria-label={`${session.server.name} SSH 终端`}
    />
  );
}
