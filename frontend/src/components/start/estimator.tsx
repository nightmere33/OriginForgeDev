"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { money } from "@/lib/lifecycle";
import type { CarePlan, Currency, Estimate, PricingChoice, PricingFactor } from "@/lib/types";
import { Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";
import { DecodeText } from "@/motion/glitch";

type S = Dictionary["start"];

/** What a choice does to the price, shown on the chip itself: "+25 %", "+25 000 DZD". */
function effect(lang: Locale, choice: PricingChoice, currency: Currency) {
  const parts: string[] = [];
  const pct = Math.round((Number(choice.multiplier) - 1) * 100);
  if (pct) parts.push(`${pct > 0 ? "+" : ""}${pct} %`);
  // Each currency has its own add-on amount (nothing is converted).
  const addon = choice[`addon_${currency.toLowerCase()}` as "addon_dzd"];
  if (addon) parts.push(`+${money(lang, addon, currency)}`);
  return parts.join(" · ");
}

export function planFeatures(s: S, p: CarePlan): string[] {
  const f = s.planFeatures;
  return [
    fill(f.maintenance, { n: p.maintenance_days }),
    fill(f.reply, { n: p.reply_hours }),
    fill(f.revisions, { n: p.revision_rounds }),
    p.small_updates === null ? f.updatesUnlimited : p.small_updates > 0 ? fill(f.updates, { n: p.small_updates }) : "",
    p.advice ? f.advice : "",
    p.monthly_call ? f.call : "",
    p.monitoring ? f.monitoring : "",
  ].filter(Boolean);
}

/** "180 000 – 240 000 DZD", each figure decoding when it changes. */
function Range({ lang, estimate }: { lang: Locale; estimate: Estimate }) {
  return (
    <>
      <DecodeText digits text={money(lang, estimate.low, "").trim()} />
      <span className="px-[0.27em] text-faint">–</span>
      <DecodeText digits text={money(lang, estimate.high, estimate.currency)} />
    </>
  );
}

export function EstimateReadout({
  lang, s, estimate, loading, className, priceRef,
}: {
  lang: Locale; s: S; estimate: Estimate | null; loading?: boolean; className?: string;
  /** The figure the floating notice docks onto (desktop). */
  priceRef?: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className={cn("border border-line bg-cell px-5 py-5 md:px-6", className)}>
      <Hud tone="muted" dot live={loading}>{s.estimateLabel}</Hud>
      <p aria-live="polite" className={cn("mt-3 font-mono text-2xl tabular-nums tracking-[-0.02em] text-ink-strong transition-opacity md:text-3xl", loading && "opacity-60")}>
        {estimate && estimate.low ? (
          <span ref={priceRef} className="inline-block"><Range lang={lang} estimate={estimate} /></span>
        ) : (
          <span className="text-base text-faint">{s.estimatePending}</span>
        )}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-faint">{s.estimateNote}</p>
      {estimate?.converted && <p className="mt-2 text-sm leading-relaxed text-faint">{s.estimateConverted}</p>}
    </div>
  );
}

export function Estimator({
  lang, s, plans, factors, plan, options, currency, estimate, loading, onPlan, onOption, onCurrency,
}: {
  lang: Locale;
  s: S;
  plans: CarePlan[];
  factors: PricingFactor[];
  plan: string;
  options: Record<string, string>;
  currency: Currency;
  estimate: Estimate | null;
  loading: boolean;
  onPlan: (code: string) => void;
  onOption: (factor: string, choice: string) => void;
  onCurrency: (c: Currency) => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      <fieldset>
        <legend className="hud mb-3 text-muted">{s.plan}</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => (
            <label key={p.code}
              className={cn(
                "group/plan relative flex cursor-pointer flex-col gap-4 border border-line bg-cell p-5 transition-colors duration-[var(--dur-micro)]",
                "hover:border-line-strong has-[:checked]:border-ember-400 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ember-400",
              )}>
              <input type="radio" name="plan" value={p.code} checked={plan === p.code} onChange={() => onPlan(p.code)} className="sr-only" />
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-lg text-ink-strong">{p.name}</span>
                <span className="hud text-faint group-has-[:checked]/plan:text-ember-400">
                  {p.surcharge_percent ? fill(s.surcharge, { n: p.surcharge_percent }) : s.included}
                </span>
              </span>
              {p.tagline && <span className="text-sm text-muted">{p.tagline}</span>}
              <ul className="flex flex-col gap-2 border-t border-line pt-4 text-sm text-ink">
                {planFeatures(s, p).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ember-400" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-8">
        <Hud tone="muted">{s.options}</Hud>
        {factors.map((f) => {
          const selected = options[f.key] ?? f.choices.find((c) => c.is_default)?.key ?? f.choices[0]?.key;
          return (
            <fieldset key={f.key} className="grid gap-3 md:grid-cols-[12rem_1fr] md:gap-6">
              <legend className="sr-only">{f.label}</legend>
              <div aria-hidden>
                <p className="text-ink">{f.label}</p>
                {f.help && <p className="mt-1 text-sm text-faint">{f.help}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {f.choices.map((c) => {
                  const fx = effect(lang, c, currency);
                  return (
                    <label key={c.key}
                      className={cn(
                        "flex cursor-pointer items-baseline gap-2 border border-line px-3 py-2 text-sm text-muted transition-colors duration-[var(--dur-micro)]",
                        "hover:border-line-strong hover:text-ink has-[:checked]:border-ember-400 has-[:checked]:text-ink-strong",
                        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ember-400",
                      )}>
                      <input type="radio" name={`opt-${f.key}`} value={c.key} checked={selected === c.key}
                        onChange={() => onOption(f.key, c.key)} className="sr-only" />
                      {c.label}
                      {/* Decodes when the currency changes, like the estimate itself. */}
                      {fx && <DecodeText digits text={fx} className="hud tabular-nums text-faint" />}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label={s.currency} className="flex gap-2">
          {(["DZD", "EUR", "USD"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={currency === c} onClick={() => onCurrency(c)}
              className={cn("hud border px-3 py-1.5", currency === c ? "border-ember-400 text-ink" : "border-line text-muted hover:text-ink")}>
              {c}
            </button>
          ))}
        </div>
        <DockedEstimate lang={lang} s={s} estimate={estimate} loading={loading} />
      </div>
    </div>
  );
}

const FLIGHT_MS = 560;
const ease = (t: number) => 1 - Math.pow(1 - t, 4);
type Pose = { x: number; y: number; k: number };

/**
 * The estimate, plus (desktop) a notice that keeps it in view while the
 * options are chosen: when the readout scrolls away the figure lifts out of
 * it into a corner notice, and when it scrolls back the notice flies home
 * onto the live position of the figure and hands over to it.
 */
function DockedEstimate({ lang, s, estimate, loading }: { lang: Locale; s: S; estimate: Estimate | null; loading: boolean }) {
  const anchor = useRef<HTMLDivElement>(null);
  const price = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const cardPrice = useRef<HTMLSpanElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [away, setAway] = useState(false);
  const flying = useRef(false);
  const pose = useRef<Pose | null>(null);
  const raf = useRef(0);
  const ready = !!estimate?.low;

  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px) and (hover: hover)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = anchor.current;
    if (!el || !desktop) return;
    const io = new IntersectionObserver(([e]) => setAway(e.intersectionRatio < 0.35), { threshold: [0, 0.35, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [desktop]);

  const floating = desktop && ready && away;

  useEffect(() => {
    const el = card.current;
    if (!el || !desktop || !ready) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Corner notice: bottom right of the form column.
    const home = (): Pose => {
      const a = anchor.current!.getBoundingClientRect();
      return { x: a.right - el.offsetWidth, y: innerHeight - el.offsetHeight - 24, k: 1 };
    };
    // Lined up so the figure in the notice sits exactly on the figure in the readout:
    // scaled by the ratio of font sizes, centred on the same line.
    const font = (n: Element | null) => (n ? parseFloat(getComputedStyle(n).fontSize) : 0);
    const k = font(price.current) / font(cardPrice.current) || 1;
    const docked = (): Pose => {
      const target = price.current?.getBoundingClientRect();
      const inner = cardPrice.current;
      if (!target || !inner) return home();
      return {
        x: target.left - inner.offsetLeft * k,
        y: target.top + target.height / 2 - (inner.offsetTop + inner.offsetHeight / 2) * k,
        k,
      };
    };
    const apply = (p: Pose, show: number) => {
      el.style.transform = `translate3d(${p.x}px,${p.y}px,0) scale(${p.k})`;
      if (chrome.current) chrome.current.style.opacity = String(show);
    };
    // Exactly one figure is visible: the notice while it is out, the readout once it lands.
    const out = (v: boolean) => {
      el.style.visibility = v ? "visible" : "hidden";
      if (price.current) price.current.style.visibility = v ? "hidden" : "";
    };
    cancelAnimationFrame(raf.current);
    if (reduce) {
      flying.current = false;
      pose.current = floating ? home() : null;
      if (pose.current) apply(pose.current, 1);
      out(floating);
      return;
    }
    if (!floating && !pose.current) return; // never left: nothing to bring back
    const from = pose.current ?? docked();
    const t0 = performance.now();
    flying.current = true;
    out(true);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / FLIGHT_MS);
      const e = ease(t);
      // The destination is read live: the page may still be scrolling under it.
      const to = floating ? home() : docked();
      const p = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      pose.current = p;
      apply(p, floating ? Math.min(1, t * 2.5) : 1 - Math.max(0, (t - 0.45) / 0.55));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else {
        flying.current = false;
        if (!floating) {
          pose.current = null;
          out(false);
        }
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [floating, desktop, ready]);

  // Keep the corner notice in its corner when the window changes size.
  useEffect(() => {
    if (!floating) return;
    const place = () => {
      const el = card.current;
      if (!el || !anchor.current || flying.current) return;
      const a = anchor.current.getBoundingClientRect();
      pose.current = { x: a.right - el.offsetWidth, y: innerHeight - el.offsetHeight - 24, k: 1 };
      el.style.transform = `translate3d(${pose.current.x}px,${pose.current.y}px,0)`;
    };
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [floating]);

  return (
    <div ref={anchor}>
      <EstimateReadout lang={lang} s={s} estimate={estimate} loading={loading} priceRef={price} />
      {desktop && ready && estimate &&
        createPortal(
          <div
            ref={card}
            aria-hidden
            style={{ visibility: "hidden" }}
            className="pointer-events-none fixed left-0 top-0 z-40 origin-top-left will-change-transform"
          >
            <div ref={chrome} className="absolute inset-0 border border-ember-400/60 bg-raised shadow-[0_24px_48px_-24px_rgb(0_0_0/0.7)]" />
            <div className="relative px-5 py-4">
              <Hud tone="muted" dot live={loading}>{s.estimateLabel}</Hud>
              <p className="mt-2 whitespace-nowrap font-mono text-xl leading-none tabular-nums tracking-[-0.02em] text-ink-strong">
                <span ref={cardPrice} className="inline-block"><Range lang={lang} estimate={estimate} /></span>
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
