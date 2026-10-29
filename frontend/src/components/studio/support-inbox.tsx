"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { day } from "@/lib/lifecycle";
import { useLiveRefresh } from "@/lib/live";
import { openThread, type Ticket } from "@/lib/support";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StandingLine, type DockT } from "@/components/chat/support";
import { useGuard } from "@/components/portal/requests";

const FILTERS = ["active", "open", "pending", "solved", "closed"] as const;
type Data = { results: Ticket[]; counts: { open: number; pending: number; overdue: number } };

/**
 * Studio → Support: every ticket, overdue first, then the clients with the
 * best plans, then the soonest due. A row opens the ticket in a dock window,
 * so several can be answered side by side without leaving the inbox.
 */
export function StudioSupport({ lang, t }: { lang: Locale; t: DockT & Pick<Dictionary, "studio"> }) {
  const user = useGuard(lang, true);
  const d = t.studio.dash.inbox;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("active");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    api.get<Data>(`/support/tickets/?${new URLSearchParams({ status: filter, q: q.trim() })}`).then(setData, () => undefined);
  }, [user, filter, q]);
  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [load]);
  useLiveRefresh(load, undefined, { messages: true });

  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-3 px-6 py-5 md:px-10">
        <div role="toolbar" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={cn("hud border px-3 py-2", filter === f ? "border-ember-400 text-ink" : "border-line text-muted hover:text-ink")}>
              {d.filters[f]}
            </button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">{d.search}</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-faint" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.search} className="pl-11" />
        </label>
        {data && (
          <Hud tone={data.counts.overdue ? "ember" : "faint"} dot={!!data.counts.overdue}>
            {fill(d.counts, { open: data.counts.open, overdue: data.counts.overdue })}
          </Hud>
        )}
      </div>
      {!data ? (
        <SkeletonRows label={t.common.loading} rows={5} />
      ) : !data.results.length ? (
        <p className="border-t border-line px-6 py-16 text-muted md:px-10">{d.empty}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {data.results.map((x) => (
            <li key={x.reference}>
              <button type="button" onClick={() => openThread(x.reference)}
                className={cn("grid w-full gap-3 px-6 py-5 text-left transition-colors hover:bg-cell md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-10",
                  x.overdue && "border-l-2 border-err")}>
                <span className="flex min-w-0 items-start gap-3">
                  <Avatar name={x.user?.full_name ?? "·"} src={x.user?.avatar_url} className="size-10" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className={cn("truncate", x.unread ? "text-ink-strong" : "text-ink")}>{x.subject}</span>
                    <span className="truncate text-sm text-faint">{x.user?.full_name} · {x.reference}{x.request ? ` · ${x.request.reference}` : ""}</span>
                    <StandingLine lang={lang} t={t} side="studio" ticket={x} />
                  </span>
                </span>
                <span className="flex items-center gap-3 md:justify-end">
                  <span className="hud text-faint">{day(lang, x.last_message_at, false)}</span>
                  {x.unread > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1.5 text-[0.65rem] tabular-nums text-on-ember">{x.unread}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
