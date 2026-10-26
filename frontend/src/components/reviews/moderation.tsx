"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useLive } from "@/lib/live";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { Stars } from "./stars";

type T = Pick<Dictionary, "studio" | "common">;
type Row = {
  id: number; reference: string; rating: number; body: string; display_name: string; display_role: string; project_label: string;
  status: "pending" | "approved" | "rejected"; reply: string; rejection_reason: string; client: string; featured: boolean; created_at: string;
};
const FILTERS = ["pending", "approved", "rejected", ""] as const;

/** The studio's review queue: approve (with a public reply), send back with a reason, unpublish, feature. */
export function ReviewModeration({ lang, t }: { lang: Locale; t: T }) {
  const m = t.studio.reviews;
  const user = useSession();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(
    () => api.get<Row[]>(`/reviews/studio/${filter ? `?status=${filter}` : ""}`).then(setRows, () => setRows([])),
    [filter],
  );
  useEffect(() => {
    if (user?.is_developer) load();
  }, [user, load]);
  useLive((e) => e.type === "notification" && e.notification.key === "studio_review" && load());

  if (user === undefined) return <p className="hud px-6 py-16 text-muted md:px-10">{t.common.loading}</p>;
  if (!user?.is_developer) return null;
  return (
    <>
      <div role="toolbar" className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4 md:px-10">
        {FILTERS.map((f) => (
          <button key={f || "all"} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={cn("hud border px-3 py-2", filter === f ? "border-ember-400 text-ink" : "border-line text-muted hover:text-ink")}>
            {f ? m.filters[f] : t.studio.all}
          </button>
        ))}
        <Link href={`/${lang}/studio`} className="hud ml-auto text-muted hover:text-ink">← {m.back}</Link>
      </div>
      {!rows ? (
        <p className="hud px-6 py-16 text-muted md:px-10">{t.common.loading}</p>
      ) : rows.length === 0 ? (
        <p className="border-t border-line px-6 py-16 text-muted md:px-10">{m.empty}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((row) => <ModerationRow key={row.id} lang={lang} t={t} row={row} onChange={load} />)}
        </ul>
      )}
    </>
  );
}

function ModerationRow({ lang, t, row, onChange }: { lang: Locale; t: T; row: Row; onChange: () => void }) {
  const m = t.studio.reviews;
  const [reply, setReply] = useState(row.reply);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string>();
  const act = async (decision: "approve" | "reject" | "unpublish", extra: Record<string, unknown> = {}) => {
    setBusy(decision);
    setError(undefined);
    try {
      await api.post(`/reviews/studio/${row.id}/moderate/`, { decision, reply, reason, ...extra });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.field("reason") ?? err.message : t.common.error);
    } finally {
      setBusy("");
    }
  };
  return (
    <li className="grid gap-6 px-6 py-8 md:px-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Stars value={row.rating} label={`${row.rating}/5`} className="h-5" />
          <Hud tone={row.status === "pending" ? "ember" : "faint"} dot={row.status === "pending"}>{m.filters[row.status]}</Hud>
          {row.featured && <Hud tone="ink">{m.featured}</Hud>}
          <Link href={`/${lang}/studio/requests/${row.reference}`} className="hud text-muted hover:text-ember-400">{row.reference}</Link>
        </div>
        <blockquote className="max-w-2xl text-lg leading-relaxed text-ink">&ldquo;{row.body}&rdquo;</blockquote>
        <p className="text-sm text-faint">
          {row.display_name}{row.display_role ? ` · ${row.display_role}` : ""} · {row.project_label}
          {row.client && row.client !== row.display_name ? ` · ${m.account}: ${row.client}` : ""}
        </p>
        {row.status === "rejected" && row.rejection_reason && <p className="border-l border-ember-400/60 pl-4 text-sm text-muted">{row.rejection_reason}</p>}
      </div>
      <div className="flex flex-col gap-4">
        <Field label={m.reply} help={m.replyHelp}>
          {(a) => <Textarea id={a.id} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />}
        </Field>
        {rejecting && (
          <Field label={m.reason} help={m.reasonHelp} error={error}>
            {(a) => <Textarea id={a.id} rows={2} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        )}
        {error && !rejecting && <p role="alert" className="text-sm text-err">{error}</p>}
        <div className="flex flex-wrap gap-3">
          {row.status !== "approved" && (
            <Button variant="ember" size="sm" loading={busy === "approve"} onClick={() => act("approve")}>{m.approve}</Button>
          )}
          {row.status === "approved" && (
            <>
              <Button variant="secondary" size="sm" loading={busy === "approve"} onClick={() => act("approve")}>{m.saveReply}</Button>
              <Button variant="secondary" size="sm" onClick={() => act("approve", { featured: !row.featured })}>
                <Star aria-hidden className="size-3.5" fill={row.featured ? "currentColor" : "none"} />
                {row.featured ? m.unfeature : m.feature}
              </Button>
              <Button variant="ghost" size="sm" loading={busy === "unpublish"} onClick={() => act("unpublish")}>{m.unpublish}</Button>
            </>
          )}
          {row.status === "pending" && (
            rejecting
              ? <Button variant="secondary" size="sm" loading={busy === "reject"} onClick={() => act("reject")}>{m.sendBack}</Button>
              : <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>{m.reject}</Button>
          )}
        </div>
        <Hud tone="faint">{new Date(row.created_at).toLocaleDateString(lang)}</Hud>
      </div>
    </li>
  );
}
