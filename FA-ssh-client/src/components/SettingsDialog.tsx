import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  Globe2,
  Info,
  Palette,
  RotateCcw,
  Settings,
  ShieldCheck,
  SquareTerminal,
  X,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import metadata from "../../package.json";
import {
  defaultSettings,
  fonts,
  normalizeServerUrl,
  themes,
  useSettings,
} from "../settings";
import "./SettingsDialog.css";

const sections = [
  { id: "general", title: "通用", icon: Globe2 },
  { id: "appearance", title: "外观", icon: Palette },
  { id: "terminal", title: "终端", icon: SquareTerminal },
  { id: "about", title: "关于", icon: Info },
];
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, save, previewTheme, t } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState("general");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    addressRef.current?.focus();
    return () => {
      dialog?.close();
      previewTheme(null);
      trigger?.focus();
    };
  }, [previewTheme]);
  const palette = themes[draft.theme];
  function submit() {
    let serverUrl: string;
    try {
      serverUrl = normalizeServerUrl(draft.serverUrl);
    } catch {
      setError("请输入有效的 HTTP(S) 地址，不含账号、查询参数或片段。");
      setSection("general");
      requestAnimationFrame(() => addressRef.current?.focus());
      return;
    }
    if (
      !Number.isInteger(draft.terminalFontSize) ||
      draft.terminalFontSize < 10 ||
      draft.terminalFontSize > 28
    ) {
      setError("字号必须是 10–28 之间的整数。");
      setSection("terminal");
      return;
    }
    try {
      save({ ...draft, serverUrl });
      onClose();
    } catch {
      setError("无法保存设置，请检查本地存储空间或浏览器权限。");
    }
  }
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <header className="settings-header">
          <div className="settings-title-icon">
            <Settings size={21} />
          </div>
          <div>
            <h2 id="settings-title">{t("设置")}</h2>
            <p>{t("自定义你的远程工作台")}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t("关闭设置")}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className="settings-layout">
          <nav
            className="settings-nav"
            aria-label={t("设置")}
            role="tablist"
            aria-orientation="vertical"
          >
            {sections.map(({ id, title, icon: Icon }, index) => (
              <button
                type="button"
                key={id}
                role="tab"
                id={`settings-tab-${id}`}
                aria-controls={`settings-panel-${id}`}
                aria-selected={section === id}
                tabIndex={section === id ? 0 : -1}
                onClick={() => setSection(id)}
                onKeyDown={(e) => {
                  const offset = ["ArrowDown", "ArrowRight"].includes(e.key)
                    ? 1
                    : ["ArrowUp", "ArrowLeft"].includes(e.key)
                      ? -1
                      : 0;
                  if (!offset && e.key !== "Home" && e.key !== "End") return;
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? sections.length - 1
                        : (index + offset + sections.length) % sections.length;
                  setSection(sections[next].id);
                  document
                    .getElementById(`settings-tab-${sections[next].id}`)
                    ?.focus();
                }}
              >
                <Icon size={17} />
                {t(title)}
              </button>
            ))}
            <div className="settings-nav-version">
              FA SSH <span>v{metadata.version}</span>
            </div>
          </nav>
          <div
            className="settings-content"
            role="tabpanel"
            id={`settings-panel-${section}`}
            aria-labelledby={`settings-tab-${section}`}
          >
            {section === "general" && (
              <>
                <h3>{t("通用")}</h3>
                <div className="setting-field">
                  <label htmlFor="service-url">{t("服务端地址")}</label>
                  <input
                    ref={addressRef}
                    id="service-url"
                    type="url"
                    value={draft.serverUrl}
                    placeholder="http://localhost:8091"
                    spellCheck={false}
                    aria-describedby="service-url-description"
                    onChange={(e) => {
                      setDraft({ ...draft, serverUrl: e.target.value });
                      setError("");
                    }}
                  />
                  <p id="service-url-description">
                    {t(
                      "SSH 管理服务地址，不含 /api/v1/ssh。保存后立即加载该服务的连接列表；切换服务不会断开原服务的会话。",
                    )}
                  </p>
                </div>
                <div className="setting-field">
                  <label htmlFor="settings-language">{t("语言")}</label>
                  <select
                    id="settings-language"
                    value={draft.language}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        language: e.target.value as typeof draft.language,
                      })
                    }
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                  <p>{t("选择工作台的显示语言，保存后生效。")}</p>
                </div>
              </>
            )}
            {section === "appearance" && (
              <>
                <h3>{t("外观")}</h3>
                <h4>{t("颜色主题")}</h4>
                <p className="settings-description">
                  {t("选择主题可预览整个工作台，保存后保留。")}
                </p>
                <div
                  className="theme-options"
                  role="radiogroup"
                  aria-label={t("颜色主题")}
                >
                  {Object.entries(themes).map(([id, theme]) => (
                    <button
                      type="button"
                      role="radio"
                      tabIndex={draft.theme === id ? 0 : -1}
                      onKeyDown={(e) => {
                        const direction = ["ArrowRight", "ArrowDown"].includes(
                          e.key,
                        )
                          ? 1
                          : ["ArrowLeft", "ArrowUp"].includes(e.key)
                            ? -1
                            : 0;
                        if (!direction) return;
                        e.preventDefault();
                        const ids = Object.keys(themes) as Array<
                          keyof typeof themes
                        >;
                        const index =
                          (ids.indexOf(id as keyof typeof themes) +
                            direction +
                            ids.length) %
                          ids.length;
                        setDraft({ ...draft, theme: ids[index] });
                        previewTheme(ids[index]);
                        e.currentTarget.parentElement
                          ?.querySelectorAll<HTMLButtonElement>(
                            '[role="radio"]',
                          )
                          [index]?.focus();
                      }}
                      aria-checked={draft.theme === id}
                      className={`theme-option ${draft.theme === id ? "chosen" : ""}`}
                      key={id}
                      onClick={() => {
                        setDraft({ ...draft, theme: id as typeof draft.theme });
                        previewTheme(id as typeof draft.theme);
                      }}
                    >
                      <div
                        className="theme-miniature"
                        aria-hidden="true"
                        style={
                          {
                            "--sample-bg": theme.surface,
                            "--sample-sidebar": theme.sidebar,
                            "--sample-border": theme.border,
                            "--sample-accent": theme.accent,
                            "--sample-muted": theme.muted,
                          } as CSSProperties
                        }
                      >
                        <div className="mini-title" />
                        <div className="mini-sidebar">
                          <i />
                          <i />
                          <i />
                        </div>
                        <div className="mini-editor">
                          <i />
                          <i />
                          <i />
                          <i />
                        </div>
                        <div className="mini-chat">
                          <i />
                          <i />
                        </div>
                        <div className="mini-status" />
                      </div>
                      <span className="theme-option-name">
                        {t(theme.name)}
                        {draft.theme === id && <Check size={15} />}
                      </span>
                      <small>{t(theme.description)}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {section === "terminal" && (
              <>
                <h3>{t("终端")}</h3>
                <p className="settings-description">
                  {t("字体与字号将应用到当前及新建的终端，不会中断连接。")}
                </p>
                <div className="terminal-settings-fields">
                  <div className="setting-field">
                    <label htmlFor="terminal-font">{t("终端字体")}</label>
                    <select
                      id="terminal-font"
                      value={draft.terminalFont}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          terminalFont: e.target
                            .value as typeof draft.terminalFont,
                        })
                      }
                    >
                      {Object.keys(fonts).map((font) => (
                        <option key={font}>{font}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-field font-size-field">
                    <label htmlFor="terminal-font-size">{t("字号")}</label>
                    <div className="font-size-input">
                      <input
                        id="terminal-font-size"
                        type="number"
                        min={10}
                        max={28}
                        step={1}
                        value={
                          Number.isNaN(draft.terminalFontSize)
                            ? ""
                            : draft.terminalFontSize
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            terminalFontSize:
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                          })
                        }
                      />
                      <span>px</span>
                    </div>
                  </div>
                </div>
                <p className="settings-description">
                  {t("字体使用本机已安装版本；不可用时自动回退到等宽字体。")}
                </p>
                <div
                  className="terminal-font-preview"
                  style={{
                    background: palette.surface,
                    color: palette.text,
                    fontFamily: fonts[draft.terminalFont],
                    fontSize: Number.isFinite(draft.terminalFontSize)
                      ? Math.min(28, Math.max(10, draft.terminalFontSize))
                      : 14,
                  }}
                >
                  <span className="preview-caption">{t("预览")}</span>
                  <div>
                    <span style={{ color: palette.icon }}>user@fa-ssh</span>:~$
                    ls -lah
                  </div>
                  <div>drwxr-xr-x docs/</div>
                  <div>-rw-r--r-- README.md</div>
                  <div>
                    <span style={{ color: palette.icon }}>$</span>{" "}
                    <span className="preview-cursor" />
                  </div>
                </div>
              </>
            )}
            {section === "about" && (
              <>
                <div className="about-brand">
                  <SquareTerminal size={44} strokeWidth={1.4} />
                  <h3>FA SSH</h3>
                  <p>{t("远程连接，专注当下。")}</p>
                </div>
                <dl className="about-details">
                  <div>
                    <dt>{t("版本信息")}</dt>
                    <dd>v{metadata.version}</dd>
                  </div>
                  <div>
                    <dt>{t("运行环境")}</dt>
                    <dd>{t(isTauri() ? "桌面应用" : "浏览器预览")}</dd>
                  </div>
                  <div>
                    <dt>{t("技术栈")}</dt>
                    <dd>
                      Tauri 2 · React 19 · TypeScript
                      <br />
                      Vite · xterm.js · Rust · OpenSSH
                    </dd>
                  </div>
                </dl>
                <div className="about-note">
                  <ShieldCheck size={17} />
                  <div>
                    <strong>{t("本地配置")}</strong>
                    <p>{t("设置保存在当前设备，不包含密码或私钥内容。")}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {error && (
          <p className="settings-error" role="alert">
            {t(error)}
          </p>
        )}
        <footer className="settings-footer">
          <button
            type="button"
            className="reset-settings"
            onClick={() => {
              setDraft(defaultSettings);
              previewTheme(defaultSettings.theme);
              setError("");
            }}
          >
            <RotateCcw size={14} />
            {t("恢复默认")}
          </button>
          <div>
            <button type="button" className="secondary" onClick={onClose}>
              {t("取消")}
            </button>
            <button type="submit" className="primary">
              {t("保存设置")}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
