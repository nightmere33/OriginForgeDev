"use client";

import { useEffect } from "react";
import { gsap, revealFrom, revealTo, ScrollTrigger } from "./gsap";
import { BEATS, atBeat } from "./intro";

/**
 * Progressive-enhancement reveals (DESIGN.md §6). Render it as the LAST child
 * of each page: inside the page's own Suspense boundary, its effect runs only
 * after the content it animates has hydrated (earlier would mismatch).
 *
 *   [data-choreo]         a section frame: its rule draws, ticks pop, eyebrow settles
 *   [data-reveal]         an element that rises in once when it enters
 *   [data-reveal-group]   children reveal one by one as each arrives; those
 *                         arriving together cascade in reading order
 *   [data-reveal-intro]   a group inside the hero: waits for the intro's copy beat
 *   data-reveal="contents" the element keeps its surface and its children rise
 *                         instead: grid cells on a gap-px hairline grid must stay
 *                         opaque, or the grid's line colour flashes through
 *
 * Nothing is hidden in the server HTML for visitors who prefer reduced
 * motion. For the others, a pre-paint flag (root layout) and the marker this
 * component leaves let globals.css hide these elements from the first paint,
 * so a page never shows, vanishes and rises again; each element is marked
 * `data-shown` once its own starting state is set here, and a CSS failsafe
 * shows anything left after 4s.
 */
/** What actually animates for a [data-reveal] element. */
const targets = (el: HTMLElement): HTMLElement[] =>
  el.dataset.reveal === "contents" ? (Array.from(el.children) as HTMLElement[]) : [el];

// Reveals that start in the same frame (a section scrolled into view, a jump
// to #services) cascade in reading order instead of all at once, as on
// getartcraft.com (measured: each piece ~0.8s, the next one ~0.13s later).
const CASCADE = 0.13;
const CASCADE_MAX = 8; // the ninth and later share the last slot, so a big grid never drags

export default function RevealManager() {
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const cleanups: (() => void)[] = [];
      let queue: HTMLElement[] = [];
      let frame = 0;
      const reveal = (el: HTMLElement) => {
        queue.push(el);
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const batch = queue.map((item) => ({ item, box: item.getBoundingClientRect() }));
          queue = [];
          // Content already scrolled past (a jump to an anchor "enters" it too)
          // settles at once and takes no slot in the cascade.
          const seen = batch.filter(({ box }) => box.bottom > 0 && box.top < innerHeight);
          batch.filter((b) => !seen.includes(b)).forEach(({ item }) => gsap.set(targets(item), { clearProps: "transform,filter,opacity,visibility" }));
          // Reading order: rows top to bottom (8px tolerance), then left to right.
          seen.sort((a, b) => Math.round(a.box.top / 8) - Math.round(b.box.top / 8) || a.box.left - b.box.left);
          seen.forEach(({ item }, i) => gsap.to(targets(item), revealTo({ delay: Math.min(i, CASCADE_MAX) * CASCADE, stagger: 0.05 })));
        });
      };
      cleanups.push(() => cancelAnimationFrame(frame));

      gsap.utils.toArray<HTMLElement>("[data-choreo]").forEach((section) => {
        section.dataset.shown = "";
        const rule = section.querySelector<HTMLElement>("[data-draw-rule]");
        const ticks = section.querySelectorAll<HTMLElement>("[data-draw-tick]");
        const eyebrow = section.querySelector<HTMLElement>("[data-draw-eyebrow]");
        if (rule) gsap.set(rule, { scaleX: 0, transformOrigin: "left center" });
        if (ticks.length) gsap.set(ticks, { scale: 0, autoAlpha: 0 });
        if (eyebrow) gsap.set(eyebrow, revealFrom());
        ScrollTrigger.create({
          trigger: section,
          start: "top 88%",
          once: true,
          onEnter: () => {
            const tl = gsap.timeline();
            if (rule) tl.to(rule, { scaleX: 1, duration: 0.7, ease: "power2.out", clearProps: "transform" }, 0);
            if (eyebrow) tl.to(eyebrow, revealTo(), 0.15);
            if (ticks.length) {
              tl.to(ticks, { scale: 1, autoAlpha: 1, duration: 0.35, stagger: 0.06, ease: "power3.out", clearProps: "all" }, 0.35);
            }
          },
        });
      });

      const take = (el: HTMLElement) => {
        el.dataset.shown = "";
        ScrollTrigger.create({ trigger: el, start: "top 86%", once: true, onEnter: () => reveal(el) });
      };
      gsap.utils.toArray<HTMLElement>("[data-reveal]:not([data-reveal-group] [data-reveal])").forEach((el) => {
        gsap.set(targets(el), revealFrom());
        take(el);
      });
      // Content streamed in after this ran (a later Suspense boundary) is taken
      // over the same way, before the CSS failsafe would show it unanimated.
      const late = () => gsap.utils.toArray<HTMLElement>("[data-reveal]:not([data-shown])").forEach((el) => {
        gsap.set(targets(el), revealFrom());
        take(el);
      });
      const timers = [400, 1200, 2600].map((ms) => window.setTimeout(late, ms));
      cleanups.push(() => timers.forEach(clearTimeout));

      gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
        const items = Array.from(group.querySelectorAll<HTMLElement>("[data-reveal]"));
        if (!items.length) return;
        gsap.set(items.flatMap(targets), revealFrom());
        items.forEach((item) => (item.dataset.shown = ""));

        if (group.hasAttribute("data-reveal-intro")) {
          // Opacity stays set: the copy lands before the intro ends, and the
          // pre-paint rule would hide it again until then.
          cleanups.push(atBeat(BEATS.copy, () => gsap.to(items.flatMap(targets), revealTo({ stagger: 0.08, clearProps: "transform,filter" })), gsap.ticker));
          return;
        }
        // One trigger per item: a tall grid revealed by a single trigger
        // would animate its lower rows while they are still off-screen. Items
        // arriving together cascade through `reveal`.
        items.forEach((item) => {
          ScrollTrigger.create({ trigger: item, start: "top 88%", once: true, onEnter: () => reveal(item) });
        });
      });

      return () => cleanups.forEach((fn) => fn());
    });
    return () => mm.revert();
  }, []);

  // The marker globals.css looks for: this page runs the reveals.
  return <span data-reveal-scope hidden />;
}
