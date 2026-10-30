"use client";

import type { CSSProperties } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { cn } from "@/lib/cn";
import { day, money, type Charge, type Engagement } from "@/lib/lifecycle";

type P = Dictionary["project"]["pay"];

/** How a share of the bar looks: paid fills (ember), due now has a slow light, the rest waits. */
function Share({ charge, index }: { charge: Charge; index: number }) {
  return (
    <span className={cn("relative block h-2.5 overflow-hidden", charge.status === "due" ? "pay-due" : "bg-line")}>
      {charge.status === "paid" && (
        <span aria-hidden className="pay-fill absolute inset-0 bg-ember-500" style={{ "--d": `${index * 0.14}s` } as CSSProperties} />
      )}
    </span>
  );
}

function shareState(lang: Locale, p: P, c: Charge): string {
  if (c.status === "paid") {
    const when = c.paid_at ? fill(p.paidOn, { date: day(lang, c.paid_at) }) : p.statuses.paid;
    return c.paid_by ? `${when} · ${fill(p.paidVia, { method: p.methods[c.paid_by] })}` : when;
  }
  if (c.status === "due") return c.overdue ? p.overdue : c.due_at ? fill(p.payBy, { date: day(lang, c.due_at) }) : p.statuses.due;
  if (c.status === "scheduled") return c.kind === "deposit" ? p.progress.when.depositLater : p.progress.when[c.kind as keyof P["progress"]["when"]];
  return p.statuses[c.status as keyof P["statuses"]] ?? c.status;
}

/**
 * How far the client is through paying: one share per payment, as wide as
 * its percentage (the 40 or 50 % deposit, a milestone, the balance), in order.
 * Labels sit under their share from `sm` up, as a list on phones. `compact`
 * is the bar alone with "payment n of N", above the form that pays it.
 */
export function PaymentProgress({ lang, p, engagement, compact, className }: {
  lang: Locale; p: P; engagement: Engagement; compact?: boolean; className?: string;
}) {
  // The contract's own schedule; extras and offers are listed apart (they never change its total).
  const charges = engagement.charges.filter((c) => c.status !== "void" && c.kind !== "extra");
  if (!charges.length) return null;
  const currency = engagement.currency;
  const total = charges.reduce((n, c) => n + c.amount, 0);
  const paidCharges = charges.filter((c) => c.status === "paid");
  const paid = paidCharges.reduce((n, c) => n + c.amount, 0);
  const percent = paidCharges.reduce((n, c) => n + c.percent, 0);
  const columns = { "--cols": charges.map((c) => `minmax(0,${c.percent}fr)`).join(" ") } as CSSProperties;
  const due = charges.findIndex((c) => c.status === "due");

  const bar = (
    <div role="img" aria-label={`${fill(p.progress.title, { percent })} · ${fill(p.progress.amounts, { paid: money(lang, paid, currency), total: money(lang, total, currency) })}`}
      className="grid gap-0.5 [grid-template-columns:var(--cols)]" style={columns}>
      {charges.map((c, i) => <Share key={c.id} charge={c} index={i} />)}
    </div>
  );

  if (compact) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {bar}
        <p className="hud text-faint">
          {fill(p.progress.step, { n: (due >= 0 ? due : paidCharges.length) + 1, total: charges.length })} · {fill(p.progress.title, { percent })}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="hud text-muted">{percent === 100 ? p.progress.done : fill(p.progress.title, { percent })}</p>
          <p className="mt-1 font-mono text-2xl tabular-nums tracking-[-0.03em] text-ink-strong">
            {money(lang, paid, currency)} <span className="text-base text-faint">/ {money(lang, total, currency)}</span>
          </p>
        </div>
        {percent < 100 && <p className="hud text-faint">{fill(p.progress.left, { amount: money(lang, total - paid, currency) })}</p>}
      </div>
      {bar}
      <ol className="flex flex-col gap-3 sm:grid sm:gap-0.5 sm:[grid-template-columns:var(--cols)]" style={columns}>
        {charges.map((c) => (
          <li key={c.id} className="flex min-w-0 items-start gap-3 sm:flex-col sm:gap-1 sm:pr-3">
            <span aria-hidden className={cn("relative mt-1 size-2 shrink-0 sm:hidden", c.status === "paid" ? "bg-ember-500" : c.status === "due" ? "pay-due" : "bg-line")} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("truncate text-sm", c.status === "scheduled" ? "text-muted" : "text-ink")}>
                {c.label} <span className="hud text-faint">{c.percent} %</span>
              </span>
              <span className="font-mono text-sm tabular-nums text-ink">{money(lang, c.amount, c.currency)}</span>
              <span className={cn("hud truncate", c.status === "due" ? (c.overdue ? "text-err" : "text-ember-400") : "text-faint")}>{shareState(lang, p, c)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
