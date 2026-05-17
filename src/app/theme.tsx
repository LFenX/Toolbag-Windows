import { useEffect } from "react";

import { useSettings } from "../features/settings/useSettings";
import { defaultSettings, type AppSettings } from "../shared/tauri/types";

function resolveTheme(theme: AppSettings["theme"]): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

function applyAccent(accent: AppSettings["accent"]) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (typeof accent === "string") {
    root.dataset.accent = accent;
    root.style.removeProperty("--tb-primary");
  } else {
    root.dataset.accent = "custom";
    root.style.setProperty("--tb-primary", accent.custom);
  }
}

export function ThemeController() {
  const { data: settings } = useSettings();
  const effective: AppSettings = settings ?? defaultSettings;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const resolved = resolveTheme(effective.theme);
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
    root.dataset.density = effective.density;
    root.dataset.motion = effective.motion;
    root.style.fontSize = `${String(effective.fontScale)}%`;
    applyAccent(effective.accent);
  }, [
    effective.theme,
    effective.density,
    effective.motion,
    effective.fontScale,
    effective.accent,
  ]);

  useEffect(() => {
    if (effective.theme !== "system") return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
      document.documentElement.style.colorScheme = mq.matches ? "dark" : "light";
    };
    handler();
    mq.addEventListener("change", handler);
    return () => { mq.removeEventListener("change", handler); };
  }, [effective.theme]);

  return null;
}
