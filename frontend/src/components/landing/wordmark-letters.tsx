"use client";

import { useEffect } from "react";
import { WORDMARK_FILL } from "./wordmark-fill";

/**
 * Gives every wordmark letter its own slice of one shared fill: the gradient
 * is sized to the whole word and offset per letter, so the word looks exactly
 * as one surface, yet each letter carries its fill wherever it goes. The
 * section titles move these very letters to the top-right stack and back
 * (motion/section-titles.tsx), so nothing is ever swapped or hidden. The
 * server render keeps the single word fill until this runs.
 */
export default function WordmarkLetters() {
  useEffect(() => {
    const letters = Array.from(document.querySelectorAll<HTMLElement>("[data-wm-letter]"));
    const word = letters[0]?.parentElement;
    if (!word) return;
    const apply = () => {
      // Measured untransformed: offsetLeft/offsetWidth ignore transforms.
      const width = word.offsetWidth;
      word.style.backgroundImage = "none";
      for (const el of letters) {
        el.style.backgroundImage = WORDMARK_FILL;
        el.style.backgroundSize = `${width}px 100%`;
        el.style.backgroundPosition = `${-el.offsetLeft}px 0`;
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundClip = "text";
        el.style.setProperty("-webkit-background-clip", "text");
        el.style.color = "transparent";
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(word);
    return () => {
      ro.disconnect();
      word.style.backgroundImage = "";
      for (const el of letters) {
        for (const p of ["background-image", "background-size", "background-position", "background-repeat", "background-clip", "-webkit-background-clip", "color"]) {
          el.style.removeProperty(p);
        }
      }
    };
  }, []);
  return null;
}
