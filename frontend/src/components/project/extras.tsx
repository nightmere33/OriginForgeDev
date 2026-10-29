"use client";

import { useState } from "react";
import { Download, FileText, Plus } from "lucide-react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { day, money, type Charge, type Engagement } from "@/lib/lifecycle";
import type { Currency } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/cn";
import { CHARGE_TONE, PayCharge, StudioCharge } from "./payments-panel";
import { ErrorLine, errorText, type PanelProps } from "./shared";

/**
 * Studio: a required cost (due at once) or an optional offer (the client
 * answers first). Once the project is live it can also buy more maintenance
 * (days added when paid); on a closed project that is the only extra, and
 * paying it reopens the project and its conversation.
 */
function NewExtra({ t, reload, engagement }: Pick<PanelProps, "t" | "reload"> & { engagement: Engagement }) {
  const x = t.project.extras;
  const care = ["live", "closed"].includes(engagement.status);
  const closed = engagement.status === "closed";
  const blank = { label: "", description: "", amount: "", currency: engagement.currency as Currency, optional: closed, extends_days: "" };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!open) {
    return <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Plus aria-hidden className="size-3.5" />{x.add}</Button>;
  }
  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/engagements/${engagement.id}/extras/`, { ...form, amount: Number(form.amount), extends_days: Number(form.extends_days) || 0 });
      setForm(blank);
      setOpen(false);
      await reload();
    } catch (err) {
      setError(errorText(t, err, "label", "amount", "currency", "extends_days", "status"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-5 border border-line bg-cell px-5 py-6 [animation:step-in_var(--dur-standard)_var(--ease-out)] md:px-6">
      <p className="text-sm leading-relaxed text-muted">{x.studioLead}</p>
      <Field label={x.label}>{(a) => <Input id={a.id} value={form.label} maxLength={80} placeholder={x.labelPlaceholder} onChange={(e) => set("label", e.target.value)} />}</Field>
      <Field label={x.description}>{(a) => <Textarea id={a.id} value={form.description} onChange={(e) => set("description", e.target.value)} className="min-h-20" />}</Field>
      <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
        <Field label={x.amount}>{(a) => <Input id={a.id} inputMode="numeric" value={form.amount} onChange={(e) => set("amount", e.target.value.replace(/\D/g, ""))} />}</Field>
        <Field label={x.currency}>
          {(a) => (
            <Select id={a.id} value={form.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
              <option value="DZD">DZD</option><option value="EUR">EUR</option><option value="USD">USD</option>
            </Select>
          )}
        </Field>
      </div>
      {care && (
        <Field label={x.extendsDays} help={closed ? x.extendsClosed : x.extendsHelp}>
          {(a) => <Input id={a.id} inputMode="numeric" value={form.extends_days} placeholder="30" aria-describedby={a.describedBy} className="sm:max-w-[9rem]"
            onChange={(e) => set("extends_days", e.target.value.replace(/\D/g, "").slice(0, 3))} />}
        </Field>
      )}
      <Toggle label={x.optionalToggle} checked={form.optional} onChange={(e) => set("optional", e.target.checked)} />
      <ErrorLine>{error}</ErrorLine>
      <div className="flex flex-wrap gap-3">
        <Button variant="ember" disabled={!form.label.trim() || !Number(form.amount) || (closed && !Number(form.extends_days))} loading={busy} onClick={send}>{x.create}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t.common.back}</Button>
      </div>
    </div>
  );
}

function ExtraRow({ lang, t, side, reload, charge: c, engagement, reference }: PanelProps & { charge: Charge; engagement: Engagement; reference: string }) {
  const x = t.project.extras;
  const [paying, setPaying] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string>();
  const run = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    setError(undefined);
    try {
      await api.post(path, body);
      await reload();
      if (key === "accept") setPaying(true);
    } catch (err) {
      setError(errorText(t, err, "decision", "status"));
    } finally {
      setBusy("");
    }
  };
  const statuses = side === "client" ? x.statuses : x.studioStatuses;
  const settled = ["paid", "declined", "void", "expired"].includes(c.status);
  return (
    <li id={`charge-${c.id}`} className="flex flex-col gap-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-3">
            <span className={cn("text-ink", settled && "text-muted")}>{c.label}</span>
            <span className={cn("hud border px-1.5 py-0.5", c.optional ? "border-line text-muted" : "border-ember-700 text-ember-400")}>{c.optional ? x.optional : x.required}</span>
            {c.extends_days > 0 && <span className="hud text-ember-400">{fill(x.extendsBadge, { days: c.extends_days })}</span>}
          </span>
          {c.description && <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted">{c.description}</p>}
          <span className="hud text-faint">
            {c.created_at ? day(lang, c.created_at) : ""}
            {c.status === "paid" && c.paid_at ? ` · ${fill(t.project.pay.paidOn, { date: day(lang, c.paid_at) })}` : ""}
            {c.status === "due" && c.due_at ? ` · ${c.overdue ? t.project.pay.overdue : fill(t.project.pay.payBy, { date: day(lang, c.due_at) })}` : ""}
          </span>
        </div>
        <span className="flex items-center gap-4">
          <span className={cn("font-mono tabular-nums", settled && c.status !== "paid" ? "text-faint line-through decoration-line-strong" : "text-ink")}>{money(lang, c.amount, c.currency)}</span>
          <StatusPill status={c.overdue ? "declined" : CHARGE_TONE[c.status]} label={c.overdue ? t.project.pay.overdue : statuses[c.status]} />
        </span>
      </div>

      {side === "client" && c.status === "proposed" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-faint">{x.acceptLead}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="ember" size="sm" loading={busy === "accept"} onClick={() => run("accept", `/charges/${c.id}/offer/`, { decision: "accept" })}>{x.accept}</Button>
            {declining ? (
              <Button variant="secondary" size="sm" loading={busy === "decline"} onClick={() => run("decline", `/charges/${c.id}/offer/`, { decision: "decline" })}>{x.declineConfirm}</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setDeclining(true)}>{x.decline}</Button>
            )}
          </div>
        </div>
      )}
      {side === "client" && c.status === "due" && (paying ? (
        <div className="border-l-2 border-ember-500 bg-cell px-5 py-6 md:px-8">
          <PayCharge lang={lang} t={t} side={side} reload={reload} charge={c} reference={reference} engagement={engagement} />
        </div>
      ) : (
        <Button variant="ember" size="sm" onClick={() => setPaying(true)}>{t.project.pay.how} · {money(lang, c.amount, c.currency)}</Button>
      ))}
      {side === "studio" && (
        <div className="flex flex-col gap-3">
          <StudioCharge lang={lang} t={t} side={side} reload={reload} charge={c} started />
          {(c.status === "proposed" || (c.status === "due" && !c.proofs.some((p) => p.status === "pending"))) && (
            <Button variant="ghost" size="sm" loading={busy === "withdraw"} onClick={() => run("withdraw", `/charges/${c.id}/withdraw/`)}>{x.withdraw}</Button>
          )}
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </li>
  );
}

/**
 * Costs outside the contract and optional offers, newest first. They have
 * their own status, reminders and invoice, and never touch the contract total.
 */
export function ExtrasPanel(props: PanelProps & { engagement: Engagement; reference: string }) {
  const { t, side, engagement } = props;
  const x = t.project.extras;
  const extras = engagement.charges.filter((c) => c.kind === "extra").reverse();
  const open = ["in_development", "client_review", "awaiting_balance", "on_hold", "live", "closed"].includes(engagement.status);
  if (!extras.length && side === "client") return null;
  return (
    <div className="flex flex-col gap-6">
      {side === "client" && <p className="max-w-2xl text-sm leading-relaxed text-muted">{x.lead}</p>}
      {extras.length > 0 ? (
        <ul className="divide-y divide-line border-y border-line">
          {extras.map((c) => <ExtraRow key={c.id} {...props} charge={c} />)}
        </ul>
      ) : (
        <p className="text-muted">{x.empty}</p>
      )}
      {side === "studio" && open && <NewExtra t={t} reload={props.reload} engagement={engagement} />}
    </div>
  );
}

/** One invoice per paid payment (contract parts and extras), newest first, each a PDF. */
export function InvoiceList({ lang, t, engagement }: Pick<PanelProps, "lang" | "t"> & { engagement: Engagement }) {
  const s = t.project.invoices;
  const invoices = engagement.charges.flatMap((c) => (c.invoice ? [c.invoice] : [])).sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  if (!invoices.length) return <p className="text-muted">{s.empty}</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {invoices.map((inv) => (
        <li key={inv.id}>
          <a href={inv.url} download className="group/inv grid gap-2 py-4 transition-colors hover:bg-cell sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-6 sm:px-3">
            <FileText aria-hidden className="hidden size-4 text-faint transition-colors group-hover/inv:text-ember-400 sm:block" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono text-sm text-ink">{inv.number}</span>
              <span className="truncate text-sm text-muted">{inv.label}</span>
            </span>
            <span className="hud text-faint">{day(lang, inv.issued_at)} · {inv.method}{inv.emailed_at ? ` · ${s.sent}` : ""}</span>
            <span className="flex items-center justify-between gap-4 sm:justify-end">
              <span className="font-mono tabular-nums text-ink">{money(lang, inv.amount, inv.currency)}</span>
              <span className="hud flex items-center gap-1.5 text-muted group-hover/inv:text-ember-400"><Download aria-hidden className="size-3.5" />PDF</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

