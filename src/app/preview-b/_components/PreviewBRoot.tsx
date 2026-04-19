"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "preview-b-dark";

type PreviewBThemeContext = {
  isDark: boolean;
  toggleTheme: () => void;
};

const PreviewBThemeContext = createContext<PreviewBThemeContext | null>(null);

export function usePreviewBTheme() {
  const ctx = useContext(PreviewBThemeContext);
  if (!ctx) {
    throw new Error("usePreviewBTheme must be used within PreviewBRoot");
  }
  return ctx;
}

/** Demo white-label: tinte 4% / 6% vía tokens globales (PREVIEW_CONCEPT_B.md). */
const themeVars = {
  "--theme-primary": "#0D9488",
  "--theme-primary-rgb": "13, 148, 136",
} as CSSProperties;

export function PreviewBRoot({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setIsDark(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ isDark, toggleTheme }),
    [isDark, toggleTheme],
  );

  return (
    <PreviewBThemeContext.Provider value={value}>
      <div
        className={cn(
          "preview-b-root min-h-dvh bg-background text-foreground antialiased",
          ready && isDark && "dark",
        )}
        style={themeVars}
        suppressHydrationWarning
      >
        {children}
      </div>
    </PreviewBThemeContext.Provider>
  );
}
