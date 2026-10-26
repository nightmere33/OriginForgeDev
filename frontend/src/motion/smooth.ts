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

/** `scrub`: follow a moving target (a drag) with Lenis's lerp instead of a timed glide. */
export function scrollToY(y: number, { scrub = false } = {}) {
  if (smooth.lenis) smooth.lenis.scrollTo(y, scrub ? { lerp: 0.18 } : { duration: 1.1 });
  else window.scrollTo({ top: y });
}
