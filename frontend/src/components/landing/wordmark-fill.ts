/**
 * The wordmark's fill: brushed steel plus a specular sheen layer, both
 * clipped to the glyphs. The sheen sits off the word (--sheen-a 0) until the
 * intro glides it across (hero-intro.tsx).
 */
export const WORDMARK_FILL =
  "linear-gradient(100deg, transparent calc(var(--sheen-x, -40%) - 16%), rgb(255 255 255 / calc(var(--sheen-a, 0) * 0.7)) var(--sheen-x, -40%), transparent calc(var(--sheen-x, -40%) + 16%)), var(--steel-gradient)";
