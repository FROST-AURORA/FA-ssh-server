import {
  lazy,
  Suspense,
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
import { ServerDialog } from "./components/ServerDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { useSettings } from "./settings";
import {
  exampleServers,
  isServer,
  readStored,
  type Server,
  type Session,
  type SessionStatus,
} from "./types";
import "./App.css";

const SshTerminal = lazy(() => import("./components/SshTerminal"));
const statusNames: Record<SessionStatus, string> = {
  starting: "启动中",
  running: "会话运行中",
  closed: "已结束",
  error: "启动失败",
};

function App() {
  const { t } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [servers, setServers] = useState(() =>
    readStored("fa-ssh.servers.v1", isServer, exampleServers),
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(servers[0]?.id ?? "");
  const [editor, setEditor] = useState<Server | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState("");
  const [notice, setNotice] = useState("");
  const [leftVisible, setLeftVisible] = useState(true);
  const [rightVisible, setRightVisible] = useState(true);
  const [mobilePanel, setMobilePanel] = useState("terminal");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Server | null>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeSession = sessions.find((s) => s.id === activeId);
  const storageError = useCallback(
    () => setNotice("本地存储不可用或已满，本次修改仅保留在当前窗口。"),
    [],
  );
  useEffect(() => {
    try {
      localStorage.setItem("fa-ssh.servers.v1", JSON.stringify(servers));
    } catch {
      storageError();
    }
  }, [servers, storageError]);
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
        document
          .querySelector<HTMLTextAreaElement>(
            ".session-view.active .xterm-helper-textarea",
          )
          ?.focus();
      }
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const updateStatus = useCallback(
    (id: string, status: SessionStatus) =>
      setSessions((all) =>
        all.map((s) => (s.id === id ? { ...s, status } : s)),
      ),
    [],
  );
  function connect(server: Server) {
    if (server.example) {
      setNotice("这是示例配置。请先编辑为你的真实服务器地址，再连接。");
      setEditor(server);
      return;
    }
    if (!isTauri()) {
      setNotice(
        "SSH 终端需要桌面环境。请运行 .\\npm22.cmd run tauri dev 后连接；浏览器中可管理配置和使用本地助手。",
      );
      return;
    }
    const running = sessions.find(
      (s) =>
        s.server.id === server.id && ["starting", "running"].includes(s.status),
    );
    if (running) setActiveId(running.id);
    else {
      const session: Session = {
        id: crypto.randomUUID(),
        server: { ...server },
        status: "starting",
      };
      setSessions((all) => [...all, session]);
      setActiveId(session.id);
    }
    setMobilePanel("terminal");
  }
  function closeSession(id: string) {
    setSessions((all) => all.filter((s) => s.id !== id));
    if (id === activeId)
      setActiveId(sessions.find((s) => s.id !== id)?.id ?? "");
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
              "添加连接后，双击服务器或点击连接按钮打开终端。认证由系统 OpenSSH 处理。Ctrl+K 搜索，Ctrl+N 新建连接。AI 区域当前为本地规则助手。配置与对话保存在当前设备。",
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
                            className={`server-state ${sessions.some((t) => t.server.id === s.id && t.status === "running") ? "running" : ""}`}
                          />
                        </span>
                        <span className="server-details">
                          <span className="server-name">
                            {s.name}
                            {s.example && <small>{t("示例")}</small>}
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
                          onClick={() => setEditor(s)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="icon-button danger-hover"
                          aria-label={`${t("删除")} ${s.name}`}
                          title={t("删除连接")}
                          onClick={() => setDeleting(s)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {selected === s.id && (
                        <button
                          className="connect-button"
                          onClick={() => connect(s)}
                        >
                          <Unplug size={12} />
                          {t("连接")}
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  ))}
            </section>
          ))}
          {!filtered.length && (
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
            {servers.length} {t("台服务器 · 保存在本机")}
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
                onClick={() => closeSession(s.id)}
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
                <button
                  className="icon-button"
                  title={t("结束并关闭会话")}
                  aria-label={t("结束并关闭会话")}
                  onClick={() => closeSession(activeId)}
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
              <p>{t("从左侧选择服务器，开启终端会话")}</p>
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
              {t("OpenSSH 加密连接")}
              <span>·</span>
              {t("你的工作区，你的掌控")}
            </div>
          </div>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-view ${activeId === session.id ? "active" : ""}`}
          >
            <Suspense
              fallback={<p className="loading">{t("正在加载终端…")}</p>}
            >
              <SshTerminal
                session={session}
                active={activeId === session.id}
                onStatus={updateStatus}
              />
            </Suspense>
          </div>
        ))}
      </section>
      <ChatPanel onStorageError={storageError} />
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
          {t("本地助手")}
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
          onSave={(server) => {
            setServers((all) =>
              all.some((s) => s.id === server.id)
                ? all.map((s) => (s.id === server.id ? server : s))
                : [...all, server],
            );
            setSelected(server.id);
            setEditor(undefined);
            setSearch("");
            setCollapsed((all) => all.filter((g) => g !== server.group));
          }}
        />
      )}
      {deleting && (
        <dialog
          ref={deleteRef}
          className="dialog delete-dialog"
          aria-labelledby="delete-title"
          onCancel={() => setDeleting(null)}
        >
          <h2 id="delete-title">
            {t("删除连接")} “{deleting.name}”?
          </h2>
          <p>{t("将删除本机保存的连接配置，并关闭该服务器的终端会话。")}</p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              {t("取消")}
            </button>
            <button
              className="danger"
              onClick={() => {
                const target = deleting.id;
                setServers((all) => all.filter((s) => s.id !== target));
                setSessions((all) => all.filter((s) => s.server.id !== target));
                if (activeSession?.server.id === target) setActiveId("");
                if (selected === target)
                  setSelected(servers.find((s) => s.id !== target)?.id ?? "");
                setDeleting(null);
              }}
            >
              {t("删除连接")}
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}
export default App;
