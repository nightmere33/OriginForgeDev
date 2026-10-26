"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError, type User } from "@/lib/api-client";
import { CurrencyToggle, useCurrency } from "@/lib/currency";
import { fetchSession, useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";

type T = Pick<Dictionary, "settings" | "start" | "portal" | "common" | "nav" | "onboarding">;
type Profile = Pick<User, "full_name" | "phone" | "whatsapp" | "company" | "country" | "language" | "contact_channel" | "contact_handle">;
const CHANNELS = ["site", "whatsapp", "instagram", "discord", "email", "phone"] as const;

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-6 border-t border-line px-6 py-8 md:grid-cols-[14rem_1fr] md:px-10">
      <Hud tone="faint" as="h3">{title}</Hud>
      <div className="flex max-w-2xl flex-col gap-6">{children}</div>
    </section>
  );
}

function ProfileForm({ t, user }: { t: T; user: User }) {
  const s = t.settings;
  const [form, setForm] = useState<Profile>({
    full_name: user.full_name, phone: user.phone, whatsapp: user.whatsapp, company: user.company, country: user.country, language: user.language,
    contact_channel: user.contact_channel || "site", contact_handle: user.contact_handle,
  });
  const [state, setState] = useState<"" | "busy" | "saved">("");
  const [errors, setErrors] = useState<Partial<Record<keyof Profile | "form", string>>>({});
  const set = (key: keyof Profile, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setState("");
  };
  const save = async () => {
    setState("busy");
    setErrors({});
    try {
      await api.patch("/auth/me/", form);
      await fetchSession(true);
      setState("saved");
    } catch (err) {
      setState("");
      setErrors(err instanceof ApiError ? { full_name: err.field("full_name"), phone: err.field("phone"), form: err.message } : { form: t.common.error });
    }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="contents">
      <Band title={s.profile}>
        <Field label={s.email}>{(a) => <Input id={a.id} value={user.email} readOnly disabled />}</Field>
        <Field label={t.start.fullName} error={errors.full_name}>
          {(a) => <Input id={a.id} autoComplete="name" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />}
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t.start.phone} error={errors.phone}>{(a) => <Input id={a.id} type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />}</Field>
          <Field label={t.start.whatsapp}>{(a) => <Input id={a.id} type="tel" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />}</Field>
          <Field label={t.start.company}>{(a) => <Input id={a.id} autoComplete="organization" value={form.company} onChange={(e) => set("company", e.target.value)} />}</Field>
          <Field label={s.country}>{(a) => <Input id={a.id} autoComplete="country-name" value={form.country} onChange={(e) => set("country", e.target.value)} />}</Field>
        </div>
      </Band>
      <Preferences t={t} language={form.language} onLanguage={(v) => set("language", v)} />
      <Band title={s.reach}>
        <Field label={s.channel} help={s.channelHelp}>
          {(a) => (
            <Select id={a.id} value={form.contact_channel} onChange={(e) => set("contact_channel", e.target.value)} className="sm:max-w-xs">
              {CHANNELS.map((c) => <option key={c} value={c}>{t.onboarding.channels[c]}</option>)}
            </Select>
          )}
        </Field>
        {(form.contact_channel === "instagram" || form.contact_channel === "discord") && (
          <Field label={form.contact_channel === "discord" ? t.onboarding.discordHandle : t.onboarding.instagramHandle}>
            {(a) => <Input id={a.id} autoComplete="off" value={form.contact_handle} maxLength={120} onChange={(e) => set("contact_handle", e.target.value)} />}
          </Field>
        )}
      </Band>
      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-line px-6 py-6 md:px-10">
        {errors.form && <p role="alert" className="mr-auto text-sm text-err">{errors.form}</p>}
        <span aria-live="polite">{state === "saved" && <Hud tone="ink" dot as="span">{s.saved}</Hud>}</span>
        <Button type="submit" variant="ember" loading={state === "busy"}>{s.save}</Button>
      </div>
    </form>
  );
}

function Preferences({ t, language, onLanguage }: { t: T; language: User["language"]; onLanguage: (v: User["language"]) => void }) {
  const s = t.settings;
  const { rates } = useCurrency();
  const r = rates?.rates;
  return (
    <Band title={s.preferences}>
      <Field label={s.language}>
        {(a) => (
          <Select id={a.id} value={language} onChange={(e) => onLanguage(e.target.value as User["language"])} className="sm:max-w-xs">
            <option value="en">English</option>
            <option value="fr">Français</option>
          </Select>
        )}
      </Field>
      <div className="flex flex-col gap-3">
        <span className="hud text-muted">{s.currency}</span>
        {/* Saved at once, on this device and the account. */}
        <CurrencyToggle label={s.currency} />
        <p className="text-sm text-faint">{s.currencyHelp}</p>
        {r?.EUR && r?.USD && <Hud tone="faint">{fill(s.rateNote, { eur: r.EUR.toFixed(2), usd: r.USD.toFixed(2) })}</Hud>}
      </div>
    </Band>
  );
}

function PasswordForm({ t }: { t: T }) {
  const s = t.settings;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; next?: string; form?: string }>({});
  const change = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.post("/auth/password/change/", { current_password: current, new_password: next });
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (err) {
      setErrors(err instanceof ApiError
        ? { current: err.field("current_password"), next: err.field("new_password"), form: err.field("current_password") || err.field("new_password") ? undefined : err.message }
        : { form: t.common.error });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); change(); }} className="contents">
      <Band title={s.security}>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={s.currentPassword} error={errors.current}>
            {(a) => <Input id={a.id} type="password" autoComplete="current-password" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={current} onChange={(e) => { setCurrent(e.target.value); setDone(false); }} />}
          </Field>
          <Field label={s.newPassword} help={t.start.passwordHelp} error={errors.next}>
            {(a) => <Input id={a.id} type="password" autoComplete="new-password" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={next} onChange={(e) => { setNext(e.target.value); setDone(false); }} />}
          </Field>
        </div>
        {errors.form && <p role="alert" className="text-sm text-err">{errors.form}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="secondary" disabled={!current || next.length < 10} loading={busy}>{s.changePassword}</Button>
          <span aria-live="polite">{done && <Hud tone="ink" dot as="span">{s.passwordChanged}</Hud>}</span>
        </div>
      </Band>
    </form>
  );
}

export function SettingsPage({ lang, t }: { lang: Locale; t: T }) {
  const user = useSession();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace(`/${lang}/login?next=${encodeURIComponent(location.pathname)}`);
  }, [user, lang, router]);
  if (!user) return <p className="hud px-6 py-16 text-muted md:px-10">{t.common.loading}</p>;
  return (
    <>
      <div className="border-t border-line px-6 py-4 md:px-10">
        <Link href={`/${lang}/${user.is_developer ? "studio" : "portal"}`} className="hud text-muted hover:text-ink">← {t.portal.requests}</Link>
      </div>
      <ProfileForm t={t} user={user} />
      <PasswordForm t={t} />
      {!user.is_developer && <DeleteAccount lang={lang} t={t} hasPassword={user.has_password} />}
    </>
  );
}

/**
 * Delete the account (privacy policy; Facebook's data-deletion rule). Asks for
 * the password and a typed word, then signs out. Refused while a project is
 * being built; the reason comes back from the API.
 */
function DeleteAccount({ lang, t, hasPassword }: { lang: Locale; t: T; hasPassword: boolean }) {
  const s = t.settings;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const word = s.deleteWord;
  const remove = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.post("/auth/delete/", { password, confirm });
      await fetchSession(true);
      router.replace(`/${lang}?deleted=1`);
      router.refresh();
    } catch (err) {
      setBusy(false);
      setErrors(err instanceof ApiError
        ? { password: err.field("password"), confirm: err.field("confirm"), form: err.field("password") || err.field("confirm") ? undefined : err.message }
        : { form: t.common.error });
    }
  };
  return (
    <Band title={s.deleteTitle}>
      <p className="text-muted">{s.deleteLead}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-faint">
        {s.deleteFacts.map((f) => <li key={f}>{f}</li>)}
      </ul>
      {!open ? (
        <Button variant="secondary" className="self-start border-err/60 text-err hover:border-err" onClick={() => setOpen(true)}>{s.deleteOpen}</Button>
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); remove(); }} className="flex flex-col gap-6 border border-err/40 p-5">
          {hasPassword && (
            <Field label={s.currentPassword} error={errors.password}>
              {(a) => <Input id={a.id} type="password" autoComplete="current-password" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
          )}
          <Field label={fill(s.deleteType, { word })} error={errors.confirm}>
            {(a) => <Input id={a.id} autoComplete="off" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          {errors.form && <p role="alert" className="text-sm text-err">{errors.form}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" variant="secondary" className="border-err/60 text-err hover:border-err" disabled={(hasPassword && !password) || confirm.trim().toUpperCase() !== word} loading={busy}>{s.deleteConfirm}</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setPassword(""); setConfirm(""); }} disabled={busy}>{s.deleteCancel}</Button>
          </div>
        </form>
      )}
    </Band>
  );
}
