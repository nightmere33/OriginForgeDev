"use client";

import { useState, type CSSProperties } from "react";
import { CalendarClock, LifeBuoy, MessageSquareReply, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { day, type Engagement } from "@/lib/lifecycle";
import { newTicket } from "@/lib/support";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";
import { ErrorLine, errorText, timeLeft, type PanelProps } from "./shared";

/**
 * The plan as signed, read as what it gives: maintenance, revision rounds
 * left, reply time, delivery, confidentiality. The studio sees the same card,
 * so both sides talk about the same terms.
 */
export function PlanCard({ lang, t, engagement: e, confidential }: Omit<PanelProps, "reload"> & { engagement: Engagement; confidential: boolean }) {
  const s = t.project.plan;
  const rows = [
    {
      icon: ShieldCheck,
      text: e.maintenance_ends_at ? fill(s.maintenanceUntil, { date: day(lang, e.maintenance_ends_at) }) : fill(s.maintenance, { n: e.plan.maintenance_days }),
      meta: e.maintenance_ends_at && e.status === "live" ? timeLeft(t, e.maintenance_ends_at) : "",
    },
    {
      icon: RotateCcw,
      text: fill(s.revisions, { left: e.revisions_left, total: e.revision_rounds }),
      meta: e.revisions_granted ? fill(s.granted, { n: e.revisions_granted }) : "",
    },
    { icon: MessageSquareReply, text: fill(s.reply, { n: e.plan.reply_hours }), meta: "" },
    // The delivery estimate matters until the work is delivered.
    ...(["awaiting_balance", "live", "closed"].includes(e.status) ? [] : [{ icon: CalendarClock, text: fill(s.timeline, { n: e.timeline_days }), meta: "" }]),
    { icon: Sparkles, text: confidential ? s.confidential : s.showcase, meta: "" },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-display text-2xl font-[620] tracking-[-0.02em] text-ink-strong [font-stretch:125%]">{e.plan.name || e.plan_name}</p>
        <Hud tone="faint">{s.includes}</Hud>
      </div>
      <ul className="grid gap-px border border-line bg-line sm:grid-cols-2">
        {rows.map((r, i) => (
          <li key={i} className={cn("flex items-start gap-3 bg-bg px-4 py-4", i === rows.length - 1 && rows.length % 2 === 1 && "sm:col-span-2")}>
            <r.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ember-400" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm leading-snug text-ink">{r.text}</span>
              {r.meta && <span className="hud text-faint">{r.meta}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Started, estimated delivery, live since, maintenance until, closed: only the ones that apply. */
export function KeyDates({ lang, t, engagement: e }: Pick<PanelProps, "lang" | "t"> & { engagement: Engagement }) {
  const s = t.project.plan;
  const finished = ["awaiting_balance", "live", "closed"].includes(e.status);
  const dates = [
    e.started_at && { k: s.started, v: day(lang, e.started_at) },
    e.deadline && !finished && { k: s.deadline, v: day(lang, e.deadline), meta: timeLeft(t, `${e.deadline}T18:00:00`) },
    e.production_at && { k: s.live, v: day(lang, e.production_at) },
    e.maintenance_ends_at && e.status !== "closed" && { k: s.ends, v: day(lang, e.maintenance_ends_at) },
    e.closed_at && e.status === "closed" && { k: s.closed, v: day(lang, e.closed_at) },
  ].filter(Boolean) as { k: string; v: string; meta?: string }[];
  if (!dates.length) return null;
  return (
    // As many columns as dates (up to four), so no cell is ever empty.
    <dl className="grid gap-px border border-line bg-line sm:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ "--n": Math.min(dates.length, 4) } as CSSProperties}>
      {dates.map((d) => (
        <div key={d.k} className="flex flex-col gap-1 bg-bg px-4 py-4">
          <dt className="hud text-faint">{d.k}</dt>
          <dd className="text-ink">{d.v}</dd>
          {d.meta && <dd className="hud text-faint">{d.meta}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * After launch. The client reports a problem (it lands in the chat as a
 * card and alerts the studio); the studio extends maintenance (a closed
 * project comes back into care) or closes the project.
 */
export function CarePanel({ lang, t, side, reload, engagement: e, reference, onReported }: PanelProps & { engagement: Engagement; reference: string; onReported?: () => void }) {
  const s = t.project.care;
  const [note, setNote] = useState("");
  const [days, setDays] = useState("30");
  const [writing, setWriting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string>();
  if (!["live", "closed"].includes(e.status)) return null;

  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(undefined);
    try {
      await api.post(`/engagements/${e.id}/action/`, { action, ...body });
      await reload();
      return true;
    } catch (err) {
      setError(errorText(t, err, "note", "days"));
      return false;
    } finally {
      setBusy("");
    }
  };

  const until = e.maintenance_ends_at ? day(lang, e.maintenance_ends_at) : "";

  if (side === "client") {
    if (e.status === "closed") {
      // After the project: bugs and more maintenance go through a ticket about it.
      return (
        <div className="flex flex-col items-start gap-4">
          <p className="max-w-2xl leading-relaxed text-muted">{s.closedLead}</p>
          <Button variant="ghost" size="sm" onClick={() => newTicket({ request: reference, category: "problem" })}>
            <LifeBuoy aria-hidden className="size-3.5" />{s.openTicket}
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-5">
        <p className="max-w-2xl leading-relaxed text-ink">{fill(s.lead, { date: until })}</p>
        {sent && !writing && <Hud tone="ink" dot>{s.sent}</Hud>}
        {writing ? (
          <div className="flex flex-col gap-4 [animation:step-in_var(--dur-standard)_var(--ease-out)]">
            <Field label={s.reportNote}>{(a) => <Textarea id={a.id} value={note} onChange={(ev) => setNote(ev.target.value)} autoFocus />}</Field>
            <ErrorLine>{error}</ErrorLine>
            <div className="flex flex-wrap gap-3">
              <Button variant="ember" disabled={!note.trim()} loading={busy === "report_issue"} onClick={async () => {
                if (await act("report_issue", { note })) {
                  setNote("");
                  setWriting(false);
                  setSent(true);
                  onReported?.();
                }
              }}>{s.send}</Button>
              <Button variant="ghost" onClick={() => setWriting(false)}>{t.common.back}</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setWriting(true)}><LifeBuoy aria-hidden className="size-3.5" />{s.report}</Button>
        )}
      </div>
    );
  }

  const n = Math.min(365, Math.max(1, Number(days) || 0));
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted">{e.status === "closed" ? s.studioClosed : fill(s.studioLead, { date: until })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={s.days} className="w-32">
          {(a) => <Input id={a.id} inputMode="numeric" value={days} onChange={(ev) => setDays(ev.target.value.replace(/\D/g, "").slice(0, 3))} />}
        </Field>
        <Button variant="secondary" loading={busy === "extend_maintenance"} disabled={!Number(days)}
          onClick={() => act("extend_maintenance", { days: n })}>{fill(s.extendGo, { n })}</Button>
        {e.status === "live" && (closing ? (
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{s.closeConfirm}</span>
            <Button variant="secondary" size="sm" loading={busy === "close"} onClick={async () => (await act("close")) && setClosing(false)}>{s.close}</Button>
            <Button variant="ghost" size="sm" onClick={() => setClosing(false)}>{s.keep}</Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setClosing(true)}>{s.close}</Button>
        ))}
      </div>
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}
