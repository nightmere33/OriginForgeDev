"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { Hud } from "@/components/ui/hud";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { useGuard } from "@/components/portal/requests";

type T = Pick<Dictionary, "studio" | "common">;
type D = Dictionary["studio"]["dash"];
type Values = Record<string, string | number | boolean | null>;
type Kind = "text" | "long" | "number" | "date" | "bool";
type Save = "idle" | "saving" | "saved" | "error";
type FieldKey = keyof D["fields"];

// What each section edits, in order; `wide` fields take the whole row.
const SECTIONS: { key: keyof D["sections"]; help?: keyof D["help"]; fields: [FieldKey, Kind, ("wide" | "mono")?][] }[] = [
  {
    key: "availability", help: "availability",
    fields: [["is_available", "bool", "wide"], ["max_active_projects", "number"], ["available_from", "date"], ["availability_en", "text"], ["availability_fr", "text"]],
  },
  {
    key: "contact",
    fields: [["email", "text"], ["phone", "text"], ["whatsapp", "text"], ["discord_username", "text"], ["github_url", "text"], ["linkedin_url", "text"],
      ["instagram_url", "text"], ["x_url", "text"], ["upwork_url", "text"]],
  },
  {
    key: "about",
    fields: [["location_en", "text"], ["location_fr", "text"], ["years_experience", "number"], ["projects_shipped", "number"], ["reply_hours", "number"],
      ["about_en", "long", "wide"], ["about_fr", "long", "wide"]],
  },
  {
    key: "payments", help: "payments",
    fields: [["ccp_account", "text", "mono"], ["ccp_key", "text", "mono"], ["ccp_holder", "text"], ["ccp_address", "text"], ["baridimob_rip", "text", "mono"],
      ["usdt_bep20_address", "text", "mono"], ["usdt_rate_override", "text", "mono"], ["cash_note_en", "text"], ["cash_note_fr", "text"]],
  },
];

function SaveState({ d, state }: { d: D; state: Save }) {
  const label = { idle: "", saving: d.saving, saved: d.saved, error: d.saveError }[state];
  return <span aria-live="polite">{label && <Hud as="span" tone={state === "error" ? "ember" : "faint"} dot={state === "saving"} live={state === "saving"}>{label}</Hud>}</span>;
}

/** One block of settings: its own form, saved on its own (only what it shows is sent). */
function SettingsSection({ lang, d, section, initial, onSaved }: { lang: Locale; d: D; section: (typeof SECTIONS)[number]; initial: Values; onSaved: (v: Values) => void }) {
  const [values, setValues] = useState<Values>(() => Object.fromEntries(section.fields.map(([k]) => [k, initial[k] ?? null])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<Save>("idle");
  const set = (k: string, v: Values[string]) => {
    setValues((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
    setState("idle");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("saving");
    // Empty dates and numbers go as null; text stays a string.
    const body = Object.fromEntries(section.fields.map(([k, kind]) => {
      const v = values[k];
      if (kind === "number") return [k, v === "" || v === null ? (k === "max_active_projects" ? 0 : null) : Number(v)];
      if (kind === "date" || k === "usdt_rate_override") return [k, v === "" ? null : v];
      return [k, v ?? ""];
    }));
    try {
      const saved = await api.patch<Values>("/studio/settings/", body);
      onSaved(saved);
      setState("saved");
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.fromEntries(section.fields.map(([k]) => [k, err.field(k) ?? ""])));
      setState("error");
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-px border-t border-line bg-line lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="flex flex-col gap-3 bg-bg px-6 py-8 md:px-10">
        <h2 className="text-h3 tracking-[-0.02em] text-ink-strong">{d.sections[section.key]}</h2>
        {section.help && <p className="max-w-sm text-sm leading-relaxed text-faint">{d.help[section.help]}</p>}
      </div>
      <div className="flex flex-col gap-6 bg-bg px-6 py-8 md:px-10">
        <div className="grid gap-6 sm:grid-cols-2">
          {section.fields.map(([k, kind, mod]) => {
            const v = values[k];
            const wide = mod === "wide" || kind === "long";
            if (kind === "bool") {
              return <Toggle key={k} className="sm:col-span-2" label={d.fields[k]} checked={!!v} onChange={(e) => set(k, e.target.checked)} />;
            }
            return (
              <Field key={k} label={d.fields[k]} error={errors[k] || undefined} className={cn(wide && "sm:col-span-2")}>
                {(a) => kind === "long" ? (
                  <Textarea id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} value={String(v ?? "")} onChange={(e) => set(k, e.target.value)} />
                ) : kind === "date" ? (
                  <DatePicker id={a.id} lang={lang} aria-describedby={a.describedBy} aria-invalid={a.invalid} value={String(v ?? "")} onChange={(x) => set(k, x)} />
                ) : (
                  <Input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid}
                    inputMode={kind === "number" ? "numeric" : undefined}
                    value={String(v ?? "")} className={cn(mod === "mono" && "font-mono")}
                    onChange={(e) => set(k, kind === "number" ? e.target.value.replace(/\D/g, "") : e.target.value)} />
                )}
              </Field>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-4 border-t border-line pt-6">
          <SaveState d={d} state={state} />
          <Button type="submit" variant="primary" size="sm" loading={state === "saving"}>{d.save}</Button>
        </div>
      </div>
    </form>
  );
}

type PriceRow = { slug: string; title: string; title_fr: string; active: boolean; amount: number | null; kind: string };

/** Starting prices in DZD and which services are listed. Each row saves when it changes. */
function Prices({ lang, d }: { lang: Locale; d: D }) {
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  // What the server holds, so leaving a field untouched sends nothing.
  const [server, setServer] = useState<PriceRow[]>([]);
  const [state, setState] = useState<Record<string, Save>>({});
  useEffect(() => {
    api.get<PriceRow[]>("/studio/prices/").then((r) => {
      setRows(r);
      setServer(r);
    }, () => setRows([]));
  }, []);
  const save = async (slug: string, patch: Partial<PriceRow>) => {
    const before = server.find((r) => r.slug === slug);
    if (before && Object.entries(patch).every(([k, v]) => before[k as keyof PriceRow] === v)) return;
    setState((s) => ({ ...s, [slug]: "saving" }));
    try {
      const fresh = await api.patch<PriceRow[]>("/studio/prices/", { slug, ...patch });
      setRows(fresh);
      setServer(fresh);
      setState((s) => ({ ...s, [slug]: "saved" }));
    } catch {
      setState((s) => ({ ...s, [slug]: "error" }));
    }
  };
  const edit = (slug: string, patch: Partial<PriceRow>) => setRows((list) => list?.map((r) => (r.slug === slug ? { ...r, ...patch } : r)) ?? null);

  return (
    <section className="grid gap-px border-t border-line bg-line lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="flex flex-col gap-3 bg-bg px-6 py-8 md:px-10">
        <h2 className="text-h3 tracking-[-0.02em] text-ink-strong">{d.sections.prices}</h2>
        <p className="max-w-sm text-sm leading-relaxed text-faint">{d.help.prices}</p>
      </div>
      <div className="bg-bg">
        {!rows ? (
          <div className="flex flex-col gap-4 px-6 py-8 md:px-10">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.slug} className={cn("grid gap-3 px-6 py-5 md:grid-cols-[minmax(0,1fr)_9rem_10rem] md:items-center md:px-10", !r.active && "opacity-60")}>
                <div className="flex flex-col gap-2">
                  <span className="text-ink">{lang === "fr" && r.title_fr ? r.title_fr : r.title}</span>
                  <span className="flex flex-wrap items-center gap-3">
                    <Toggle label={d.listed} checked={r.active} onChange={(e) => { edit(r.slug, { active: e.target.checked }); save(r.slug, { active: e.target.checked }); }} />
                    <SaveState d={d} state={state[r.slug] ?? "idle"} />
                  </span>
                </div>
                <Input aria-label={`${r.title} · DZD`} inputMode="numeric" className="font-mono" value={r.amount === null ? "" : String(r.amount)}
                  onChange={(e) => edit(r.slug, { amount: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })}
                  onBlur={() => save(r.slug, { amount: r.amount })} />
                <Select aria-describedby={undefined} value={r.kind} onChange={(e) => { edit(r.slug, { kind: e.target.value }); if (r.amount !== null) save(r.slug, { amount: r.amount, kind: e.target.value }); }}>
                  {(["from", "per_minute", "fixed", "monthly", "hourly"] as const).map((k) => <option key={k} value={k}>{d.kinds[k]}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function StudioSettings({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const d = t.studio.dash;
  const [values, setValues] = useState<Values | null>(null);
  useEffect(() => {
    if (user) api.get<Values>("/studio/settings/").then(setValues, () => undefined);
  }, [user]);

  if (!user || !values) {
    return (
      <div role="status" aria-label={t.common.loading} className="grid gap-px border-t border-line bg-line lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="flex flex-col gap-3 bg-bg px-6 py-8 md:px-10"><Skeleton className="h-6 w-40" /><Skeleton className="h-3 w-56" /></div>
        <div className="grid gap-6 bg-bg px-6 py-8 sm:grid-cols-2 md:px-10">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      </div>
    );
  }
  return (
    <div>
      {SECTIONS.map((section) => (
        <SettingsSection key={section.key} lang={lang} d={d} section={section} initial={values} onSaved={setValues} />
      ))}
      <Prices lang={lang} d={d} />
    </div>
  );
}
