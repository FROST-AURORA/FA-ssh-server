import { useEffect, useRef, useState } from "react";
import { useSettings } from "../settings";
import {
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  Copy,
  History,
  MessageSquare,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useAgentChat, type AcquireTerminal, type AgentTarget } from "../hooks/useAgentChat";
export function ChatPanel({ onStorageError, target, acquireTerminal }: {
  onStorageError: () => void;
  target: AgentTarget | null;
  acquireTerminal: AcquireTerminal;
}) {
  const { t, settings } = useSettings();
  const chat = useAgentChat(settings.serverUrl, onStorageError, acquireTerminal);
  const { conversations, active, agents, pending } = chat;
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState(false);
  const [copied, setCopied] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const canSend = !!target && !!chat.selectedAgent && !pending && !chat.loading && !chat.loadError;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [active.messages, active.id]);
  function send(text = draft) {
    const value = text.trim();
    if (!value || !canSend) return;
    void chat.send(value, target);
    setDraft("");
    input.current?.focus();
  }
  return (
    <aside className="chat-panel" aria-label={t("AI 对话")}>
      <header className="panel-heading">
        <span>
          <Sparkles size={15} />
          {t("AI 助手")}
        </span>
        <div className="heading-actions">
          <button
            className="icon-button"
            title={t("历史对话")}
            aria-label={t("历史对话")}
            onClick={() => setHistory(!history)}
          >
            <History size={16} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              chat.newChat();
              setDraft("");
              setHistory(false);
            }}
          >
            <Plus size={16} />
            {t("新建对话")}
          </button>
        </div>
      </header>
      {history && (
        <div className="chat-history">
          <div className="history-heading">
            {t("历史对话")}
            <button
              className="icon-button"
              aria-label={t("关闭历史对话")}
              onClick={() => setHistory(false)}
            >
              <X size={14} />
            </button>
          </div>
          {conversations.map((c) => (
            <button
              key={c.id}
              className={c.id === active.id ? "selected" : ""}
              onClick={() => {
                chat.selectConversation(c.id);
                setDraft("");
                setHistory(false);
              }}
            >
              <MessageSquare size={14} />
              <span>{c.title}</span>
            </button>
          ))}
        </div>
      )}
      <div className="assistant-mode">
        <span className="status-dot" />
        {t("服务端智能体")}
        <span>{t(chat.loading ? "正在加载…" : chat.loadError ? "暂无智能体" : pending ? "正在处理…" : "就绪")}</span>
      </div>
      <div className="chat-target" role="status">
        {pending ? `${t("正在处理")} · ${pending.target.name}` : target ? `${t("执行目标")} · ${target.name}` : t("请先连接并选中 SSH 终端")}
      </div>
      {chat.loadError && <div className="connection-error" role="alert">
        <p>{t(chat.loadError)}</p>
        <button className="text-button" onClick={chat.retry} disabled={chat.loading}>{t("重试")}</button>
      </div>}
      <div
        className="messages"
        role="log"
        aria-label={t("对话消息")}
        aria-live="polite"
      >
        {active.messages.map((m) => (
          <div className={`message ${m.role}`} key={m.id}>
            {m.role === "assistant" && (
              <div className="avatar">
                <Bot size={18} />
              </div>
            )}
            <div className="message-body">
              <div className="message-author">
                {m.role === "assistant" ? t(m.agent || "AI 助手") : t("你")}
                {m.target && <span className="message-target"> · {m.target}</span>}
              </div>
              {(m.content || m.status === "streaming") && <div className="message-content">{m.content ? t(m.content) : t("正在思考并处理请求…")}</div>}
              {m.tools?.map((tool) => <details className="tool-result" key={tool.id} open>
                <summary>{tool.command || tool.name} · {t(tool.status === "running" ? "执行中…" : tool.status === "error" ? "执行失败" : tool.status === "unknown" ? "未收到结果" : "已返回结果")}</summary>
                {tool.output !== undefined && <pre>{tool.output || t("无输出")}</pre>}
              </details>)}
              {m.status === "streaming" && <div className="message-progress" role="status">{t("正在接收回复，命令输出请查看绑定终端…")}</div>}
              {m.error && <p className="chat-message-error" role="alert">{t(m.error)}</p>}
              {m.role === "assistant" && m.content && (
                <button
                  className="copy-button"
                  aria-label={t("复制回复")}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(m.content)
                      .then(() => setCopied(m.id))
                      .catch(() => setCopied("failed"));
                  }}
                >
                  {copied === m.id ? <Check size={12} /> : <Copy size={12} />}
                  {copied === m.id ? t("已复制") : t("复制")}
                </button>
              )}
            </div>
          </div>
        ))}
        {copied === "failed" && (
          <p role="alert">{t("无法访问剪贴板，请手动选择文本复制。")}</p>
        )}
        <div ref={end} />
      </div>
      <div className="chat-bottom">
        {active.messages.length === 1 && (
          <div className="suggestions">
            {[t("查看磁盘使用情况"), t("如何排查 SSH 连接失败")].map((q) => (
              <button key={q} disabled={!canSend} onClick={() => send(q)}>
                <MessageSquare size={14} />
                <span>{q}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={input}
            aria-label={t("对话输入框")}
            placeholder={t("输入消息，Enter 发送…")}
            value={draft}
            maxLength={8000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="composer-toolbar">
            <select
              aria-label={t("选择智能体")}
              value={chat.selectedAgent?.agentId ?? ""}
              disabled={!!pending || chat.loading || !agents.length}
              onChange={(e) => chat.selectAgent(e.target.value)}
            >
              {!agents.length && <option value="">{t(chat.loading ? "正在加载…" : "暂无智能体")}</option>}
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.agentName}
                </option>
              ))}
            </select>
            <button
              className="send-button"
              type="submit"
              aria-label={t("发送消息")}
              disabled={!draft.trim() || !canSend}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </form>
        <div className="composer-hint">
          {t("Shift + Enter 换行 · AI 可在绑定终端执行命令")}
        </div>
      </div>
    </aside>
  );
}
