"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError, type User } from "@/lib/api-client";
import { CurrencyToggle, useCurrency } from "@/lib/currency";
import { fetchSession, useSession } from "@/lib/session";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Beside, ChoiceChip, Field, Input, Select } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { CountrySelect, englishName } from "@/components/ui/country-select";
import { Hud } from "@/components/ui/hud";
import { EmailCode } from "@/components/auth/email-code";

type T = Pick<Dictionary, "settings" | "start" | "portal" | "common" | "nav" | "onboarding" | "auth" | "phoneInput">;
type Profile = Pick<User, "full_name" | "handle" | "phone" | "whatsapp" | "instagram" | "messenger" | "company" | "country" | "country_code" | "address" | "city" | "postal_code" | "language" | "contact_channel" | "contact_handle">;
const CHANNELS = ["site", "whatsapp", "instagram", "discord", "email", "phone"] as const;

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-6 border-t border-line px-6 py-8 md:grid-cols-[14rem_1fr] md:px-10">
      <Hud tone="faint" as="h3">{title}</Hud>
      <div className="flex max-w-2xl flex-col gap-6">{children}</div>
    </section>
  );
}

/**
 * The profile picture uploads on its own, at once: the server crops it,
 * strips the photo data and checks it for explicit content before keeping it.
 */
function PictureField({ t, user }: { t: T; user: User }) {
  const p = t.settings.picture;
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"" | "busy" | "saved">("");
  const [error, setError] = useState<string>();
  const send = async (file?: File) => {
    setState("busy");
    setError(undefined);
    try {
      if (file) {
        const form = new FormData();
        form.append("file", file);
        await api.post("/auth/me/avatar/", form);
      } else await api.delete("/auth/me/avatar/");
      await fetchSession(true);
      setState(file ? "saved" : "");
    } catch (err) {
      setState("");
      setError(err instanceof ApiError ? err.field("file") ?? err.message : t.common.error);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="hud text-muted">{p.label}</span>
      <div className="flex flex-wrap items-center gap-4">
        <span className="relative">
          <Avatar name={user.full_name} src={user.avatar_url} className="size-16 text-sm" />
          {state === "busy" && <span aria-hidden className="absolute inset-0 animate-pulse rounded-full bg-bg/60" />}
        </span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) send(file);
          }} />
        <Button type="button" variant="secondary" size="sm" loading={state === "busy"} onClick={() => input.current?.click()}>
          {user.avatar_url ? p.change : p.choose}
        </Button>
        {user.avatar_url && state !== "busy" && (
          <Button type="button" variant="ghost" size="sm" onClick={() => send()}>{p.remove}</Button>
        )}
        <span role="status" className="hud text-faint">{state === "busy" ? p.checking : state === "saved" ? p.saved : ""}</span>
      </div>
      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-err"><span aria-hidden className="size-1.5 shrink-0 bg-err" />{error}</p>
      ) : (
        <p className="text-sm text-faint">{p.help}</p>
      )}
    </div>
  );
}

function ProfileForm({ lang, t, user }: { lang: Locale; t: T; user: User }) {
  const s = t.settings;
  const [waSame, setWaSame] = useState(!user.whatsapp || user.whatsapp === user.phone);
  const [form, setForm] = useState<Profile>({
    full_name: user.full_name, handle: user.handle ?? "", country_code: user.country_code ?? "", phone: user.phone, whatsapp: user.whatsapp, instagram: user.instagram ?? "", messenger: user.messenger ?? "",
    company: user.company, country: user.country, language: user.language,
    address: user.address ?? "", city: user.city ?? "", postal_code: user.postal_code ?? "",
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
      await api.patch("/auth/me/", { ...form, whatsapp: waSame ? form.phone : form.whatsapp });
      await fetchSession(true);
      setState("saved");
    } catch (err) {
      setState("");
      setErrors(err instanceof ApiError
        ? { full_name: err.field("full_name"), handle: err.field("handle"), country_code: err.field("country_code"), phone: err.field("phone"),
            instagram: err.field("instagram"), messenger: err.field("messenger"), form: err.message }
        : { form: t.common.error });
    }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="contents">
      <Band title={s.profile}>
        <PictureField t={t} user={user} />
        <Field label={s.email}>{(a) => <Input id={a.id} value={user.email} readOnly disabled />}</Field>
        {!user.email_verified && <VerifyNow t={t} user={user} />}
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t.start.fullName} error={errors.full_name}>
            {(a) => <Input id={a.id} autoComplete="name" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />}
          </Field>
          <Field label={s.handle} help={s.handleHelp} error={errors.handle}>
            {(a) => (
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-faint">@</span>
                <Input id={a.id} autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={30}
                  aria-invalid={a.invalid} aria-describedby={a.describedBy} value={form.handle}
                  onChange={(e) => set("handle", e.target.value.replace(/^@+/, "").toLowerCase())} className="pl-8" />
              </div>
            )}
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t.start.phone} error={errors.phone}>
            {(a) => <PhoneInput id={a.id} lang={lang} labels={t.phoneInput} value={form.phone} invalid={a.invalid} describedBy={a.describedBy} onChange={(v) => set("phone", v)} />}
          </Field>
          <Beside>
            <ChoiceChip inline label={t.start.whatsappSame} checked={waSame} onChange={(e) => {
              setWaSame(e.target.checked);
              setState("");
            }} />
          </Beside>
          {!waSame && (
            <Field label={t.start.whatsapp} className="sm:col-span-2 sm:max-w-[calc(50%-0.75rem)]">
              {(a) => <PhoneInput id={a.id} lang={lang} labels={t.phoneInput} value={form.whatsapp} autoComplete="off" onChange={(v) => set("whatsapp", v)} />}
            </Field>
          )}
          <Field label={t.start.instagram} error={errors.instagram}>
            {(a) => (
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-faint">@</span>
                <Input id={a.id} value={form.instagram} placeholder={t.start.instagramHint} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  aria-invalid={a.invalid} onChange={(e) => set("instagram", e.target.value.replace(/^@+/, ""))} className="pl-8" />
              </div>
            )}
          </Field>
          <Field label={t.start.messenger} error={errors.messenger}>
            {(a) => <Input id={a.id} value={form.messenger} placeholder={t.start.messengerHint} autoCapitalize="off" autoCorrect="off" spellCheck={false}
              aria-invalid={a.invalid} onChange={(e) => set("messenger", e.target.value)} />}
          </Field>
          <Field label={t.start.company}>{(a) => <Input id={a.id} autoComplete="organization" value={form.company} onChange={(e) => set("company", e.target.value)} />}</Field>
          <Field label={s.country} error={errors.country_code}>
            {(a) => (
              <CountrySelect id={a.id} lang={lang} labels={t.phoneInput} value={form.country_code} invalid={a.invalid} describedBy={a.describedBy}
                onChange={(code) => {
                  setForm((f) => ({ ...f, country_code: code, country: englishName(code) }));
                  setState("");
                }} />
            )}
          </Field>
        </div>
      </Band>
      <Band title={s.addressTitle}>
        <Field label={s.address} help={s.addressHelp}>
          {(a) => <Input id={a.id} aria-describedby={a.describedBy} autoComplete="street-address" value={form.address} maxLength={255} onChange={(e) => set("address", e.target.value)} />}
        </Field>
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label={s.city}>{(a) => <Input id={a.id} autoComplete="address-level2" value={form.city} maxLength={80} onChange={(e) => set("city", e.target.value)} />}</Field>
          <Field label={s.postalCode}>{(a) => <Input id={a.id} autoComplete="postal-code" inputMode="numeric" value={form.postal_code} maxLength={20} onChange={(e) => set("postal_code", e.target.value)} />}</Field>
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

/** An unconfirmed address: confirm it right here with the e-mailed code. */
function VerifyNow({ t, user }: { t: T; user: User }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    // A code may already be on its way (sign-up): asking too soon just waits.
    await api.post("/auth/verify-email/resend/").catch(() => undefined);
    setBusy(false);
    setOpen(true);
  };
  return (
    <div className="flex flex-col gap-4 border border-ember-400/40 bg-ember-500/[0.05] p-5">
      <Hud tone="ember" dot>{t.auth.code.unverified}</Hud>
      {open ? <EmailCode a={t.auth} email={user.email} onVerified={() => setOpen(false)} /> : (
        <Button variant="secondary" size="sm" loading={busy} onClick={start}>{t.auth.code.verifyNow}</Button>
      )}
    </div>
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

/**
 * Change the password, or, for an account made with Google or Facebook (it
 * has none), set a first one so the e-mail works for signing in too.
 */
function PasswordForm({ t, hasPassword }: { t: T; hasPassword: boolean }) {
  const s = t.settings;
  const first = !hasPassword;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; next?: string; form?: string }>({});
  const change = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.post("/auth/password/change/", first ? { new_password: next } : { current_password: current, new_password: next });
      if (first) await fetchSession(true);
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
        {first && <p className="text-sm leading-relaxed text-muted">{s.setPasswordLead}</p>}
        <div className="grid gap-6 sm:grid-cols-2">
          {!first && (
            <Field label={s.currentPassword} error={errors.current}>
              {(a) => <Input id={a.id} type="password" autoComplete="current-password" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={current} onChange={(e) => { setCurrent(e.target.value); setDone(false); }} />}
            </Field>
          )}
          <Field label={s.newPassword} help={t.start.passwordHelp} error={errors.next}>
            {(a) => <Input id={a.id} type="password" autoComplete="new-password" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={next} onChange={(e) => { setNext(e.target.value); setDone(false); }} />}
          </Field>
        </div>
        {errors.form && <p role="alert" className="text-sm text-err">{errors.form}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="secondary" disabled={(!first && !current) || next.length < 10} loading={busy}>{first ? s.setPassword : s.changePassword}</Button>
          <span aria-live="polite">{done && <Hud tone="ink" dot as="span">{first ? s.passwordSet : s.passwordChanged}</Hud>}</span>
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
        <Link href={`/${lang}/${user.is_developer ? "studio" : "portal"}`} className="hud -my-3 inline-flex min-h-11 items-center text-muted hover:text-ink">← {t.portal.requests}</Link>
      </div>
      <ProfileForm lang={lang} t={t} user={user} />
      <PasswordForm t={t} hasPassword={user.has_password} />
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
