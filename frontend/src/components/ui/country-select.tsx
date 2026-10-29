"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import { getCountries, type CountryCode } from "libphonenumber-js";
import type { Locale } from "@/i18n/dictionaries";
import type { Currency } from "@/lib/types";
import { cn } from "@/lib/cn";
import { tearIn, useDismiss } from "@/motion/glitch";
import { FLOAT, useFloat } from "./float";
import { FIRST, Flag } from "./phone-input";

export type CountryLabels = { countrySearch: string; countryNone: string; country: string; countryPick: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Euro prices for Europe and its neighbours across the sea; dollars elsewhere.
const EURO = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH", "NO", "IS", "GB", "AD", "MC", "SM", "VA", "LI", "ME", "AL", "RS", "BA",
  "MK", "MD", "UA", "MA", "TN",
]);

/** The currency a country's prices are shown in: dinars in Algeria, euros in Europe (and Morocco, Tunisia), dollars elsewhere. */
export function currencyFor(code: string): Currency {
  if (code === "DZ") return "DZD";
  return EURO.has(code) ? "EUR" : "USD";
}

/** The English name, as invoices and the studio read it. */
export function englishName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A country, picked from a searchable list with flags (the clients' usual
 * countries first, then A to Z in the reader's language). Emits the ISO code.
 */
export function CountrySelect({ id, lang, labels, value, onChange, invalid, describedBy }: {
  id?: string; lang: Locale; labels: CountryLabels; value: string; onChange: (code: CountryCode) => void;
  invalid?: boolean; describedBy?: string;
}) {
  const names = useMemo(() => {
    const display = new Intl.DisplayNames([lang === "fr" ? "fr" : "en"], { type: "region" });
    const all = getCountries().map((code) => ({ code, name: display.of(code) ?? code }));
    const first = FIRST.map((c) => all.find((x) => x.code === c)).filter((x): x is (typeof all)[number] => !!x);
    return { first, rest: all.filter((x) => !FIRST.includes(x.code)).sort((a, b) => a.name.localeCompare(b.name, lang)) };
  }, [lang]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  useDismiss(open, root, setOpen);
  const panel = useFloat<HTMLDivElement>(open, root, { max: 340 });
  useEffect(() => {
    if (!open) return;
    tearIn(panel.current);
    search.current?.focus({ preventScroll: true });
  }, [open, panel]);

  const q = fold(query.trim());
  const all = [...names.first, ...names.rest];
  const list = q ? all.filter((x) => fold(x.name).includes(q) || x.code.toLowerCase() === q) : all;
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const pick = (code: CountryCode) => {
    setOpen(false);
    setQuery("");
    onChange(code);
    button.current?.focus();
  };
  const onListKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list[active]) pick(list[active].code);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
  };
  const current = all.find((x) => x.code === value);

  return (
    <div ref={root} className="relative">
      <button ref={button} id={id} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        data-invalid={invalid || undefined} aria-describedby={describedBy}
        onClick={() => {
          setActive(Math.max(0, current ? list.findIndex((x) => x.code === current.code) : 0));
          setOpen((o) => !o);
        }}
        className={cn(
          "flex h-12 w-full items-center gap-3 border border-line bg-cell px-4 text-left transition-[border-color,box-shadow] duration-[var(--dur-micro)]",
          "hover:border-line-strong focus-visible:border-ember-400 focus-visible:shadow-[inset_0_0_0_1px_var(--ember-400)] focus-visible:outline-none data-[invalid]:border-err",
        )}>
        {current ? <Flag code={current.code} /> : null}
        <span className={cn("min-w-0 flex-1 truncate", current ? "text-ink" : "text-faint")}>{current ? current.name : labels.countryPick}</span>
        <ChevronDown aria-hidden className={cn("size-3.5 shrink-0 text-muted transition-transform duration-[var(--dur-micro)]", open && "rotate-180")} />
      </button>

      {open && (
        <div ref={panel} popover="manual" data-lenis-prevent
          className={cn(FLOAT, "flex w-[min(22rem,calc(100vw-1rem))] flex-col border border-line bg-raised shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)]")}>
          <label className="flex items-center gap-2 border-b border-line px-3">
            <Search aria-hidden className="size-3.5 shrink-0 text-faint" />
            <input ref={search} value={query} placeholder={labels.countrySearch} aria-label={labels.countrySearch}
              role="combobox" aria-expanded aria-controls={listId} aria-activedescendant={list[active] ? `${listId}-${active}` : undefined}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onListKey}
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-faint focus:outline-none sm:text-sm" />
          </label>
          <ul id={listId} role="listbox" aria-label={labels.country} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {list.length === 0 && <li className="px-4 py-3 text-sm text-faint">{labels.countryNone}</li>}
            {list.map((x, i) => (
              <li key={x.code} id={`${listId}-${i}`} role="option" aria-selected={x.code === value}
                onPointerDown={(e) => e.preventDefault()} onPointerMove={() => setActive(i)} onClick={() => pick(x.code)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-2 text-sm",
                  i === active && "bg-cell",
                  x.code === value ? "text-ink-strong" : i === active ? "text-ink" : "text-muted",
                  !q && i === names.first.length - 1 && "mb-1 border-b border-line pb-3",
                )}>
                <Flag code={x.code} />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
