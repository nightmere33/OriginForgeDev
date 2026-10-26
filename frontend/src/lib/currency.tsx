"use client";

/**
 * Display currency. The visitor picks DZD, EUR or USD; prices follow.
 * A price set in that currency is shown as is; otherwise it is converted from
 * DZD at the live street rate (backend/fx) and marked "≈". Contract amounts
 * never change currency: they only get a "≈" equivalent next to them.
 *
 * Preference order: this device's choice, then the account's, then a guess
 * from the timezone. The server render uses DZD; the choice applies on mount.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { DecodeText, SPLIT, tearIn, useDecode, useDismiss } from "@/motion/glitch";
import { api } from "./api-client";
import { cn } from "./cn";
import { money } from "./lifecycle";
import { useSession } from "./session";
import type { Currency, PriceKind } from "./types";

export const CURRENCIES = ["DZD", "EUR", "USD"] as const satisfies readonly Currency[];
export type Rates = { base: "DZD"; rates: Record<string, number>; source: string; updated_at: string | null; stale: boolean };

const KEY = "of:currency";
const STEP: Record<Currency, number> = { DZD: 1000, EUR: 10, USD: 10 };
const isCurrency = (v: unknown): v is Currency => CURRENCIES.includes(v as Currency);

// localStorage as an external store: consistent across tabs and renders.
const listeners = new Set<() => void>();
const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === KEY && listener();
    addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      removeEventListener("storage", onStorage);
    };
  },
  read(): string {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  },
  write(value: Currency) {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
    listeners.forEach((l) => l());
  },
};
const noop = () => () => {};

function guess(): Currency {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  if (zone.startsWith("Europe/")) return "EUR";
  if (zone.startsWith("America/")) return "USD";
  return "DZD";
}

type Ctx = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: Rates | null;
  /** Convert through DZD; null when no rate is known. */
  convert: (amount: number, from: Currency, to?: Currency) => number | null;
};

const CurrencyContext = createContext<Ctx>({ currency: "DZD", setCurrency: () => {}, rates: null, convert: () => null });

export function CurrencyProvider({ rates, children }: { rates: Rates | null; children: ReactNode }) {
  const stored = useSyncExternalStore(store.subscribe, store.read, () => "");
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const user = useSession();
  const [chosen, setChosen] = useState<Currency | null>(null);
  const currency: Currency = chosen ?? (isCurrency(stored) ? stored : isCurrency(user?.currency) && user?.currency !== "DZD" ? user.currency : mounted ? guess() : "DZD");

  const setCurrency = useCallback((c: Currency) => {
    setChosen(c);
    store.write(c);
    if (user) api.patch("/auth/me/", { currency: c }).catch(() => undefined);
  }, [user]);

  const convert = useCallback((amount: number, from: Currency, to: Currency = currency) => {
    if (from === to) return amount;
    const r = rates?.rates;
    if (!r?.[from] || !r?.[to]) return null;
    return (amount * r[from]) / r[to];
  }, [rates, currency]);

  return <CurrencyContext.Provider value={{ currency, setCurrency, rates, convert }}>{children}</CurrencyContext.Provider>;
}

/**
 * The display currency, hydration-safe: a component shows the server's DZD
 * until it has hydrated itself. (The provider above may already have switched
 * to the visitor's choice while a Suspense boundary below is still hydrating.)
 */
export function useCurrency(): Ctx {
  const ctx = useContext(CurrencyContext);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return hydrated ? ctx : { ...ctx, currency: "DZD" };
}

export const roundTo = (value: number, currency: Currency) => Math.round(value / STEP[currency]) * STEP[currency];

/** A list price in the visitor's currency: the one set for it, or "≈" converted from another. */
export function Price({
  lang, prices, labels, className,
}: {
  lang: Locale;
  prices: { currency: Currency; amount: number; kind: PriceKind }[];
  labels: Record<PriceKind, string>;
  className?: string;
}) {
  const { currency, convert } = useCurrency();
  const line = (kind: PriceKind, price: string) => ({ kind, text: fill(labels[kind], { price }) });
  let lines = prices.filter((p) => p.currency === currency).map((p) => line(p.kind, money(lang, p.amount, p.currency)));
  if (!lines.length) {
    const source = prices.find((p) => p.currency === "DZD") ?? prices[0];
    if (!source) return null;
    const value = convert(source.amount, source.currency);
    lines = [line(source.kind, value === null ? money(lang, source.amount, source.currency) : `≈ ${money(lang, roundTo(value, currency), currency)}`)];
  }
  // One keyed list in every case, so a currency switch updates (and decodes) the same text.
  return <>{lines.map((l) => <DecodeText key={l.kind} className={className} text={l.text} />)}</>;
}

/** "≈ 450 EUR" next to a fixed amount, when the visitor reads another currency. */
export function Equivalent({ lang, amount, currency: from, className }: { lang: Locale; amount: number; currency: Currency; className?: string }) {
  const { currency, convert } = useCurrency();
  if (currency === from) return null;
  const value = convert(amount, from);
  if (value === null) return null;
  return <DecodeText className={className} text={`≈\u00a0${money(lang, Math.round(value), currency)}`} />;
}

function CurrencyOption({ code, current, onPick }: { code: Currency; current: boolean; onPick: () => void }) {
  const { shown, glitching, run } = useDecode(code);
  // Decode in as the list opens.
  useEffect(() => run(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <li role="option" aria-selected={current}>
      <button type="button" onClick={onPick} onPointerEnter={run} onFocus={run}
        className={cn("hud flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left hover:bg-cell focus-visible:bg-cell focus-visible:outline-none", current ? "text-ink" : "text-muted hover:text-ink")}>
        <span style={glitching ? SPLIT : undefined}>{shown}</span>
        {current && <Check aria-hidden className="size-3 text-ember-400" />}
      </button>
    </li>
  );
}

/** Nav control: the current currency, opening a three-item list that glitches in. */
export function CurrencySwitcher({ label, className }: { label: string; className?: string }) {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLUListElement>(null);
  useDismiss(open, root, setOpen);
  useEffect(() => {
    if (open) tearIn(panel.current);
  }, [open]);

  return (
    <div ref={root} className={cn("relative flex", className)}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${currency}`} onClick={() => setOpen(!open)}
        className="hud flex items-center gap-1.5 px-4 text-muted transition-colors duration-[var(--dur-micro)] hover:text-ink">
        <DecodeText text={currency} />
        <ChevronDown aria-hidden className={cn("size-3 transition-transform duration-[var(--dur-micro)]", open && "rotate-180")} />
      </button>
      {open && (
        <ul ref={panel} role="listbox" aria-label={label} className="absolute right-0 top-full z-50 min-w-28 border border-line bg-raised py-1 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)]">
          {CURRENCIES.map((c) => (
            <CurrencyOption key={c} code={c} current={c === currency} onPick={() => { setCurrency(c); setOpen(false); }} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ToggleOption({ code, current, onPick }: { code: Currency; current: boolean; onPick: () => void }) {
  const { shown, glitching, run } = useDecode(code);
  return (
    <button type="button" role="radio" aria-checked={current} onClick={() => { onPick(); run(); }}
      className={cn("hud border px-3 py-2", current ? "border-ember-400 text-ink" : "border-line text-muted hover:text-ink")}>
      <span style={glitching ? SPLIT : undefined}>{shown}</span>
    </button>
  );
}

/** Inline three-way toggle (mobile menu, settings); the picked code decodes. */
export function CurrencyToggle({ label, className }: { label: string; className?: string }) {
  const { currency, setCurrency } = useCurrency();
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-2", className)}>
      {CURRENCIES.map((c) => <ToggleOption key={c} code={c} current={currency === c} onPick={() => setCurrency(c)} />)}
    </div>
  );
}
