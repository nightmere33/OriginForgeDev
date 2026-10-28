"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * A one-time code field (asset pack): six square cells that fill as you type
 * and hand the code over the moment the last digit lands, so there is no
 * button to press. One real input sits under the cells, so paste, the
 * phone's "from Messages/Mail" suggestion (autocomplete one-time-code),
 * screen readers and backspace all behave natively. `state` drives the look:
 * a wrong code shakes the row red, a right one lights it up.
 */
export function OtpInput({
  value, onChange, onComplete, state = "idle", disabled, length = 6, label, autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  state?: "idle" | "checking" | "wrong" | "ok";
  disabled?: boolean;
  length?: number;
  label: string;
  autoFocus?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const done = useRef(onComplete);
  useEffect(() => {
    done.current = onComplete;
  });

  // A wrong code: the row shakes, then the field clears for another go.
  useEffect(() => {
    if (state !== "wrong" || !row.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    row.current.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(7px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "translateX(0)" }],
      { duration: 380, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
    );
  }, [state]);

  const set = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) done.current?.(digits);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    set(e.clipboardData.getData("text"));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // The caret always sits at the end: arrows would only confuse the cells.
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) e.preventDefault();
  };

  const active = Math.min(value.length, length - 1);
  return (
    <div className="group/otp relative w-fit" onClick={() => input.current?.focus()}>
      <input
        ref={input}
        value={value}
        onChange={(e) => set(e.target.value)}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        aria-label={label}
        aria-invalid={state === "wrong" || undefined}
        autoFocus={autoFocus}
        disabled={disabled}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 [caret-color:transparent]"
      />
      <div ref={row} aria-hidden className="flex gap-2 sm:gap-3">
        {Array.from({ length }, (_, i) => {
          const ch = value[i] ?? "";
          const here = i === active && value.length < length;
          return (
            <span
              key={i}
              className={cn(
                "relative flex h-14 w-11 items-center justify-center border bg-cell font-mono text-2xl tabular-nums text-ink-strong transition-[border-color,background-color,color,box-shadow] duration-200 sm:h-16 sm:w-12",
                state === "ok" ? "border-ok bg-ok/10 text-ok" : state === "wrong" ? "border-err text-err" : ch ? "border-line-strong" : "border-line",
                here && state !== "ok" && "group-focus-within/otp:border-ember-400 group-focus-within/otp:shadow-[inset_0_0_0_1px_var(--ember-400)]",
                state === "checking" && "animate-pulse",
              )}
              style={state === "ok" ? { transitionDelay: `${i * 45}ms` } : undefined}
            >
              {ch && <span className="[animation:step-in_160ms_var(--ease-out)]">{ch}</span>}
              {/* The caret: a blinking ember bar in the cell being typed. */}
              {here && !ch && state !== "ok" && <span className="otp-caret absolute h-6 w-px bg-ember-400 opacity-0 group-focus-within/otp:opacity-100" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
