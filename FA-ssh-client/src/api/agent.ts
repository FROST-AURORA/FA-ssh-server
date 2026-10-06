import { request } from "./ssh";

export interface AgentConfig {
  agentId: string;
  agentName: string;
  agentDesc?: string;
}

export interface AgentEvent {
  event: string;
  content?: string;
  fullText?: string;
  toolCallId?: string;
  toolName?: string;
  command?: string;
  status?: string;
}

export interface ChatRequest {
  agentId: string;
  userId: string;
  sessionId: string;
  terminalSessionId: string;
  message: string;
}

// AgentServiceController emits newline-delimited JSON, interleaved with SSE
// heartbeat comments. Also accept data: frames for an SSE-compatible backend.
export async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const consume = (raw: string) => {
    let line = raw.trim();
    if (!line || line.startsWith(":") || /^(event|id|retry):/.test(line)) return;
    if (line.startsWith("data:")) line = line.slice(5).trim();
    if (!line) return;
    let value: AgentEvent;
    try { value = JSON.parse(line); }
    catch { throw new Error("AI 服务返回了无法解析的流式数据。"); }
    if (!value || typeof value.event !== "string") throw new Error("AI 事件格式不正确。");
    for (const field of ["content", "fullText", "toolCallId", "toolName", "command", "status"] as const) {
      if (value[field] !== undefined && typeof value[field] !== "string") throw new Error("AI 事件字段格式不正确。");
    }
    if (value.event === "error") throw new Error(value.content || "AI 对话失败，请重试。");
    onEvent(value);
    if (value.event === "done") completed = true;
  };
  try {
    while (!completed) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while (!completed && (newline = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) {
        if (!completed && buffer.trim()) consume(buffer);
        if (!completed) throw new Error("AI 回复连接提前断开，命令可能仍在执行，请查看终端后再发送。");
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createAgentApi(serverUrl: string) {
  const base = `${serverUrl.replace(/\/+$/, "")}/api/v1`;
  return {
    async list(signal: AbortSignal) {
      const agents = await request<AgentConfig[]>(base, "query_ai_agent_config_list", "GET", undefined, { signal });
      if (!Array.isArray(agents) || agents.some((a) => !a || typeof a.agentId !== "string" || typeof a.agentName !== "string")) {
        throw new Error("智能体列表格式不正确。");
      }
      return agents;
    },
    async createSession(agentId: string, userId: string, signal: AbortSignal) {
      const data = await request<{ sessionId: string }>(base, "create_session", "POST", { agentId, userId }, { signal });
      if (typeof data?.sessionId !== "string" || !data.sessionId) throw new Error("AI 服务未返回会话 ID。");
      return data.sessionId;
    },
    async stream(payload: ChatRequest, signal: AbortSignal, onEvent: (event: AgentEvent) => void) {
      // Do not use the ordinary 45-second SSH request timeout for an agent run.
      const timeout = AbortSignal.timeout(10 * 60 * 1000);
      const response = await fetch(`${base}/chat_stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/x-ndjson, application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([signal, timeout]),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`AI 服务请求失败（HTTP ${response.status}）`);
      if (!response.body) throw new Error("浏览器未能读取 AI 回复流。");
      await readAgentStream(response.body, onEvent);
    },
  };
}
