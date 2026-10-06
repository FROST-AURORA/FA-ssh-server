export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: "agent" | "password" | "key";
  privateKey: string;
  group: string;
  example?: boolean;
  status?: 0 | 1 | 2 | 3;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface ServerInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: "password" | "key";
  password?: string;
  privateKey?: string;
  userId?: string;
}
export type SessionStatus = "starting" | "running" | "closed" | "error";
export interface Session {
  id: string;
  server: Server;
  status: SessionStatus;
}
export interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
  agent?: string;
  target?: string;
  status?: "streaming" | "done" | "error";
  error?: string;
  tools?: ToolResult[];
}
export interface ToolResult {
  id: string;
  name: string;
  command?: string;
  output?: string;
  status: "running" | "success" | "error" | "unknown";
}
export interface Conversation {
  id: string;
  title: string;
  agent: string;
  messages: Message[];
}
export const newConversation = (agent = ""): Conversation => ({
  id: crypto.randomUUID(),
  title: "新对话",
  agent,
  messages: [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      agent: "AI 助手",
      content:
        "你好，我是你的 SSH 助手。\n连接服务器并选择智能体后，告诉我你要完成的任务。\n\n命令和执行结果会显示在绑定的 SSH 终端中，我会在这里回复处理结果。",
    },
  ],
});
export const exampleServers: Server[] = [
  {
    id: "example-production",
    name: "production",
    host: "prod.example.com",
    username: "root",
    group: "我的服务器",
    port: 22,
    auth: "agent",
    privateKey: "",
    example: true,
  },
  {
    id: "example-staging",
    name: "staging",
    host: "staging.example.com",
    username: "deploy",
    group: "我的服务器",
    port: 22,
    auth: "agent",
    privateKey: "",
    example: true,
  },
  {
    id: "example-development",
    name: "development",
    host: "dev.example.com",
    username: "dev",
    group: "我的服务器",
    port: 22,
    auth: "agent",
    privateKey: "",
    example: true,
  },
];
export function isServer(value: unknown): value is Server {
  if (!value || typeof value !== "object") return false;
  const s = value as Server;
  return (
    [s.id, s.name, s.host, s.username, s.group, s.privateKey].every(
      (v) => typeof v === "string",
    ) &&
    Number.isInteger(s.port) &&
    s.port > 0 &&
    s.port < 65536 &&
    ["agent", "password", "key"].includes(s.auth)
  );
}
export function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Conversation;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.agent === "string" &&
    Array.isArray(c.messages) &&
    c.messages.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        ["assistant", "user"].includes(m.role) &&
        typeof m.content === "string" &&
        (m.target === undefined || typeof m.target === "string") &&
        (m.agent === undefined || typeof m.agent === "string") &&
        (m.error === undefined || typeof m.error === "string") &&
        (m.status === undefined || ["streaming", "done", "error"].includes(m.status)) &&
        (m.tools === undefined || (Array.isArray(m.tools) && m.tools.every((tool) =>
          tool && typeof tool.id === "string" && typeof tool.name === "string" &&
          ["running", "success", "error", "unknown"].includes(tool.status) &&
          (tool.command === undefined || typeof tool.command === "string") &&
          (tool.output === undefined || typeof tool.output === "string")))),
    )
  );
}
export function readStored<T>(
  key: string,
  valid: (value: unknown) => value is T,
  fallback: T[],
): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) && data.every(valid) ? data : fallback;
  } catch {
    return fallback;
  }
}
