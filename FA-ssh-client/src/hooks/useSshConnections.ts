import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSshApi, errorMessage } from "../api/ssh";
import type { Server, ServerInput } from "../types";

export function useSshConnections(serverUrl: string) {
  const sshApi = useMemo(() => createSshApi(serverUrl), [serverUrl]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const locks = useRef(new Set<string>());
  const revision = useRef(0);
  const refreshing = useRef<number | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (locks.current.size || refreshing.current !== null) return;
    const version = ++revision.current;
    refreshing.current = version;
    setLoading(true);
    try {
      const list = await sshApi.list();
      if (mounted.current && version === revision.current) {
        setServers(list);
        setLoadError("");
      }
    } catch (error) {
      if (mounted.current && version === revision.current) setLoadError(errorMessage(error));
    } finally {
      if (refreshing.current === version) refreshing.current = null;
      if (mounted.current && version === revision.current) setLoading(false);
    }
  }, [sshApi]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      revision.current++;
      refreshing.current = null;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  async function run<T>(id: string, action: string, operation: () => Promise<T>): Promise<T> {
    if (locks.current.has(id)) throw new Error("该连接正在操作中，请稍候。");
    locks.current.add(id);
    revision.current++;
    refreshing.current = null;
    setLoading(false);
    setBusy((all) => ({ ...all, [id]: action }));
    try {
      return await operation();
    } finally {
      locks.current.delete(id);
      if (mounted.current) {
        setBusy((all) => {
          const next = { ...all };
          delete next[id];
          return next;
        });
        // Also reconcile after failure: a timed-out write may have succeeded.
        void refresh();
      }
    }
  }
  function update(server: Server) {
    setServers((all) => all.some((s) => s.id === server.id)
      ? all.map((s) => s.id === server.id ? server : s) : [...all, server]);
  }
  function markDisconnected(id: string) {
    setServers((all) => all.map((s) => s.id === id ? { ...s, status: 0 } : s));
  }
  return {
    servers, loading, loadError, busy, refresh,
    get: (id: string) => run(id, "读取中", () => sshApi.get(id)),
    save: (input: ServerInput) => run(input.id || "new", "保存中", async () => {
      // An update resets persisted status; stop the live session using old settings.
      if (input.id) {
        await sshApi.disconnect(input.id);
        markDisconnected(input.id);
      }
      const saved = await sshApi.save(input);
      update(saved);
      return saved;
    }),
    connect: (id: string) => run(id, "连接中", async () => {
      await sshApi.connect(id);
      setServers((all) => all.map((s) => s.id === id ? { ...s, status: 1 } : s));
    }),
    disconnect: (id: string) => run(id, "断开中", async () => {
      await sshApi.disconnect(id);
      markDisconnected(id);
    }),
    remove: (id: string) => run(id, "删除中", async () => {
      // delete_connection removes the record but does not close its SSH session.
      await sshApi.disconnect(id);
      markDisconnected(id);
      await sshApi.remove(id);
      setServers((all) => all.filter((s) => s.id !== id));
    }),
  };
}
