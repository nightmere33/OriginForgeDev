"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

const ITEM = 36; // px per row
const VISIBLE = 5; // rows in view; the middle one is the pick

export type WheelItem<V extends string | number> = { value: V; label: string; disabled?: boolean };

/**
 * A scroll wheel (asset pack): a column that spins under the finger, mouse
 * wheel or arrow keys and snaps to the row in the middle band. Rows tilt
 * away on a drum as they leave the centre (rotateX and fade, transform only),
 * so it reads as a physical dial. Native scrolling does the spinning; the
 * pick is reported when the wheel comes to rest.
 */
export function WheelPicker<V extends string | number>({
  items, value, onChange, label, className,
}: {
  items: WheelItem<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  const programmatic = useRef(false);
  const id = useId();
  const index = Math.max(0, items.findIndex((x) => x.value === value));

  // The drum: each row tilts and fades with its distance from the centre.
  const paint = () => {
    const el = list.current;
    if (!el) return;
    const centre = el.scrollTop / ITEM;
    el.querySelectorAll<HTMLElement>("[data-row]").forEach((row, i) => {
      const d = Math.max(-2.6, Math.min(2.6, i - centre));
      row.style.transform = `rotateX(${(-d * 22).toFixed(1)}deg) translateZ(0)`;
      row.style.opacity = String(Math.max(0.12, 1 - Math.abs(d) * 0.34));
    });
  };

  // Follow the value when it changes from outside (or on first show).
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    if (Math.round(el.scrollTop / ITEM) === index) return paint();
    programmatic.current = true;
    el.scrollTop = index * ITEM;
    paint();
    requestAnimationFrame(() => (programmatic.current = false));
  }, [index]);

  const onScroll = () => {
    requestAnimationFrame(paint);
    if (programmatic.current) return;
    clearTimeout(settle.current);
    // At rest: report the row in the band (skipping a disabled one).
    settle.current = window.setTimeout(() => {
      const el = list.current;
      if (!el) return;
      let i = Math.round(el.scrollTop / ITEM);
      i = Math.max(0, Math.min(items.length - 1, i));
      if (items[i]?.disabled) {
        const next = items.findIndex((x, k) => k > i && !x.disabled);
        i = next >= 0 ? next : items.findLastIndex((x) => !x.disabled);
        el.scrollTo({ top: i * ITEM, behavior: "smooth" });
      }
      if (items[i] && items[i].value !== value) onChange(items[i].value);
    }, 110);
  };

  const step = (by: number) => {
    let i = index + by;
    while (items[i]?.disabled) i += Math.sign(by);
    if (!items[i]) return;
    list.current?.scrollTo({ top: i * ITEM, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const by = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[e.key];
    if (by) {
      e.preventDefault();
      step(by);
    }
  };

  return (
    <div className={cn("relative select-none [perspective:420px]", className)} style={{ height: ITEM * VISIBLE }}>
      {/* The band the pick lands in: two hairlines and a faint ember wash. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 border-y border-ember-400/50 bg-ember-500/[0.07]" style={{ top: ITEM * 2, height: ITEM }} />
      <div
        ref={list}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={`${id}-${index}`}
        data-lenis-prevent
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="scroll-bare h-full snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [mask-image:linear-gradient(transparent,black_30%,black_70%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400"
        style={{ paddingBlock: ITEM * 2 }}
      >
        {items.map((item, i) => (
          <div
            key={item.value}
            id={`${id}-${i}`}
            data-row
            role="option"
            aria-selected={i === index}
            aria-disabled={item.disabled || undefined}
            onClick={() => !item.disabled && list.current?.scrollTo({ top: i * ITEM, behavior: "smooth" })}
            className={cn(
              "flex snap-center items-center justify-center font-mono text-sm tabular-nums will-change-transform [backface-visibility:hidden]",
              i === index ? "text-ink-strong" : "text-muted",
              item.disabled ? "cursor-not-allowed text-faint line-through" : "cursor-pointer",
            )}
            style={{ height: ITEM }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
