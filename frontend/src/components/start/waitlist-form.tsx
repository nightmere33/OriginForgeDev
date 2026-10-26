"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** One field, one click: paused visitors become the first to hear (§4). */
export function WaitlistForm({ lang, s, service }: { lang: Locale; s: Dictionary["start"]; service?: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p role="status" className="flex items-center gap-3 text-ink">
        <span className="flex size-8 items-center justify-center border border-ember-400 text-ember-400"><Check aria-hidden className="size-4" /></span>
        {s.waitlistDone}
      </p>
    );
  }
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^\S+@\S+\.\S+$/.test(email)) return setError(s.required);
        setBusy(true);
        try {
          await api.post("/waitlist/", { email, language: lang, service });
          setDone(true);
        } catch (err) {
          setError(err instanceof ApiError ? err.field("email") ?? err.message : undefined);
        } finally {
          setBusy(false);
        }
      }}
      className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
    >
      <Field label={s.email} error={error}>
        {(a) => (
          <Input id={a.id} type="email" autoComplete="email" aria-invalid={a.invalid} aria-describedby={a.describedBy}
            value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} />
        )}
      </Field>
      <Button type="submit" variant="ember" loading={busy} className={error ? "sm:mb-7" : undefined}>{s.waitlistJoin}</Button>
    </form>
  );
}
