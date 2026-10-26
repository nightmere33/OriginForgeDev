"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { money, type ProjectRequest } from "@/lib/lifecycle";
import type { CarePlan, Currency } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChoiceChip, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { ErrorLine, errorText, type PanelProps } from "./shared";

const SMALL: Record<Currency, number> = { DZD: 60_000, EUR: 400, USD: 400 };
const LARGE: Record<Currency, number> = { DZD: 500_000, EUR: 3_500, USD: 3_500 };

/** Preview of the schedule the server will apply (engagements/lifecycle.py default_schedule). */
function previewSchedule(price: number, currency: Currency, rush: boolean) {
  if (price >= LARGE[currency]) return [40, 30, 30];
  const deposit = rush || price < SMALL[currency] ? 50 : 40;
  return [deposit, 100 - deposit];
}

export function ProposalBuilder({ lang, t, reload, req }: Omit<PanelProps, "side"> & { req: ProjectRequest }) {
  const st = t.studio;
  const versions = req.proposals?.length ?? 0;
  const last = req.proposals?.[versions - 1];
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [form, setForm] = useState(() => ({
    title: last?.title ?? req.title,
    scope: last?.scope ?? req.objectives,
    deliverables: last?.deliverables.join("\n") ?? "",
    exclusions: last?.exclusions.join("\n") ?? "",
    price: String(last?.price ?? req.estimate_low ?? req.budget_max ?? ""),
    currency: (last?.currency ?? (req.estimate_currency || req.budget_currency || "DZD")) as Currency,
    plan: req.plan ?? "pro",
    timeline_days: String(last?.timeline_days ?? 30),
    nda: last?.nda ?? req.wants_nda,
    note: "",
  }));
  const [milestones, setMilestones] = useState(() => last?.milestones.map((m) => ({ title: m.title, days: String(m.days) })) ?? [{ title: "", days: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.get<CarePlan[]>(`/content/plans/?lang=${lang}`).then(setPlans, () => setPlans([]));
  }, [lang]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const price = Number(form.price) || 0;
  const schedule = previewSchedule(price, form.currency, req.options?.speed === "rush");

  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/requests/${req.reference}/proposals/`, {
        title: form.title, scope: form.scope, deliverables: form.deliverables, exclusions: form.exclusions, note: form.note,
        price, currency: form.currency, plan: form.plan, timeline_days: Number(form.timeline_days) || 0, nda: form.nda,
        milestones: milestones.filter((m) => m.title.trim()).map((m) => ({ title: m.title.trim(), days: Number(m.days) || 0 })),
      });
      await reload();
    } catch (err) {
      setError(errorText(t, err, "scope", "price", "plan", "timeline_days", "milestones", "version"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg text-ink-strong">{versions ? st.newVersion : st.builder}</p>
        <Hud tone="muted">{fill(st.versionsLeft, { n: 3 - versions })}</Hud>
      </div>
      {req.estimate_low ? (
        <Hud tone="faint">{st.clientEstimate} · {money(lang, req.estimate_low, req.estimate_currency || "DZD")} – {money(lang, req.estimate_high ?? req.estimate_low, req.estimate_currency || "DZD")}</Hud>
      ) : null}

      <Field label={t.project.proposal.title}>{(a) => <Input id={a.id} value={form.title} onChange={(e) => set("title", e.target.value)} />}</Field>
      <Field label={st.scope}>{(a) => <Textarea id={a.id} value={form.scope} onChange={(e) => set("scope", e.target.value)} />}</Field>
      <div className="grid gap-6 lg:grid-cols-2">
        <Field label={st.deliverables}>{(a) => <Textarea id={a.id} value={form.deliverables} onChange={(e) => set("deliverables", e.target.value)} />}</Field>
        <Field label={st.exclusions}>{(a) => <Textarea id={a.id} value={form.exclusions} onChange={(e) => set("exclusions", e.target.value)} />}</Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={st.price}>{(a) => <Input id={a.id} inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value.replace(/\D/g, ""))} />}</Field>
        <Field label={st.currency}>
          {(a) => (
            <Select id={a.id} value={form.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
              <option value="DZD">DZD</option><option value="EUR">EUR</option><option value="USD">USD</option>
            </Select>
          )}
        </Field>
        <Field label={st.plan}>
          {(a) => (
            <Select id={a.id} value={form.plan} onChange={(e) => set("plan", e.target.value)}>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={st.timeline}>{(a) => <Input id={a.id} inputMode="numeric" value={form.timeline_days} onChange={(e) => set("timeline_days", e.target.value.replace(/\D/g, ""))} />}</Field>
      </div>

      <div className="flex flex-col gap-3">
        <p className="hud text-muted">{st.milestones}</p>
        {milestones.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-3">
            <Input aria-label={`${st.milestoneTitle} ${i + 1}`} placeholder={st.milestoneTitle} value={m.title}
              onChange={(e) => setMilestones((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <Input aria-label={st.days} placeholder={st.days} inputMode="numeric" value={m.days}
              onChange={(e) => setMilestones((l) => l.map((x, j) => (j === i ? { ...x, days: e.target.value.replace(/\D/g, "") } : x)))} />
            <button type="button" aria-label={`${t.start.remove} ${i + 1}`} onClick={() => setMilestones((l) => l.filter((_, j) => j !== i))}
              className="flex size-9 items-center justify-center text-faint hover:text-err"><X aria-hidden className="size-4" /></button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setMilestones((l) => [...l, { title: "", days: "" }])}>
          <Plus aria-hidden className="size-3.5" />{st.addMilestone}
        </Button>
      </div>

      <div className="border border-line bg-bg-sunken px-5 py-4">
        <p className="hud text-faint">{st.schedule}</p>
        <p className="mt-2 font-mono tabular-nums text-ink">
          {schedule.map((pct) => `${pct} % · ${money(lang, Math.round((price * pct) / 100), form.currency)}`).join("   /   ")}
        </p>
        <p className="mt-2 text-sm text-faint">{st.scheduleHelp}</p>
      </div>

      <ChoiceChip label={st.nda} checked={form.nda} onChange={(e) => set("nda", e.target.checked)} className="sm:max-w-sm" />
      <Field label={st.note}>{(a) => <Textarea id={a.id} value={form.note} onChange={(e) => set("note", e.target.value)} className="min-h-12" />}</Field>
      <ErrorLine>{error}</ErrorLine>
      <Button variant="ember" disabled={!price || !form.scope.trim() || versions >= 3} loading={busy} onClick={send}>{st.sendProposal}</Button>
    </div>
  );
}
