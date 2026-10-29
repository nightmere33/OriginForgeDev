"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api, ApiError, type User } from "@/lib/api-client";
import { CurrencyToggle, useCurrency } from "@/lib/currency";
import { fetchSession, useSession } from "@/lib/session";
import { DecodeText, tearIn } from "@/motion/glitch";
import { Button } from "@/components/ui/button";
import { ChoiceChip, Field, Input } from "@/components/ui/field";
import { CountrySelect, currencyFor, englishName } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhoneNumber } from "libphonenumber-js";
import { safeNext } from "./auth-forms";

type T = Pick<Dictionary, "onboarding" | "common" | "phoneInput">;
type Answers = Pick<User, "full_name" | "handle" | "country_code" | "country" | "phone" | "language" | "heard_from" | "heard_from_detail"
  | "contact_channel" | "contact_handle" | "whatsapp">;

const HEARD = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "google", "github", "friend", "client", "other"] as const;
const CHANNELS = ["site", "whatsapp", "instagram", "discord", "email", "phone"] as const;
const DETAIL_FOR = new Set(["friend", "client", "other"]);
const HANDLE_FOR = new Set(["instagram", "discord"]);
const NUMBER_FOR = new Set(["whatsapp", "phone"]);

/**
 * The welcome after sign-up (or a first Google / Facebook sign-in): who they
 * are (name, username, country, phone), how the site should speak to them and
 * which prices to show (the country suggests the currency), how they found
 * me, and where they'd rather talk. Four short steps, skippable.
 */
export function Onboarding({ lang, t }: { lang: Locale; t: T }) {
  const user = useSession();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace(`/${lang}/login?next=${encodeURIComponent(`/${lang}/welcome`)}`);
  }, [user, lang, router]);
  if (!user) return <p className="hud text-muted">{t.common.loading}</p>;
  return <Steps lang={lang} t={t} user={user} />;
}

function Steps({ lang, t, user }: { lang: Locale; t: T; user: User }) {
  const o = t.onboarding;
  const router = useRouter();
  const params = useSearchParams();
  const { currency, setCurrency } = useCurrency();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Answers | "form", string>>>({});
  const [a, setA] = useState<Answers>({
    full_name: user.full_name, handle: user.handle ?? "", country_code: user.country_code ?? "", country: user.country ?? "",
    phone: user.phone ?? "",
    language: user.language === "fr" ? "fr" : lang,
    heard_from: user.heard_from, heard_from_detail: user.heard_from_detail,
    contact_channel: user.contact_channel || "site", contact_handle: user.contact_handle, whatsapp: user.whatsapp,
  });
  const pane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tearIn(pane.current);
  }, [step]);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setA((v) => ({ ...v, [key]: value }));
    setErrors({});
  };
  const destination = (language: string) =>
    safeNext(params.get("next"), `/${language}/portal`).replace(/^\/(en|fr)(?=\/|$)/, `/${language}`);

  const finish = async (skip = false) => {
    setBusy(true);
    setErrors({});
    try {
      await api.post<User>("/auth/onboarding/", skip ? { language: a.language, currency } : { ...a, currency });
      await fetchSession(true);
      router.push(destination(a.language));
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        const you = { full_name: err.field("full_name"), handle: err.field("handle"), country_code: err.field("country_code"), phone: err.field("phone") };
        const reach = { contact_handle: err.field("contact_handle"), whatsapp: err.field("whatsapp") };
        const any = Object.values({ ...you, ...reach }).some(Boolean);
        setErrors({ ...you, ...reach, form: any ? undefined : err.message });
        if (Object.values(you).some(Boolean)) setStep(0);
        else if (reach.contact_handle || reach.whatsapp) setStep(3);
      } else setErrors({ form: t.common.error });
    }
  };

  const last = step === o.steps.length - 1;
  // The first step's own checks: a name, and a phone that is a real number when given.
  const checkYou = () => {
    const e: typeof errors = {};
    if (!a.full_name.trim()) e.full_name = o.you.name;
    if (a.phone && !isValidPhoneNumber(a.phone, "DZ")) e.phone = o.you.phoneHelp;
    setErrors(e);
    return !Object.keys(e).length;
  };
  const total = String(o.steps.length).padStart(2, "0");

  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (step === 0 && !checkYou()) return;
      if (last) finish();
      else setStep(step + 1);
    }} className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="hud text-ember-400"><DecodeText text={`${String(step + 1).padStart(2, "0")} / ${total}`} /></span>
          <button type="button" onClick={() => finish(true)} disabled={busy} className="hud text-faint hover:text-ink">{o.skip}</button>
        </div>
        {/* The rail fills as they go. */}
        <div aria-hidden className="h-px bg-line">
          <div className="h-px origin-left bg-ember-400 transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `scaleX(${(step + 1) / o.steps.length})` }} />
        </div>
        <h2 className="text-xl text-ink-strong">{o.steps[step]}</h2>
      </div>

      <div ref={pane} className="flex flex-col gap-6">
        {step === 0 && (
          <>
            <Field label={o.you.name} error={errors.full_name}>
              {(f) => <Input id={f.id} autoComplete="name" aria-invalid={f.invalid} aria-describedby={f.describedBy} value={a.full_name} maxLength={150} onChange={(e) => set("full_name", e.target.value)} />}
            </Field>
            <Field label={o.you.handle} help={o.you.handleHelp} error={errors.handle}>
              {(f) => (
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-faint">@</span>
                  <Input id={f.id} autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={30}
                    aria-invalid={f.invalid} aria-describedby={f.describedBy} value={a.handle}
                    onChange={(e) => set("handle", e.target.value.replace(/^@+/, "").toLowerCase())} className="pl-8" />
                </div>
              )}
            </Field>
            <Field label={o.you.country} help={o.you.countryHelp} error={errors.country_code}>
              {(f) => (
                <CountrySelect id={f.id} lang={lang} labels={t.phoneInput} value={a.country_code} invalid={f.invalid} describedBy={f.describedBy}
                  onChange={(code) => {
                    setA((v) => ({ ...v, country_code: code, country: englishName(code) }));
                    setErrors({});
                    // Prices follow the country: dinars in Algeria, euros or dollars abroad (changeable next step).
                    setCurrency(currencyFor(code));
                  }} />
              )}
            </Field>
            <Field label={o.you.phone} help={o.you.phoneHelp} error={errors.phone}>
              {(f) => <PhoneInput id={f.id} lang={lang} labels={t.phoneInput} value={a.phone} invalid={f.invalid} describedBy={f.describedBy}
                defaultCountry={(a.country_code || "DZ") as never} onChange={(v) => set("phone", v)} />}
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <fieldset className="flex flex-col gap-3">
              <legend className="hud mb-3 text-muted">{o.language}</legend>
              <div className="grid grid-cols-2 gap-3">
                {(["en", "fr"] as const).map((l) => (
                  <ChoiceChip key={l} type="radio" name="language" label={l === "en" ? "English" : "Français"} checked={a.language === l} onChange={() => set("language", l)} />
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-3">
              <span className="hud text-muted">{o.currency}</span>
              <CurrencyToggle label={o.currency} />
              <p className="text-sm text-faint">{o.currencyHelp}</p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset>
              <legend className="sr-only">{o.steps[2]}</legend>
              <div className="grid grid-cols-2 gap-3">
                {HEARD.map((h) => (
                  <ChoiceChip key={h} type="radio" name="heard_from" label={o.heard[h]} checked={a.heard_from === h} onChange={() => set("heard_from", h)} />
                ))}
              </div>
            </fieldset>
            {DETAIL_FOR.has(a.heard_from) && (
              <Field label={a.heard_from === "other" ? o.heardOther : o.heardWho}>
                {(f) => <Input id={f.id} value={a.heard_from_detail} maxLength={160} onChange={(e) => set("heard_from_detail", e.target.value)} />}
              </Field>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <fieldset>
              <legend className="sr-only">{o.steps[3]}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {CHANNELS.map((c) => (
                  <ChoiceChip key={c} type="radio" name="contact_channel" label={o.channels[c]} description={o.channelHelp[c]} checked={a.contact_channel === c} onChange={() => set("contact_channel", c)} />
                ))}
              </div>
            </fieldset>
            {HANDLE_FOR.has(a.contact_channel) && (
              <Field label={a.contact_channel === "discord" ? o.discordHandle : o.instagramHandle} error={errors.contact_handle}>
                {(f) => <Input id={f.id} autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} value={a.contact_handle} maxLength={120} onChange={(e) => set("contact_handle", e.target.value)} />}
              </Field>
            )}
            {NUMBER_FOR.has(a.contact_channel) && (
              <Field label={o.number} error={errors.whatsapp}>
                {(f) => <Input id={f.id} type="tel" autoComplete="tel" aria-invalid={f.invalid} aria-describedby={f.describedBy} value={a.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />}
              </Field>
            )}
            <p className="text-sm text-faint">{o.channelNote}</p>
          </>
        )}
      </div>

      {errors.form && <p role="alert" className="text-sm text-err">{errors.form}</p>}
      <div className="flex items-center justify-between gap-4 border-t border-line pt-6">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}>{t.common.back}</Button>
        <Button type="submit" variant="ember" loading={busy} arrow={!last}>{last ? o.finish : t.common.next}</Button>
      </div>
    </form>
  );
}
