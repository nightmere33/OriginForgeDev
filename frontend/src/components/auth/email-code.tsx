"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { fetchSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { OtpInput } from "@/components/ui/otp-input";
import { BootText, DecodeText } from "@/motion/glitch";

type A = Dictionary["auth"];
type State = "idle" | "checking" | "wrong" | "ok";
type ErrorCode = keyof A["code"]["errors"];

/**
 * Confirm an e-mail with the 6-digit code from the sign-up e-mail. The code
 * checks itself as the sixth digit lands; a right one lights the cells and
 * moves on, a wrong one shakes them and clears. A new code can be asked for
 * after a short countdown (the server keeps the same pace), and a mistyped
 * address can be corrected here: the code then goes to the new one (three
 * changes a day, inside the day's budget of codes; the server decides).
 */
export function EmailCode({ a, email, onVerified, autoFocus = true }: { a: A; email: string; onVerified: () => void; autoFocus?: boolean }) {
  const c = a.code;
  const [address, setAddress] = useState(email);
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<{ tone: "err" | "ok"; text: string } | null>(null);
  const [wait, setWait] = useState(45);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(email);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  // The countdown before another code can be sent.
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);

  const explain = (err: unknown): string => {
    if (!(err instanceof ApiError)) return c.wrong;
    const key = String((err.data as { code?: string }).code ?? "") as ErrorCode;
    return c.errors[key] ?? err.field("email") ?? err.message;
  };

  const check = async (value: string) => {
    setState("checking");
    setMessage(null);
    try {
      await api.post("/auth/verify-email/code/", { code: value });
      setState("ok");
      setMessage({ tone: "ok", text: c.ok });
      await fetchSession(true);
      window.setTimeout(onVerified, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700);
    } catch (err) {
      const expired = err instanceof ApiError && err.field("code") === "expired";
      setState("wrong");
      setMessage({ tone: "err", text: expired ? c.expired : c.wrong });
      window.setTimeout(() => {
        setCode("");
        setState("idle");
      }, 420);
    }
  };

  const resend = async () => {
    setMessage(null);
    try {
      const res = await api.post<{ retry_after?: number }>("/auth/verify-email/resend/");
      setWait(res.retry_after ?? 45);
      setMessage({ tone: "ok", text: c.sent });
    } catch (err) {
      const retry = err instanceof ApiError ? Number((err.data as { retry_after?: number }).retry_after) : 0;
      if (retry) setWait(retry);
      else setMessage({ tone: "err", text: explain(err) });
    }
  };

  const changeAddress = async () => {
    setBusy(true);
    setFieldError(undefined);
    try {
      const res = await api.post<{ email: string; retry_after?: number }>("/auth/verify-email/change/", { email: draft });
      setAddress(res.email);
      setEditing(false);
      setCode("");
      setState("idle");
      setWait(res.retry_after ?? 45);
      setMessage({ tone: "ok", text: fill(c.changed, { email: res.email }) });
      await fetchSession(true);
    } catch (err) {
      setFieldError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const [before, after = ""] = c.lead.split("{email}");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-muted">
          {before}<DecodeText text={address} className="text-ink" />{after}
        </p>
        {state !== "ok" && !editing && (
          <p className="text-sm text-faint">
            {c.wrongAddress}{" "}
            <button type="button" onClick={() => {
              setDraft(address);
              setFieldError(undefined);
              setEditing(true);
            }} className="text-ember-400 underline-offset-4 transition-colors hover:text-ink hover:underline">
              {c.change}
            </button>
          </p>
        )}
      </div>

      {/* The address, corrected in place; the code cells wait underneath. */}
      <div className={cn("grid transition-[grid-template-rows] duration-[var(--dur-standard)] ease-[var(--ease-out)]", editing ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <form noValidate onSubmit={(e) => {
            e.preventDefault();
            changeAddress();
          }} className="flex flex-col gap-3 border border-line bg-cell/40 p-4">
            <label htmlFor={fieldId} className="hud text-muted">{c.newAddress}</label>
            <Input ref={field} id={fieldId} type="email" autoComplete="email" value={draft} aria-invalid={!!fieldError}
              aria-describedby={fieldError ? `${fieldId}-err` : undefined} tabIndex={editing ? 0 : -1}
              onChange={(e) => {
                setDraft(e.target.value);
                setFieldError(undefined);
              }} />
            {fieldError && (
              <p id={`${fieldId}-err`} role="alert" className="flex items-center gap-2 text-sm text-err">
                <span aria-hidden className="size-1.5 shrink-0 bg-err" />{fieldError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="ember" size="sm" loading={busy} disabled={!draft.trim()} tabIndex={editing ? 0 : -1}>{c.sendHere}</Button>
              <Button type="button" variant="ghost" size="sm" tabIndex={editing ? 0 : -1} onClick={() => setEditing(false)}>{c.cancel}</Button>
            </div>
          </form>
        </div>
      </div>

      {!editing && (
        <>
          <OtpInput label={c.label} value={code} onChange={setCode} onComplete={check} state={state} disabled={state === "checking" || state === "ok"} autoFocus={autoFocus} />
          <div aria-live="polite" className="min-h-5">
            {message && (
              <Hud as="span" tone={message.tone === "ok" ? "ink" : "ember"} dot>
                <BootText key={message.text} text={message.text} />
              </Hud>
            )}
            {!message && state === "checking" && <Hud as="span" tone="muted" dot live>{c.checking}</Hud>}
          </div>
          <button type="button" onClick={resend} disabled={wait > 0 || state === "ok"}
            className="hud w-fit text-ember-400 transition-colors hover:text-ink disabled:cursor-default disabled:text-faint">
            {wait > 0 ? fill(c.resendIn, { n: wait }) : c.resend}
          </button>
        </>
      )}
    </div>
  );
}
