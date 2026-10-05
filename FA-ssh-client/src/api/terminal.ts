import { request } from "./ssh";

export interface TerminalOpenResponse {
  sessionId: string;
  connectionId: string;
  initialOutput?: string;
}

export function createTerminalApi(serverUrl: string) {
  const baseUrl = `${serverUrl.replace(/\/+$/, "")}/api/v1/ssh/terminal`;
  const query = (sessionId: string) => `sessionId=${encodeURIComponent(sessionId)}`;
  return {
    async open(connectionId: string, cols: number, rows: number) {
      const result = await request<TerminalOpenResponse>(baseUrl, "open", "POST", { connectionId, cols, rows });
      if (!result?.sessionId) throw new Error("终端服务未返回会话 ID");
      return result;
    },
    read: (sessionId: string, signal?: AbortSignal) =>
      request<{ output: string }>(baseUrl, `read?${query(sessionId)}`, "GET", undefined, { signal }),
    write: (sessionId: string, input: string) =>
      request<void>(baseUrl, "write", "POST", { sessionId, input }),
    exec: (sessionId: string, command: string) =>
      request<{ output: string }>(baseUrl, "exec", "POST", { sessionId, command }),
    resize: (sessionId: string, cols: number, rows: number) =>
      request<void>(baseUrl, "resize", "POST", { sessionId, cols, rows }),
    close: (sessionId: string) =>
      request<void>(baseUrl, `close?${query(sessionId)}`, "POST", undefined, { keepalive: true }),
  };
}
