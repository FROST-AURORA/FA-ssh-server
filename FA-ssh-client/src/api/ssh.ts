import type { Server, ServerInput } from "../types";

export const userId = import.meta.env.VITE_SSH_USER_ID || "default";

interface ConnectionDTO {
  connectionId: string;
  connectionName: string;
  host: string;
  port: number;
  username: string;
  authType: 1 | 2;
  status: 0 | 1 | 2 | 3;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
}

async function request<T>(apiBaseUrl: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${apiBaseUrl}/${path}`, {
      method, signal: controller.signal, cache: "no-store",
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }),
    });
    if (!response.ok) throw new Error(`SSH 服务请求失败（HTTP ${response.status}）`);
    const result = await response.json();
    if (!result || typeof result.code !== "string") throw new Error("SSH 服务响应格式不正确");
    if (result.code !== "0000") throw new Error(result.info || "SSH 操作失败");
    return result.data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("SSH 服务请求超时，请刷新列表确认操作结果。");
    if (error instanceof TypeError) throw new Error("无法访问 SSH 服务，请检查服务地址和网络后重试。");
    if (error instanceof SyntaxError) throw new Error("SSH 服务响应不是有效的 JSON，请检查服务端地址。");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function toServer(dto: ConnectionDTO): Server {
  if (!dto?.connectionId || !dto.host) throw new Error("SSH 连接数据不完整");
  return {
    id: dto.connectionId, name: dto.connectionName, host: dto.host,
    port: dto.port, username: dto.username,
    auth: dto.authType === 2 ? "key" : "password", privateKey: "",
    group: "我的服务器", status: dto.status ?? 0, userId: dto.userId,
    createdAt: dto.createdAt, updatedAt: dto.updatedAt,
  };
}

const idQuery = (id: string) => `connectionId=${encodeURIComponent(id)}`;
export function createSshApi(serverUrl: string) {
  const baseUrl = `${serverUrl.replace(/\/+$/, "")}/api/v1/ssh`;
  const send = <T>(path: string, method?: string, body?: unknown) => request<T>(baseUrl, path, method, body);
  return {
  async list() {
    const data = await send<ConnectionDTO[]>(`connection_list?userId=${encodeURIComponent(userId)}`);
    if (!Array.isArray(data)) throw new Error("SSH 连接列表格式不正确");
    return data.map(toServer);
  },
  async get(id: string) {
    return toServer(await send<ConnectionDTO>(`get_connection?${idQuery(id)}`));
  },
  async save(input: ServerInput) {
    return toServer(await send<ConnectionDTO>(input.id ? "update_connection" : "create_connection", "POST", {
      connectionId: input.id, connectionName: input.name, host: input.host,
      port: input.port, username: input.username, authType: input.auth === "key" ? 2 : 1,
      password: input.auth === "password" ? input.password || undefined : undefined,
      privateKey: input.auth === "key" ? input.privateKey || undefined : undefined,
      userId: input.userId || userId,
      // The controller always upserts config but cannot read it back. Explicit
      // defaults prevent NOT NULL failures on update; the dialog explains this.
      connectTimeout: 10, keepaliveInterval: 60, compression: false, strictHostKeyCheck: true,
    }));
  },
  connect: (id: string) => send<void>(`connect?${idQuery(id)}`, "POST"),
  disconnect: (id: string) => send<void>(`disconnect?${idQuery(id)}`, "POST"),
  remove: (id: string) => send<void>(`delete_connection?${idQuery(id)}`, "POST"),
  };
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "SSH 操作失败，请重试。";
