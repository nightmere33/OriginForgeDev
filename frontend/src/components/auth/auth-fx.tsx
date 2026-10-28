"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { DecodeText, GlitchLabel, SPLIT, tearIn, useDecode } from "@/motion/glitch";
import { Input } from "@/components/ui/field";

export { BootText } from "@/motion/glitch";
import { BootText } from "@/motion/glitch";

/** Children tear in one after another when the page arrives. */
export function TearGroup({ children, className, start = 0, step = 70 }: { children: ReactNode; className?: string; start?: number; step?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    [...(ref.current?.children ?? [])].forEach((el, i) => tearIn(el, start + i * step));
  }, [start, step]);
  return <div ref={ref} className={className}>{children}</div>;
}

type FieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  minLength?: number;
  error?: string;
  help?: string;
  placeholder?: string;
  reveal?: { show: string; hide: string };
};

/**
 * A sign-in field: the label decodes and an ember line sweeps across the box
 * when it takes focus; an error tears in; passwords can be shown.
 */
export function AuthField({ label, name, type = "text", autoComplete, minLength, error, help, placeholder, reveal }: FieldProps) {
  const id = useId();
  const { shown, glitching, run } = useDecode(label);
  const [visible, setVisible] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) tearIn(errorRef.current);
  }, [error]);
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help && !error ? `${id}-help` : undefined;
  const password = type === "password";
  return (
    <div className="group/f flex flex-col gap-2">
      <label htmlFor={id} className="hud text-muted transition-colors duration-[var(--dur-micro)] group-focus-within/f:text-ember-400" style={glitching ? SPLIT : undefined}>
        {shown}
      </label>
      <div className="auth-input relative">
        <Input
          id={id}
          name={name}
          type={password && visible ? "text" : type}
          autoComplete={autoComplete}
          minLength={minLength}
          placeholder={placeholder}
          required
          aria-invalid={!!error}
          aria-describedby={[errorId, helpId].filter(Boolean).join(" ") || undefined}
          onFocus={run}
          className={cn(password && reveal && "pr-12")}
        />
        {password && reveal && (
          <button
            type="button"
            aria-pressed={visible}
            aria-label={visible ? reveal.hide : reveal.show}
            onClick={() => setVisible((v) => !v)}
            className="absolute right-0 top-0 flex size-12 items-center justify-center text-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ember-400"
          >
            {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p ref={errorRef} id={errorId} role="alert" className="flex items-center gap-2 text-sm text-err">
          <span aria-hidden className="size-1.5 shrink-0 bg-err" />
          {error}
        </p>
      ) : (
        help && <p id={helpId} className="text-sm text-faint">{help}</p>
      )}
    </div>
  );
}

export type Phase = "idle" | "busy" | "done";

/** The submit bar: its words decode as the request moves (Sign in → Verifying → Access granted). */
export function PhaseButton({ phase, labels }: { phase: Phase; labels: Record<Phase, string> }) {
  return (
    <button
      type="submit"
      disabled={phase !== "idle"}
      aria-busy={phase === "busy"}
      className={cn(
        "group/btn relative flex h-12 w-full items-center justify-center gap-3 overflow-hidden bg-ember-500 px-6 font-mono text-hud font-bold uppercase tracking-[0.12em] text-on-ember",
        "transition-colors duration-[var(--dur-micro)] hover:bg-ember-600 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400",
        phase === "done" && "bg-ok hover:bg-ok",
      )}
    >
      {phase === "busy" && <span aria-hidden className="auth-busy absolute inset-y-0 left-0 w-1/3" />}
      <span className="relative" aria-live="polite">
        <GlitchLabel text={labels[phase]} />
      </span>
    </button>
  );
}

// ── Sign in with Google / Facebook, and the method this device used last ──

const LAST_KEY = "of:last-signin";
export type Method = "email" | "google" | "facebook";

/** Remember how this device signed in, so the next visit marks it "Last used". */
export function rememberMethod(method: Method) {
  try {
    localStorage.setItem(LAST_KEY, method);
  } catch {
    // Storage blocked: the hint simply doesn't show.
  }
}

const readLast = (): string | null => {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
};

export function useLastMethod(): string | null {
  return useSyncExternalStore(() => () => {}, readLast, () => null);
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-[18px] shrink-0">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] shrink-0">
      <path fill="#1877F2" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

type OAuthLabels = { google: string; facebook: string; redirecting: string; or: string; last: string };

function ProviderButton({ provider, href, labels, last }: { provider: "google" | "facebook"; href: string; labels: OAuthLabels; last: boolean }) {
  const name = provider === "google" ? "Google" : "Facebook";
  const { shown, glitching, run } = useDecode(labels[provider]);
  const [going, setGoing] = useState(false);
  return (
    <a
      href={href}
      onPointerEnter={run}
      onFocus={run}
      onClick={() => {
        rememberMethod(provider);
        setGoing(true);
      }}
      className={cn(
        "group/p relative flex h-12 items-center gap-3 border px-4 transition-[border-color,background-color] duration-[var(--dur-micro)]",
        "hover:bg-cell focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400",
        last ? "border-ember-400/70 bg-ember-500/[0.06]" : "border-line-strong hover:border-ink/50",
      )}
    >
      {going && <span aria-hidden className="absolute inset-0 overflow-hidden"><span className="auth-busy absolute inset-y-0 left-0 w-1/3" /></span>}
      {provider === "google" ? <GoogleMark /> : <FacebookMark />}
      <span className="relative text-ink" style={glitching ? SPLIT : undefined}>
        {going ? <DecodeText text={labels.redirecting.replace("{provider}", name)} /> : shown}
      </span>
      {last && !going && (
        // A notch on the top border: it never squeezes the label, even on a phone.
        <span className="hud absolute -top-[7px] right-3 inline-flex items-center gap-1.5 bg-raised px-1.5 leading-none text-ember-400">
          <span aria-hidden className="size-1.5 bg-ember-400" />
          <BootText text={labels.last} delay={300} />
        </span>
      )}
    </a>
  );
}

/**
 * "Continue with Google / Facebook" for the providers whose keys are set
 * (none: nothing shows). The one this device used last comes first, marked.
 */
export function ProviderButtons({ lang, next, labels }: { lang: string; next?: string | null; labels: OAuthLabels }) {
  const [providers, setProviders] = useState<string[] | null>(null);
  const last = useLastMethod();
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/providers/", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d: { providers: string[] }) => alive && setProviders(d.providers), () => alive && setProviders([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!providers?.length) return null;
  const ordered = [...providers].sort((a, b) => Number(b === last) - Number(a === last)) as ("google" | "facebook")[];
  const query = new URLSearchParams({ lang, ...(next ? { next } : {}) }).toString();
  return (
    <div className="flex flex-col gap-3">
      <TearGroup start={120} step={70} className="flex flex-col gap-3">
        {ordered.map((p) => (
          <ProviderButton key={p} provider={p} href={`/api/auth/oauth/${p}/start/?${query}`} labels={labels} last={p === last} />
        ))}
      </TearGroup>
      <div className="my-2 flex items-center gap-4">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="hud inline-flex items-center gap-2 text-faint">
          {labels.or}
          {last === "email" && (
            <span className="inline-flex items-center gap-1.5 text-ember-400">
              <span aria-hidden className="size-1.5 bg-ember-400" />
              {labels.last}
            </span>
          )}
        </span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

/** Why a provider sign-in came back without signing in (?oauth=…). */
export function OAuthNotice({ code, messages }: { code: string | null; messages: Record<string, string> }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (code) tearIn(ref.current);
  }, [code]);
  if (!code || !messages[code]) return null;
  return (
    <p ref={ref} role="alert" className="flex items-start gap-2 border border-err/40 bg-err/5 px-3 py-2.5 text-sm text-err">
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-err" />
      {messages[code]}
    </p>
  );
}

// ── The live mosaic on the sign-in page ──────────────────────────────────

/** One still glitches: a jolt, a red/blue split and a sliced band, ~0.3 s. */
function glitchTile(el: Element) {
  const a = Math.random() * 70;
  const b = Math.min(96, a + 10 + Math.random() * 22);
  el.animate(
    [
      { transform: "none", filter: "none", clipPath: "inset(0 0 0 0)" },
      { transform: "translate3d(7px,0,0)", filter: "drop-shadow(3px 0 rgb(255 70 60 / 0.75)) drop-shadow(-3px 0 rgb(60 150 255 / 0.75))", clipPath: `inset(${a}% 0 ${100 - b}% 0)`, offset: 0.25 },
      { transform: "translate3d(-5px,0,0)", filter: "drop-shadow(-2px 0 rgb(255 70 60 / 0.6)) drop-shadow(2px 0 rgb(60 150 255 / 0.6)) brightness(1.25)", clipPath: "inset(0 0 0 0)", offset: 0.5 },
      { transform: "translate3d(2px,0,0)", filter: "none", clipPath: `inset(${b}% 0 0 0)`, offset: 0.75 },
      { transform: "none", filter: "none", clipPath: "inset(0 0 0 0)" },
    ],
    { duration: 300, easing: "steps(6, end)" },
  );
}

/**
 * The project mosaic stays alive while the page is open: scanlines drift,
 * grain flickers, an ember scan bar sweeps down (CSS), and every few seconds
 * a random still glitches. Stops for reduced motion; idles in a hidden tab.
 */
export function MosaicGlitch({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        const tiles = ref.current ? [...ref.current.querySelectorAll("img")] : [];
        if (!document.hidden && tiles.length) glitchTile(tiles[Math.floor(Math.random() * tiles.length)]);
        next();
      }, 1700 + Math.random() * 1600);
    };
    next();
    return () => clearTimeout(timer);
  }, []);
  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      {children}
      <div aria-hidden className="auth-scanlines auth-scanlines-live pointer-events-none absolute inset-0" />
      <div aria-hidden className="auth-grain pointer-events-none absolute -inset-1/2" />
      <div aria-hidden className="auth-sweep pointer-events-none absolute inset-x-0 top-0 h-1/4" />
    </div>
  );
}
