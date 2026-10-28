"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import type { Locale } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { tearIn, useDismiss } from "@/motion/glitch";
import { FLOAT, useFloat } from "./float";
import { Input } from "./field";

/** Where most clients call from: listed first, then every country A to Z. */
const FIRST: CountryCode[] = ["DZ", "FR", "MA", "TN", "BE", "CA", "CH", "ES", "IT", "DE", "GB", "US", "AE", "SA", "QA", "TR"];

export type PhoneLabels = { countrySearch: string; countryNone: string; country: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A stored number ("+213…", or national digits from before) as a country and the digits typed for it. */
function read(value: string, fallback: CountryCode): { country: CountryCode; text: string } {
  const parsed = value ? parsePhoneNumberFromString(value, fallback) : undefined;
  if (parsed?.country) return { country: parsed.country, text: parsed.formatNational() };
  return { country: fallback, text: value.replace(/^\+\d{1,3}\s*/, "") };
}

/** What is stored: E.164 ("+213555123456"), or "" when nothing is typed. */
function write(text: string, country: CountryCode): string {
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  const typed = new AsYouType(country);
  typed.input(text);
  return typed.getNumber()?.number ?? `+${getCountryCallingCode(country)}${digits.replace(/^0+/, "")}`;
}

function Flag({ code, className }: { code: CountryCode; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 3:2 SVG flags from /public/flags, loaded only when seen
    <img src={`/flags/${code}.svg`} alt="" width={21} height={14} loading="lazy" decoding="async"
      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      className={cn("h-3.5 w-[1.3125rem] shrink-0 object-cover shadow-[0_0_0_1px_var(--line)]", className)} />
  );
}

/**
 * A phone number with its country: the flag and calling code open a list
 * (search by name, ISO code or "+213"), the number formats as it is typed for
 * that country, and a pasted "+33 6…" moves to its country by itself. Emits
 * E.164; validity is the caller's (`isValidPhoneNumber`).
 */
export function PhoneInput({ id, lang, labels, value, onChange, defaultCountry = "DZ", invalid, describedBy, autoComplete = "tel" }: {
  id?: string; lang: Locale; labels: PhoneLabels; value: string; onChange: (e164: string) => void;
  defaultCountry?: CountryCode; invalid?: boolean; describedBy?: string; autoComplete?: string;
}) {
  const [{ country, text }, setState] = useState(() => read(value, defaultCountry));
  const emitted = useRef(value);
  // A value changed from outside (another field, a reset) is read again.
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setState(read(value, defaultCountry));
    }
  }, [value, defaultCountry]);

  const update = (next: { country: CountryCode; text: string }) => {
    setState(next);
    const e164 = write(next.text, next.country);
    emitted.current = e164;
    onChange(e164);
  };

  const onType = (raw: string) => {
    // A full international number pasted or typed: its own country.
    if (raw.trim().startsWith("+")) {
      const parsed = parsePhoneNumberFromString(raw);
      if (parsed?.country) return update({ country: parsed.country, text: parsed.formatNational() });
    }
    const formatted = raw.length < text.length ? raw : new AsYouType(country).input(raw);
    update({ country, text: formatted });
  };

  const names = useMemo(() => {
    const display = new Intl.DisplayNames([lang === "fr" ? "fr" : "en"], { type: "region" });
    const all = getCountries().map((code) => ({ code, name: display.of(code) ?? code, dial: getCountryCallingCode(code) }));
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, lang);
    const first = FIRST.map((c) => all.find((x) => x.code === c)).filter((x): x is (typeof all)[number] => !!x);
    return { first, rest: all.filter((x) => !FIRST.includes(x.code)).sort(byName) };
  }, [lang]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const number = useRef<HTMLInputElement>(null);
  const listId = useId();
  useDismiss(open, root, setOpen);
  const panel = useFloat<HTMLDivElement>(open, root, { max: 340 });
  useEffect(() => {
    if (!open) return;
    tearIn(panel.current);
    search.current?.focus({ preventScroll: true });
  }, [open, panel]);

  const q = fold(query.trim().replace(/^\+/, ""));
  const matches = (x: { code: string; name: string; dial: string }) =>
    !q || fold(x.name).includes(q) || x.code.toLowerCase() === q || x.dial.startsWith(q);
  const list = q ? [...names.first, ...names.rest].filter(matches) : [...names.first, ...names.rest];
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const pick = (code: CountryCode) => {
    setOpen(false);
    setQuery("");
    update({ country: code, text: text ? new AsYouType(code).input(text.replace(/\D/g, "")) : "" });
    number.current?.focus();
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

  const dial = getCountryCallingCode(country);
  const countryName = names.first.concat(names.rest).find((x) => x.code === country)?.name ?? country;

  return (
    <div ref={root} data-invalid={invalid || undefined}
      className={cn(
        "flex h-12 items-stretch border border-line bg-cell transition-[border-color,box-shadow] duration-[var(--dur-micro)] hover:border-line-strong",
        "focus-within:border-ember-400 focus-within:shadow-[inset_0_0_0_1px_var(--ember-400)] data-[invalid]:border-err",
      )}>
      <button ref={button} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={`${labels.country}: ${countryName} +${dial}`}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
        className="flex shrink-0 items-center gap-2 border-r border-line pl-3 pr-2.5 text-ink transition-colors hover:bg-ink/[0.04] focus-visible:outline-none">
        <Flag code={country} />
        <span className="font-mono text-sm tabular-nums">+{dial}</span>
        <ChevronDown aria-hidden className={cn("size-3.5 text-muted transition-transform duration-[var(--dur-micro)]", open && "rotate-180")} />
      </button>
      <div className="min-w-0 flex-1 [&>span]:h-full">
        <Input ref={number} id={id} type="tel" inputMode="tel" autoComplete={autoComplete} value={text}
          aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => onType(e.target.value)}
          placeholder={new AsYouType(country).input(exampleDigits(country))}
          className="h-full border-0 bg-transparent px-3 hover:border-transparent focus:border-transparent focus:shadow-none" />
      </div>

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
              <li key={x.code} id={`${listId}-${i}`} role="option" aria-selected={x.code === country}
                onPointerDown={(e) => e.preventDefault()} onPointerMove={() => setActive(i)} onClick={() => pick(x.code)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-2 text-sm",
                  i === active && "bg-cell",
                  x.code === country ? "text-ink-strong" : i === active ? "text-ink" : "text-muted",
                  !q && i === names.first.length - 1 && "mb-1 border-b border-line pb-3",
                )}>
                <Flag code={x.code} />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="font-mono text-xs tabular-nums text-faint">+{x.dial}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A placeholder in the country's own format, from its first mobile-looking digits. */
function exampleDigits(country: CountryCode): string {
  return ({ DZ: "0555123456", FR: "0612345678", MA: "0612345678", TN: "20123456", BE: "0470123456", CA: "5145550123", US: "2015550123", GB: "07400123456" } as Partial<Record<CountryCode, string>>)[country] ?? "";
}
