"use client";

/**
 * Dark (the brand default) or light. The choice lives in localStorage and on
 * <html data-theme>; the root layout's pre-paint script applies a saved
 * "light" before first paint, so there is no flash. Components read colours
 * through the tokens in globals.css, which the light block turns over.
 */
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "./cn";
import { THEME_KEY } from "./theme-flag";

export type Theme = "dark" | "light";

const listeners = new Set<() => void>();
export const themeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  read: (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
};

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  const apply = () => {
    if (theme === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    listeners.forEach((l) => l());
  };
  // A cross-fade between the two palettes where the browser supports it.
  const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
  if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(apply);
  else apply();
}

export function useTheme(): Theme {
  return useSyncExternalStore(themeStore.subscribe, themeStore.read, () => "dark");
}

/** Nav control: the moon in dark mode, the sun in light; tapping switches. */
export function ThemeToggle({ labels, className }: { labels: { light: string; dark: string }; className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={next === "light" ? labels.light : labels.dark}
      title={next === "light" ? labels.light : labels.dark}
      onClick={() => setTheme(next)}
      className={cn("flex w-12 items-center justify-center text-muted transition-colors duration-[var(--dur-micro)] hover:text-ink", className)}
    >
      {theme === "dark" ? <Moon aria-hidden className="size-4" /> : <Sun aria-hidden className="size-4" />}
    </button>
  );
}
