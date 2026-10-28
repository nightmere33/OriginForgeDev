"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { dateTime, type Engagement } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";
import { ErrorLine, errorText, type PanelProps } from "./shared";

/**
 * Every round of changes, numbered, with what was asked and on what (the
 * whole work or one milestone), and a meter of the rounds the plan allows.
 * The studio can grant one more round at any time once the work started.
 */
export function RevisionsPanel({ lang, t, side, reload, engagement: e }: PanelProps & { engagement: Engagement }) {
  const r = t.project.revisions;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canGrant = side === "studio" && ["in_development", "client_review", "awaiting_balance", "on_hold", "live"].includes(e.status);
  const grant = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/engagements/${e.id}/action/`, { action: "grant_revision" });
      await reload();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1" role="img" aria-label={fill(r.used, { used: e.revisions_used, total: e.revision_rounds })}>
          {Array.from({ length: e.revision_rounds }, (_, i) => (
            <span key={i} className={cn("h-2.5 w-7", i < e.revisions_used ? "bg-ember-500" : "bg-line",
              i >= e.revision_rounds - e.revisions_granted && "outline outline-1 -outline-offset-1 outline-ember-700")} />
          ))}
        </div>
        <Hud tone="muted">
          {fill(r.used, { used: e.revisions_used, total: e.revision_rounds })}
          {e.revisions_granted ? ` · ${fill(r.granted, { n: e.revisions_granted })}` : ""}
        </Hud>
      </div>

      {e.revisions.length === 0 ? (
        <p className="text-muted">{r.empty}</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {e.revisions.map((rev) => (
            <li key={rev.id} className="grid gap-2 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6">
              <span className="flex flex-col gap-1">
                <span className="hud text-ember-400">{fill(r.round, { n: rev.number })}</span>
                <span className="hud text-faint">{dateTime(lang, rev.created_at)}</span>
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="hud text-faint">{rev.milestone ? fill(r.on, { milestone: rev.milestone }) : r.whole}</span>
                <span className="whitespace-pre-line leading-relaxed text-ink">{rev.note}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {canGrant && (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm" loading={busy} onClick={grant}><Plus aria-hidden className="size-3.5" />{r.grant}</Button>
          <ErrorLine>{error}</ErrorLine>
        </div>
      )}
    </div>
  );
}
