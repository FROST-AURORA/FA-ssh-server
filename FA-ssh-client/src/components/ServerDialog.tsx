import { useEffect, useRef, useState } from "react";
import { KeyRound, Server as ServerIcon, X } from "lucide-react";
import type { Server, ServerInput } from "../types";
import { errorMessage } from "../api/ssh";
import { useSettings } from "../settings";
export function ServerDialog({
  server,
  onSave,
  onClose,
}: {
  server: Server | null;
  onSave: (server: ServerInput) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const ref = useRef<HTMLDialogElement>(null);
  const [auth, setAuth] = useState<ServerInput["auth"]>(server?.auth === "key" ? "key" : "password");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      // Closing a credential form must be intentional. Dialog padding and
      // backdrop clicks can both target the dialog, and Escape can come from IME.
      onCancel={(e) => e.preventDefault()}
      aria-labelledby="connection-title"
    >
      <form
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            e.target instanceof HTMLInputElement &&
            !e.nativeEvent.isComposing
          ) {
            // Keep Enter in a field from implicitly submitting a completed form.
            // Buttons retain keyboard activation; textarea keeps its newlines.
            e.preventDefault();
          }
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting.current) return;
          const data = new FormData(e.currentTarget);
          const privateKey = String(data.get("privateKey") || "").trim();
          if (auth === "key" && !server && !privateKey) {
            setError(t("请输入私钥内容"));
            return;
          }
          submitting.current = true;
          setSaving(true);
          setError("");
          try { await onSave({
            id: server?.id,
            name: String(data.get("name")).trim(),
            host: String(data.get("host")).trim(),
            port: Number(data.get("port")),
            username: String(data.get("username")).trim(),
            userId: server?.userId,
            auth,
            password: auth === "password" ? String(data.get("password") || "") : undefined,
            privateKey:
              auth === "key" ? privateKey : undefined,
          }); } catch (cause) { setError(errorMessage(cause)); }
          finally { submitting.current = false; setSaving(false); }
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
            disabled={saving}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="muted">{t("配置服务器信息，随时开启 SSH 会话。")}</p>
        <fieldset disabled={saving} className="connection-fields">
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
        </div>
        <label>
          {t("认证方式")}
          <select
            value={auth}
            disabled={!!server}
            onChange={(e) => setAuth(e.target.value as ServerInput["auth"])}
          >
            <option value="password">{t("密码认证")}</option>
            <option value="key">{t("私钥认证")}</option>
          </select>
        </label>
        {auth === "password" && <label>
          {t("密码")}
          <input name="password" type="password" autoComplete="new-password" required={!server}
            placeholder={server ? t("留空保留原密码") : t("输入 SSH 登录密码")} />
        </label>}
        {auth === "key" && (
          <label>
            {t("私钥内容")}
            <textarea
              name="privateKey"
              required={!server}
              rows={5}
              spellCheck={false}
              placeholder={server ? t("留空保留原私钥") : "-----BEGIN OPENSSH PRIVATE KEY-----"}
            />
          </label>
        )}
        <div className="form-note">
          <KeyRound size={15} />
          <span>
            {t("认证信息提交至服务端保存，不写入浏览器本地存储。")}
            {server && <><br />{t("编辑时留空保留原凭据；切换认证方式请新建连接。保存将先断开当前会话。")}</>}
          </span>
        </div>
        {server && <p className="form-note">{t("当前服务端不返回高级配置，保存会重置高级配置为默认值，并清空启动命令及已知主机记录。")}</p>}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button type="button" className="secondary" disabled={saving} onClick={onClose}>
            {t("取消")}
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {t(saving ? "保存中…" : "保存连接")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
