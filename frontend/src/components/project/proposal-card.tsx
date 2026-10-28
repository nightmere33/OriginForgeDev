"use client";

import { useState } from "react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { day, money, type Proposal } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { ErrorLine, Fact, errorText, type PanelProps } from "./shared";

const TONE: Record<Proposal["status"], string> = {
  sent: "proposal_sent", accepted: "accepted", declined: "declined", countered: "clarification", superseded: "archived", expired: "withdrawn",
};

/** Full terms of one version, plus the answer controls when it is this side's turn. */
export function ProposalCard({ lang, t, side, reload, proposal: p, compact }: PanelProps & { proposal: Proposal; compact?: boolean }) {
  const s = t.project.proposal;
  const [mode, setMode] = useState<"" | "counter" | "decline">("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "accept" | "decline" | "counter">("");
  const [error, setError] = useState<string>();

  const respond = async (action: "accept" | "decline" | "counter") => {
    setBusy(action);
    setError(undefined);
    try {
      await api.post(`/proposals/${p.id}/respond/`, { action, note, ...(action === "counter" ? { price: Number(price) } : {}) });
      await reload();
    } catch (err) {
      setError(errorText(t, err, "price", "note"));
    } finally {
      setBusy("");
    }
  };

  // Amounts per payment, the same rounding as the contract: the last one takes the remainder.
  const share = (percent: number) => Math.round((p.price * percent) / 100);
  const lastIndex = p.schedule.length - 1;
  const beforeLast = p.schedule.slice(0, lastIndex).reduce((n, x) => n + share(x.percent), 0);
  const schedule = p.schedule.map((x, i) => ({ ...x, amount: i < lastIndex ? share(x.percent) : p.price - beforeLast }));

  const label = (
    <Hud tone="faint">
      {fill(s.version, { n: p.version })} · {p.from_client ? s.fromClient : s.fromYounes} · {day(lang, p.created_at)}
    </Hud>
  );
  const pill = <StatusPill status={TONE[p.status]} label={s.statuses[p.status]} />;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        {label}
        <span className="flex items-center gap-4">
          <span className="font-mono tabular-nums text-ink">{money(lang, p.price, p.currency)}</span>
          {pill}
        </span>
        {p.note && <p className="w-full text-sm text-muted">{p.note}</p>}
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">{label}{pill}</div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="hud text-faint">{s.price}</p>
          <p className="mt-2 font-mono text-4xl tabular-nums tracking-[-0.03em] text-ink-strong md:text-5xl">{money(lang, p.price, p.currency)}</p>
        </div>
        <span className="flex flex-col items-end gap-2">
          {!p.from_client && !p.negotiable && (
            <span className="hud border border-ember-700 px-2 py-1 text-ember-400">{p.version > 1 ? s.finalOffer : s.fixedPrice}</span>
          )}
          {p.status === "sent" && <Hud tone="muted">{fill(s.validUntil, { date: day(lang, p.expires_at) })}</Hud>}
        </span>
      </div>

      {p.note && (
        <blockquote className={cn("border-l-2 px-5 py-1 leading-relaxed text-ink", p.from_client ? "border-line-strong" : "border-ember-500")}>{p.note}</blockquote>
      )}

      {!p.from_client && (
        <>
          <dl className="grid gap-6 border-y border-line py-6 sm:grid-cols-2 lg:grid-cols-4">
            <Fact k={s.plan} v={p.plan_name} />
            <Fact k={s.timeline} v={fill(s.days, { n: p.timeline_days })} />
            <Fact k={s.maintenanceLabel} v={fill(s.days, { n: p.maintenance_days })} />
            <Fact k={s.revisionsLabel} v={p.revision_rounds} />
          </dl>

          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="hud text-faint">{s.scope}</p>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-ink">{p.scope}</p>
            </div>
            <div className="flex flex-col gap-6">
              {p.deliverables.length > 0 && (
                <div>
                  <p className="hud text-faint">{s.deliverables}</p>
                  <ul className="mt-3 flex flex-col gap-2 text-ink">
                    {p.deliverables.map((d) => <li key={d} className="flex gap-3"><span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-ember-400" />{d}</li>)}
                  </ul>
                </div>
              )}
              {p.exclusions.length > 0 && (
                <div>
                  <p className="hud text-faint">{s.exclusions}</p>
                  <ul className="mt-3 flex flex-col gap-2 text-muted">
                    {p.exclusions.map((d) => <li key={d} className="flex gap-3"><span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-line-strong" />{d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="hud text-faint">{s.payments}</p>
              <ol className="mt-3 divide-y divide-line border-y border-line">
                {schedule.map((x) => (
                  <li key={x.label} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-ink">{x.label} <span className="hud text-faint">{x.percent} %</span></span>
                    <span className="font-mono tabular-nums text-ink">{money(lang, x.amount, p.currency)}</span>
                  </li>
                ))}
              </ol>
            </div>
            {p.milestones.length > 0 && (
              <div>
                <p className="hud text-faint">{s.milestones}</p>
                <ol className="mt-3 divide-y divide-line border-y border-line">
                  {p.milestones.map((m, i) => (
                    <li key={`${m.title}-${i}`} className="flex items-baseline justify-between gap-4 py-3">
                      <span className="text-ink"><span className="hud mr-3 text-faint">{String(i + 1).padStart(2, "0")}</span>{m.title}</span>
                      <span className="hud text-muted">{fill(s.days, { n: m.days })}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          {p.nda && <Hud tone="ink" dot>{s.nda}</Hud>}
        </>
      )}

      {p.can_respond && (
        <div className="flex flex-col gap-5 border-t border-line pt-6">
          {side === "client" && !p.can_counter && <p className="text-sm text-muted">{p.version > 1 || p.negotiable ? s.finalOfferLead : s.fixedPrice}</p>}
          {side === "studio" && <p className="text-sm text-muted">{t.studio.counterHint}</p>}

          {mode === "counter" && (
            <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
              <Field label={`${s.counterPrice} · ${p.currency}`}>
                {(a) => <Input id={a.id} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />}
              </Field>
              <Field label={s.counterNote}>
                {(a) => <Textarea id={a.id} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-12" />}
              </Field>
            </div>
          )}
          {mode === "decline" && (
            <Field label={s.declineNote}>
              {(a) => <Textarea id={a.id} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-12" />}
            </Field>
          )}
          <ErrorLine>{error}</ErrorLine>

          <div className="flex flex-wrap gap-3">
            {mode === "" && (
              <>
                <Button variant="ember" loading={busy === "accept"} onClick={() => respond("accept")}>
                  {side === "studio" ? t.studio.acceptCounter : s.accept}
                </Button>
                {p.can_counter && <Button variant="secondary" onClick={() => setMode("counter")}>{s.counter}</Button>}
                <Button variant="ghost" onClick={() => setMode("decline")}>{side === "studio" ? t.studio.declineCounter : s.decline}</Button>
              </>
            )}
            {mode === "counter" && (
              <Button variant="ember" disabled={!price} loading={busy === "counter"} onClick={() => respond("counter")}>{s.sendCounter}</Button>
            )}
            {mode === "decline" && (
              <Button variant="secondary" loading={busy === "decline"} onClick={() => respond("decline")}>{s.confirmDecline}</Button>
            )}
            {mode !== "" && <Button variant="ghost" onClick={() => { setMode(""); setError(undefined); }}>{t.common.back}</Button>}
          </div>
        </div>
      )}
    </article>
  );
}
