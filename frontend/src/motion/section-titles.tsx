"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "./gsap";
import { introClock } from "./intro";
import { onRuler, rulerMap } from "./ruler-map";
import { frameScroll } from "./smooth";

export type TitleMark = { id: string; label: string; top: number };

/**
 * The scroll instrument's section titles (DESIGN.md §6), letter by letter:
 *
 *   queued   small, stacked at the bottom right: the sections still ahead
 *   current  larger, under the stack: the section being read
 *   passed   small, stacked at the top right: the sections behind
 *
 * Every letter's place is a pure function of the scroll position, so the
 * titles flow up as you read down and flow back on scroll-up. Letters leave
 * one after another along a slight arc. On the home page the hero's own
 * wordmark's own letters fly into the stack and back (as on
 * getartcraft.com): never a copy, so nothing is swapped, hidden or re-shown.
 *
 * While the scroll ruler is zoomed out to the whole page, every title flies
 * to its own section's place on it (a map of the page), and back on leave.
 *
 * Transforms and opacity only, written on the GSAP ticker when the scroll
 * or the ruler moved. Reduced motion: titles change state without the flight.
 */
const BASE = 34; // px the letters are rendered at; every state is a scale of it
const SMALL = 11; // queued and passed titles, px
const ROW = 16; // px between stacked titles
// The wordmark's own letters carry their font box lower than an overlay title
// of the same size (measured: 7px at 11px), so stacked they would sit on the
// next row. They are lifted by that much, in proportion to the stack size.
const HERO_LIFT = 0.64 * SMALL;
const STAGGER = 0.045; // share of the transition each letter waits after the previous
const ARC = 18; // px the letters bow out to the left mid-flight
const FROST_TOP = 92; // the top frost starts under the sticky section eyebrow, never over it
const MAP = 13; // px, titles laid along the zoomed-out ruler

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
// Size settles early in a flight (letters shrink, then travel), as on getartcraft.com.
const early = (v: number) => 1 - (1 - v) ** 3;

export default function SectionTitles({ marks }: { marks: TitleMark[] }) {
  const letters = useRef<(HTMLSpanElement | null)[][]>([]);
  const widths = useRef<number[][]>([]);
  const frostTop = useRef<HTMLDivElement>(null);
  const frostBottom = useRef<HTMLDivElement>(null);

  // Measure each letter at the base size once per set of titles (and drop
  // refs left over from a longer previous set).
  useLayoutEffect(() => {
    letters.current.length = marks.length;
    letters.current.forEach((row, i) => row && (row.length = marks[i].label.length));
    widths.current = letters.current.map((row) => (row ?? []).map((el) => el?.offsetWidth ?? BASE * 0.7));
  }, [marks]);

  useEffect(() => {
    if (!marks.length) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heroLetters = Array.from(document.querySelectorAll<HTMLElement>("[data-wm-letter]")).filter((el) => el.getClientRects().length > 0);
    const heroMode = marks[0].id === "hero" && heroLetters.length === marks[0].label.length;
    let last = "";
    let hero: { x: number; y: number; scale: number }[] = [];
    // The letters' resting place, page offsets so they hold while scrolled:
    // measured with our transforms off (never during the intro, whose
    // letters are still rising), at the handoff and on resize.
    const measureHero = () => {
      if (!heroMode || !introClock.done) return;
      const saved = heroLetters.map((el) => el.style.transform);
      heroLetters.forEach((el) => (el.style.transform = ""));
      const size = parseFloat(getComputedStyle(heroLetters[0]).fontSize) || BASE;
      const sy = frameScroll();
      hero = heroLetters.map((el) => {
        const r = el.getBoundingClientRect();
        // The wordmark sets line-height 0.9; a title letter box is 1em tall.
        return { x: r.left, y: r.top + sy - size * 0.05, scale: size / BASE };
      });
      heroLetters.forEach((el, i) => (el.style.transform = saved[i]));
    };
    const rest = () => {
      for (const el of heroLetters) {
        el.style.transform = "";
        el.style.opacity = "";
      }
    };
    if (heroMode) heroLetters.forEach((el) => (el.style.transformOrigin = "0 0"));
    const onResize = () => {
      measureHero();
      last = "";
    };
    addEventListener("resize", onResize);

    let handedOff = false;
    const tick = () => {
      const y = frameScroll();
      const vw = innerWidth;
      const vh = innerHeight;
      const z = rulerMap.z;
      const key = `${y}|${vw}|${vh}|${z}|${z > 0 ? rulerMap.top + rulerMap.d0 : 0}`;
      if (key === last) return;
      last = key;

      const n = marks.length;
      const gutter = (vw - 1280) / 2;
      const current = Math.min(24, Math.max(13, gutter * 0.11)) / BASE;
      const small = SMALL / BASE;
      const right = vw - 64; // left of the rail
      const top = 48 + 56; // under the nav and the sticky section eyebrow
      const focus = y + vh * 0.4;
      const span = vh * 0.55;
      // How far each title is into "current" (a) and into "passed" (p).
      const a = marks.map((m, i) => (i === 0 ? 1 : clamp01((focus - m.top) / span + 0.5)));
      if (heroMode) a[0] = 1;
      const p = marks.map((_, i) => (heroMode && i === 0 ? clamp01(y / (vh * 0.45)) : i < n - 1 ? a[i + 1] : 0));
      const snap = (v: number) => (reduced ? (v >= 0.5 ? 1 : 0) : v);
      // The hero letters are ours to move once the intro is over and the page
      // has left the very top; at rest they are the wordmark again, untouched.
      // Opening the ruler map at the top never moves them (as on getartcraft.com).
      const handoff = heroMode && introClock.done && y > 1;
      if (handoff !== handedOff) {
        if (handoff) measureHero();
        else rest();
        handedOff = handoff;
      }

      let passedRows = 0;
      let maxCurrentWidth = 0;
      let currentShown = 0; // how much of a "current" title is on screen (0..1)
      for (let i = 0; i < n; i++) {
        const row = letters.current[i] ?? [];
        const w = widths.current[i] ?? [];
        const total = w.reduce((s, v) => s + v, 0);
        const L = row.length;
        const share = 1 - (L - 1) * STAGGER;
        let offset = 0;
        const isHeroRow = heroMode && i === 0;
        for (let j = 0; j < L; j++) {
          // The hero row moves the wordmark's own letters; its overlay copy only gives widths.
          const el = isHeroRow ? (handoff ? heroLetters[j] : null) : row[j];
          if (!el) continue;
          const ar = snap(clamp01((a[i] - j * STAGGER) / share));
          const pr = snap(clamp01((p[i] - j * STAGGER) / share));
          const aj = smooth(ar);
          const pj = smooth(pr);
          const as = early(ar);
          const ps = early(pr);
          const isHero = heroMode && i === 0;
          // Weights of the three states for this letter.
          const q = isHero ? 0 : 1 - aj;
          const c = isHero ? 0 : aj - pj;
          const h = isHero ? 1 - pj : 0;
          const pa = pj;
          const at = (scale: number) => right - total * scale + offset * scale;
          const yQueue = vh - 34 - (n - 1 - i) * ROW;
          const yCurrent = top + passedRows * ROW + 4;
          const yPassed = top + i * ROW;
          let x = q * at(small) + c * at(current) + pa * at(small);
          let ty = q * yQueue + c * yCurrent + pa * (yPassed - (isHero ? HERO_LIFT : 0));
          // Scale blends with the early-settling weights.
          let k = isHero ? ps * small : (1 - as) * small + (as - ps) * current + ps * small;
          if (isHero && hero[j]) {
            x += h * hero[j].x;
            ty += h * (hero[j].y - y);
            k += (1 - ps) * hero[j].scale;
          }
          if (!reduced) x -= (Math.sin(Math.PI * aj) * (isHero ? 0 : 1) + Math.sin(Math.PI * pj)) * ARC;
          let alpha = q * 0.5 + c + pa * 0.62 + h;
          // Zoomed-out ruler: letters leave one after another for the title's place on the map.
          // The hero wordmark joins the map only as far as it has already left
          // the hero for the stack, so the map never dismantles it in place.
          const mapShare = 1 - (L - 1) * STAGGER * 0.5;
          const ov = (z > 0 ? (reduced ? z : smooth(clamp01((z - j * STAGGER * 0.5) / mapShare))) : 0) * (isHeroRow ? p[i] : 1);
          if (ov > 0) {
            const mk = MAP / BASE;
            x += (right - total * mk + offset * mk - x) * ov;
            ty += (onRuler(marks[i].top) - MAP / 2 - ty) * ov;
            k += (mk - k) * ov;
            alpha += (0.55 + 0.45 * (a[i] - p[i]) - alpha) * ov;
          }
          if (isHero && hero[j]) {
            // Relative to the letter's resting place, scaled from its top-left.
            const b = hero[j];
            el.style.transform = `translate3d(${x - b.x}px, ${ty - (b.y - y)}px, 0) scale(${k / b.scale})`;
          } else el.style.transform = `translate3d(${x}px, ${ty}px, 0) scale(${k})`;
          el.style.opacity = String(alpha);
          offset += w[j] ?? 0;
        }
        passedRows += p[i];
        // The hero wordmark, while still in the hero, is not a top-right title.
        if (!(heroMode && i === 0)) {
          currentShown += a[i] - p[i];
          maxCurrentWidth = Math.max(maxCurrentWidth, total * current * (a[i] - p[i]));
        }
      }

      // Frost behind the stacks, sized to what they hold.
      if (frostTop.current) {
        // Frost only behind titles that are actually there (no empty blurred box).
        const topContent = passedRows + currentShown;
        frostTop.current.style.height = `${top - FROST_TOP + passedRows * ROW + currentShown * current * BASE + 28}px`;
        frostTop.current.style.width = `${Math.max(180, maxCurrentWidth + 96)}px`;
        frostTop.current.style.opacity = String(Math.min(1, topContent * 2) * (1 - z));
      }
      if (frostBottom.current) {
        const queued = a.reduce((s, v) => s + (1 - v), 0);
        frostBottom.current.style.height = `${queued * ROW + 48}px`;
        frostBottom.current.style.opacity = queued > 0.05 ? String(1 - z) : "0";
      }
    };
    gsap.ticker.add(tick);
    tick();
    return () => {
      gsap.ticker.remove(tick);
      removeEventListener("resize", onResize);
      if (heroMode) {
        rest();
        heroLetters.forEach((el) => (el.style.transformOrigin = ""));
      }
    };
  }, [marks]);

  if (!marks.length) return null;
  const frost = {
    backdropFilter: "blur(9px)",
    WebkitBackdropFilter: "blur(9px)",
    background: "color-mix(in srgb, var(--bg) 72%, transparent)",
  } as const;
  // The pool's fade ends inside its own box: an ellipse whose radii are the box
  // itself, from its corner, gone by 96 %, so no side of the rectangle ever
  // shows as an edge. The letters carry their own halo (below); this only
  // calms busy content behind the stack.
  const pool = (corner: string) => {
    const mask = `radial-gradient(100% 100% at 100% ${corner}, #000 32%, rgb(0 0 0 / 0.78) 50%, rgb(0 0 0 / 0.45) 66%, rgb(0 0 0 / 0.18) 80%, rgb(0 0 0 / 0.04) 90%, transparent 96%)`;
    return { ...frost, maskImage: mask, WebkitMaskImage: mask };
  };
  // Each letter's own shadow: a tight edge, then a soft wide glow, in the page colour.
  const halo = "0 0 2px var(--bg), 0 0 6px var(--bg), 0 0 16px color-mix(in srgb, var(--bg) 80%, transparent)";

  return (
    <div aria-hidden data-print-hide className="pointer-events-none fixed inset-0 z-[39] overflow-hidden">
      <div ref={frostTop} className="absolute right-14 opacity-0" style={{ ...pool("0%"), top: FROST_TOP }} />
      <div ref={frostBottom} className="absolute bottom-0 right-14 w-56 opacity-0 transition-opacity duration-300" style={pool("100%")} />
      {marks.map((m, i) => (
        <span key={m.id}>
          {[...m.label.toUpperCase()].map((ch, j) => (
            <span
              key={j}
              ref={(el) => {
                (letters.current[i] ??= [])[j] = el;
              }}
              className={`absolute left-0 top-0 origin-top-left whitespace-pre font-display uppercase leading-none tracking-[-0.02em] [font-stretch:125%] [font-weight:760] ${
                i === 0 && m.id === "hero" ? "steel-text" : "text-ink-strong"
              }`}
              style={{ fontSize: BASE, opacity: 0, visibility: i === 0 && m.id === "hero" ? "hidden" : undefined, textShadow: i === 0 && m.id === "hero" ? undefined : halo }}
            >
              {ch}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
