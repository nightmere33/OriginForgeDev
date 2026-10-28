"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Play } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { day } from "@/lib/lifecycle";
import { useLiveRefresh } from "@/lib/live";
import { Hud } from "@/components/ui/hud";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useGuard } from "@/components/portal/requests";

type Row = { reference: string; title: string; client: string; service: string; queued_at: string; status: string; position: number; start: string | null };
type Lane = {
  lane: string; services: string[]; capacity: number; used: number; full: boolean;
  active: { reference: string; title: string; status: string; ends: string | null }[];
  reserved: { reference: string; title: string }[];
  queue: Row[];
};
type T = Pick<Dictionary, "studio" | "common" | "project">;

/** The places of a lane: filled for taken, hollow for free (0 = no limit). */
function Places({ used, capacity }: { used: number; capacity: number }) {
  const n = Math.max(capacity, used);
  if (!n) return null;
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn("size-3 border", i < used ? "border-steel-300 bg-steel-300" : "border-line-strong")} />
      ))}
    </span>
  );
}

/**
 * The queue, lane by lane: places taken (projects in progress, requests
 * released and about to start), then the line in order with each one's
 * estimated start. Younes can start one now, or move it up or down.
 */
export function QueueBoard({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const q = t.studio.dash.queue;
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api.get<Lane[]>("/studio/queue/").then(setLanes, () => undefined), []);
  useLiveRefresh(load);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const act = async (ref: string, action: "take" | "up" | "down") => {
    setBusy(`${ref}:${action}`);
    try {
      setLanes(await api.post<Lane[]>(`/studio/queue/${ref}/${action}/`));
    } finally {
      setBusy(null);
    }
  };

  if (!user || !lanes) return <SkeletonRows label={t.common.loading} rows={4} />;
  const base = `/${lang}/studio/requests`;
  return (
    <div>
      {lanes.map((lane) => (
        <section key={lane.lane} className="border-t border-line">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-6 md:px-10">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="text-h3 tracking-[-0.02em] text-ink-strong">{lane.lane === "studio" ? q.studioLane : lane.services[0]}</h2>
              {lane.lane === "studio" && <p className="truncate text-sm text-faint">{lane.services.join(" · ")}</p>}
            </div>
            <Places used={lane.used} capacity={lane.capacity} />
            <Hud tone={lane.full ? "ember" : "ink"} dot live={lane.full}>
              {lane.capacity ? fill(q.places, { used: lane.used, capacity: lane.capacity }) : q.noLimit}
              {lane.full ? ` · ${q.full}` : ""}
            </Hud>
          </div>

          {(lane.active.length > 0 || lane.reserved.length > 0) && (
            <ul className="divide-y divide-line border-t border-line bg-cell/40">
              {lane.active.map((a) => (
                <li key={a.reference}>
                  <Link href={`${base}/${a.reference}`} className="grid gap-1 px-6 py-3 transition-colors hover:bg-cell md:grid-cols-[8rem_1fr_auto] md:items-center md:gap-6 md:px-10">
                    <span className="hud text-faint">{a.reference}</span>
                    <span className="truncate text-sm text-ink">{a.title}</span>
                    <span className="hud text-muted">
                      {t.project.statuses[a.status as keyof T["project"]["statuses"]] ?? a.status}
                      {a.ends ? ` · ${fill(q.ends, { date: day(lang, a.ends, false) })}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
              {lane.reserved.map((r) => (
                <li key={r.reference}>
                  <Link href={`${base}/${r.reference}`} className="grid gap-1 px-6 py-3 transition-colors hover:bg-cell md:grid-cols-[8rem_1fr_auto] md:items-center md:gap-6 md:px-10">
                    <span className="hud text-faint">{r.reference}</span>
                    <span className="truncate text-sm text-ink">{r.title}</span>
                    <span className="hud text-ember-400">{q.starting}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {lane.queue.length ? (
            <ol className="divide-y divide-line border-t border-line">
              {lane.queue.map((r, i) => (
                <li key={r.reference} className="grid items-center gap-3 px-6 py-4 [animation:step-in_var(--dur-standard)_var(--ease-out)] md:grid-cols-[3rem_minmax(0,1fr)_auto_auto] md:gap-6 md:px-10">
                  <span className="font-mono text-2xl tabular-nums text-ink-strong">#{r.position}</span>
                  <Link href={`${base}/${r.reference}`} className="group/q min-w-0">
                    <span className="flex items-center gap-2 text-ink group-hover/q:text-ember-400">
                      <span className="truncate">{r.title}</span>
                      <ArrowUpRight aria-hidden className="size-3.5 shrink-0 opacity-60" />
                    </span>
                    <span className="block truncate text-sm text-faint">{[r.client, r.service, r.reference].filter(Boolean).join(" · ")}</span>
                  </Link>
                  <span className="hud text-muted">{r.start ? fill(q.startsAround, { date: day(lang, r.start, false) }) : q.startsSoon}</span>
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label={q.up} disabled={i === 0 || !!busy} onClick={() => act(r.reference, "up")}
                      className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ink disabled:opacity-30"><ArrowUp aria-hidden className="size-4" /></button>
                    <button type="button" aria-label={q.down} disabled={i === lane.queue.length - 1 || !!busy} onClick={() => act(r.reference, "down")}
                      className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ink disabled:opacity-30"><ArrowDown aria-hidden className="size-4" /></button>
                    <button type="button" disabled={!!busy} onClick={() => act(r.reference, "take")}
                      className="hud ml-2 inline-flex h-9 items-center gap-2 border border-line-strong px-3 text-ink transition-colors hover:border-ember-400 hover:text-ember-400 disabled:opacity-40">
                      <Play aria-hidden className="size-3" />{q.take}
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="border-t border-line px-6 py-6 text-sm text-faint md:px-10">{q.empty}</p>
          )}
        </section>
      ))}
    </div>
  );
}
