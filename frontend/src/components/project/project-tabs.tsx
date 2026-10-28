"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ProjectTab = "overview" | "payments" | "progress" | "messages" | "files" | "contract";
export type TabSpec = { key: ProjectTab; label: string; badge?: number; dot?: boolean };

/**
 * The project's sections, one open at a time. The open tab lives in the
 * address (`?tab=payments`), so a notification, an e-mail link or a reload
 * lands on the right one, and Back is not polluted (it replaces, never pushes).
 */
export function useProjectTab(tabs: TabSpec[]): [ProjectTab, (tab: ProjectTab) => void] {
  const params = useSearchParams();
  const asked = params.get("tab") as ProjectTab | null;
  const active = tabs.some((t) => t.key === asked) ? asked! : "overview";
  const open = useCallback((tab: ProjectTab) => {
    const url = new URL(location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    history.replaceState(history.state, "", url);
  }, []);
  return [active, open];
}

/**
 * The tab row: an ember bar glides from the tab you leave to the one you
 * open (one composited transform). Arrow keys move between tabs (WAI-ARIA
 * tabs, automatic activation); the row scrolls sideways on phones.
 */
export function ProjectTabs({ label, tabs, active, onChange, idBase }: {
  label: string; tabs: TabSpec[]; active: ProjectTab; onChange: (tab: ProjectTab) => void; idBase: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const last = useRef<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const row = list.current;
    const el = row?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    const b = bar.current;
    if (!row || !el || !b) return;
    const to = { x: el.offsetLeft, w: el.offsetWidth };
    if (row.scrollWidth > row.clientWidth) row.scrollTo({ left: Math.max(0, to.x - 24), behavior: last.current ? "smooth" : "auto" });
    const from = last.current;
    last.current = to;
    b.style.transform = `translateX(${to.x}px) scaleX(${to.w})`;
    if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches || (from.x === to.x && from.w === to.w)) return;
    b.animate(
      [{ transform: `translateX(${from.x}px) scaleX(${from.w})` }, { transform: `translateX(${to.x}px) scaleX(${to.w})` }],
      { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [active, tabs.length]);

  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === active);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    onChange(tab.key);
    list.current?.querySelector<HTMLElement>(`[data-tab="${tab.key}"]`)?.focus();
  };

  return (
    <div className="sticky top-[var(--nav-h)] z-20 border-t border-line bg-bg/90 backdrop-blur-md">
      <div ref={list} role="tablist" aria-label={label} onKeyDown={onKey}
        className="relative flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" data-tab={t.key} id={`${idBase}-tab-${t.key}`}
            aria-selected={t.key === active} aria-controls={`${idBase}-panel`} tabIndex={t.key === active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              "hud flex h-12 shrink-0 items-center gap-2 px-5 transition-colors duration-[var(--dur-micro)] md:px-6",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ember-400",
              t.key === active ? "text-ink" : "text-muted hover:text-ink",
            )}>
            {t.label}
            {t.badge ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center bg-ember-500 px-1 text-[0.6rem] tabular-nums text-on-ember">{t.badge}</span>
            ) : t.dot ? (
              <span aria-hidden className="size-1.5 bg-ember-500" style={{ animation: "live-pulse 2.4s ease-in-out infinite" }} />
            ) : null}
          </button>
        ))}
        <span ref={bar} aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-ember-500" style={{ transform: "scaleX(0)" }} />
      </div>
    </div>
  );
}

/** The open tab's content, cross-faded in (8px rise), labelled by its tab. */
export function TabPanel({ idBase, active, children }: { idBase: string; active: ProjectTab; children: ReactNode }) {
  return (
    <div key={active} id={`${idBase}-panel`} role="tabpanel" aria-labelledby={`${idBase}-tab-${active}`}
      className="[animation:step-in_var(--dur-standard)_var(--ease-out)] [&>section:first-child]:border-t-0">
      {children}
    </div>
  );
}
