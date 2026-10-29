"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Mail, MessageCircle, Phone, Search } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { day } from "@/lib/lifecycle";
import { openThread, type Ticket } from "@/lib/support";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useGuard } from "@/components/portal/requests";

type Client = {
  id: number; full_name: string; email: string; handle: string; company: string; phone: string; whatsapp: string; country: string;
  language: string; currency: string; date_joined: string; last_login: string | null; verified: boolean;
  heard_from_label: string; heard_from_detail: string; contact_channel_label: string; contact_handle: string;
  requests: number; projects: number; open_tickets: number; avatar_url: string;
  standing: { tier: string; label: string; hours: number };
};
type Detail = Client & {
  requests_list: { reference: string; title: string; status: string; created_at: string; engagement_status: string }[];
  tickets_list: { reference: string; subject: string; status: string; updated_at: string }[];
};
type Page = { count: number; page: number; pages: number; results: Client[] };
type T = Pick<Dictionary, "studio" | "common" | "support" | "portal" | "project">;

const SHOW = ["", "clients", "requests", "newcomers", "tickets"] as const;
const TIER_TONE: Record<string, string> = { ultimate: "border-ember-400 text-ember-400", pro: "border-ember-700 text-ember-400", starter: "border-line-strong text-ink" };
const digits = (s: string) => s.replace(/[^\d+]/g, "");

/** One person, opened: their projects, their tickets, and a way to write to them first. */
function PersonDetail({ lang, t, id }: { lang: Locale; t: T; id: number }) {
  const p = t.studio.dash.people;
  const [d, setD] = useState<Detail | null>(null);
  const [form, setForm] = useState({ subject: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    api.get<Detail>(`/studio/clients/${id}/`).then(setD, () => undefined);
  }, [id]);
  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const ticket = await api.post<Ticket>("/support/start/", { user: id, ...form });
      setForm({ subject: "", body: "" });
      openThread(ticket.reference);
      setD((x) => x && { ...x, tickets_list: [{ reference: ticket.reference, subject: ticket.subject, status: ticket.status, updated_at: ticket.updated_at }, ...x.tickets_list] });
    } catch (err) {
      setError(err instanceof ApiError ? err.field("body") ?? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };
  if (!d) return <p className="hud px-6 pb-5 text-faint md:px-10">{t.common.loading}</p>;
  return (
    <div className="grid gap-6 border-t border-line bg-bg-sunken px-6 py-6 md:grid-cols-3 md:px-10">
      <div className="flex flex-col gap-3">
        <Hud tone="faint" as="h4">{p.requests}</Hud>
        {d.requests_list.length ? (
          <ul className="flex flex-col gap-2">
            {d.requests_list.map((r) => (
              <li key={r.reference}>
                <Link href={`/${lang}/studio/requests/${r.reference}`} className="text-sm text-ink hover:text-ember-400">{r.title || r.reference}</Link>
                <p className="hud text-faint">
                  {r.reference} · {r.engagement_status
                    ? t.project.statuses[r.engagement_status as keyof T["project"]["statuses"]] ?? r.engagement_status
                    : t.portal.statuses[r.status as keyof T["portal"]["statuses"]] ?? r.status} · {day(lang, r.created_at, false)}
                </p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-faint">{p.none}</p>}
      </div>
      <div className="flex flex-col gap-3">
        <Hud tone="faint" as="h4">{p.tickets}</Hud>
        {d.tickets_list.length ? (
          <ul className="flex flex-col gap-2">
            {d.tickets_list.map((x) => (
              <li key={x.reference}>
                <button type="button" onClick={() => openThread(x.reference)} className="text-left text-sm text-ink hover:text-ember-400">{x.subject}</button>
                <p className="hud text-faint">{x.reference} · {t.support.studioStatuses[x.status as keyof T["support"]["studioStatuses"]] ?? x.status}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-faint">{p.none}</p>}
      </div>
      <div className="flex flex-col gap-3">
        <Hud tone="faint" as="h4">{p.start}</Hud>
        <Field label={p.startSubject}>{(a) => <Input id={a.id} value={form.subject} maxLength={160} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />}</Field>
        <Field label={p.startMessage} error={error}>
          {(a) => <Textarea id={a.id} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} className="min-h-24" />}
        </Field>
        <Button variant="ember" size="sm" loading={busy} disabled={!form.subject.trim() || !form.body.trim()} onClick={start} className="w-fit">{p.startSend}</Button>
      </div>
    </div>
  );
}

export function StudioClients({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const d = t.studio.dash;
  const p = d.people;
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<(typeof SHOW)[number]>("");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<number | null>(null);
  const [data, setData] = useState<(Page & { key: string }) | null>(null);
  const key = `${query}|${show}|${page}`;
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
    api.get<Page>(`/studio/clients/?${new URLSearchParams({ q: query, show, page: String(page) })}`)
      .then((r) => alive && setData({ ...r, key: `${query}|${show}|${page}` }), () => undefined);
    return () => {
      alive = false;
    };
  }, [user, query, show, page]);

  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-4 px-6 py-5 md:px-10">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">{d.search}</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-faint" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.search} className="pl-11" />
        </label>
        {data && <Hud tone="faint" dot={busy} live={busy}>{data.count}</Hud>}
        <div role="toolbar" className="flex basis-full flex-wrap gap-2">
          {SHOW.map((s) => (
            <button key={s || "all"} type="button" aria-pressed={show === s} onClick={() => { setShow(s); setPage(1); }}
              className={cn("hud border px-3 py-2", show === s ? "border-ember-400 text-ink" : "border-line text-muted hover:text-ink")}>
              {p.show[s || "all"]}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <SkeletonRows label={t.common.loading} rows={6} />
      ) : !data.results.length ? (
        <p className="border-t border-line px-6 py-16 text-muted md:px-10">{d.noClients}</p>
      ) : (
        <ul className={cn("divide-y divide-line border-t border-line transition-opacity duration-[var(--dur-micro)]", busy && "opacity-60")}>
          {data.results.map((c) => {
            const wa = digits(c.whatsapp || c.phone);
            const open = opened === c.id;
            return (
              <li key={c.id}>
                <div className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:px-10">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.full_name || c.email} src={c.avatar_url} className="size-10" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-ink-strong">{c.full_name || c.email}</span>
                        <span className={cn("hud border px-1.5 py-0.5", TIER_TONE[c.standing.tier] ?? "border-line text-faint")}>{c.standing.label}</span>
                        {!c.verified && <Hud as="span" tone="faint">{d.unverified}</Hud>}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">{[c.handle && `@${c.handle}`, c.email, c.company, c.country].filter(Boolean).join(" · ")}</p>
                    </div>
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
                      {c.open_tickets > 0 && <span className="text-ember-400"> · {fill(p.openTickets, { n: c.open_tickets })}</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <a href={`mailto:${c.email}`} aria-label={`E-mail ${c.full_name}`} className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ember-400"><Mail aria-hidden className="size-4" /></a>
                      {wa && <a href={`https://wa.me/${wa.replace("+", "")}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.full_name}`} className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ember-400"><MessageCircle aria-hidden className="size-4" /></a>}
                      {c.phone && <a href={`tel:${digits(c.phone)}`} aria-label={`Call ${c.full_name}`} className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ember-400"><Phone aria-hidden className="size-4" /></a>}
                      <button type="button" onClick={() => setOpened(open ? null : c.id)} aria-expanded={open} aria-label={p.start}
                        className="flex size-9 items-center justify-center text-faint transition-colors hover:text-ember-400">
                        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
                      </button>
                    </span>
                  </div>
                </div>
                {open && <PersonDetail lang={lang} t={t} id={c.id} />}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-4 md:px-10">
          <Button variant="ghost" size="sm" disabled={page <= 1 || busy} onClick={() => setPage((x) => x - 1)}>{d.prev}</Button>
          <Hud tone="faint">{fill(d.page, { n: data.page, total: data.pages })}</Hud>
          <Button variant="ghost" size="sm" disabled={page >= data.pages || busy} onClick={() => setPage((x) => x + 1)}>{d.next}</Button>
        </div>
      )}
    </div>
  );
}
