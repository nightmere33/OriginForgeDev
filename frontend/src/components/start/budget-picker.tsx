"use client";

import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { cn } from "@/lib/cn";
import { money } from "@/lib/lifecycle";
import type { Currency, Estimate } from "@/lib/types";
import { Field, Input } from "@/components/ui/field";
import { DecodeText } from "@/motion/glitch";

type S = Dictionary["start"];
type Range = { min: number | null; max: number | null };

// The ranges per currency, set like the prices: dinars for the Algerian
// market, standard ranges in euros and dollars (nothing is converted).
const EDGES: Record<Currency, number[]> = {
  DZD: [50_000, 100_000, 200_000, 400_000],
  EUR: [1_000, 3_000, 7_000, 15_000],
  USD: [1_000, 3_000, 7_500, 15_000],
};

export function budgetRanges(currency: Currency): Range[] {
  const edges = EDGES[currency];
  return [{ min: null, max: edges[0] }, ...edges.slice(0, -1).map((e, i) => ({ min: e, max: edges[i + 1] })), { min: edges[edges.length - 1], max: null }];
}

/**
 * A budget moved to another currency: the same range if it was one. Own
 * amounts are cleared rather than converted: the markets differ, so a
 * converted number would mislead.
 */
export function convertBudget(min: string, max: string, from: Currency, to: Currency): { min: string; max: string } {
  if (from === to || (!min && !max)) return { min, max };
  const i = budgetRanges(from).findIndex((r) => String(r.min ?? "") === min && String(r.max ?? "") === max);
  if (i < 0) return { min: "", max: "" };
  const r = budgetRanges(to)[i];
  return { min: r.min ? String(r.min) : "", max: r.max ? String(r.max) : "" };
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 10);

/**
 * The budget as ranges anyone can read ("50 000 – 100 000 DZD"), "not sure"
 * or one's own range. Amounts decode when the currency changes, like the
 * estimate; the custom fields group digits as they are typed and suggest the
 * live estimate as their example.
 */
export function BudgetPicker({ lang, s, currency, estimate, min, max, custom, onChange, error }: {
  lang: Locale; s: S; currency: Currency; estimate: Estimate | null; min: string; max: string; custom: boolean;
  onChange: (next: { min: string; max: string; custom: boolean }) => void; error?: string;
}) {
  const ranges = budgetRanges(currency);
  const chosen = custom ? -2 : !min && !max ? -1 : ranges.findIndex((r) => String(r.min ?? "") === min && String(r.max ?? "") === max);
  const amount = (n: number) => money(lang, n, currency);
  const label = (r: Range) => (r.min === null ? fill(s.budgetUnder, { amount: amount(r.max!) })
    : r.max === null ? fill(s.budgetOver, { amount: amount(r.min) })
      : `${money(lang, r.min, "").trim()} – ${amount(r.max)}`);
  const group = (v: string) => (v ? new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(Number(v)).replace(/[\s,  ]/g, " ") : "");
  const example = (n: number | undefined) => (n ? fill(s.budgetPlaceholder, { amount: money(lang, n, "").trim() }) : "");
  const chip = (on: boolean) => cn(
    "hud border px-3 py-2 text-left transition-colors duration-[var(--dur-micro)]",
    on ? "border-ember-400 text-ink shadow-[inset_0_0_0_1px_var(--ember-400)]" : "border-line text-muted hover:border-line-strong hover:text-ink",
  );

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="hud mb-3 text-muted">{s.budgetOptional} · {currency}</legend>
      <div role="radiogroup" aria-label={s.budgetOptional} className="flex flex-wrap gap-2">
        {ranges.map((r, i) => (
          <button key={i} type="button" role="radio" aria-checked={chosen === i} className={chip(chosen === i)}
            onClick={() => onChange({ min: r.min ? String(r.min) : "", max: r.max ? String(r.max) : "", custom: false })}>
            <DecodeText digits text={label(r)} className="tabular-nums" />
          </button>
        ))}
        <button type="button" role="radio" aria-checked={chosen === -1} className={chip(chosen === -1)}
          onClick={() => onChange({ min: "", max: "", custom: false })}>{s.budgetNotSure}</button>
        <button type="button" role="radio" aria-checked={chosen === -2} className={chip(chosen === -2)}
          onClick={() => onChange({ min, max, custom: true })}>{s.budgetCustom}</button>
      </div>
      {custom && (
        <div className="grid gap-6 [animation:step-in_var(--dur-standard)_var(--ease-out)] sm:grid-cols-2">
          <Field label={`${s.budgetMin} · ${currency}`}>
            {(a) => <Input id={a.id} inputMode="numeric" value={group(min)} placeholder={example(estimate?.low)}
              onChange={(e) => onChange({ min: digits(e.target.value), max, custom: true })} className="font-mono tabular-nums" />}
          </Field>
          <Field label={`${s.budgetMax} · ${currency}`} error={error}>
            {(a) => <Input id={a.id} inputMode="numeric" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={group(max)}
              placeholder={example(estimate?.high)} onChange={(e) => onChange({ min, max: digits(e.target.value), custom: true })}
              className="font-mono tabular-nums" />}
          </Field>
        </div>
      )}
      <p className="text-sm text-faint">{s.budgetHelp}</p>
    </fieldset>
  );
}
