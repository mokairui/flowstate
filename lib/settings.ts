import type { AppSettings } from "./types";

const SETTINGS_KEY = "flowstate_settings";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  aiEnabled: true,
  apiBaseUrl: "",
  apiKey: "",
  model: "gpt-4o-mini",
  autoParse: true,
  quickCaptureShortcut: "Cmd/Ctrl + K",
  speechEnabled: true,
  speechLang: "zh-CN",
  ttsEnabled: false,
  ttsLang: "zh-CN",
  ambientMotionEnabled: true,
  userEnergyMode: undefined,
  lastPlanGeneratedAt: 0,
  dailyAvailableMinutes: 480,
  autoOpenDailyPlan: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
}

export function getShortcutDisplay(): string {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return isMac ? "⌘ K" : "Ctrl + K";
}
