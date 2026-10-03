import { useEffect, useRef, useState } from "react";
import { KeyRound, Server as ServerIcon, X } from "lucide-react";
import type { Server } from "../types";
import { useSettings } from "../settings";
export function ServerDialog({
  server,
  onSave,
  onClose,
}: {
  server: Server | null;
  onSave: (server: Server) => void;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const ref = useRef<HTMLDialogElement>(null);
  const [auth, setAuth] = useState<Server["auth"]>(server?.auth ?? "agent");
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="connection-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          onSave({
            id: server?.id ?? crypto.randomUUID(),
            name: String(data.get("name")).trim(),
            host: String(data.get("host")).trim(),
            port: Number(data.get("port")),
            username: String(data.get("username")).trim(),
            group: String(data.get("group")).trim() || "我的服务器",
            auth,
            privateKey:
              auth === "key" ? String(data.get("privateKey")).trim() : "",
          });
        }}
      >
        <div className="dialog-heading">
          <ServerIcon size={20} />
          <h2 id="connection-title">
            {server ? t("编辑连接") : t("新建连接")}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t("关闭弹窗")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="muted">{t("配置服务器信息，随时开启 SSH 会话。")}</p>
        <label>
          {t("连接名称")}
          <input
            autoFocus
            name="name"
            required
            maxLength={80}
            pattern=".*\S.*"
            defaultValue={server?.name}
            placeholder={t("例如：生产服务器")}
          />
        </label>
        <div className="form-row">
          <label>
            {t("主机地址")}
            <input
              name="host"
              required
              pattern="[a-zA-Z0-9][a-zA-Z0-9.:%_\-]*"
              defaultValue={server?.host}
              placeholder={t("IP 地址或域名")}
              title={t("输入 IP 地址或域名，不包含空格或协议前缀")}
            />
          </label>
          <label className="port-field">
            {t("端口")}
            <input
              name="port"
              type="number"
              required
              min={1}
              max={65535}
              defaultValue={server?.port ?? 22}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t("用户名")}
            <input
              name="username"
              required
              pattern="[a-zA-Z0-9_][a-zA-Z0-9_.\-]*"
              defaultValue={server?.username ?? "root"}
            />
          </label>
          <label>
            {t("分组")}
            <input
              name="group"
              maxLength={60}
              defaultValue={server?.group ?? "我的服务器"}
            />
          </label>
        </div>
        <label>
          {t("认证方式")}
          <select
            value={auth}
            onChange={(e) => setAuth(e.target.value as Server["auth"])}
          >
            <option value="agent">{t("SSH Agent / 默认密钥")}</option>
            <option value="password">{t("密码认证")}</option>
            <option value="key">{t("指定私钥文件")}</option>
          </select>
        </label>
        {auth === "key" && (
          <label>
            {t("私钥文件路径")}
            <input
              name="privateKey"
              required
              pattern=".*\S.*"
              defaultValue={server?.privateKey}
              placeholder={t("C:\\Users\\你的用户名\\.ssh\\id_ed25519")}
            />
          </label>
        )}
        <div className="form-note">
          <KeyRound size={15} />
          <span>
            {auth === "password"
              ? t("连接时在终端输入密码，应用不会保存密码。")
              : t("认证由系统 OpenSSH 处理，私钥口令在终端中输入。")}
          </span>
        </div>
        <footer className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t("取消")}
          </button>
          <button type="submit" className="primary">
            {t("保存连接")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
