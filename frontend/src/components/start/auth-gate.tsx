"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api, ApiError, type User } from "@/lib/api-client";
import { fetchSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Accented } from "@/components/ui/hud";
import { cn } from "@/lib/cn";

type Errors = Partial<Record<"full_name" | "email" | "password" | "form", string>>;

/**
 * Sign in before the wizard: the draft then lives on the account and resumes
 * on any device. Plain e-mail + password works inside Instagram and Facebook's
 * in-app browsers, where Google sign-in is blocked.
 */
export function AuthGate({
  lang, t, onSignedIn,
}: {
  lang: Locale;
  t: Pick<Dictionary, "start" | "auth" | "common">;
  onSignedIn: (user: User) => void;
}) {
  const s = t.start;
  const [mode, setMode] = useState<"register" | "login">("register");
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "", whatsapp: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const submit = async () => {
    const e: Errors = {};
    if (mode === "register" && !form.full_name.trim()) e.full_name = s.required;
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = s.required;
    if (form.password.length < (mode === "register" ? 10 : 1)) e.password = mode === "register" ? s.passwordHelp : s.required;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const user = mode === "register"
        ? await api.post<User>("/auth/register/", { ...form, language: lang })
        : await api.post<User>("/auth/login/", { email: form.email, password: form.password });
      await fetchSession(true);
      onSignedIn(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({
          full_name: err.field("full_name"), email: err.field("email"), password: err.field("password"),
          form: err.field("full_name") || err.field("email") || err.field("password") ? undefined : err.message,
        });
      } else {
        setErrors({ form: t.common.error });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="border-line px-6 py-8 md:px-10 lg:border-r lg:py-12">
        <h2 className="text-h3 tracking-[-0.02em] text-ink-strong"><Accented parts={s.signInTitle} /></h2>
        <p className="mt-4 max-w-md leading-relaxed text-muted">{s.signInLead}</p>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-6 px-6 py-8 md:px-10 lg:py-12"
      >
        <div role="radiogroup" aria-label={s.signInTitle.join("")} className="flex flex-wrap gap-2">
          {(["register", "login"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={cn("hud border px-3 py-2", mode === m ? "border-ember-400 text-ink" : "border-line text-muted hover:text-ink")}>
              {m === "register" ? s.newAccount : s.haveAccount}
            </button>
          ))}
        </div>
        {mode === "register" && (
          <Field label={s.fullName} error={errors.full_name}>
            {(a) => <Input id={a.id} autoComplete="name" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />}
          </Field>
        )}
        <Field label={s.email} error={errors.email}>
          {(a) => <Input id={a.id} type="email" autoComplete="email" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={form.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
        <Field label={s.password} help={mode === "register" ? s.passwordHelp : undefined} error={errors.password}>
          {(a) => (
            <Input id={a.id} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"}
              aria-invalid={a.invalid} aria-describedby={a.describedBy} value={form.password} onChange={(e) => set("password", e.target.value)} />
          )}
        </Field>
        {mode === "register" && (
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label={s.phone}>{(a) => <Input id={a.id} type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />}</Field>
            <Field label={s.whatsapp}>{(a) => <Input id={a.id} type="tel" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />}</Field>
          </div>
        )}
        {errors.form && (
          <p role="alert" className="flex items-center gap-2 text-sm text-err">
            <span aria-hidden className="size-1.5 bg-err" />
            {errors.form}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          {mode === "login" ? (
            <Link href={`/${lang}/reset`} className="hud text-muted hover:text-ink">{t.auth.forgot}</Link>
          ) : <span />}
          <Button type="submit" variant="ember" arrow loading={busy}>
            {mode === "register" ? t.auth.submitRegister : t.auth.submitLogin}
          </Button>
        </div>
      </form>
    </div>
  );
}
