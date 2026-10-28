"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { DecodeText, tearIn, useDismiss } from "@/motion/glitch";
import { FLOAT, useFloat } from "./float";
import { WheelPicker } from "./wheel-picker";

const LABELS = {
  en: { today: "Today", clear: "Clear", prev: "Previous month", next: "Next month", pick: "Pick month and year", done: "Done", month: "Month", year: "Year", choose: "Choose a date" },
  fr: { today: "Aujourd'hui", clear: "Effacer", prev: "Mois précédent", next: "Mois suivant", pick: "Choisir le mois et l'année", done: "OK", month: "Mois", year: "Année", choose: "Choisir une date" },
};

// Dates as "YYYY-MM-DD" in local time, the format a date input posts.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate()));
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && iso(a) === iso(b);

/**
 * A date field with the studio's own calendar (asset pack), in place of the
 * browser's. The month grid follows the WAI-ARIA date picker dialog: arrows
 * move by day and week, Page Up/Down by month (with Shift, by year),
 * Home/End to the week's ends, Enter picks, Escape closes. The title opens
 * scroll wheels for month and year; months slide in from the side they come
 * from. Weeks start on Monday. Posts "YYYY-MM-DD" like a date input.
 */
export function DatePicker({
  id, value, onChange, lang, min, max, placeholder, className, "aria-invalid": invalid, "aria-describedby": describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  lang: Locale;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const l = LABELS[lang === "fr" ? "fr" : "en"];
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const selected = parse(value);
  const lo = min ? parse(min) : null;
  const hi = max ? parse(max) : null;
  const [open, setOpen] = useState(false);
  const [wheels, setWheels] = useState(false);
  const [focus, setFocus] = useState<Date>(() => selected ?? lo ?? new Date());
  const [dir, setDir] = useState<1 | -1>(1);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDismiss(open, root, (o) => {
    setOpen(o);
    if (!o) setWheels(false);
  });
  const panel = useFloat<HTMLDivElement>(open, button);

  const blocked = (d: Date) => (lo !== null && d < lo) || (hi !== null && d > hi);
  const today = new Date();
  const month = new Date(focus.getFullYear(), focus.getMonth(), 1);
  // Six rows from the Monday on or before the 1st: the grid never changes height.
  const start = addDays(month, -((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i))),
    [locale],
  );
  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2024, i, 1))),
    [locale],
  );

  useEffect(() => {
    if (!open) return;
    tearIn(panel.current);
  }, [open, panel]);
  // Keyboard focus follows the focused day (the grid is one roving tab stop).
  useEffect(() => {
    if (open && !wheels) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${iso(focus)}"]`)?.focus({ preventScroll: true });
  }, [open, wheels, focus]);

  const show = () => {
    setFocus(selected ?? (lo && lo > today ? lo : today));
    setWheels(false);
    setOpen(true);
  };
  // From the latest focus: the two wheels can both settle in the same frame.
  const move = (to: Date | ((from: Date) => Date)) => {
    setFocus((from) => {
      const next = typeof to === "function" ? to(from) : to;
      if (next.getMonth() !== from.getMonth() || next.getFullYear() !== from.getFullYear()) setDir(next > from ? 1 : -1);
      return next;
    });
  };
  const pick = (d: Date) => {
    if (blocked(d)) return;
    onChange(iso(d));
    setOpen(false);
    button.current?.focus();
  };

  const onGridKey = (e: KeyboardEvent) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => addDays(focus, -((focus.getDay() + 6) % 7)),
      End: () => addDays(focus, 6 - ((focus.getDay() + 6) % 7)),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
    };
    if (moves[e.key]) {
      e.preventDefault();
      move(moves[e.key]());
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
  };

  const fromYear = Math.min((lo ?? today).getFullYear(), focus.getFullYear()) - (lo ? 0 : 5);
  const toYear = Math.max((hi ?? today).getFullYear() + (hi ? 0 : 6), focus.getFullYear());
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => ({ value: fromYear + i, label: String(fromYear + i) }));

  const shown = selected ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(selected) : "";
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={button}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : show())}
        className={cn(
          "flex h-12 w-full items-center justify-between gap-3 border border-line bg-cell px-4 text-left transition-[border-color,box-shadow] duration-[var(--dur-micro)]",
          "hover:border-line-strong focus-visible:border-ember-400 focus-visible:shadow-[inset_0_0_0_1px_var(--ember-400)] focus-visible:outline-none data-[invalid]:border-err",
          open && "border-ember-400 shadow-[inset_0_0_0_1px_var(--ember-400)]",
        )}
      >
        {shown ? <DecodeText text={shown} className="truncate text-ink" /> : <span className="truncate text-faint">{placeholder ?? l.choose}</span>}
        <CalendarDays aria-hidden className={cn("size-4 shrink-0 transition-colors", open ? "text-ember-400" : "text-muted")} />
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          popover="manual"
          data-lenis-prevent
          className={cn(FLOAT, "w-[19.5rem] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain border border-line bg-raised shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)]")}
        >
          <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
            <button type="button" onClick={() => move(addMonths(focus, -1))} aria-label={l.prev} disabled={wheels}
              className="flex size-9 items-center justify-center text-muted transition-colors hover:text-ink disabled:opacity-0">
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button type="button" id={titleId} onClick={() => setWheels((w) => !w)} aria-expanded={wheels} aria-label={`${title}. ${l.pick}`}
              className="hud flex items-center gap-1.5 px-2 py-2 text-ink transition-colors hover:text-ember-400">
              <DecodeText text={title} />
              <ChevronDown aria-hidden className={cn("size-3.5 text-muted transition-transform duration-[var(--dur-micro)]", wheels && "rotate-180")} />
            </button>
            <button type="button" onClick={() => move(addMonths(focus, 1))} aria-label={l.next} disabled={wheels}
              className="flex size-9 items-center justify-center text-muted transition-colors hover:text-ink disabled:opacity-0">
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>

          {wheels ? (
            <div className="[animation:step-in_var(--dur-standard)_var(--ease-out)]">
              <div className="grid grid-cols-[1.4fr_1fr] gap-2 px-3 py-3">
                <WheelPicker label={l.month} value={focus.getMonth()}
                  items={monthNames.map((name, i) => ({ value: i, label: name }))}
                  onChange={(m) => move((f) => new Date(f.getFullYear(), m, Math.min(f.getDate(), daysIn(f.getFullYear(), m))))} />
                <WheelPicker label={l.year} value={focus.getFullYear()} items={years}
                  onChange={(y) => move((f) => new Date(y, f.getMonth(), Math.min(f.getDate(), daysIn(y, f.getMonth()))))} />
              </div>
              <div className="flex justify-end border-t border-line px-2 py-1.5">
                <button type="button" onClick={() => setWheels(false)} className="hud px-3 py-2 text-ember-400 hover:text-ink">{l.done}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 px-2 pt-2" aria-hidden>
                {weekdays.map((w, i) => <span key={i} className="hud flex h-8 items-center justify-center text-faint">{w}</span>)}
              </div>
              {/* Keyed by month: each new month slides in from the side it comes from. */}
              <div ref={grid} key={iso(month)} role="grid" aria-labelledby={titleId} onKeyDown={onGridKey}
                className={cn("grid grid-cols-7 px-2 pb-2", dir > 0 ? "[animation:cal-next_280ms_var(--ease-out)]" : "[animation:cal-prev_280ms_var(--ease-out)]")}>
                {days.map((d) => {
                  const inMonth = d.getMonth() === month.getMonth();
                  const isSel = sameDay(d, selected);
                  const isToday = sameDay(d, today);
                  const off = blocked(d);
                  return (
                    <button
                      key={iso(d)}
                      type="button"
                      role="gridcell"
                      data-day={iso(d)}
                      tabIndex={sameDay(d, focus) ? 0 : -1}
                      aria-selected={isSel}
                      aria-current={isToday ? "date" : undefined}
                      aria-disabled={off || undefined}
                      aria-label={new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d)}
                      onClick={() => pick(d)}
                      onFocus={() => !sameDay(d, focus) && setFocus(d)}
                      className={cn(
                        "relative flex h-10 items-center justify-center font-mono text-sm tabular-nums outline-none transition-colors duration-[var(--dur-micro)]",
                        "focus-visible:shadow-[inset_0_0_0_1px_var(--ember-400)]",
                        isSel ? "bg-ember-500 text-on-ember" : off ? "cursor-not-allowed text-faint/50 line-through" : inMonth ? "text-ink hover:bg-cell" : "text-faint hover:bg-cell",
                      )}
                    >
                      {d.getDate()}
                      {isToday && !isSel && <span aria-hidden className="absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 bg-ember-400" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
                <button type="button" onClick={() => { onChange(""); setOpen(false); button.current?.focus(); }}
                  className="hud px-3 py-2 text-muted transition-colors hover:text-err disabled:opacity-40" disabled={!value}>{l.clear}</button>
                <button type="button" onClick={() => (blocked(today) ? move(lo ?? today) : pick(today))}
                  className="hud px-3 py-2 text-ember-400 transition-colors hover:text-ink">{l.today}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
