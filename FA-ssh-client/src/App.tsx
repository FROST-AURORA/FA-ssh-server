import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  FolderOpen,
  LayoutPanelLeft,
  MessageSquare,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Settings2,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Terminal,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { ChatPanel } from "./components/ChatPanel";
import SshTerminal from "./components/SshTerminal";
import type { TerminalSession } from "./api/terminalSession";
import { ServerDialog } from "./components/ServerDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { useSettings } from "./settings";
import { type Server, type Session, type SessionStatus } from "./types";
import { useSshConnections } from "./hooks/useSshConnections";
import { errorMessage } from "./api/ssh";
import "./App.css";

const statusNames: Record<SessionStatus, string> = {
  starting: "连接中",
  running: "已连接",
  closed: "未连接",
  error: "连接失败",
};

function SshWorkspace() {
  const { t, settings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const connections = useSshConnections(settings.serverUrl);
  const { servers, loading, loadError } = connections;
  const [terminalBusy, setTerminalBusy] = useState<Record<string, string>>({});
  const busy = { ...connections.busy, ...terminalBusy };
  const terminalLocks = useRef(new Set<string>());
  const controllers = useRef(new Map<string, TerminalSession>());
  const mounted = useRef(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [editor, setEditor] = useState<Server | null | undefined>(undefined);
  const [sessions, setSessions] = useState<(Session & { generation: string })[]>([]);
  const registerController = useCallback((id: string, controller: TerminalSession | null) => {
    if (controller) controllers.current.set(id, controller);
    else controllers.current.delete(id);
  }, []);
  const onTerminalStatus = useCallback((id: string, status: SessionStatus) => {
    setSessions((all) => all.map((session) => session.id === id ? { ...session, status } : session));
  }, []);
  const [activeId, setActiveId] = useState("");
  const [notice, setNotice] = useState("");
  const [leftVisible, setLeftVisible] = useState(true);
  const [rightVisible, setRightVisible] = useState(true);
  const [mobilePanel, setMobilePanel] = useState("terminal");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Server | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const deleteRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeSession = sessions.find((s) => s.id === activeId);
  const storageError = useCallback(
    () => setNotice("本地存储不可用或已满，本次修改仅保留在当前窗口。"),
    [],
  );
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!servers.some((s) => s.id === selected)) setSelected(servers[0]?.id ?? "");
  }, [servers, selected]);
  useEffect(() => {
    if (activeId && !sessions.some((session) => session.id === activeId)) {
      setActiveId(sessions[0]?.id ?? "");
    }
  }, [sessions, activeId]);
  useEffect(() => {
    if (deleting) deleteRef.current?.showModal();
  }, [deleting]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || document.querySelector("dialog[open]"))
        return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLeftVisible(true);
        setMobilePanel("servers");
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setEditor(null);
      }
      if (e.key === "`") {
        e.preventDefault();
        setMobilePanel("terminal");
        requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".session-view.active .xterm-helper-textarea")?.focus());
      }
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function withTerminalLock<T>(id: string, label: string, action: () => Promise<T>) {
    if (terminalLocks.current.has(id)) throw new Error("该连接正在操作中，请稍候。");
    terminalLocks.current.add(id);
    setTerminalBusy((all) => ({ ...all, [id]: label }));
    try { return await action(); }
    finally {
      terminalLocks.current.delete(id);
      if (mounted.current) setTerminalBusy((all) => {
        const next = { ...all };
        delete next[id];
        return next;
      });
    }
  }
  async function closeTerminal(id: string) {
    try {
      await controllers.current.get(id)?.close();
      if (mounted.current) onTerminalStatus(id, "closed");
    } catch (error) {
      if (mounted.current) onTerminalStatus(id, "error");
      throw error;
    }
  }
  async function acquireAgentTerminal(id: string, abort: () => void) {
    const controller = controllers.current.get(id);
    if (!controller || terminalLocks.current.has(id) || connections.busy[id]) {
      throw new Error("SSH 终端尚未就绪，请稍后重试。");
    }
    terminalLocks.current.add(id);
    setTerminalBusy((all) => ({ ...all, [id]: "AI 处理中" }));
    const release = () => {
      controller.endAgentRun();
      terminalLocks.current.delete(id);
      if (mounted.current) setTerminalBusy((all) => {
        const next = { ...all };
        delete next[id];
        return next;
      });
    };
    try {
      return { terminalSessionId: await controller.beginAgentRun(abort), release };
    } catch (error) {
      release();
      throw error;
    }
  }
  async function connect(server: Server) {
    if (busy[server.id]) return;
    setMobilePanel("terminal");
    const existing = sessions.find((session) => session.id === server.id);
    if (existing?.status === "running" || existing?.status === "starting") {
      setActiveId(server.id);
      return;
    }
    try {
      await withTerminalLock(server.id, "连接中", async () => {
        await closeTerminal(server.id);
        if (server.status !== 1 || existing) await connections.connect(server.id);
        if (!mounted.current) return;
        setSessions((all) => [...all.filter((session) => session.id !== server.id), {
          id: server.id, server, status: "starting", generation: crypto.randomUUID(),
        }]);
        setActiveId(server.id);
      });
    } catch (error) { setNotice(errorMessage(error)); }
  }
  async function disconnect(id: string, close = false) {
    try {
      await withTerminalLock(id, "断开中", async () => {
        await closeTerminal(id);
        await connections.disconnect(id);
        if (close) {
          setSessions((all) => all.filter((s) => s.id !== id));
          setActiveId((current) => current === id ? sessions.find((s) => s.id !== id)?.id ?? "" : current);
        }
      });
      setNotice("已断开连接");
    } catch (error) { setNotice(errorMessage(error)); }
  }
  async function edit(server: Server) {
    try { setEditor(await connections.get(server.id)); }
    catch (error) { setNotice(errorMessage(error)); }
  }
  async function deleteConnection() {
    if (!deleting) return;
    setDeleteError("");
    try {
      await withTerminalLock(deleting.id, "删除中", async () => {
        await closeTerminal(deleting.id);
        await connections.remove(deleting.id);
        setSessions((all) => all.filter((session) => session.id !== deleting.id));
        setActiveId((current) => current === deleting.id ? "" : current);
      });
      setDeleting(null);
      setNotice("连接已删除");
    } catch (error) { setDeleteError(errorMessage(error)); }
  }
  const filtered = servers.filter((s) =>
    `${s.name} ${s.host} ${s.username} ${s.group}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const groups = [...new Set(filtered.map((s) => s.group))];
  return (
    <main
      className={`workbench ${leftVisible ? "" : "hide-left"} ${rightVisible ? "" : "hide-right"} mobile-${mobilePanel}`}
    >
      <header className="titlebar">
        <div className="brand">
          <SquareTerminal size={21} />
          <span>FA SSH</span>
          <span className="brand-divider" />
          <span className="workspace-name">{t("远程工作台")}</span>
        </div>
        <button
          className="command-search"
          onClick={() => {
            setLeftVisible(true);
            setMobilePanel("servers");
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <Search size={14} />
          <span>{t("搜索服务器")}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="layout-actions">
          <button
            className="icon-button"
            aria-label={t("切换连接面板")}
            title={t("切换连接面板")}
            aria-pressed={leftVisible}
            onClick={() => setLeftVisible(!leftVisible)}
          >
            <PanelLeftClose size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("切换 AI 面板")}
            title={t("切换 AI 面板")}
            aria-pressed={rightVisible}
            onClick={() => setRightVisible(!rightVisible)}
          >
            <PanelRightClose size={17} />
          </button>
        </div>
      </header>
      <nav className="activity-bar" aria-label={t("工作台导航")}>
        <button
          className={`activity-button ${mobilePanel === "servers" ? "active" : ""}`}
          aria-label={t("SSH 连接管理")}
          title={t("SSH 连接管理")}
          onClick={() => {
            setLeftVisible(true);
            setMobilePanel("servers");
          }}
        >
          <ServerIcon size={23} />
        </button>
        <button
          className={`activity-button ${mobilePanel === "terminal" ? "active" : ""}`}
          aria-label={t("终端工作区")}
          title={t("终端工作区")}
          onClick={() => setMobilePanel("terminal")}
        >
          <SquareTerminal size={25} />
        </button>
        <button
          className={`activity-button ${mobilePanel === "chat" ? "active" : ""}`}
          aria-label={t("AI 对话面板")}
          title={t("AI 对话")}
          onClick={() => {
            setRightVisible(true);
            setMobilePanel("chat");
          }}
        >
          <MessageSquare size={23} />
        </button>
        <div className="activity-spacer" />
        <button
          className="activity-button"
          aria-label={t("使用帮助")}
          title={t("使用帮助")}
          onClick={() =>
            setNotice(
              "添加连接后，双击服务器或点击连接打开远程终端。在 AI 区域选择智能体并输入任务，命令和结果会显示在绑定的终端，AI 回复显示在对话栏。Ctrl+K 搜索，Ctrl+N 新建连接。",
            )
          }
        >
          <CircleHelp size={22} />
        </button>
        <button
          className="activity-button settings-activity"
          aria-label={t("设置")}
          title={`${t("设置")} (Ctrl+,)`}
          aria-haspopup="dialog"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={23} />
        </button>
      </nav>
      <aside className="server-panel" aria-label={t("SSH 连接管理面板")}>
        <header className="panel-heading">
          <span>{t("SSH 连接")}</span>
          <button className="icon-button" title={t("刷新连接列表")} aria-label={t("刷新连接列表")}
            disabled={loading || Object.keys(busy).length > 0} onClick={() => void connections.refresh()}>
            <RefreshCw size={15} />
          </button>
          <button
            className="icon-button"
            title={t("添加服务器")}
            aria-label={t("添加服务器")}
            onClick={() => setEditor(null)}
          >
            <Plus size={18} />
          </button>
        </header>
        <div className="server-search">
          <Search size={14} />
          <input
            ref={searchRef}
            aria-label={t("搜索服务器")}
            placeholder={t("搜索服务器…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="icon-button"
              aria-label={t("清除搜索")}
              onClick={() => setSearch("")}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="server-list">
          {loadError && <div className="connection-error" role="alert">
            <p>{loadError}</p><p>{t("列表状态可能已过期")}</p>
            <button className="text-button" disabled={loading} onClick={() => void connections.refresh()}>{t("重试")}</button>
          </div>}
          {loading && !servers.length && <p className="loading" role="status">{t("正在加载连接…")}</p>}
          {groups.map((group) => (
            <section key={group}>
              <button
                className="group-heading"
                aria-expanded={!collapsed.includes(group)}
                onClick={() =>
                  setCollapsed((all) =>
                    all.includes(group)
                      ? all.filter((g) => g !== group)
                      : [...all, group],
                  )
                }
              >
                {collapsed.includes(group) ? (
                  <ChevronRight size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
                <span>{t(group)}</span>
                <span className="count">
                  {filtered.filter((s) => s.group === group).length}
                </span>
              </button>
              {!collapsed.includes(group) &&
                filtered
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <div
                      key={s.id}
                      className={`server-row ${selected === s.id ? "selected" : ""}`}
                    >
                      <button
                        className="server-select"
                        aria-label={`${t("选择")} ${s.name}`}
                        aria-pressed={selected === s.id}
                        onClick={() => setSelected(s.id)}
                        onDoubleClick={() => connect(s)}
                      >
                        <span className="server-icon">
                          <SquareTerminal size={23} />
                          <span
                            className={`server-state ${s.status === 1 ? "running" : s.status === 3 ? "error" : ""}`}
                          />
                        </span>
                        <span className="server-details">
                          <span className="server-name">
                            {s.name}
                            <small>{t(busy[s.id] || statusNames[s.status === 1 ? "running" : s.status === 2 ? "starting" : s.status === 3 ? "error" : "closed"])}</small>
                          </span>
                          <span className="server-address">
                            {s.username}@{s.host}:{s.port}
                          </span>
                        </span>
                      </button>
                      <div className="server-row-actions">
                        <button
                          className="icon-button"
                          aria-label={`${t("编辑")} ${s.name}`}
                          title={t("编辑连接")}
                          disabled={!!busy[s.id]}
                          onClick={() => void edit(s)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="icon-button danger-hover"
                          aria-label={`${t("删除")} ${s.name}`}
                          title={t("删除连接")}
                          disabled={!!busy[s.id]}
                          onClick={() => { setDeleteError(""); setDeleting(s); }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {selected === s.id && (
                        <button
                          className="connect-button"
                          disabled={!!busy[s.id] || s.status === 2}
                          onClick={() => s.status === 1 ? void disconnect(s.id) : void connect(s)}
                        >
                          <Unplug size={12} />
                          {t(busy[s.id] || (s.status === 1 ? "断开连接" : "连接"))}
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  ))}
            </section>
          ))}
          {!filtered.length && !loading && !loadError && (
            <div className="list-empty">
              <FolderOpen size={28} />
              <p>{search ? t("未找到匹配的服务器") : t("还没有服务器")}</p>
              <button
                className="text-button"
                onClick={() => (search ? setSearch("") : setEditor(null))}
              >
                {search ? t("清除搜索") : t("添加第一台服务器")}
              </button>
            </div>
          )}
        </div>
        <div className="sidebar-footer">
          <span>
            {servers.length} {t("台服务器 · 保存在服务端")}
          </span>
          <button className="primary" onClick={() => setEditor(null)}>
            <Plus size={16} />
            {t("新建连接")}
          </button>
        </div>
      </aside>
      <section className="terminal-panel" aria-label={t("终端工作区面板")}>
        <div className="tabs" role="tablist" aria-label={t("终端会话")}>
          <button
            role="tab"
            aria-selected={!activeId}
            className={`tab ${!activeId ? "active" : ""}`}
            onClick={() => setActiveId("")}
          >
            <LayoutPanelLeft size={14} />
            {t("欢迎")}
          </button>
          {sessions.map((s) => (
            <div
              className={`session-tab ${activeId === s.id ? "active" : ""}`}
              key={s.id}
            >
              <button
                className="tab"
                role="tab"
                aria-selected={activeId === s.id}
                onClick={() => setActiveId(s.id)}
              >
                <Terminal size={14} />
                {s.server.name}
              </button>
              <button
                className="icon-button"
                aria-label={`${t("关闭")} ${s.server.name} ${t("终端")}`}
                disabled={!!busy[s.id]}
                onClick={() => void disconnect(s.id, true)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            className="icon-button new-tab"
            title={t("新建连接")}
            aria-label={t("新建终端连接")}
            onClick={() => setEditor(null)}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="terminal-toolbar">
          <span>
            <Terminal size={13} />
            {t("终端")}
            {activeSession && (
              <span className="terminal-host">
                / {activeSession.server.username}@{activeSession.server.host}
              </span>
            )}
          </span>
          <div>
            {activeSession ? (
              <>
                <span className={`session-status ${activeSession.status}`}>
                  {t(statusNames[activeSession.status])}
                </span>
                {(activeSession.status === "closed" || activeSession.status === "error") && (
                  <button className="text-button" disabled={!!busy[activeId]} onClick={() => void connect(servers.find((s) => s.id === activeId) ?? activeSession.server)}>
                    {t("重新连接")}
                  </button>
                )}
                <button
                  className="icon-button"
                  title={t("结束并关闭会话")}
                  aria-label={t("结束并关闭会话")}
                  disabled={!!busy[activeId]}
                  onClick={() => void disconnect(activeId, true)}
                >
                  <Unplug size={15} />
                </button>
              </>
            ) : (
              <span className="terminal-label">{t("SSH 工作区")}</span>
            )}
          </div>
        </div>
        {!activeId && (
          <div className="welcome">
            <div className="welcome-content">
              <SquareTerminal
                className="welcome-icon"
                strokeWidth={1}
                size={94}
              />
              <h1>{t("连接你的下一台服务器")}</h1>
              <p>{t("从左侧选择服务器，建立 SSH 连接")}</p>
              <button className="primary" onClick={() => setEditor(null)}>
                <Plus size={16} />
                {t("新建连接")}
              </button>
              <div className="shortcuts">
                <div>
                  <span>{t("搜索服务器")}</span>
                  <span>
                    <kbd>Ctrl</kbd>
                    <kbd>K</kbd>
                  </span>
                </div>
                <div>
                  <span>{t("新建连接")}</span>
                  <span>
                    <kbd>Ctrl</kbd>
                    <kbd>N</kbd>
                  </span>
                </div>
                <div>
                  <span>{t("聚焦终端")}</span>
                  <span>
                    <kbd>Ctrl</kbd>
                    <kbd>`</kbd>
                  </span>
                </div>
              </div>
            </div>
            <div className="welcome-footer">
              <ShieldCheck size={13} />
              {t("服务端 SSH 连接管理")}
              <span>·</span>
              {t("你的工作区，你的掌控")}
            </div>
          </div>
        )}
        {sessions.map((session) => (
          <div
            key={session.generation}
            className={`session-view ${activeId === session.id ? "active" : ""}`}
          >
            <SshTerminal session={session} active={activeId === session.id} agentRunning={terminalBusy[session.id] === "AI 处理中"}
              onStatus={onTerminalStatus} onController={registerController} />
          </div>
        ))}
      </section>
      <ChatPanel onStorageError={storageError} acquireTerminal={acquireAgentTerminal}
        target={activeSession?.status === "running" && !busy[activeSession.id]
          ? { id: activeSession.id, name: `${activeSession.server.name} (${activeSession.server.username}@${activeSession.server.host})` }
          : null} />
      <footer className="statusbar">
        <span className="remote-indicator">
          <Command size={13} />
        </span>
        <span>
          <Unplug size={12} />
          {sessions.filter((s) => s.status === "running").length
            ? `${sessions.filter((s) => s.status === "running").length} ${t("个会话运行中")}`
            : t("无活动会话")}
        </span>
        <span className="status-environment">
          {isTauri() ? t("桌面环境") : t("浏览器预览")}
        </span>
        <div className="status-spacer" />
        <span>UTF-8</span>
        <span>LF</span>
        <span className="status-ai">
          <Settings2 size={12} />
          {t("服务端智能体")}
        </span>
      </footer>
      {notice && (
        <div className="notice" role="alert">
          <CircleHelp size={18} />
          <p>{t(notice)}</p>
          <button
            className="icon-button"
            aria-label={t("关闭提示")}
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
      )}
      {editor !== undefined && (
        <ServerDialog
          server={editor}
          onClose={() => setEditor(undefined)}
          onSave={async (input) => {
            const server = await withTerminalLock(input.id || "new", "保存中", async () => {
              if (input.id) await closeTerminal(input.id);
              return connections.save(input);
            });
            setSelected(server.id);
            setEditor(undefined);
            setSearch("");
            setCollapsed((all) => all.filter((g) => g !== server.group));
            setNotice("连接已保存");
          }}
        />
      )}
      {deleting && (
        <dialog
          ref={deleteRef}
          className="dialog delete-dialog"
          aria-labelledby="delete-title"
          onCancel={(e) => { if (busy[deleting.id]) e.preventDefault(); else setDeleting(null); }}
        >
          <h2 id="delete-title">
            {t("删除连接")} “{deleting.name}”?
          </h2>
          <p>{t("将先断开 SSH 会话，再删除服务端保存的连接配置。")}</p>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
          <div className="dialog-actions">
            <button className="secondary" disabled={!!busy[deleting.id]} onClick={() => setDeleting(null)}>
              {t("取消")}
            </button>
            <button
              className="danger"
              disabled={!!busy[deleting.id]}
              onClick={() => void deleteConnection()}
            >
              {t(busy[deleting.id] || "删除连接")}
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}
export default function App() {
  const { settings } = useSettings();
  // A different service has a different set of connection IDs and live sessions.
  return <SshWorkspace key={settings.serverUrl} />;
}
