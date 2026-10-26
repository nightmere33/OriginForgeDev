"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { SPLIT, tearIn, useDecode, useDismiss } from "@/motion/glitch";

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];
/** The proxy reads this cookie to send a returning visitor to their language. */
function rememberLocale(code: Locale) {
  document.cookie = `of_lang=${code}; path=/; max-age=31536000; samesite=lax`;
}

function Option({ code, label, current, href, onPick }: { code: Locale; label: string; current: boolean; href: string; onPick: () => void }) {
  const { shown, glitching, run } = useDecode(label);
  // Decode in as the list opens.
  useEffect(() => run(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <li role="none">
      <Link
        role="menuitemradio"
        aria-checked={current}
        href={href}
        hrefLang={code}
        lang={code}
        onClick={onPick}
        onPointerEnter={run}
        onFocus={run}
        className={cn(
          "flex items-center justify-between gap-6 px-4 py-2.5 hover:bg-cell focus-visible:bg-cell focus-visible:outline-none",
          current ? "text-ink-strong" : "text-muted hover:text-ink",
        )}
      >
        <span className="flex items-baseline gap-3">
          <span className="hud text-faint">{code.toUpperCase()}</span>
          <span className="font-mono text-sm tracking-[0.04em] [font-variant-ligatures:none]" style={glitching ? SPLIT : undefined}>
            {shown}
          </span>
        </span>
        {current && <Check aria-hidden className="size-3.5 text-ember-400" />}
      </Link>
    </li>
  );
}

/** Nav language control: a dropdown that glitches in, instead of switching on tap. */
export function LanguageSwitcher({ lang, pathname, label }: { lang: Locale; pathname: string; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLUListElement>(null);
  useDismiss(open, root, setOpen);
  useEffect(() => {
    if (open) tearIn(panel.current);
  }, [open]);

  const hrefFor = (code: Locale) => pathname.replace(/^\/(en|fr)(?=\/|$)/, `/${code}`);
  const remember = (code: Locale) => {
    rememberLocale(code);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${lang.toUpperCase()}`}
        onClick={() => setOpen(!open)}
        className="hud flex items-center gap-1.5 px-4 text-muted transition-colors duration-[var(--dur-micro)] hover:text-ink"
      >
        {lang.toUpperCase()}
        <ChevronDown aria-hidden className={cn("size-3 transition-transform duration-[var(--dur-micro)]", open && "rotate-180")} />
      </button>
      {open && (
        <ul ref={panel} role="menu" aria-label={label}
          className="absolute right-0 top-full z-50 min-w-48 border border-line bg-raised py-1 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)]">
          {LANGUAGES.map((l) => (
            <Option key={l.code} code={l.code} label={l.label} current={l.code === lang} href={hrefFor(l.code)} onPick={() => remember(l.code)} />
          ))}
        </ul>
      )}
    </div>
  );
}
