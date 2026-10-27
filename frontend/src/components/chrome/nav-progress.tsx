"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Below this, a navigation is instant enough to need no bar at all.
const SHOW_AFTER_MS = 120;
const GIVE_UP_MS = 12000;

/**
 * A hairline under the nav while a page is on its way: it leaps to a third
 * as the link is clicked, crawls toward the end while the server answers,
 * and fills and fades when the new page is in. Prefetched pages arrive
 * before it ever shows. Transform only, on its own layer.
 */
export function NavProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const state = useRef<{ timer: number; giveUp: number; running: boolean }>({ timer: 0, giveUp: 0, running: false });
  const pathname = usePathname();

  const finish = () => {
    const s = state.current;
    const el = bar.current;
    clearTimeout(s.timer);
    clearTimeout(s.giveUp);
    if (!s.running || !el) {
      s.running = false;
      return;
    }
    s.running = false;
    el.style.transition = "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 300ms ease 180ms";
    el.style.transform = "scaleX(1)";
    el.style.opacity = "0";
  };

  // The new page is in.
  useEffect(finish, [pathname]);

  useEffect(() => {
    const start = () => {
      const s = state.current;
      clearTimeout(s.timer);
      clearTimeout(s.giveUp);
      s.timer = window.setTimeout(() => {
        const el = bar.current;
        if (!el) return;
        s.running = true;
        el.style.transition = "none";
        el.style.opacity = "1";
        el.style.transform = "scaleX(0)";
        void el.offsetWidth; // commit the start before animating
        el.style.transition = "transform 300ms cubic-bezier(0.22,1,0.36,1)";
        el.style.transform = "scaleX(0.3)";
        // Then a long crawl that never quite arrives.
        window.setTimeout(() => {
          if (!s.running) return;
          el.style.transition = "transform 8s cubic-bezier(0.1,0.6,0.2,1)";
          el.style.transform = "scaleX(0.92)";
        }, 320);
      }, SHOW_AFTER_MS);
      s.giveUp = window.setTimeout(finish, GIVE_UP_MS);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page (an anchor or the page itself): nothing loads.
      if (url.pathname === location.pathname) return;
      start();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[61] h-0.5">
      <div ref={bar} className="h-full origin-left bg-ember-500 opacity-0 shadow-[0_0_12px_rgb(255_106_26/0.7)] will-change-transform" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
