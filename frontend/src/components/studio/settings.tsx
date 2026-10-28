"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { fill } from "@/i18n/fill";
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
    fields: [["is_available", "bool", "wide"], ["max_active_projects", "number"], ["available_from", "date"], ["reply_hours", "number"], ["review_hours", "number"],
      ["availability_en", "text"], ["availability_fr", "text"]],
  },
  {
    key: "contact",
    fields: [["email", "text"], ["phone", "text"], ["whatsapp", "text"], ["discord_username", "text"], ["github_url", "text"], ["linkedin_url", "text"],
      ["instagram_url", "text"], ["x_url", "text"], ["upwork_url", "text"]],
  },
  {
    key: "about",
    fields: [["location_en", "text"], ["location_fr", "text"], ["years_experience", "number"], ["projects_shipped", "number"],
      ["about_en", "long", "wide"], ["about_fr", "long", "wide"]],
  },
  {
    key: "payments", help: "payments",
    fields: [["ccp_account", "text", "mono"], ["ccp_key", "text", "mono"], ["ccp_holder", "text"], ["ccp_address", "text"], ["baridimob_rip", "text", "mono"],
      ["usdt_bep20_address", "text", "mono"], ["usdt_rate_override", "text", "mono"], ["cash_note_en", "text"], ["cash_note_fr", "text"]],
  },
  {
    key: "invoices", help: "invoices",
    fields: [["seller_name", "text", "wide"], ["seller_address", "long"], ["seller_tax_ids", "long"], ["invoice_note_en", "text"], ["invoice_note_fr", "text"]],
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

type EmailStatus = { backend: "smtp" | "console"; host: string; from: string; studio: string; worker: boolean | null; sent?: boolean; to?: string; error?: string };

/**
 * Is e-mail really leaving? How it is sent (a mail server, or only the
 * server log), whether the worker that sends it answers, and a button that
 * sends a real test right now and shows what the mail server said.
 */
function EmailCheck({ d }: { d: D }) {
  const e = d.email;
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<EmailStatus>("/studio/email/").then(setStatus, () => undefined);
  }, []);
  const test = async () => {
    setBusy(true);
    try {
      setStatus(await api.post<EmailStatus>("/studio/email/"));
    } finally {
      setBusy(false);
    }
  };
  const row = (label: string, value: string, ok: boolean | null) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="hud text-faint">{label}</span>
      <span className={cn("text-right text-sm", ok === false ? "text-err" : ok ? "text-ok" : "text-ink")}>{value}</span>
    </div>
  );
  return (
    <section className="grid gap-px border-t border-line bg-line lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="flex flex-col gap-3 bg-bg px-6 py-8 md:px-10">
        <h2 className="text-h3 tracking-[-0.02em] text-ink-strong">{e.title}</h2>
        <p className="max-w-sm text-sm leading-relaxed text-faint">{e.help}</p>
      </div>
      <div className="flex flex-col gap-6 bg-bg px-6 py-8 md:px-10">
        {!status ? <Skeleton className="h-28 w-full" /> : (
          <div className="border border-line px-4">
            {row(e.backend, status.backend === "smtp" ? `${e.smtp} · ${status.host}` : e.console, status.backend === "smtp")}
            {row(e.worker, status.worker === null ? e.inline : status.worker ? e.workerUp : e.workerDown, status.worker)}
            {row(e.from, status.from, null)}
            {row(e.studio, status.studio || "·", status.studio ? null : false)}
          </div>
        )}
        {status?.to !== undefined && (
          <p role="status" className={cn("flex items-start gap-2 text-sm", status.sent ? "text-ok" : "text-err")}>
            <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0", status.sent ? "bg-ok" : "bg-err")} />
            {status.sent ? fill(e.sent, { to: status.to }) : `${e.failed} ${status.error ?? ""}`}
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" loading={busy} onClick={test}>{e.test}</Button>
        </div>
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
      <EmailCheck d={d} />
    </div>
  );
}
