"use client";

import { useEffect } from "react";
import { useFlowState } from "@/lib/store";

function getResolvedTheme(theme: "system" | "dark" | "light"): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useFlowState((s) => s.settings.theme);

  useEffect(() => {
    const resolved = getResolvedTheme(theme);
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    html.classList.remove("dark", "light");
    html.classList.add(resolved);
  }, [theme]);

  // Listen for system preference changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      const html = document.documentElement;
      html.classList.remove("dark", "light");
      html.classList.add(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return <>{children}</>;
}
