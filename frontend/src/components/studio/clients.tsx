"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { day } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useGuard } from "@/components/portal/requests";

type Client = {
  id: number; full_name: string; email: string; company: string; phone: string; whatsapp: string; country: string;
  language: string; currency: string; date_joined: string; last_login: string | null; verified: boolean;
  heard_from_label: string; heard_from_detail: string; contact_channel_label: string; contact_handle: string;
  requests: number; projects: number;
};
type Page = { count: number; page: number; pages: number; results: Client[] };
type T = Pick<Dictionary, "studio" | "common">;

const digits = (s: string) => s.replace(/[^\d+]/g, "");

export function StudioClients({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const d = t.studio.dash;
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page & { key: string }) | null>(null);
  const key = `${query}|${page}`;
  // Still showing the previous page or search while the next one loads.
  const busy = !!data && data.key !== key;

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.get<Page>(`/studio/clients/?${new URLSearchParams({ q: query, page: String(page) })}`)
      .then((r) => alive && setData({ ...r, key: `${query}|${page}` }), () => undefined);
    return () => {
      alive = false;
    };
  }, [user, query, page]);

  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-4 px-6 py-5 md:px-10">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">{d.search}</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-faint" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.search} className="pl-11" />
        </label>
        {data && <Hud tone="faint" dot={busy} live={busy}>{data.count}</Hud>}
      </div>

      {!data ? (
        <SkeletonRows label={t.common.loading} rows={6} />
      ) : !data.results.length ? (
        <p className="border-t border-line px-6 py-16 text-muted md:px-10">{d.noClients}</p>
      ) : (
        <ul className={cn("divide-y divide-line border-t border-line transition-opacity duration-[var(--dur-micro)]", busy && "opacity-60")}>
          {data.results.map((c) => {
            const wa = digits(c.whatsapp || c.phone);
            return (
              <li key={c.id} className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:px-10">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-ink-strong">{c.full_name || c.email}</span>
                    {!c.verified && <Hud as="span" tone="faint">{d.unverified}</Hud>}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted">{[c.email, c.company, c.country].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-col gap-1 text-sm text-faint">
                  <span>{d.joined} {day(lang, c.date_joined)}{c.last_login ? ` · ${d.lastSeen} ${day(lang, c.last_login, false)}` : ""}</span>
                  <span>
                    {[c.heard_from_label, c.contact_channel_label + (c.contact_handle ? ` ${c.contact_handle}` : "")].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 md:justify-end">
                  <span className="hud text-muted">
                    {fill(d.requestsCount, { n: c.requests })} · {fill(d.projectsCount, { n: c.projects })}
                  </span>
                  <span className="flex items-center gap-1">
                    <a href={`mailto:${c.email}`} aria-label={`E-mail ${c.full_name}`} className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ember-400"><Mail aria-hidden className="size-4" /></a>
                    {wa && <a href={`https://wa.me/${wa.replace("+", "")}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.full_name}`} className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ember-400"><MessageCircle aria-hidden className="size-4" /></a>}
                    {c.phone && <a href={`tel:${digits(c.phone)}`} aria-label={`Call ${c.full_name}`} className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ember-400"><Phone aria-hidden className="size-4" /></a>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-4 md:px-10">
          <Button variant="ghost" size="sm" disabled={page <= 1 || busy} onClick={() => setPage((p) => p - 1)}>{d.prev}</Button>
          <Hud tone="faint">{fill(d.page, { n: data.page, total: data.pages })}</Hud>
          <Button variant="ghost" size="sm" disabled={page >= data.pages || busy} onClick={() => setPage((p) => p + 1)}>{d.next}</Button>
        </div>
      )}
    </div>
  );
}
