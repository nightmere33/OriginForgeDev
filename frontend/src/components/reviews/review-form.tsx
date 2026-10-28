"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { api, ApiError, type User } from "@/lib/api-client";
import { useLive } from "@/lib/live";
import { Button } from "@/components/ui/button";
import { ChoiceChip, Field, Input, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { StarInput, Stars } from "./stars";

type R = Dictionary["project"]["review"];
type Mine = {
  id: number; engagement: number; reference: string; rating: number; body: string; display_name: string; display_role: string;
  status: "pending" | "approved" | "rejected"; reply: string; rejection_reason: string;
};
type Eligible = { engagement: number; reference: string; title: string; label: string };

/** "Sam Kaci" → "Sam K.": a default the client can change. */
const shortName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first ?? "";
};

/**
 * The client's review of a delivered project, in the project hub: the form
 * while there is none, then its state (waiting, published, or a reason to fix).
 */
export function ReviewPanel({ r, reference, user }: { r: R; reference: string; user: User }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [eligible, setEligible] = useState<Eligible | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => api.get<{ eligible: Eligible[]; reviews: Mine[] }>("/reviews/mine/").then((d) => {
    setMine(d.reviews.find((x) => x.reference === reference) ?? null);
    setEligible(d.eligible.find((x) => x.reference === reference) ?? null);
    setLoaded(true);
  }, () => setLoaded(true)), [reference]);
  useEffect(() => {
    load();
  }, [load]);
  // Approved or sent back from the studio: show it at once.
  useLive((e) => e.type === "notification" && e.notification.key.startsWith("review_") && load());

  if (!loaded || (!mine && !eligible)) return null;
  if (mine && !editing) {
    const tone = { pending: "muted", approved: "ink", rejected: "ember" } as const;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Stars value={mine.rating} label={`${mine.rating}/5`} className="h-5" />
          <Hud tone={tone[mine.status]} dot={mine.status !== "approved"}>{r.status[mine.status]}</Hud>
        </div>
        <blockquote className="text-ink">&ldquo;{mine.body}&rdquo;</blockquote>
        {mine.status === "rejected" && mine.rejection_reason && (
          <p className="border-l border-ember-400/60 pl-4 text-sm text-muted">{mine.rejection_reason}</p>
        )}
        {mine.reply && <p className="border-l border-line-strong pl-4 text-sm text-muted">{mine.reply}</p>}
        {mine.status !== "approved" && (
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setEditing(true)}>{r.edit}</Button>
        )}
      </div>
    );
  }
  return (
    <ReviewForm
      r={r}
      user={user}
      initial={mine}
      engagement={mine?.engagement ?? eligible!.engagement}
      onDone={() => {
        setEditing(false);
        load();
      }}
    />
  );
}

/** The review itself. `sendTo` posts it elsewhere (an invitation), without an engagement. */
export function ReviewForm({ r, user, initial, engagement, sendTo, onDone }: {
  r: R; user: User; initial: Mine | null; engagement?: number; sendTo?: string; onDone: () => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [body, setBody] = useState(initial?.body ?? "");
  const [name, setName] = useState(initial?.display_name ?? shortName(user.full_name));
  const [role, setRole] = useState(initial?.display_role ?? "");
  const [consent, setConsent] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"rating" | "body" | "display_name" | "consent" | "form", string>>>({});

  const send = async () => {
    if (!rating) return setErrors({ rating: r.pickStars });
    setBusy(true);
    setErrors({});
    const payload = { engagement, rating, body, display_name: name, display_role: role, consent };
    try {
      if (initial) await api.patch(`/reviews/mine/${initial.id}/`, payload);
      else await api.post(sendTo ?? "/reviews/mine/", payload);
      onDone();
    } catch (err) {
      setBusy(false);
      setErrors(err instanceof ApiError
        ? { body: err.field("body"), display_name: err.field("display_name"), consent: err.field("consent"), form: err.field("engagement") ?? err.field("detail") ?? err.message }
        : { form: r.error });
    }
  };

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); send(); }} className="flex flex-col gap-6">
      <p className="text-muted">{r.lead}</p>
      <div className="flex flex-col gap-2">
        <StarInput value={rating} onChange={(v) => { setRating(v); setErrors({}); }} labels={r.starLabels} name={r.rating} />
        {errors.rating && <p role="alert" className="text-sm text-err">{errors.rating}</p>}
      </div>
      <Field label={r.body} help={r.bodyHelp} error={errors.body}>
        {(a) => <Textarea id={a.id} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={body} maxLength={1500} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={r.name} help={r.nameHelp} error={errors.display_name}>
          {(a) => <Input id={a.id} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={r.role} help={r.roleHelp}>
          {(a) => <Input id={a.id} value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} />}
        </Field>
      </div>
      <ChoiceChip label={r.consent} description={r.consentHelp} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      {errors.consent && <p role="alert" className="-mt-4 text-sm text-err">{errors.consent}</p>}
      {errors.form && <p role="alert" className="text-sm text-err">{errors.form}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="ember" loading={busy} disabled={!consent || body.trim().length < 20}>{initial ? r.resubmit : r.submit}</Button>
        <span className="hud inline-flex items-center gap-1.5 text-faint"><BadgeCheck aria-hidden className="size-3.5 text-ok" />{r.verifiedHint}</span>
      </div>
    </form>
  );
}
