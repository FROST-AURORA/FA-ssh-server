import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { TerminalSession } from "../api/terminalSession";
import { errorMessage } from "../api/ssh";
import type { Session, SessionStatus } from "../types";
import "@xterm/xterm/css/xterm.css";
import { fonts, themes, useSettings } from "../settings";

export default function SshTerminal({ session, active, agentRunning, onStatus, onController }: {
  session: Session;
  active: boolean;
  agentRunning: boolean;
  onStatus: (id: string, status: SessionStatus) => void;
  onController: (id: string, controller: TerminalSession | null) => void;
}) {
  const { settings, currentTheme, t } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const terminalRef = useRef<Terminal | null>(null);
  const controllerRef = useRef<TerminalSession | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => {});
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const activeRef = useRef(active);
  activeRef.current = active;
  const [command, setCommand] = useState("");
  const [executing, setExecuting] = useState(false);
  const [commandError, setCommandError] = useState("");
  const { id } = session;
  const connectionId = session.server.id;
  const serverUrl = settings.serverUrl;

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: settingsRef.current.terminalFontSize,
      fontFamily: fonts[settingsRef.current.terminalFont],
      lineHeight: 1.3,
      scrollback: 5000,
      disableStdin: true,
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    const controller = new TerminalSession(serverUrl,
      (output) => { if (!disposed) terminal.write(output); },
      (status) => {
        if (disposed) return;
        terminal.options.disableStdin = status !== "running";
        statusRef.current(id, status);
        if (status === "running" && activeRef.current && !document.querySelector("dialog[open]")) terminal.focus();
      });
    controllerRef.current = controller;
    onController(id, controller);
    const fitTerminal = () => {
      if (disposed || !container.current?.clientWidth || !container.current.clientHeight) return;
      fit.fit();
      controller.resize(terminal.cols, terminal.rows);
    };
    fitRef.current = fitTerminal;
    fitTerminal();
    const observer = new ResizeObserver(fitTerminal);
    observer.observe(container.current);
    const input = terminal.onData((data) => controller.write(data));
    terminal.writeln("\x1b[90m正在打开远程终端…\x1b[0m");
    void controller.open(connectionId, terminal.cols, terminal.rows);
    const closeOnExit = () => { void controller.close().catch(() => {}); };
    window.addEventListener("pagehide", closeOnExit);
    return () => {
      disposed = true;
      window.removeEventListener("pagehide", closeOnExit);
      observer.disconnect();
      input.dispose();
      terminal.dispose();
      terminalRef.current = null;
      controllerRef.current = null;
      onController(id, null);
      // Explicit UI closes await this call and display failures; unmount is best effort.
      closeOnExit();
    };
  }, [id, connectionId, serverUrl, onController]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const palette = themes[currentTheme];
    terminal.options.fontFamily = fonts[settings.terminalFont];
    terminal.options.fontSize = settings.terminalFontSize;
    terminal.options.theme = {
      background: palette.surface, foreground: palette.text,
      cursor: palette.strong, selectionBackground: palette.selection,
      blue: palette.icon, green: palette.scheme === "light" ? "#287553" : "#73c991",
    };
    const frame = requestAnimationFrame(() => fitRef.current());
    return () => cancelAnimationFrame(frame);
  }, [currentTheme, settings.terminalFont, settings.terminalFontSize]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.disableStdin = executing || agentRunning || session.status !== "running";
  }, [executing, agentRunning, session.status]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      fitRef.current();
      if (!document.querySelector("dialog[open]")) terminalRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className="terminal-workspace">
      <div className="terminal-container" ref={container} aria-label={`${session.server.name} SSH 终端`} />
      {agentRunning && <div className="message-progress" role="status">{t("AI 正在使用此终端，命令与结果会实时显示。")}</div>}
      {commandError && <p className="form-error" role="alert">{commandError}</p>}
      <form className="terminal-command" onSubmit={async (event) => {
        event.preventDefault();
        const controller = controllerRef.current;
        if (!controller || !command.trim() || executing || agentRunning || session.status !== "running") return;
        setExecuting(true);
        setCommandError("");
        try {
          await controller.exec(command);
          if (controllerRef.current === controller) setCommand("");
        } catch (error) {
          if (controllerRef.current === controller) setCommandError(errorMessage(error));
        } finally {
          if (controllerRef.current === controller) setExecuting(false);
        }
      }}>
        <input aria-label={t("执行单条命令")} placeholder={t("输入命令，Enter 执行")}
          value={command} onChange={(event) => setCommand(event.target.value)}
          disabled={executing || agentRunning || session.status !== "running"} autoComplete="off" spellCheck={false} />
        <button className="secondary" type="submit" disabled={executing || agentRunning || session.status !== "running" || !command.trim()}>
          {t(executing ? "执行中…" : "执行命令")}
        </button>
      </form>
    </div>
  );
}
