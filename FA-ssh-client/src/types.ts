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
}
export interface Conversation {
  id: string;
  title: string;
  agent: string;
  messages: Message[];
}
export const agents = ["运维助手", "Linux 命令助手", "连接诊断助手"];
export const newConversation = (): Conversation => ({
  id: crypto.randomUUID(),
  title: "新对话",
  agent: agents[0],
  messages: [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      agent: agents[0],
      content:
        "你好，我是你的 SSH 助手。\n我可以帮你查阅常用命令、排查连接问题。\n\n当前使用本地规则回复，尚未接入 AI 模型。",
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
    agents.includes(c.agent) &&
    Array.isArray(c.messages) &&
    c.messages.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        ["assistant", "user"].includes(m.role) &&
        typeof m.content === "string",
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
export function localReply(input: string, agent: string): string {
  if (/磁盘|空间|disk|df\b/i.test(input))
    return "可以在终端手动执行以下只读命令：\n\ndf -h\n\n查看各分区容量及使用率。若要查看当前目录各项占用：\n\ndu -sh -- *\n\n这些命令尚未执行；请根据终端输出继续判断。";
  if (/连接|ssh|超时|拒绝|认证/i.test(input) || agent === "连接诊断助手")
    return "建议依次检查：\n\n1. 主机地址、端口和用户名是否正确。\n2. 服务器 SSH 服务与防火墙是否允许访问。\n3. Permission denied：检查用户名、密码或私钥权限。\n4. Connection refused：检查 SSH 服务及监听端口。\n5. 首次连接时，请核对终端显示的主机指纹。\n\n可用 ssh -v 用户名@主机 查看诊断信息。粘贴日志前请移除敏感信息。";
  if (/内存|memory|free\b/i.test(input))
    return "在 Linux 终端执行 free -h 查看内存与交换空间，重点关注 available 列。\n\n使用 top 可以继续查看各进程的 CPU 和内存占用。以上命令需要你手动执行。";
  if (/目录|文件|ls\b|pwd\b/i.test(input) || agent === "Linux 命令助手")
    return "常用 Linux 命令参考：\n\npwd       显示当前目录\nls -lah   列出文件及权限\ncd /路径  切换目录\ntail -n 50 文件  查看末尾 50 行\n\n本地助手仅提供预置参考，不能理解任意命令或读取服务器内容。";
  return "当前为本地规则助手，尚未连接 AI 模型，无法对任意问题生成智能回答。\n\n你可以询问「磁盘使用情况」「内存使用情况」「SSH 连接失败」或「常用文件命令」。切换底部智能体可选择不同的参考方向。";
}
