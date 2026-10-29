import type Lenis from "lenis";

/**
 * The live Lenis instance, for code that scrolls programmatically (the ruler,
 * in-page links). Null before mount and for reduced-motion visitors: callers
 * fall back to native scrolling through `scrollToY`.
 */
export const smooth: { lenis: Lenis | null } = { lenis: null };

/**
 * The scroll offset for frame loops. Lenis already holds it; reading
 * `window.scrollY` after other tickers wrote transforms forces a synchronous
 * layout every frame.
 */
export const frameScroll = () => (smooth.lenis ? smooth.lenis.scroll : scrollY);

/**
 * Room the chat launcher takes at the bottom right (px), so the ruler and
 * the queued section titles end above it. Also set as --dock-clear for CSS.
 */
export const dockClear = { px: 0 };
export function setDockClear(px: number) {
  dockClear.px = px;
  document.documentElement.style.setProperty("--dock-clear", `${px}px`);
}

/** Glide an element just under the fixed nav, as for anchors. */
export function scrollToElement(el: Element, offset = 96) {
  const target = Math.max(0, scrollY + el.getBoundingClientRect().top - offset);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (smooth.lenis) smooth.lenis.scrollTo(target, { duration: 0.9, immediate: reduce, force: true });
  else window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
}

/** `scrub`: follow a moving target (a drag) with Lenis's lerp instead of a timed glide. */
export function scrollToY(y: number, { scrub = false } = {}) {
  if (smooth.lenis) smooth.lenis.scrollTo(y, scrub ? { lerp: 0.18 } : { duration: 1.1 });
  else window.scrollTo({ top: y });
}
