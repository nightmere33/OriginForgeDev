"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Progressive motion: the server renders the final state; on the client (motion
 * allowed) the element is armed (`data-armed`, back to its start) and plays
 * once it is seen (`data-seen`). Attributes, not state: no re-render.
 */
function useArmed(ref: RefObject<Element | null>, onSeen?: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    el.setAttribute("data-armed", "");
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.setAttribute("data-seen", "");
      onSeen?.();
      io.disconnect();
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// Five stars in one 128×24 box (24 wide, 2 apart).
const STAR = "12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26";
const W = 128;
const fillWidth = (v: number) => {
  const n = Math.floor(Math.max(0, Math.min(5, v)));
  return n >= 5 ? W : n * 26 + (v - n) * 24;
};

/**
 * A gold rating. The gold is a bar clipped to the star shapes, so partial
 * scores (4.6) fill partially; when first seen it fills left to right and a
 * glint runs across, on the stars only.
 */
export function Stars({ value, label, className }: { value: number; label: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  useArmed(ref);
  const stars = [0, 1, 2, 3, 4].map((i) => <polygon key={i} points={STAR} transform={`translate(${i * 26} 0)`} />);
  return (
    <svg ref={ref} role="img" aria-label={label} viewBox={`0 0 ${W} 24`} className={cn("stars h-4 w-auto overflow-visible", className)}>
      <defs>
        <clipPath id={`c${id}`}>{stars}</clipPath>
        <linearGradient id={`g${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.9" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="var(--line-strong)">{stars}</g>
      <g clipPath={`url(#c${id})`}>
        <rect className="stars-gold" width={W} height="24" fill="var(--gold-400)" style={{ ["--f" as string]: fillWidth(value) / W }} />
        <rect className="stars-glint" x="-36" width="28" height="24" fill={`url(#g${id})`} />
      </g>
    </svg>
  );
}

/** Choose 1–5 stars: a radio group (arrow keys, Home/End), gold that follows the pointer. */
export function StarInput({ value, onChange, labels, name }: { value: number; onChange: (v: number) => void; labels: string[]; name: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const onKey = (e: KeyboardEvent) => {
    const next = { ArrowRight: value + 1, ArrowUp: value + 1, ArrowLeft: value - 1, ArrowDown: value - 1, Home: 1, End: 5 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(Math.max(1, Math.min(5, next)));
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div role="radiogroup" aria-label={name} onKeyDown={onKey} onPointerLeave={() => setHover(0)} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={labels[n - 1]}
            tabIndex={value === n || (!value && n === 1) ? 0 : -1}
            onPointerEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className={cn(
              "p-1 transition-[color,transform] duration-200 ease-[var(--ease-out)] hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ember-400 motion-reduce:hover:scale-100",
              n <= shown ? "text-gold-400" : "text-line-strong",
            )}
          >
            <Star aria-hidden className="size-8" fill="currentColor" strokeWidth={1.2} />
          </button>
        ))}
      </div>
      <span aria-live="polite" className="hud text-muted">{shown ? labels[shown - 1] : ""}</span>
    </div>
  );
}

/** The average, counting up from zero once seen (1 decimal, the visitor's locale). */
export function CountUp({ value, lang, className }: { value: number; lang: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const raf = useRef(0);
  useArmed(ref, () => {
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 1400);
      if (ref.current) ref.current.textContent = fmt.format(value * (1 - Math.pow(1 - t, 4)));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  });
  useEffect(() => {
    // Armed: start from zero (the server sent the real score for no-JS and crawlers).
    if (ref.current?.hasAttribute("data-armed") && !ref.current.hasAttribute("data-seen")) ref.current.textContent = fmt.format(0);
    return () => cancelAnimationFrame(raf.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={cn("tabular-nums", className)}>{fmt.format(value)}</span>;
}

/** A distribution bar that grows to its share once seen. */
export function Bar({ share, delay = 0, className }: { share: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useArmed(ref);
  return (
    <span ref={ref} className={cn("review-bar relative block h-1 overflow-hidden bg-line", className)}>
      <span className="review-bar-fill absolute inset-0 origin-left bg-gold-400" style={{ ["--f" as string]: share, ["--d" as string]: `${delay}s` }} />
    </span>
  );
}
