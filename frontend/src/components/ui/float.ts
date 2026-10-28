"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

const GAP = 4;
const EDGE = 8;

/**
 * A dropdown panel (`popover="manual"`, rendered only while open) lifted into
 * the top layer and placed with fixed coordinates under its anchor, so no
 * folding section, overflow-hidden card or scroll box above it can cut it
 * off. It opens upward when the room below is short and there is more above,
 * stays inside the screen, and follows the anchor as the page scrolls.
 * Returns the ref for the panel. `match`: as wide as the anchor (a select).
 * `max`: the tallest it gets.
 */
export function useFloat<T extends HTMLElement>(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  { match = false, max = Infinity }: { match?: boolean; max?: number } = {},
) {
  const panel = useRef<T>(null);
  useLayoutEffect(() => {
    const a = anchor.current;
    const p = panel.current;
    if (!open || !a || !p) return;
    // Older browsers without popovers keep it fixed in place, unclipped by overflow.
    if ("showPopover" in p && !p.matches(":popover-open")) p.showPopover();
    const fit = () => {
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const below = vh - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const up = below < Math.min(p.scrollHeight, max) && above > below;
      const s = p.style;
      if (match) s.width = `${r.width}px`;
      s.left = `${Math.max(EDGE, Math.min(r.left, vw - EDGE - p.offsetWidth))}px`;
      s.top = up ? "auto" : `${r.bottom + GAP}px`;
      s.bottom = up ? `${vh - r.top + GAP}px` : "auto";
      s.maxHeight = `${Math.max(0, Math.min(max, up ? above : below))}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(a);
    ro.observe(p);
    // Any scroll box, the page included (capture: scroll events don't bubble).
    addEventListener("scroll", fit, { capture: true, passive: true });
    addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      removeEventListener("scroll", fit, { capture: true });
      removeEventListener("resize", fit);
    };
  }, [open, anchor, match, max]);
  return panel;
}

/** Classes that undo the popover defaults (centred, framed, inset 0) for a placed panel. */
export const FLOAT = "fixed inset-auto m-0 p-0 text-ink";
