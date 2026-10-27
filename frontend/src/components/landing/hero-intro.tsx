"use client";

import { useEffect } from "react";
import { gsap } from "@/motion/gsap";
import { BEATS, WORD_DUR, atBeat, introClock } from "@/motion/intro";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const SHADOW = "drop-shadow(0 0 24px rgb(255 106 26 / 0.35))";
// Share of the formation the mark holds the line before it lifts to its slot.
const LIFT_FROM = 0.4;

/**
 * The hero's own intro (DESIGN.md §6), in the spirit of getartcraft.com's:
 * the OF mark ignites alone, large, at the centre of the word (an ember bloom
 * that cools to steel). Then the word forms out of it: each half of
 * ORIGINFORGE slides outward from behind the mark as one surface, cut at the
 * mark's edge like a blade. Then the mark lifts to its own slot like a lid,
 * and the middle of the word closes up beneath it. One specular sweep
 * crosses the finished letters.
 *
 * Driven every frame by the shared intro clock, so input fast-forward and
 * the return-visit speed apply. Elements start hidden by the pre-paint
 * `data-intro-hide` rule; with no intro they simply stay visible.
 */
export default function HeroIntro() {
  useEffect(() => {
    if (introClock.done) return;
    const mark = document.querySelector<HTMLElement>("[data-hero-mark]");
    const glow = document.querySelector<HTMLElement>("[data-hero-glow]");
    const letters = gsap.utils.toArray<HTMLElement>("[data-wm-letter]");
    // The letters' parent carries the steel fill and its sheen layer.
    const word = letters[0]?.parentElement ?? null;
    if (!mark || !word || !letters.length) return;

    const tl = gsap.timeline({ paused: true });
    if (glow) tl.fromTo(glow, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 1.6, ease: "power2.out" }, BEATS.mark);
    // One sheen glides through the glyphs on a gentle ease, fading in as it
    // enters and out as it leaves, so it never pops on or off.
    const at = BEATS.letters + WORD_DUR * 0.6;
    tl.fromTo(word, { "--sheen-x": "-40%" }, { "--sheen-x": "140%", duration: 1.8, ease: "sine.inOut" }, at);
    tl.fromTo(word, { "--sheen-a": 0 }, { "--sheen-a": 1, duration: 0.6, ease: "sine.out" }, at);
    tl.to(word, { "--sheen-a": 0, duration: 0.7, ease: "sine.in" }, at + 1.1);

    // Where the mark rests, in the word's own coordinates (the letters'
    // offsetLeft is relative to the word, and ignores transforms).
    let rest = { cx: 0, dy: 0, w: 0, scale: 1 };
    const measure = () => {
      mark.style.transform = "";
      const m = mark.getBoundingClientRect();
      const w = word.getBoundingClientRect();
      rest = {
        cx: m.left + m.width / 2 - w.left,
        dy: w.top + w.height / 2 - (m.top + m.height / 2),
        w: m.width,
        // Large enough to stand for the word while it hides inside.
        scale: Math.min(2.4, Math.max(1, (w.height * 0.95) / m.height)),
      };
    };
    measure();
    let stale = false;
    const ro = new ResizeObserver(() => (stale = true));
    ro.observe(word);

    const clear = () => {
      mark.style.transform = "";
      mark.style.filter = "";
      mark.style.opacity = "1";
      for (const el of letters) {
        el.style.transform = "";
        el.style.clipPath = "";
        // Explicit values, not "": the pre-paint rule hides them until the intro ends.
        el.style.opacity = "1";
        el.style.visibility = "visible";
      }
    };

    let formed = false;
    const frame = () => {
      const t = introClock.t;
      if (introClock.done || t >= tl.duration()) {
        tl.progress(1);
        if (!formed) clear();
        gsap.ticker.remove(frame);
        return;
      }
      tl.time(t);
      if (formed) return;
      if (stale) {
        stale = false;
        measure();
      }
      const lit = easeOut(clamp01(t / 0.9));
      const f = clamp01((t - BEATS.letters) / WORD_DUR);
      if (f >= 1) {
        formed = true;
        clear();
        return;
      }

      // The mark: ignites at the word's centre, holds the line while the word
      // slides out, then lifts to its slot.
      const lift = easeInOut(clamp01((f - LIFT_FROM) / (1 - LIFT_FROM)));
      const n = letters.length;
      const left = letters[0].offsetLeft;
      const right = letters[n - 1].offsetLeft + letters[n - 1].offsetWidth;
      const cx = (left + right) / 2;
      const scale = rest.scale + (1 - rest.scale) * lift;
      const mx = (cx - rest.cx) * (1 - lift);
      mark.style.opacity = String(clamp01(t / 0.3));
      mark.style.transform = `translate3d(${mx.toFixed(1)}px, ${(rest.dy * (1 - lift)).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      mark.style.filter = lit < 1 ? `blur(${(10 * (1 - lit)).toFixed(2)}px) brightness(${(1 + 1.2 * (1 - lit)).toFixed(3)}) ${SHADOW}` : "";

      // The word: two surfaces, each tucked behind the mark and sliding out
      // through its edge. The blade closes as the mark lifts off the line.
      if (f <= 0) return;
      const blade = (rest.w / 2) * scale * (1 - lift) ** 2;
      const bladeL = cx + mx - blade;
      const bladeR = cx + mx + blade;
      const slide = 1 - easeOut(f);
      const tuck = rest.w * 0.1;
      const offL = (bladeL - left + tuck) * slide;
      const offR = -(right - bladeR + tuck) * slide;
      for (const el of letters) {
        const x0 = el.offsetLeft;
        const x1 = x0 + el.offsetWidth;
        const isLeft = (x0 + x1) / 2 < cx;
        const o = isLeft ? offL : offR;
        el.style.opacity = "1";
        el.style.visibility = "visible";
        el.style.transform = `translate3d(${o.toFixed(1)}px, 0, 0)`;
        const cut = isLeft ? x1 + o - bladeL : bladeR - (x0 + o);
        el.style.clipPath = cut > 0.5 ? (isLeft ? `inset(-20% ${cut.toFixed(1)}px -20% 0)` : `inset(-20% 0 -20% ${cut.toFixed(1)}px)`) : "";
      }
    };
    gsap.ticker.add(frame);
    const stop = atBeat(BEATS.end, () => tl.progress(1), gsap.ticker);
    return () => {
      gsap.ticker.remove(frame);
      ro.disconnect();
      stop();
      tl.progress(1).kill();
      clear();
    };
  }, []);

  return null;
}
