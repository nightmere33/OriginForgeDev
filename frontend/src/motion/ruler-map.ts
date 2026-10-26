/**
 * What the scroll ruler shows this frame, shared with the section titles so
 * they can line up with their sections when the ruler zooms out. Written by
 * ScrollRuler on the GSAP ticker; plain numbers, no React state.
 */
export const rulerMap = {
  z: 0, // 0 at rest (1:1 with the page), 1 zoomed out to the whole page
  top: 0, // viewport y of the rail's top edge
  k: 1, // rail px per page px
  needle: 0, // needle offset inside the rail
  d0: 0, // the page point under the needle
};

/** Viewport y of page point `d` on the ruler, at its current scale. */
export const onRuler = (d: number) => rulerMap.top + rulerMap.needle + (d - rulerMap.d0) * rulerMap.k;
