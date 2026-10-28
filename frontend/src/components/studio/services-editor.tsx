"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { money } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { useGuard } from "@/components/portal/requests";

type Service = {
  slug: string; active: boolean; order: number; icon: string;
  title_en: string; title_fr: string; summary_en: string; summary_fr: string; description_en: string; description_fr: string;
  deliverables_en: string; deliverables_fr: string; timeline_en: string; timeline_fr: string;
  max_active: number | null; accept_directly: boolean; typical_days: number; amount: number | null; kind: string;
  queue: { direct: boolean; full: boolean; waiting: number; used: number; capacity: number };
};
type T = Pick<Dictionary, "studio" | "common">;
type Mode = "shared" | "own" | "direct";
const KINDS = ["from", "per_minute", "fixed", "monthly", "hourly"] as const;
const WORDS = [
  ["title", "text"], ["summary", "long"], ["timeline", "text"], ["deliverables", "long"], ["description", "long"],
] as const;

/** One service: a summary row that opens into its editor. Saves only what it shows. */
function ServiceRow({ lang, t, initial, onSaved }: { lang: Locale; t: T; initial: Service; onSaved: (s: Service) => void }) {
  const d = t.studio.dash.services;
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mode: Mode = s.accept_directly ? "direct" : s.max_active === null ? "shared" : "own";
  const set = <K extends keyof Service>(k: K, v: Service[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    setState("idle");
  };
  const setMode = (m: Mode) => {
    setS((x) => ({ ...x, accept_directly: m === "direct", max_active: m === "own" ? x.max_active ?? 1 : m === "direct" ? x.max_active : null }));
    setState("idle");
  };

  const save = async () => {
    setState("saving");
    setErrors({});
    const body: Partial<Service> = { ...s };
    delete body.queue;
    try {
      const fresh = await api.patch<Service>(`/studio/services/${s.slug}/`, body);
      setS(fresh);
      onSaved(fresh);
      setState("saved");
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.fromEntries(Object.keys(err.data).map((k) => [k, err.field(k) ?? ""])));
      setState("error");
    }
  };

  const title = lang === "fr" && s.title_fr ? s.title_fr : s.title_en;
  const price = s.amount === null ? d.quoted : `${d.kinds[s.kind as keyof typeof d.kinds] ?? ""} ${money(lang, s.amount, "DZD")}`;
  const lane = s.queue.direct ? d.direct : s.queue.capacity ? fill(d.placesShort, { used: s.queue.used, capacity: s.queue.capacity }) : d.noLimit;

  return (
    <li className={cn("border-t border-line", !s.active && "opacity-70")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="grid w-full items-center gap-3 px-6 py-5 text-left transition-colors hover:bg-cell md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:gap-6 md:px-10">
        <span className="flex min-w-0 items-center gap-3">
          <span className="truncate text-lg text-ink-strong">{title}</span>
          {!s.active && <Hud as="span" tone="faint">{d.hidden}</Hud>}
        </span>
        <span className="font-mono text-sm tabular-nums text-ink">{price}</span>
        <Hud as="span" tone={s.queue.full ? "ember" : "muted"} dot={s.queue.full}>
          {lane}{s.queue.waiting ? ` · ${fill(d.waiting, { n: s.queue.waiting })}` : ""}
        </Hud>
        <ChevronDown aria-hidden className={cn("size-4 text-muted transition-transform duration-[var(--dur-standard)]", open && "rotate-180")} />
      </button>

      {/* Opens on the grid-rows 0fr → 1fr trick: height animates without measuring. */}
      <div className={cn("grid transition-[grid-template-rows] duration-[var(--dur-standard)] ease-[var(--ease-out)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-8 border-t border-line bg-cell/30 px-6 py-8 md:px-10">
            <Toggle label={d.listed} checked={s.active} onChange={(e) => set("active", e.target.checked)} />

            <div className="grid gap-6 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)]">
              <Field label={d.price} help={d.priceHelp} error={errors.amount}>
                {(a) => <Input id={a.id} aria-describedby={a.describedBy} inputMode="numeric" className="font-mono" value={s.amount === null ? "" : String(s.amount)}
                  onChange={(e) => set("amount", e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")))} />}
              </Field>
              <Field label={d.priceKind}>
                {(a) => (
                  <Select id={a.id} value={s.kind} onChange={(e) => set("kind", e.target.value)}>
                    {KINDS.map((k) => <option key={k} value={k}>{d.kinds[k]}</option>)}
                  </Select>
                )}
              </Field>
            </div>

            <fieldset className="flex flex-col gap-4">
              <legend className="hud mb-3 text-muted">{d.capacity}</legend>
              <div className="grid gap-3 md:grid-cols-3">
                {(["shared", "own", "direct"] as const).map((m) => (
                  <label key={m} className={cn(
                    "flex cursor-pointer flex-col gap-1 border border-line bg-bg p-4 transition-colors hover:border-line-strong",
                    "has-[:checked]:border-ember-400 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ember-400",
                  )}>
                    <input type="radio" name={`mode-${s.slug}`} className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
                    <span className="text-ink">{d.modes[m]}</span>
                    <span className="text-sm text-faint">{d.modesHelp[m]}</span>
                  </label>
                ))}
              </div>
              <div className="grid gap-6 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)]">
                {mode === "own" && (
                  <Field label={d.maxActive} help={d.maxActiveHelp} error={errors.max_active}>
                    {(a) => <Input id={a.id} aria-describedby={a.describedBy} inputMode="numeric" className="font-mono" value={String(s.max_active ?? "")}
                      onChange={(e) => set("max_active", e.target.value === "" ? 0 : Number(e.target.value.replace(/\D/g, "")))} />}
                  </Field>
                )}
                <Field label={d.typicalDays} help={d.typicalDaysHelp} error={errors.typical_days}>
                  {(a) => <Input id={a.id} aria-describedby={a.describedBy} inputMode="numeric" className="font-mono" value={String(s.typical_days)}
                    onChange={(e) => set("typical_days", Number(e.target.value.replace(/\D/g, "")) || 1)} />}
                </Field>
              </div>
            </fieldset>

            <div className="grid gap-6 lg:grid-cols-2">
              {(["en", "fr"] as const).map((l) => (
                <fieldset key={l} className="flex flex-col gap-5">
                  <legend className="hud mb-3 text-muted">{l === "en" ? "English" : "Français"}</legend>
                  {WORDS.map(([w, kind]) => {
                    const k = `${w}_${l}` as keyof Service;
                    return (
                      <Field key={k} label={d.words[w]} help={w === "deliverables" ? d.onePerLine : undefined} error={errors[k]}>
                        {(a) => kind === "long"
                          ? <Textarea id={a.id} aria-describedby={a.describedBy} rows={w === "summary" ? 2 : 4} className="min-h-20" value={String(s[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
                          : <Input id={a.id} aria-describedby={a.describedBy} value={String(s[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />}
                      </Field>
                    );
                  })}
                </fieldset>
              ))}
            </div>

            <div className="flex items-center justify-end gap-4 border-t border-line pt-6">
              <span aria-live="polite">
                {state !== "idle" && (
                  <Hud as="span" tone={state === "error" ? "ember" : "faint"} dot={state === "saving"} live={state === "saving"}>
                    {state === "saving" ? t.studio.dash.saving : state === "saved" ? t.studio.dash.saved : t.studio.dash.saveError}
                  </Hud>
                )}
              </span>
              <Button type="submit" variant="ember" size="sm" loading={state === "saving"}>{t.studio.dash.save}</Button>
            </div>
          </form>
        </div>
      </div>
    </li>
  );
}

/** Every service, editable any time: words, price, capacity and queue rules. */
export function ServicesEditor({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const [rows, setRows] = useState<Service[] | null>(null);
  useEffect(() => {
    if (user) api.get<Service[]>("/studio/services/").then(setRows, () => setRows([]));
  }, [user]);
  if (!user || !rows) return <SkeletonRows label={t.common.loading} rows={6} />;
  return (
    <ul>
      {rows.map((s) => (
        <ServiceRow key={s.slug} lang={lang} t={t} initial={s} onSaved={(fresh) => setRows((list) => list?.map((x) => (x.slug === fresh.slug ? fresh : x)) ?? null)} />
      ))}
    </ul>
  );
}
