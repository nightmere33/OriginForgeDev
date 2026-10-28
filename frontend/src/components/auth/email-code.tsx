"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError } from "@/lib/api-client";
import { fetchSession } from "@/lib/session";
import { Hud } from "@/components/ui/hud";
import { OtpInput } from "@/components/ui/otp-input";
import { BootText } from "@/motion/glitch";

type A = Dictionary["auth"];
type State = "idle" | "checking" | "wrong" | "ok";

/**
 * Confirm an e-mail with the 6-digit code from the sign-up e-mail. The code
 * checks itself as the sixth digit lands; a right one lights the cells and
 * moves on, a wrong one shakes them and clears. A new code can be asked for
 * after a short countdown (the server keeps the same pace).
 */
export function EmailCode({ a, email, onVerified, autoFocus = true }: { a: A; email: string; onVerified: () => void; autoFocus?: boolean }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<{ tone: "err" | "ok"; text: string } | null>(null);
  const [wait, setWait] = useState(45);

  // The countdown before another code can be sent.
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const check = async (value: string) => {
    setState("checking");
    setMessage(null);
    try {
      await api.post("/auth/verify-email/code/", { code: value });
      setState("ok");
      setMessage({ tone: "ok", text: a.code.ok });
      await fetchSession(true);
      window.setTimeout(onVerified, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700);
    } catch (err) {
      const expired = err instanceof ApiError && err.field("code") === "expired";
      setState("wrong");
      setMessage({ tone: "err", text: expired ? a.code.expired : a.code.wrong });
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
      setMessage({ tone: "ok", text: a.code.sent });
    } catch (err) {
      const retry = err instanceof ApiError ? Number((err.data as { retry_after?: number }).retry_after) : 0;
      if (retry) setWait(retry);
      else setMessage({ tone: "err", text: err instanceof ApiError ? err.message : a.code.wrong });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted">{fill(a.code.lead, { email })}</p>
      <OtpInput label={a.code.label} value={code} onChange={setCode} onComplete={check} state={state} disabled={state === "checking" || state === "ok"} autoFocus={autoFocus} />
      <div aria-live="polite" className="min-h-5">
        {message && (
          <Hud as="span" tone={message.tone === "ok" ? "ink" : "ember"} dot>
            <BootText text={message.text} />
          </Hud>
        )}
        {!message && state === "checking" && <Hud as="span" tone="muted" dot live>{a.code.checking}</Hud>}
      </div>
      <button type="button" onClick={resend} disabled={wait > 0 || state === "ok"}
        className="hud w-fit text-ember-400 transition-colors hover:text-ink disabled:cursor-default disabled:text-faint">
        {wait > 0 ? fill(a.code.resendIn, { n: wait }) : a.code.resend}
      </button>
    </div>
  );
}
