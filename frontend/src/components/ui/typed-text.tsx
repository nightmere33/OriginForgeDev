"use client";

/**
 * Typed text that decodes in, for every text field on the site (DESIGN.md §6).
 *
 * The real <input>/<textarea> keeps everything: typing, selection, autofill,
 * password managers, screen readers, the value that is submitted. Its own
 * text is transparent; a mirror laid exactly over its padding box draws the
 * same text, and each newly typed character flickers through two or three
 * glyphs (ember, red/blue split) before settling. A glyph sits over an
 * invisible copy of its real character, so widths never change and wrapping
 * stays identical in any font; settled characters merge back into plain text
 * runs, so kerning (and the caret) match the field. Off for reduced motion
 * and forced colours.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { SPLIT } from "@/motion/glitch";

const GLYPHS = "!<>/\\[]{}=+*^?#%&01";
const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
// A paste or a programmatic fill flickers only its last characters.
const MAX_FRESH = 24;
const DOT = "•";
export const TEXT_TYPES = new Set(["text", "email", "tel", "search", "url", "password"]);

type Ch = { ch: string; id: number; fresh: boolean };

const QUERY = "(prefers-reduced-motion: reduce), (forced-colors: active)";
const subscribe = (cb: () => void) => {
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** True where the effect may run (not on the server, not for reduced motion or forced colours). */
export function useTypingFx() {
  return useSyncExternalStore(subscribe, () => !matchMedia(QUERY).matches, () => false);
}

/** A character being typed: a few glyphs over an invisible copy of itself, then it reports in. */
function FreshChar({ ch, onSettle }: { ch: string; onSettle: () => void }) {
  const [flicker, setFlicker] = useState(glyph);
  const done = useRef(onSettle);
  useEffect(() => {
    done.current = onSettle;
  });
  useEffect(() => {
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      if (n >= 3) {
        clearInterval(t);
        done.current();
      } else setFlicker(glyph());
    }, 45);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative">
      <span className="invisible">{ch}</span>
      <span className="absolute left-0 top-0" style={{ color: "var(--ember-400)", textShadow: SPLIT.textShadow }}>{flicker}</span>
    </span>
  );
}

// Everything that decides where glyphs land, copied from the field.
const COPIED = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "letterSpacing", "wordSpacing",
  "lineHeight", "textTransform", "textIndent", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
] as const;

/**
 * Drawn beside the field inside a `relative` wrapper. It listens to the field
 * itself (input, scroll, caret moves, resizes); `value` is passed so a
 * controlled field changed from outside (cleared after sending) follows too.
 */
export function TypedMirror({
  field, masked, multiline, value,
}: { field: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; masked: boolean; multiline?: boolean; value?: unknown }) {
  const [chars, setChars] = useState<Ch[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const started = useRef(false);
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    // The field hides its own text only while this mirror runs (TYPED_FIELD).
    el.setAttribute("data-typed", "");
    const place = () => {
      const b = box.current;
      const c = content.current;
      if (!b || !c) return;
      const cs = getComputedStyle(el);
      // Over the field's padding box (inside its border, beside any scrollbar).
      b.style.left = `${el.offsetLeft + el.clientLeft}px`;
      b.style.top = `${el.offsetTop + el.clientTop}px`;
      b.style.width = `${el.clientWidth}px`;
      b.style.height = `${el.clientHeight}px`;
      for (const k of COPIED) (b.style as unknown as Record<string, string>)[k] = cs[k] as string;
      // One line, centred the way a text input centres it.
      if (el.tagName === "INPUT") c.style.lineHeight = `${el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)}px`;
      c.style.transform = `translate3d(${-el.scrollLeft}px, ${-el.scrollTop}px, 0)`;
    };
    const sync = () => {
      const next = Array.from(el.value);
      // The first reading (initial value, autofill before any event) never flickers.
      const flicker = started.current;
      started.current = true;
      setChars((prev) => {
        const old = prev.map((c) => c.ch);
        if (old.length === next.length && old.every((c, i) => c === next[i])) return prev;
        let a = 0;
        while (a < old.length && a < next.length && old[a] === next[a]) a++;
        let b = 0;
        while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
        const mid = next.slice(a, next.length - b);
        const fresh = mid.map((ch, i) => ({ ch, id: ++seq.current, fresh: flicker && !/\s/.test(ch) && i >= mid.length - MAX_FRESH }));
        return [...prev.slice(0, a), ...fresh, ...prev.slice(prev.length - b)];
      });
      requestAnimationFrame(place);
    };
    syncRef.current = sync;
    const placeSoon = () => requestAnimationFrame(place);
    el.addEventListener("input", sync);
    el.addEventListener("scroll", place);
    el.addEventListener("select", placeSoon);
    el.addEventListener("keyup", placeSoon);
    el.addEventListener("focus", placeSoon);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    sync();
    // Autofill and password managers can fill the field without an event.
    const t = window.setTimeout(sync, 300);
    return () => {
      el.removeEventListener("input", sync);
      el.removeEventListener("scroll", place);
      el.removeEventListener("select", placeSoon);
      el.removeEventListener("keyup", placeSoon);
      el.removeEventListener("focus", placeSoon);
      ro.disconnect();
      clearTimeout(t);
      el.removeAttribute("data-typed");
    };
  }, [field]);

  // A controlled value changed from outside.
  useEffect(() => {
    syncRef.current();
  }, [value]);

  const settle = (id: number) => setChars((prev) => prev.map((c) => (c.id === id ? { ...c, fresh: false } : c)));
  const style: CSSProperties = multiline ? { whiteSpace: "pre-wrap", overflowWrap: "break-word" } : { whiteSpace: "pre" };
  // Settled characters as plain runs (kerning intact); the ones being typed as their own spans.
  const parts: ReactNode[] = [];
  let run = "";
  for (const c of chars) {
    const shown = masked ? DOT : c.ch;
    if (!c.fresh) {
      run += shown;
      continue;
    }
    if (run) parts.push(run);
    run = "";
    parts.push(<FreshChar key={c.id} ch={shown} onSettle={() => settle(c.id)} />);
  }
  if (run) parts.push(run);
  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute overflow-hidden text-ink forced-colors:hidden">
      <div ref={content} style={style}>
        {parts}
        {/* A trailing newline still needs its line drawn. */}
        {multiline && "​"}
      </div>
    </div>
  );
}

/**
 * Classes the field takes while mirrored. Its text turns transparent only once
 * the mirror has started (`data-typed`), so a mirror that never runs leaves a
 * plain, readable field.
 */
export const TYPED_FIELD =
  "data-typed:text-transparent caret-ember-400 selection:bg-ember-500/30 forced-colors:text-[CanvasText] " +
  "data-typed:[&:-webkit-autofill]:[-webkit-text-fill-color:transparent] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_var(--color-cell)]";
