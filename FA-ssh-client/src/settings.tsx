import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { english } from "./translations";

export const SETTINGS_KEY = "fa-ssh.settings.v1";
export const fonts = {
  Consolas: 'Consolas, "Microsoft YaHei", monospace',
  "Cascadia Code": '"Cascadia Code", Consolas, monospace',
  "Courier New": '"Courier New", monospace',
  monospace: "monospace",
};
export const themes = {
  dark: {
    name: "经典深色",
    description: "熟悉的编辑器配色",
    scheme: "dark",
    surface: "#1f1f1f",
    sidebar: "#181818",
    elevated: "#242424",
    input: "#252526",
    text: "#cccccc",
    strong: "#eeeeee",
    muted: "#969696",
    subtle: "#808080",
    border: "#303030",
    inputBorder: "#454545",
    accent: "#007acc",
    accentHover: "#1189d3",
    focus: "#75beff",
    selection: "#083b5c",
    selectionText: "#d2e7f6",
    userBg: "#153c55",
    userBorder: "#234b63",
    hover: "#ffffff0b",
    icon: "#67b7f3",
  },
  light: {
    name: "明亮浅色",
    description: "清晰轻盈，专注工作",
    scheme: "light",
    surface: "#ffffff",
    sidebar: "#f3f3f3",
    elevated: "#f6f6f6",
    input: "#ffffff",
    text: "#333333",
    strong: "#171717",
    muted: "#616161",
    subtle: "#6b6b6b",
    border: "#dedede",
    inputBorder: "#b8b8b8",
    accent: "#0067b8",
    accentHover: "#005a9e",
    focus: "#0067b8",
    selection: "#dcecf9",
    selectionText: "#15466c",
    userBg: "#e4f0fb",
    userBorder: "#bfd8ed",
    hover: "#00000008",
    icon: "#0067b8",
  },
  midnight: {
    name: "午夜蓝",
    description: "沉静蓝调，适合夜间",
    scheme: "dark",
    surface: "#151e2e",
    sidebar: "#101827",
    elevated: "#1d293c",
    input: "#192437",
    text: "#cbd5e1",
    strong: "#edf3fc",
    muted: "#98abc4",
    subtle: "#8397b2",
    border: "#2a3950",
    inputBorder: "#3c506e",
    accent: "#4369cf",
    accentHover: "#557de6",
    focus: "#91b5ff",
    selection: "#253e69",
    selectionText: "#deebff",
    userBg: "#233d62",
    userBorder: "#39557c",
    hover: "#ffffff0b",
    icon: "#91b5ff",
  },
  forest: {
    name: "静谧森林",
    description: "柔和绿意，舒适阅读",
    scheme: "dark",
    surface: "#18231f",
    sidebar: "#121c18",
    elevated: "#213029",
    input: "#1c2b24",
    text: "#c9d8ce",
    strong: "#edf4ed",
    muted: "#9bb3a4",
    subtle: "#88a091",
    border: "#304339",
    inputBorder: "#465d50",
    accent: "#287553",
    accentHover: "#338864",
    focus: "#81cca3",
    selection: "#234b37",
    selectionText: "#ddf0e3",
    userBg: "#264633",
    userBorder: "#3c624b",
    hover: "#ffffff0b",
    icon: "#81cca3",
  },
} as const;
export interface Settings {
  serverUrl: string;
  language: "zh-CN" | "en";
  theme: keyof typeof themes;
  terminalFont: keyof typeof fonts;
  terminalFontSize: number;
}
export const defaultSettings: Settings = {
  serverUrl: "http://127.0.0.1:8080",
  language: "zh-CN",
  theme: "dark",
  terminalFont: "Consolas",
  terminalFontSize: 14,
};
export function normalizeServerUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid service URL");
  return url.toString().replace(/\/+$/, "");
}
function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return defaultSettings;
    return {
      serverUrl:
        typeof saved.serverUrl === "string"
          ? normalizeServerUrl(saved.serverUrl)
          : defaultSettings.serverUrl,
      language: saved.language === "en" ? "en" : "zh-CN",
      theme: Object.prototype.hasOwnProperty.call(themes, saved.theme)
        ? saved.theme
        : defaultSettings.theme,
      terminalFont: Object.prototype.hasOwnProperty.call(
        fonts,
        saved.terminalFont,
      )
        ? saved.terminalFont
        : defaultSettings.terminalFont,
      terminalFontSize:
        Number.isInteger(saved.terminalFontSize) &&
        saved.terminalFontSize >= 10 &&
        saved.terminalFontSize <= 28
          ? saved.terminalFontSize
          : 14,
    };
  } catch {
    return defaultSettings;
  }
}
interface SettingsContextValue {
  settings: Settings;
  currentTheme: Settings["theme"];
  save: (next: Settings) => void;
  previewTheme: (theme: Settings["theme"] | null) => void;
  t: (text: string) => string;
}
const SettingsContext = createContext<SettingsContextValue | null>(null);
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadSettings);
  const [preview, previewTheme] = useState<Settings["theme"] | null>(null);
  const save = useCallback((next: Settings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setSettings(next);
  }, []);
  const t = useCallback(
    (text: string) =>
      settings.language === "en" ? (english[text] ?? text) : text,
    [settings.language],
  );
  useLayoutEffect(() => {
    const theme = themes[preview ?? settings.theme];
    document.documentElement.dataset.theme = preview ?? settings.theme;
    document.documentElement.style.colorScheme = theme.scheme;
    for (const [key, value] of Object.entries(theme)) {
      if (!["name", "description", "scheme"].includes(key))
        document.documentElement.style.setProperty(
          `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
          value,
        );
    }
  }, [settings.theme, preview]);
  useLayoutEffect(() => {
    document.documentElement.lang = settings.language;
    document.title =
      settings.language === "en"
        ? "FA SSH — Remote Workspace"
        : "FA SSH — 远程工作台";
  }, [settings.language]);
  return (
    <SettingsContext.Provider
      value={{
        settings,
        currentTheme: preview ?? settings.theme,
        save,
        previewTheme,
        t,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("SettingsProvider is required");
  return context;
}
