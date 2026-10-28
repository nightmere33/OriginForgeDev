"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { day } from "@/lib/lifecycle";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";

type Invite = { id: number; email: string; full_name: string; language: string; project: string; slug: string; state: "sent" | "used" | "expired"; created_at: string };
type T = Pick<Dictionary, "studio" | "common">;

/**
 * Review invitations for projects done before the platform (MediGate): the
 * client gets an e-mail, signs in with that address and reviews the
 * project, which then shows with its logo and page on the website.
 */
export function StudioInvites({ lang, t }: { lang: Locale; t: T }) {
  const v = t.studio.reviews.invites;
  const user = useSession();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ invites: Invite[]; projects: { slug: string; title: string }[] } | null>(null);
  const [form, setForm] = useState({ email: "", full_name: "", case_study: "", language: lang === "fr" ? "fr" : "en" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const load = useCallback(() => api.get<NonNullable<typeof data>>("/reviews/studio/invites/").then((d) => {
    setData(d);
    setForm((f) => ({ ...f, case_study: f.case_study || d.projects[0]?.slug || "" }));
  }, () => undefined), []);
  useEffect(() => {
    if (user?.is_developer) load();
  }, [user, load]);
  if (!user?.is_developer) return null;

  const send = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.post("/reviews/studio/invites/", form);
      setSentTo(form.email);
      setForm((f) => ({ ...f, email: "", full_name: "" }));
      await load();
    } catch (err) {
      setErrors(err instanceof ApiError ? Object.fromEntries(Object.keys(err.data).map((k) => [k, err.field(k) ?? ""])) : { form: t.common.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-cell md:px-10">
        <Send aria-hidden className="size-4 text-ember-400" />
        <span className="text-ink-strong">{v.title}</span>
        <span className="hidden text-sm text-faint sm:inline">{v.lead}</span>
        <ChevronDown aria-hidden className={cn("ml-auto size-4 text-muted transition-transform duration-[var(--dur-standard)]", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-[var(--dur-standard)] ease-[var(--ease-out)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <form noValidate onSubmit={(e) => { e.preventDefault(); send(); }} className="grid gap-6 border-t border-line bg-cell/30 px-6 py-8 md:grid-cols-2 md:px-10">
            <Field label={v.email} error={errors.email}>
              {(a) => <Input id={a.id} type="email" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
            </Field>
            <Field label={v.name}>{(a) => <Input id={a.id} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}</Field>
            <Field label={v.project} error={errors.case_study}>
              {(a) => (
                <Select id={a.id} value={form.case_study} onChange={(e) => setForm({ ...form, case_study: e.target.value })}>
                  {(data?.projects ?? []).map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
                </Select>
              )}
            </Field>
            <Field label={v.language}>
              {(a) => (
                <Select id={a.id} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap items-center justify-end gap-4 md:col-span-2">
              {sentTo && <Hud as="span" tone="ink" dot>{fill(v.sent, { email: sentTo })}</Hud>}
              {errors.form && <span className="text-sm text-err">{errors.form}</span>}
              <Button type="submit" variant="ember" size="sm" loading={busy} disabled={!form.email || !form.case_study}>{v.send}</Button>
            </div>
          </form>
          {data && data.invites.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {data.invites.map((i) => (
                <li key={i.id} className="grid gap-1 px-6 py-3 md:grid-cols-[minmax(0,1fr)_10rem_7rem] md:items-center md:gap-6 md:px-10">
                  <span className="truncate text-sm text-ink">{[i.full_name, i.email].filter(Boolean).join(" · ")}</span>
                  <span className="truncate text-sm text-muted">{i.project}</span>
                  <Hud as="span" tone={i.state === "used" ? "ink" : i.state === "expired" ? "faint" : "ember"} dot={i.state === "sent"}>
                    {v.states[i.state]} · {day(lang, i.created_at, false)}
                  </Hud>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
