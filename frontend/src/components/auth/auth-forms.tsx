"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api, ApiError, type User } from "@/lib/api-client";
import { fetchSession, useSession } from "@/lib/session";
import { Hud } from "@/components/ui/hud";
import { GlitchLabel, tearIn } from "@/motion/glitch";
import { AuthField, BootText, OAuthNotice, PhaseButton, ProviderButtons, rememberMethod, type Phase } from "./auth-fx";
import { EmailCode } from "./email-code";

type T = Pick<Dictionary, "auth" | "common">;
type Errors = Record<string, string | undefined>;

function errorsFrom(err: unknown, fallback: string): Errors {
  if (!(err instanceof ApiError)) return { form: fallback };
  const out: Errors = {};
  for (const key of Object.keys(err.data)) out[key === "detail" ? "form" : key] = err.field(key);
  return Object.keys(out).length ? out : { form: err.message };
}

const HERE = "https://originforge.invalid";

/**
 * Only same-site paths are honoured as ?next= targets (no open redirect).
 * Read the way the browser will read it: a backslash, or a tab inside
 * "//evil.com", makes another site of a path that starts with "/".
 */
export function safeNext(value: string | null, fallback: string) {
  if (!value?.startsWith("/")) return fallback;
  try {
    const url = new URL(value, HERE);
    return url.origin === HERE ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}

/** The way back, kept when switching between sign-in and sign-up. */
export const carry = (next: string | null) => {
  const safe = safeNext(next, "");
  return safe ? `?next=${encodeURIComponent(safe)}` : "";
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Long enough to read "Access granted" before the page changes. */
const settle = () => new Promise((r) => setTimeout(r, reduced() ? 0 : 520));
const phases = (words: string[]): Record<Phase, string> => ({ idle: words[0], busy: words[1], done: words[2] });

function FormError({ message }: { message?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) tearIn(ref.current);
  }, [message]);
  if (!message) return null;
  return (
    <p ref={ref} role="alert" className="flex items-center gap-2 text-sm text-err">
      <span aria-hidden className="size-1.5 shrink-0 bg-err" />
      {message}
    </p>
  );
}

/** Shared by sign-in and sign-up: submit, decode the phases, tear the form on an error. */
function useAuthSubmit(fallback: string) {
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const form = useRef<HTMLFormElement>(null);
  const run = async (action: () => Promise<void>) => {
    setPhase("busy");
    setErrors({});
    try {
      await action();
    } catch (err) {
      setErrors(errorsFrom(err, fallback));
      setPhase("idle");
      tearIn(form.current);
    }
  };
  return { errors, phase, setPhase, form, run };
}

export function LoginForm({ lang, t }: { lang: Locale; t: T }) {
  const a = t.auth;
  const router = useRouter();
  const params = useSearchParams();
  const { errors, phase, setPhase, form, run } = useAuthSubmit(t.common.error);
  const reveal = { show: a.showPassword, hide: a.hidePassword };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    run(async () => {
      const user = await api.post<User>("/auth/login/", { email: data.get("email"), password: data.get("password") });
      rememberMethod("email");
      setPhase("done");
      await Promise.all([fetchSession(true), settle()]);
      router.push(safeNext(params.get("next"), `/${lang}/${user.is_developer ? "studio" : "portal"}`));
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <OAuthNotice code={params.get("oauth")} messages={a.oauth.errors} />
      <ProviderButtons lang={lang} next={params.get("next")} labels={a.oauth} />
      <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <AuthField label={a.email} name="email" type="email" autoComplete="email" placeholder={a.placeholders.email} error={errors.email} />
        <AuthField label={a.password} name="password" type="password" autoComplete="current-password" placeholder={a.placeholders.password} error={errors.password} reveal={reveal} />
        <FormError message={errors.form} />
        <PhaseButton phase={phase} labels={phases(a.phases.login)} />
        <div className="flex flex-wrap justify-between gap-3">
          <Link href={`/${lang}/reset`} className="hud text-muted hover:text-ember-400"><GlitchLabel text={a.forgot} /></Link>
          <Link href={`/${lang}/register${carry(params.get("next"))}`} className="hud text-muted hover:text-ember-400"><GlitchLabel text={a.noAccount} /></Link>
        </div>
      </form>
    </div>
  );
}

export function RegisterForm({ lang, t }: { lang: Locale; t: T }) {
  const a = t.auth;
  const router = useRouter();
  const params = useSearchParams();
  const { errors, phase, setPhase, form, run } = useAuthSubmit(t.common.error);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    run(async () => {
      await api.post<User>("/auth/register/", {
        full_name: data.get("full_name"), email: data.get("email"), password: data.get("password"), language: lang,
      });
      rememberMethod("email");
      setPhase("done");
      await Promise.all([fetchSession(true), settle()]);
      // New accounts confirm their e-mail with the code just sent, then the
      // short welcome (language, how they found me, how to talk).
      const next = params.get("next");
      const welcome = `/${lang}/welcome${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      router.push(`/${lang}/verify-email?next=${encodeURIComponent(welcome)}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <OAuthNotice code={params.get("oauth")} messages={a.oauth.errors} />
      <ProviderButtons lang={lang} next={params.get("next")} labels={a.oauth} />
      <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <AuthField label={a.fullName} name="full_name" autoComplete="name" placeholder={a.placeholders.fullName} error={errors.full_name} />
        <AuthField label={a.email} name="email" type="email" autoComplete="email" placeholder={a.placeholders.email} error={errors.email} />
        <AuthField label={a.password} name="password" type="password" autoComplete="new-password" minLength={10}
          placeholder={a.placeholders.newPassword} error={errors.password} help={a.passwordHelp} reveal={{ show: a.showPassword, hide: a.hidePassword }} />
        <FormError message={errors.form} />
        <PhaseButton phase={phase} labels={phases(a.phases.register)} />
        <Link href={`/${lang}/login${carry(params.get("next"))}`} className="hud text-muted hover:text-ember-400"><GlitchLabel text={a.hasAccount} /></Link>
      </form>
    </div>
  );
}

/** Step 1 (no token): ask for the link. Step 2 (?uid&token): choose a new password. */
export function ResetForm({ lang, t }: { lang: Locale; t: T }) {
  const a = t.auth;
  const params = useSearchParams();
  const uid = params.get("uid");
  const token = params.get("token");
  const { errors, phase, setPhase, form, run } = useAuthSubmit(t.common.error);
  const [done, setDone] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    run(async () => {
      if (uid && token) await api.post("/auth/password/reset/confirm/", { uid, token, password: data.get("password") });
      else await api.post("/auth/password/reset/", { email: data.get("email") });
      setPhase("done");
      await settle();
      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <Hud tone="ink" dot><BootText text={uid ? a.resetDone : a.resetSent} /></Hud>
        {uid && <Link href={`/${lang}/login`} className="hud text-ember-400 hover:underline">{a.submitLogin}</Link>}
      </div>
    );
  }
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {uid && token ? (
        <AuthField label={a.newPassword} name="password" type="password" autoComplete="new-password" minLength={10}
          placeholder={a.placeholders.newPassword} error={errors.password} help={a.passwordHelp} reveal={{ show: a.showPassword, hide: a.hidePassword }} />
      ) : (
        <AuthField label={a.email} name="email" type="email" autoComplete="email" placeholder={a.placeholders.email} error={errors.email} />
      )}
      <FormError message={errors.form} />
      <PhaseButton phase={phase} labels={phases(uid ? a.phases.resetConfirm : a.phases.reset)} />
      <Link href={`/${lang}/login`} className="hud text-muted hover:text-ember-400">← <GlitchLabel text={a.submitLogin} /></Link>
    </form>
  );
}

/**
 * Confirming an e-mail: with the 6-digit code (after sign-up, or any time
 * from the portal), or with the link from the same e-mail (?token=).
 */
export function VerifyEmail({ lang, t }: { lang: Locale; t: T }) {
  const params = useSearchParams();
  const token = params.get("token");
  if (!token) return <VerifyWithCode lang={lang} t={t} next={safeNext(params.get("next"), `/${lang}/portal`)} />;
  return <VerifyWithLink lang={lang} t={t} token={token} />;
}

function VerifyWithCode({ lang, t, next }: { lang: Locale; t: T; next: string }) {
  const user = useSession();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace(`/${lang}/login?next=${encodeURIComponent(`/${lang}/verify-email?next=${encodeURIComponent(next)}`)}`);
    else if (user?.email_verified) router.replace(next);
  }, [user, lang, next, router]);
  if (!user || user.email_verified) return <Hud tone="muted" dot live>{t.common.loading}</Hud>;
  return <EmailCode a={t.auth} email={user.email} onVerified={() => router.push(next)} />;
}

function VerifyWithLink({ lang, t, token }: { lang: Locale; t: T; token: string }) {
  const [state, setState] = useState<"pending" | "ok" | "fail">("pending");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true; // strict-mode double effects must not spend the token twice
    api.post("/auth/verify-email/", { token })
      .then(() => fetchSession(true))
      .then(() => setState("ok"), () => setState("fail"));
  }, [token]);

  if (state === "pending") return <Hud tone="muted" dot live>{t.common.loading}</Hud>;
  return (
    <div className="flex flex-col gap-6">
      <Hud tone={state === "ok" ? "ink" : "muted"} dot={state === "ok"}>
        <BootText text={state === "ok" ? t.auth.verifyOk : t.auth.verifyFail} />
      </Hud>
      <Link href={`/${lang}/portal`} className="hud text-ember-400 hover:underline">{t.auth.goPortal}</Link>
    </div>
  );
}
