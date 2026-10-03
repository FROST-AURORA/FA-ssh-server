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
import {
  agents,
  isConversation,
  localReply,
  newConversation,
  readStored,
  type Conversation,
} from "../types";
export function ChatPanel({ onStorageError }: { onStorageError: () => void }) {
  const { t } = useSettings();
  const [conversations, setConversations] = useState(() => {
    const saved = readStored("fa-ssh.conversations.v1", isConversation, []);
    return saved.length ? saved : [newConversation()];
  });
  const [activeId, setActiveId] = useState(conversations[0].id);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState(false);
  const [copied, setCopied] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const active =
    conversations.find((c) => c.id === activeId) ?? conversations[0];
  useEffect(() => {
    try {
      localStorage.setItem(
        "fa-ssh.conversations.v1",
        JSON.stringify(conversations),
      );
    } catch {
      onStorageError();
    }
  }, [conversations, onStorageError]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [active.messages, active.id]);
  function update(patch: Partial<Conversation>) {
    setConversations((all) =>
      all.map((c) => (c.id === active.id ? { ...c, ...patch } : c)),
    );
  }
  function send(text = draft) {
    const value = text.trim();
    if (!value) return;
    update({
      title: active.messages.length === 1 ? value.slice(0, 24) : active.title,
      messages: [
        ...active.messages,
        { id: crypto.randomUUID(), role: "user", content: value },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          agent: active.agent,
          content: localReply(value, active.agent),
        },
      ],
    });
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
              const c = newConversation();
              setConversations((all) => [c, ...all]);
              setActiveId(c.id);
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
                setActiveId(c.id);
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
        {t("本地规则助手")}
        <span>{t("未接入模型")}</span>
      </div>
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
                {m.role === "assistant" ? t(m.agent ?? active.agent) : t("你")}
              </div>
              <div className="message-content">{m.content}</div>
              {m.role === "assistant" && (
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
              <button key={q} onClick={() => send(q)}>
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
              value={active.agent}
              onChange={(e) => update({ agent: e.target.value })}
            >
              {agents.map((a) => (
                <option key={a} value={a}>
                  {t(a)}
                </option>
              ))}
            </select>
            <button
              className="send-button"
              type="submit"
              aria-label={t("发送消息")}
              disabled={!draft.trim()}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </form>
        <div className="composer-hint">
          {t("Shift + Enter 换行 · 回复不会自动执行命令")}
        </div>
      </div>
    </aside>
  );
}
