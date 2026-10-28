"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "./gsap";
import { rulerMap } from "./ruler-map";
import SectionTitles from "./section-titles";
import { frameScroll, scrollToY } from "./smooth";

/** A section on the rail: `at` is its fraction of the scroll range, `top` its page offset. */
type Mark = { id: string; label: string; at: number; top: number };

const TICKS = Array.from({ length: 101 }, (_, i) => i); // one per 1% of the page
const DIGITS = "0123456789".split("");
const INTENT = 150; // ms the pointer rests on the rail before it zooms out (edge grazes don't fire)
const GRACE = 150; // ms after leaving before it zooms back in
const SETTLE = 0.1; // s, time constant of the zoom ease (exponential, like a spring with no overshoot)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The scroll instrument (DESIGN.md §5): replaces the native scrollbar for
 * fine pointers on laptop-class screens and up (≥1024px, as on
 * getartcraft.com). Where the viewport leaves no gutter beside the 1280 rail,
 * content flows under it and a frosted strip keeps the ticks readable.
 *
 * Two scales on one mapping. At rest the ruler is 1:1 with the page: a tick
 * per 1% of the document, sliding past as you scroll. Hovering zooms it out
 * until the whole page fits the rail, with a window showing what is on
 * screen; leaving zooms back in. A page point `d` sits at
 * `needle + (d - d0) * k`, where `k` eases from 1 to rail/page and `d0` keeps
 * the needle reading the scroll progress, so both scales agree with the
 * read-out, the section ticks and the window. Pressing zooms out at once and
 * glides to that point of the page; dragging scrubs it, the page easing
 * behind the pointer. Section names live in SectionTitles. Sections opt in
 * with `data-ruler="Label"` and an id.
 */
export default function ScrollRuler() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const markRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const marksRef = useRef<Mark[]>([]);
  // Odometer read-out: one 0-9 column per digit, rolled with a CSS transform.
  const digitRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostReadoutRef = useRef<HTMLSpanElement>(null);
  // Zoom state, driven from the ticker: `z` eases toward `target` (0 rest, 1 overview).
  const zoom = useRef({ z: 0, target: 0, timer: 0, pointer: -1, k: 1, needle: 0, d0: 0, dragging: false, pressY: 0, moved: 0 });

  useEffect(() => {
    // Desktop only (as on getartcraft.com): a hover-capable fine pointer on a
    // laptop-class screen, and never a phone or tablet browser (a tablet with
    // a mouse attached still reports a fine pointer).
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const query = matchMedia("(pointer: fine) and (hover: hover) and (min-width: 1024px)");
    const update = () => setEnabled(!mobileUa && query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Measure section positions; re-measure whenever the page changes size.
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("has-ruler");
    const measure = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      // Rendered sections only: client navigation keeps earlier pages mounted
      // but hidden (React Activity), so the same ids can exist twice.
      const seen = new Set<string>();
      setMarks(
        Array.from(document.querySelectorAll<HTMLElement>("[data-ruler][id]"))
          .filter((el) => el.getClientRects().length > 0 && !seen.has(el.id) && seen.add(el.id))
          .map((el) => {
            const top = el.getBoundingClientRect().top + scrollY;
            return { id: el.id, label: el.dataset.ruler ?? el.id, top, at: Math.min(1, Math.max(0, (top - 48) / max)) };
          }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      ro.disconnect();
      document.documentElement.classList.remove("has-ruler");
    };
  }, [enabled, pathname]);

  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);

  // Ticks, window, needle and read-out follow scroll and zoom every frame (no React renders).
  useEffect(() => {
    if (!enabled) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const state = zoom.current;
    let lastDigits = "";
    let lastKey = "";
    // Geometry is read on resize only: reading layout in the frame loop, after
    // other tickers wrote transforms, forced a synchronous layout per scrolled frame.
    const geo = { docH: 1, track: 1, top: 0 };
    const measure = () => {
      const rail = railRef.current;
      if (!rail) return;
      geo.docH = Math.max(1, document.documentElement.scrollHeight);
      geo.track = rail.clientHeight;
      geo.top = rail.getBoundingClientRect().top;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (railRef.current) ro.observe(railRef.current);
    const tick = (_time: number, deltaMs: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const dt = Math.min(0.1, deltaMs / 1000);
      state.z = reduced.matches ? state.target : state.z + (state.target - state.z) * (1 - Math.exp(-dt / SETTLE));
      if (Math.abs(state.target - state.z) < 0.0005) state.z = state.target;

      const { docH, track } = geo;
      const vh = innerHeight;
      const max = Math.max(1, docH - vh);
      const sy = Math.min(max, Math.max(0, frameScroll()));
      const key = `${sy}|${state.z}|${docH}|${track}|${state.pointer}`;
      if (key === lastKey) return;
      lastKey = key;

      const p = sy / max;
      state.k = 1 + (track / docH - 1) * state.z;
      state.needle = p * track;
      state.d0 = sy + p * vh; // the page point under the needle
      const at = (d: number) => state.needle + (d - state.d0) * state.k;
      Object.assign(rulerMap, { z: state.z, top: geo.top, k: state.k, needle: state.needle, d0: state.d0 });

      tickRefs.current.forEach((el, i) => el && (el.style.transform = `translate3d(0, ${at((i / 100) * docH)}px, 0)`));
      labelRefs.current.forEach((el, i) => el && (el.style.transform = `translate3d(0, ${at((i / 10) * docH)}px, 0) translateY(-50%)`));
      marksRef.current.forEach((m, i) => {
        const el = markRefs.current[i];
        if (el) el.style.transform = `translate3d(0, ${at(m.top)}px, 0)`;
      });
      if (windowRef.current) {
        windowRef.current.style.transform = `translate3d(0, ${at(sy)}px, 0)`;
        windowRef.current.style.height = `${vh * state.k}px`;
        windowRef.current.style.opacity = String(state.z);
      }
      if (needleRef.current) needleRef.current.style.transform = `translate3d(0, ${state.needle}px, 0)`;
      const digits = String(Math.round(p * 100)).padStart(3, "0");
      if (digits !== lastDigits) {
        lastDigits = digits;
        digitRefs.current.forEach((col, i) => col && (col.style.transform = `translateY(${-Number(digits[i])}em)`));
      }
      // The hover read-out names the page point under the cursor, in either scale.
      if (state.pointer >= 0 && ghostRef.current && ghostReadoutRef.current) {
        const d = state.d0 + (state.pointer - state.needle) / state.k;
        ghostRef.current.style.transform = `translate3d(0, ${state.pointer}px, 0)`;
        ghostReadoutRef.current.textContent = `${String(Math.round(clamp01(d / docH) * 100)).padStart(3, "0")}%`;
      }
    };
    gsap.ticker.add(tick);
    tick(0, 16);
    const relax = () => {
      clearTimeout(state.timer);
      state.dragging = false;
      state.pointer = -1;
      state.target = 0;
    };
    const onVisibility = () => document.hidden && relax();
    addEventListener("blur", relax);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      gsap.ticker.remove(tick);
      ro.disconnect();
      clearTimeout(state.timer);
      removeEventListener("blur", relax);
      document.removeEventListener("visibilitychange", onVisibility);
      rulerMap.z = 0;
    };
  }, [enabled]);

  if (!enabled) return null;

  const localY = (clientY: number) => clientY - railRef.current!.getBoundingClientRect().top;
  const setTarget = (target: number, delay: number) => {
    const state = zoom.current;
    clearTimeout(state.timer);
    state.timer = window.setTimeout(() => (state.target = target), delay);
  };
  // The scroll position whose needle sits under the pointer: absolute, not
  // relative to the current scroll, so a drag never feeds back on itself.
  const progressAt = (clientY: number) =>
    clamp01(localY(clientY) / railRef.current!.clientHeight) * Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = zoom.current;
    if (!state.dragging) return;
    state.dragging = false;
    const rail = e.currentTarget;
    rail.style.cursor = "";
    if (rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
    // A press that didn't travel is a click: glide there.
    if (state.moved <= 4) scrollToY(progressAt(e.clientY));
    // Capture swallowed the leave: if the release happened off the rail,
    // zoom back in ourselves (otherwise it could stay zoomed).
    const r = rail.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) {
      state.pointer = -1;
      if (ghostRef.current) ghostRef.current.style.opacity = "0";
      setTarget(0, GRACE);
    }
  };

  return (
    <>
    <SectionTitles marks={marks} />
    <aside
      aria-hidden
      data-print-hide
      className="pointer-events-none fixed bottom-6 right-0 top-[calc(var(--nav-h)+1.75rem)] z-40 w-14"
    >
      {/* No gutter below 1400px: content passes under the rail, frosted here so the ticks read. */}
      <div className="ruler-frost frost absolute -inset-y-6 right-0 w-16" />
      <div
        ref={railRef}
        className="pointer-events-auto absolute inset-y-0 right-0 w-12 cursor-crosshair touch-none select-none"
        onPointerEnter={() => setTarget(1, INTENT)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          // No text selection, no focus jump: the rail is a handle.
          e.preventDefault();
          const state = zoom.current;
          state.dragging = true;
          state.pressY = e.clientY;
          state.moved = 0;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.style.cursor = "grabbing";
          // A press zooms out at once (no hover intent).
          clearTimeout(state.timer);
          state.target = 1;
        }}
        onPointerMove={(e) => {
          const state = zoom.current;
          state.pointer = localY(e.clientY);
          if (ghostRef.current) ghostRef.current.style.opacity = "1";
          if (!state.dragging) return;
          // Thumb drag: the needle follows the cursor, the page easing behind it.
          state.moved = Math.max(state.moved, Math.abs(e.clientY - state.pressY));
          scrollToY(progressAt(e.clientY), { scrub: true });
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={(e) => {
          if (zoom.current.dragging) endDrag(e);
        }}
        onPointerLeave={() => {
          // Captured during a drag; endDrag handles a release off the rail.
          if (zoom.current.dragging) return;
          zoom.current.pointer = -1;
          if (ghostRef.current) ghostRef.current.style.opacity = "0";
          setTarget(0, GRACE);
        }}
      >
        {/* Ticks slide, so they live in a clipped layer that fades at both ends. */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ maskImage: "linear-gradient(to bottom, transparent, #000 1.5rem, #000 calc(100% - 1.5rem), transparent)" }}
        >
          {TICKS.map((v) => (
            <span
              key={v}
              ref={(el) => {
                tickRefs.current[v] = el;
              }}
              className="absolute right-0 top-0 h-px bg-line-strong"
              style={{ width: v % 10 === 0 ? 16 : v % 5 === 0 ? 11 : 6, opacity: v % 5 === 0 ? 1 : 0.55 }}
            />
          ))}
          {TICKS.filter((v) => v % 10 === 0).map((v, i) => (
            <span
              key={`l${v}`}
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              className="hud absolute right-5 top-0 text-faint"
            >
              {v}
            </span>
          ))}
          {marks.map((m, i) => (
            <span
              key={m.id}
              ref={(el) => {
                markRefs.current[i] = el;
              }}
              className="absolute right-0 top-0 h-px w-6 -translate-y-px bg-ember-500"
            />
          ))}
        </div>
        {/* What is on screen, drawn on the overview (fades in with the zoom). */}
        <div ref={windowRef} className="pointer-events-none absolute inset-x-0 top-0 opacity-0">
          <span className="absolute inset-0 bg-ink/[0.07]" />
          <span className="absolute inset-x-0 top-0 h-px bg-ink/50" />
          <span className="absolute inset-x-0 bottom-0 h-px bg-ink/50" />
        </div>
        {/* Overlays never catch the pointer: they reach left of the rail, and hovering
            one would keep the map open after the pointer has left the strip. */}
        <div ref={ghostRef} className="pointer-events-none absolute right-0 top-0 flex items-center opacity-0 transition-opacity duration-[var(--dur-micro)]">
          <span ref={ghostReadoutRef} className="hud mr-1 text-muted" />
          <span className="h-px w-10 bg-steel-300" />
        </div>
        <div ref={needleRef} className="pointer-events-none absolute right-0 top-0 flex items-center will-change-transform">
          <span className="hud mr-1 inline-flex -translate-y-px bg-steel-950 px-1 leading-none text-ember-400">
            {[0, 1, 2].map((i) => (
              <span key={i} className="inline-block h-[1em] overflow-hidden">
                <span
                  ref={(el) => {
                    digitRefs.current[i] = el;
                  }}
                  className="flex flex-col transition-transform duration-[280ms] ease-[var(--ease-out)] motion-reduce:transition-none"
                >
                  {DIGITS.map((d) => <span key={d} className="h-[1em]">{d}</span>)}
                </span>
              </span>
            ))}
            %
          </span>
          <span className="h-px w-12 bg-ember-400 shadow-[0_0_12px_var(--ember-500)]" />
        </div>
      </div>
    </aside>
    </>
  );
}
