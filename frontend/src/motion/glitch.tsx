"use client";

/**
 * The glitch vocabulary (DESIGN.md §6): text that decodes out of random
 * glyphs with a red/blue channel split, and panels that tear in. Used where
 * something is chosen or changes meaning (menus, selects, the currency, a
 * filter), never as idle decoration. Text and transform/clip-path only, no
 * layout change; reduced motion turns it off.
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

// Glyphs a decoding label flickers through (no dashes: they read as punctuation).
const GLYPHS = "!<>/\\[]{}=+*^?#%&01";
const DURATION = 360;
/** The channel split shown while text decodes. */
export const SPLIT: CSSProperties = { textShadow: "1.5px 0 rgb(255 90 78 / 0.85), -1.5px 0 rgb(80 170 255 / 0.85)" };

const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const scramble = (s: string) => [...s].map((c) => (/\s/.test(c) ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join("");
// Amounts flicker through digits only, so with tabular figures the width never jumps.
const scrambleDigits = (s: string) => s.replace(/\d/g, () => String(Math.floor(Math.random() * 10)));

/**
 * `run()` resolves `text` left to right out of random glyphs (~360ms);
 * `glitching` is true meanwhile, for the channel split.
 */
export function useDecode(text: string, length = DURATION, digits = false) {
  // The frame being shown while decoding; null once settled.
  const [frameText, setFrameText] = useState<string | null>(null);
  const frame = useRef(0);

  const run = () => {
    if (reduced()) return;
    cancelAnimationFrame(frame.current);
    let start = 0;
    const step = (now: number) => {
      start ||= now;
      const k = Math.min(1, (now - start) / length);
      const settled = Math.floor(k * text.length);
      if (k < 1) {
        setFrameText(text.slice(0, settled) + (digits ? scrambleDigits : scramble)(text.slice(settled)));
        frame.current = requestAnimationFrame(step);
      } else setFrameText(null);
    };
    frame.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { shown: frameText ?? text, glitching: frameText !== null, run };
}

/** Text that decodes whenever its value changes (not on first paint). `digits` for amounts. */
export function DecodeText({ text, className, digits }: { text: string; className?: string; digits?: boolean }) {
  const { shown, glitching, run } = useDecode(text, digits ? 480 : DURATION, digits);
  const last = useRef(text);
  useEffect(() => {
    if (last.current === text) return;
    last.current = text;
    run();
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={className} style={glitching ? SPLIT : undefined}>
      {shown}
    </span>
  );
}

/**
 * Text that decodes once when it first appears (after `delay` ms). The server
 * sends the final words; on the client they resolve out of glyphs, then stay.
 */
export function BootText({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const { shown, glitching, run } = useDecode(text, 560);
  useEffect(() => {
    const t = window.setTimeout(run, delay);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={className} style={glitching ? SPLIT : undefined}>
      {shown}
    </span>
  );
}

/**
 * The label of a button or link: it decodes when the control is hovered,
 * focused or tapped, and whenever its words change (Sign in → Verifying).
 * Drop it inside the control; it listens on the closest a/button.
 */
export function GlitchLabel({ text, className }: { text: string; className?: string }) {
  const { shown, glitching, run } = useDecode(text);
  const ref = useRef<HTMLSpanElement>(null);
  const latest = useRef(run);
  const last = useRef(text);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (last.current === text) return;
    last.current = text;
    run();
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const host = ref.current?.closest("a, button, [role=button]");
    if (!host) return;
    const go = () => latest.current();
    host.addEventListener("pointerenter", go);
    host.addEventListener("focus", go);
    return () => {
      host.removeEventListener("pointerenter", go);
      host.removeEventListener("focus", go);
    };
  }, []);
  return (
    <span ref={ref} className={className} style={glitching ? SPLIT : undefined}>
      {shown}
    </span>
  );
}

/** Tear a freshly opened panel in: horizontal slices and a skew jitter, then settle. */
export function tearIn(el: Element | null, delay = 0) {
  if (!el || reduced()) return;
  el.animate(
    [
      { opacity: 0, transform: "translate3d(-6px,0,0) skewX(10deg)", clipPath: "inset(0 0 100% 0)" },
      { opacity: 1, transform: "translate3d(4px,0,0) skewX(-6deg)", clipPath: "inset(0 0 55% 0)", offset: 0.3 },
      { transform: "translate3d(-3px,0,0) skewX(3deg)", clipPath: "inset(35% 0 0 0)", offset: 0.55 },
      { transform: "translate3d(1px,0,0)", clipPath: "inset(0 0 12% 0)", offset: 0.8 },
      { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" },
    ],
    { duration: 320, delay, easing: "steps(10, end)", fill: "backwards" },
  );
}

/** Close a popover on Escape or a press outside `root`. */
export function useDismiss(open: boolean, root: RefObject<HTMLElement | null>, setOpen: (open: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, root, setOpen]);
}
