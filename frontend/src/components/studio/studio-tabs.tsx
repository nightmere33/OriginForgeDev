"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

const TABS = ["overview", "requests", "clients", "payments", "reviews", "settings", "kit"] as const;
export type StudioTab = (typeof TABS)[number];
type Tab = StudioTab;

const href = (lang: Locale, tab: Tab) => `/${lang}/studio${tab === "overview" ? "" : `/${tab}`}`;

/**
 * The studio's sections. The ember bar glides from the tab you leave to the
 * one you open (it remembers where it was across navigations), so moving
 * around the studio reads as one instrument, not separate pages.
 */
let lastBar: { x: number; w: number } | null = null;

// Each page says which tab it is (no pathname hook: the frame stays static).
export function StudioTabs({ lang, labels, active }: { lang: Locale; labels: Dictionary["studio"]["dash"]["tabs"]; active: Tab }) {
  const list = useRef<HTMLUListElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const ul = list.current;
    const el = ul?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    const b = bar.current;
    if (!ul || !el || !b) return;
    const to = { x: el.offsetLeft, w: el.offsetWidth };
    // Keep the active tab in view on phones (the row scrolls sideways).
    ul.scrollTo({ left: Math.max(0, to.x - 24), behavior: lastBar ? "smooth" : "auto" });
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = lastBar;
    lastBar = to;
    b.style.transform = `translateX(${to.x}px) scaleX(${to.w})`;
    if (!from || reduce || (from.x === to.x && from.w === to.w)) return;
    b.animate(
      [{ transform: `translateX(${from.x}px) scaleX(${from.w})` }, { transform: `translateX(${to.x}px) scaleX(${to.w})` }],
      { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [active]);

  return (
    <nav aria-label="Studio" className="border-t border-line">
      <ul ref={list} className="relative flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => (
          <li key={tab} data-tab={tab} className="shrink-0">
            <Link
              href={href(lang, tab)}
              aria-current={tab === active ? "page" : undefined}
              className={cn(
                "hud flex h-12 items-center px-5 transition-colors duration-[var(--dur-micro)] md:px-6",
                tab === active ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {labels[tab]}
            </Link>
          </li>
        ))}
        {/* 1px wide, scaled to the tab's width: one composited transform. */}
        <span ref={bar} aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-ember-500" style={{ transform: "scaleX(0)" }} />
      </ul>
    </nav>
  );
}
