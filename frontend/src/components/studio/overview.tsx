"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { dateTime, money } from "@/lib/lifecycle";
import { useLiveRefresh } from "@/lib/live";
import { Hud } from "@/components/ui/hud";
import { Skeleton } from "@/components/ui/skeleton";
import { DecodeText } from "@/motion/glitch";
import { useGuard } from "@/components/portal/requests";

type Counts = Record<string, number>;
type Overview = {
  clients: { total: number; week: number; month: number; verified: number; sources: { key: string; label: string; n: number }[] };
  requests: { total: number; open: number; new: number; week: number; drafts: number; by_status: Counts; by_service: { slug: string; title: string; n: number }[] };
  projects: { by_status: Counts; accepting: boolean; paused: boolean; full: boolean; active: number };
  money: { month: Counts; all_time: Counts; due: Counts; proofs_pending: number };
  reviews_pending: number;
  queued: number;
  waitlist: number;
  activity: { at: string; action: string; label: string; actor: string; target_type: string; target_id: string }[];
};
type T = Pick<Dictionary, "studio" | "portal" | "project" | "common" | "start">;

const sums = (lang: Locale, counts: Counts) => Object.entries(counts).filter(([, v]) => v).map(([c, v]) => money(lang, v, c));

/** One figure of the instrument panel: a label, a number that decodes in, a line of context. */
function Kpi({ label, value, note, href, tone }: { label: string; value: string; note?: ReactNode; href?: string; tone?: "ember" }) {
  const body = (
    <>
      <Hud tone={tone === "ember" ? "ember" : "muted"} dot={tone === "ember"}>{label}</Hud>
      <p className="mt-4 font-mono text-3xl tabular-nums tracking-[-0.02em] text-ink-strong md:text-4xl">
        <DecodeText digits text={value} />
      </p>
      {note && <p className="mt-2 text-sm text-faint">{note}</p>}
      {href && <ArrowUpRight aria-hidden className="absolute right-5 top-5 size-4 text-faint transition-colors group-hover/kpi:text-ember-400" />}
    </>
  );
  const cell = "group/kpi relative flex flex-col bg-bg px-6 py-6 md:px-8";
  return href ? <Link href={href} className={cn(cell, "transition-colors duration-[var(--dur-micro)] hover:bg-cell")}>{body}</Link> : <div className={cell}>{body}</div>;
}

/** Counts as hairline bars that draw out to their share when they arrive. */
function Bars({ rows }: { rows: { key: string; label: string; n: number }[] }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r, i) => (
        <li key={r.key} className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate text-ink">{r.label}</span>
            <span className="font-mono tabular-nums text-muted">{r.n}</span>
          </span>
          <span className="relative block h-px bg-line">
            <span
              className="absolute inset-y-[-1px] left-0 w-full origin-left bg-ember-500 transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: `scaleX(${drawn ? r.n / max : 0})`, transitionDelay: `${i * 60}ms` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-6 bg-bg px-6 py-8 md:px-10", className)}>
      <Hud tone="muted">{title}</Hud>
      {children}
    </section>
  );
}

function OverviewSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="border-t border-line">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-4 bg-bg px-6 py-6 md:px-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-px border-t border-line bg-line lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-5 bg-bg px-6 py-8 md:px-10">
            <Skeleton className="h-3 w-32" />
            {[0, 1, 2, 3].map((j) => <Skeleton key={j} className="h-3 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudioOverview({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const d = t.studio.dash;
  const [data, setData] = useState<Overview | null>(null);
  const load = useCallback(() => api.get<Overview>("/studio/overview/").then(setData, () => undefined), []);
  // Anything moving on a request (a new one, a payment, a review) refreshes the panel.
  useLiveRefresh(load);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user || !data) return <OverviewSkeleton label={t.common.loading} />;
  const base = `/${lang}/studio`;
  const statusLabel = (s: string) =>
    t.portal.statuses[s as keyof typeof t.portal.statuses] ?? t.project.statuses[s as keyof typeof t.project.statuses] ?? s;
  const actionLabel = (a: string) => {
    const known = d.actions as Record<string, string>;
    return known[a] ?? known[a.split(".").slice(0, 2).join(".")] ?? known[a.split(".")[0]] ?? a;
  };
  const cap = data.projects;
  const capacityNote = cap.paused ? d.kpi.paused : cap.full ? d.kpi.full : d.kpi.accepting;
  const month = sums(lang, data.money.month);
  const due = sums(lang, data.money.due);
  const allTime = sums(lang, data.money.all_time);

  return (
    <div className="border-t border-line">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        <Kpi label={d.kpi.newRequests} value={String(data.requests.new)} tone={data.requests.new ? "ember" : undefined}
          note={fill(d.kpi.drafts, { n: data.requests.drafts })} href={`${base}/requests`} />
        <Kpi label={d.kpi.openRequests} value={String(data.requests.open)} note={fill(d.kpi.thisWeek, { n: data.requests.week })} href={`${base}/requests`} />
        <Kpi label={d.kpi.activeProjects} value={String(cap.active)} tone={data.queued ? "ember" : undefined}
          note={data.queued ? fill(d.kpi.queued, { n: data.queued }) : capacityNote} href={`${base}/queue`} />
        <Kpi label={d.kpi.clients} value={String(data.clients.total)} note={fill(d.kpi.thisWeek, { n: data.clients.week })} href={`${base}/clients`} />
        <Kpi label={d.kpi.monthIn} value={month[0] ?? "0"} note={month.slice(1).join(" · ") || (allTime.join() !== month.join() ? fill(d.kpi.allTime, { sum: allTime.join(" · ") }) : undefined)} href={`${base}/payments`} />
        <Kpi label={d.kpi.due} value={due[0] ?? "0"} note={due.slice(1).join(" · ") || undefined} href={`${base}/payments`} />
        <Kpi label={d.kpi.receipts} value={String(data.money.proofs_pending)} tone={data.money.proofs_pending ? "ember" : undefined} href={`${base}/payments`} />
        <Kpi label={d.kpi.reviews} value={String(data.reviews_pending)} tone={data.reviews_pending ? "ember" : undefined}
          note={data.waitlist ? `${data.waitlist} · ${d.kpi.waitlist}` : undefined} href={`${base}/reviews`} />
      </div>

      <div className="grid gap-px border-t border-line bg-line lg:grid-cols-3">
        <Panel title={d.byStage}>
          {Object.keys(data.requests.by_status).length ? (
            <Bars rows={Object.entries(data.requests.by_status).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: statusLabel(k), n }))} />
          ) : <p className="text-sm text-faint">{d.kpi.none}</p>}
        </Panel>
        <Panel title={d.byService}>
          {data.requests.by_service.length ? (
            <Bars rows={data.requests.by_service.map((r) => ({ key: r.slug || "other", label: r.title || t.start.serviceOther, n: r.n }))} />
          ) : <p className="text-sm text-faint">{d.kpi.none}</p>}
        </Panel>
        <Panel title={d.sources}>
          {data.clients.sources.length ? (
            <Bars rows={data.clients.sources.map((s) => ({ key: s.key, label: s.label, n: s.n }))} />
          ) : <p className="text-sm text-faint">{d.kpi.none}</p>}
        </Panel>
      </div>

      <Panel title={d.activity} className="border-t border-line">
        {data.activity.length ? (
          <ol className="-mx-6 divide-y divide-line border-y border-line md:-mx-10">
            {data.activity.map((a, i) => {
              const ref = a.target_type === "engagements.projectrequest" ? a.label.split(" · ")[0] : null;
              const row = (
                <>
                  <span className="hud text-faint">{dateTime(lang, a.at)}</span>
                  <span className="text-ink">{actionLabel(a.action)}</span>
                  <span className="min-w-0 truncate text-sm text-muted">{[a.actor, a.label].filter(Boolean).join(" · ")}</span>
                </>
              );
              const cls = "grid gap-1 px-6 py-3.5 md:grid-cols-[9rem_14rem_1fr] md:items-baseline md:gap-6 md:px-10";
              return (
                <li key={`${a.at}-${i}`}>
                  {ref ? <Link href={`${base}/requests/${ref}`} className={cn(cls, "transition-colors hover:bg-cell")}>{row}</Link> : <div className={cls}>{row}</div>}
                </li>
              );
            })}
          </ol>
        ) : <p className="text-sm text-faint">{d.noActivity}</p>}
      </Panel>
    </div>
  );
}
