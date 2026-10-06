import { useEffect, useMemo, useRef, useState } from "react";
import { createAgentApi, type AgentConfig, type AgentEvent } from "../api/agent";
import { userId } from "../api/ssh";
import { isConversation, newConversation, readStored, type Message, type ToolResult } from "../types";

export interface AgentTarget {
  id: string;
  name: string;
}
export interface AgentLease {
  terminalSessionId: string;
  release: () => void;
}
export type AcquireTerminal = (id: string, abort: () => void) => Promise<AgentLease>;

const finishTools = (tools?: ToolResult[]) => tools?.map((tool): ToolResult =>
  tool.status === "running" ? { ...tool, status: "unknown" } : tool);

function applyEvent(message: Message, event: AgentEvent): Message {
  if (event.event === "text") {
    return { ...message, content: typeof event.fullText === "string" ? event.fullText : message.content + (event.content ?? "") };
  }
  if (event.event === "done") {
    return { ...message, status: "done", tools: finishTools(message.tools), content: event.content || message.content || "处理完成，请查看终端输出。" };
  }
  if (event.event !== "tool_call" && event.event !== "tool_result") return message;
  const id = event.toolCallId || `tool-${message.tools?.length ?? 0}`;
  const tools = [...(message.tools ?? [])];
  const index = tools.findIndex((tool) => tool.id === id);
  const tool: ToolResult = { ...(index < 0 ? { id, name: event.toolName || "executeCommand" } : tools[index]), status: "running" };
  if (event.command) tool.command = event.command;
  if (event.event === "tool_result") {
    tool.status = event.status === "error" || event.status === "failed" ? "error" : "success";
    tool.output = event.content ?? "";
    // Structured tool results may be JSON-encoded within content. Preserve raw
    // output when the current backend sends a plain string instead.
    try {
      const result = JSON.parse(tool.output);
      if (result && typeof result === "object") {
        if (typeof result.command === "string") tool.command = result.command;
        if (typeof result.output === "string") tool.output = result.output;
        if (result.success === false) tool.status = "error";
      }
    } catch { /* Plain command output. */ }
  }
  if (index < 0) tools.push(tool);
  else tools[index] = tool;
  return { ...message, tools };
}

export function useAgentChat(serverUrl: string, onStorageError: () => void, acquireTerminal: AcquireTerminal) {
  const api = useMemo(() => createAgentApi(serverUrl), [serverUrl]);
  const storageKey = `fa-ssh.agent-conversations.v1:${serverUrl}`;
  const [conversations, setConversations] = useState(() => {
    const saved = readStored(storageKey, isConversation, []).map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message): Message => message.status === "streaming"
        ? { ...message, status: "error", tools: finishTools(message.tools), error: "上次回复已中断，请查看终端状态后再发送。" } : message),
    }));
    return saved.length ? saved : [newConversation()];
  });
  const [activeId, setActiveId] = useState(conversations[0].id);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<{ conversationId: string; target: AgentTarget } | null>(null);
  const run = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  // Backend sessions live in memory; never restore their IDs after a page load.
  const sessions = useRef(new Map<string, { userId: string; sessionId: string }>());
  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const selectedAgent = agents.find((agent) => agent.agentId === active.agent) ?? agents[0];

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; run.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void api.list(controller.signal).then((list) => {
      if (controller.signal.aborted) return;
      setAgents(list);
      if (!list.length) setLoadError("服务端尚未配置智能体。");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "加载智能体失败。");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, reload]);
  useEffect(() => {
    // Persist once after completion, rather than blocking every streamed chunk.
    if (pending) return;
    try { localStorage.setItem(storageKey, JSON.stringify(conversations)); }
    catch { onStorageError(); }
  }, [conversations, pending, storageKey, onStorageError]);

  async function send(text: string, target: AgentTarget | null) {
    const value = text.trim();
    if (!value || !target || !selectedAgent || loading || loadError || run.current) return false;
    const controller = new AbortController();
    run.current = controller;
    const conversationId = active.id;
    const messageId = crypto.randomUUID();
    const agent = selectedAgent;
    setPending({ conversationId, target });
    setConversations((all) => all.map((c) => c.id !== conversationId ? c : {
      ...c, agent: agent.agentId,
      title: c.messages.length === 1 ? value.slice(0, 24) : c.title,
      messages: [...c.messages,
        { id: crypto.randomUUID(), role: "user", content: value, target: target.name },
        { id: messageId, role: "assistant", agent: agent.agentName, content: "", status: "streaming", target: target.name },
      ],
    }));
    const update = (transform: (message: Message) => Message) => {
      if (mounted.current) setConversations((all) => all.map((c) => c.id !== conversationId ? c : {
        ...c, messages: c.messages.map((m) => m.id === messageId ? transform(m) : m),
      }));
    };
    let lease: AgentLease | undefined;
    let key = "";
    try {
      lease = await acquireTerminal(target.id, () => controller.abort());
      controller.signal.throwIfAborted();
      key = JSON.stringify([conversationId, agent.agentId, lease.terminalSessionId]);
      let session = sessions.current.get(key);
      if (!session) {
        // create_session caches by userId only. Scope it to this conversation,
        // agent and terminal so different chats cannot reuse the same history.
        const scopedUser = `${userId}:${crypto.randomUUID()}`;
        const sessionId = await api.createSession(agent.agentId, scopedUser, controller.signal);
        session = { userId: scopedUser, sessionId };
        sessions.current.set(key, session);
      }
      await api.stream({ ...session, agentId: agent.agentId, terminalSessionId: lease.terminalSessionId, message: value },
        controller.signal, (event) => update((message) => applyEvent(message, event)));
    } catch (error) {
      sessions.current.delete(key);
      const detail = controller.signal.aborted
        ? "SSH 终端已断开，回复接收已中断。"
        : error instanceof Error ? error.message : "AI 对话失败。";
      update((message) => ({ ...message, status: "error", tools: finishTools(message.tools), error: `${detail}\n请检查终端；已提交的命令可能仍在执行，不会自动重试。` }));
    } finally {
      lease?.release();
      run.current = null;
      if (mounted.current) setPending(null);
    }
    return true;
  }

  return {
    conversations, active, selectedAgent, agents, loading, loadError, pending, send,
    retry: () => setReload((value) => value + 1),
    selectConversation: setActiveId,
    selectAgent: (id: string) => setConversations((all) => all.map((c) => c.id === active.id ? { ...c, agent: id } : c)),
    newChat: () => {
      const conversation = newConversation(selectedAgent?.agentId);
      setConversations((all) => [conversation, ...all]);
      setActiveId(conversation.id);
    },
  };
}
