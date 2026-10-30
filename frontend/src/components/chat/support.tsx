"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Send, Star, UserRound } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useLiveRefresh } from "@/lib/live";
import { type ProjectRequest } from "@/lib/lifecycle";
import type { Standing, Ticket } from "@/lib/support";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { Conversation } from "@/components/project/conversation";
import { ErrorLine, type Side, type T } from "@/components/project/shared";
import { ShareCard } from "./share-card";

export type DockT = T & Pick<Dictionary, "support" | "assistant">;

const relative = (lang: Locale, iso: string) => {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(lang === "fr" ? "fr" : "en", { numeric: "auto" });
  return Math.abs(mins) < 90 ? rtf.format(mins, "minute") : Math.abs(mins) < 48 * 60 ? rtf.format(Math.round(mins / 60), "hour") : rtf.format(Math.round(mins / 1440), "day");
};

/** The line every ticket shows: who it is and how soon Younes answers. */
export function StandingLine({ lang, t, side, ticket }: { lang: Locale; t: DockT; side: Side; ticket: Ticket }) {
  const s = t.support;
  const statuses = side === "studio" ? s.studioStatuses : s.statuses;
  return (
    <span className="hud flex flex-wrap items-center gap-x-3 gap-y-1 text-faint">
      <span className={cn(ticket.status === "open" ? "text-ember-400" : "text-muted")}>{statuses[ticket.status]}</span>
      <span>{fill(s.standing, { label: ticket.tier_label, hours: ticket.target_hours })}</span>
      {ticket.status === "open" && ticket.due_at && (
        <span className={cn(ticket.overdue && "text-err")}>{ticket.overdue ? s.overdue : fill(s.due, { time: relative(lang, ticket.due_at) })}</span>
      )}
    </span>
  );
}

/** A support ticket: its standing and moves on top, then the thread (the project conversation's, in ticket mode). */
export function TicketThread({ lang, t, side, reference, paused = false }: {
  lang: Locale; t: DockT; side: Side; reference: string; paused?: boolean;
}) {
  const s = t.support;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get<Ticket>(`/support/tickets/${reference}/`).then(setTicket, () => undefined), [reference]);
  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(load, reference, { messages: true });

  const move = async (status: Ticket["status"]) => {
    setBusy(status);
    try {
      setTicket(await api.post<Ticket>(`/support/tickets/${reference}/status/`, { status }));
    } finally {
      setBusy("");
    }
  };
  const rate = async (rating: number) => setTicket(await api.post<Ticket>(`/support/tickets/${reference}/rate/`, { rating }));
  const done = ticket && (ticket.status === "solved" || ticket.status === "closed");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {ticket && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-line px-4 py-3">
          <StandingLine lang={lang} t={t} side={side} ticket={ticket} />
          <span className="flex flex-wrap gap-2">
            {side === "studio" ? (
              <>
                {ticket.status !== "solved" && ticket.status !== "closed" && (
                  <Button size="sm" variant="secondary" loading={busy === "solved"} onClick={() => move("solved")}>{s.solve}</Button>
                )}
                {done && <Button size="sm" variant="ghost" loading={busy === "open"} onClick={() => move("open")}>{s.reopen}</Button>}
                {ticket.status !== "closed" && <Button size="sm" variant="ghost" loading={busy === "closed"} onClick={() => move("closed")}>{s.close}</Button>}
              </>
            ) : (
              !done && <Button size="sm" variant="ghost" loading={busy === "solved"} onClick={() => move("solved")}>{s.solve}</Button>
            )}
          </span>
          {side === "client" && done && (
            ticket.rating ? <span className="hud text-faint">{s.rated}</span> : (
              <span className="flex items-center gap-3">
                <span className="text-sm text-muted">{s.rate}</span>
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => rate(n)} aria-label={`${n} / 5`}
                      className="group/star flex size-8 items-center justify-center text-faint hover:text-ember-400">
                      <Star aria-hidden className="size-4" />
                    </button>
                  ))}
                </span>
              </span>
            )
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Conversation lang={lang} t={t} side={side} reference={reference} enabled variant="dock" paused={paused}
          endpoint={`/support/tickets/${reference}/messages/`} reactions={false} notes
          state={ticket?.status === "closed" ? "closed" : "open"} />
      </div>
    </div>
  );
}

/** Opening a ticket: what about, the message, and what to expect (newcomers see that plans are answered first). */
export function NewTicket({ lang, t, projects, initial, onCreated, onCancel }: {
  lang: Locale; t: DockT; projects: ProjectRequest[];
  initial?: { subject?: string; body?: string; request?: string; category?: string; transcript?: { role: "user" | "assistant"; text: string }[] };
  onCreated: (ticket: Ticket) => void; onCancel: () => void;
}) {
  const s = t.support;
  const [form, setForm] = useState({
    subject: initial?.subject ?? "", body: initial?.body ?? "", category: initial?.category ?? "question", request: initial?.request ?? "",
  });
  const [standing, setStanding] = useState<Standing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    api.get<Standing>("/support/standing/").then(setStanding, () => undefined);
  }, []);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onCreated(await api.post<Ticket>("/support/tickets/", { ...form, transcript: initial?.transcript }));
    } catch (err) {
      setError(err instanceof ApiError ? err.field("subject") ?? err.field("body") ?? err.message : t.common.error);
      setBusy(false);
    }
  };
  return (
    <div data-lenis-prevent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      {standing && (
        standing.tier === "newcomer" ? (
          <p className="border-l-2 border-ember-500 bg-cell px-3 py-2.5 text-sm leading-relaxed text-muted">
            {s.newcomerUpsell}{" "}
            <Link href={`/${lang}/start`} className="text-ember-400 hover:underline">{s.seePlans}</Link>
          </p>
        ) : (
          <Hud tone="faint">{fill(s.standing, { label: standing.label, hours: standing.hours })}</Hud>
        )
      )}
      <Field label={s.subject}>{(a) => <Input id={a.id} value={form.subject} maxLength={160} onChange={(e) => set("subject", e.target.value)} />}</Field>
      <Field label={s.category}>
        {(a) => (
          <Select id={a.id} value={form.category} onChange={(e) => set("category", e.target.value)}>
            {Object.entries(s.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
      </Field>
      {projects.length > 0 && (
        <Field label={s.project}>
          {(a) => (
            <Select id={a.id} value={form.request} onChange={(e) => set("request", e.target.value)}>
              <option value="">{s.none}</option>
              {projects.map((p) => <option key={p.reference} value={p.reference}>{p.title || p.reference}</option>)}
            </Select>
          )}
        </Field>
      )}
      <Field label={s.message}>{(a) => <Textarea id={a.id} value={form.body} onChange={(e) => set("body", e.target.value)} className="min-h-28" />}</Field>
      <ErrorLine>{error}</ErrorLine>
      <span className="flex flex-wrap gap-2">
        <Button variant="ember" loading={busy} disabled={!form.subject.trim() || !form.body.trim()} onClick={send}>{s.send}</Button>
        <Button variant="ghost" onClick={onCancel}>{s.back}</Button>
      </span>
    </div>
  );
}

type Turn = { role: "user" | "assistant"; text: string; sources?: { title: string; url: string }[]; film?: string; handoff?: boolean };
type Line = { role: "user" | "assistant"; text: string };
export type Handoff = { subject: string; body: string; transcript: Line[] };
const STORE = "of:assistant";
// A guest who asked for Younes signs in first; the dock picks it up after.
const PENDING = "of:handoff";

function readTurns(): Turn[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.slice(-30) : [];
  } catch {
    return [];
  }
}

/** A new ticket from the chat so far: the first question as its subject, the transcript attached. */
function handoff(turns: Line[]): Handoff {
  const asked = turns.filter((x) => x.role === "user");
  return { subject: (asked[0]?.text ?? "").slice(0, 120), body: asked[asked.length - 1]?.text ?? "", transcript: turns };
}

/** The ticket a guest asked for before signing in, once (null when there is none). */
export function takeHandoff(): Handoff | null {
  try {
    if (sessionStorage.getItem(PENDING) !== "1") return null;
    sessionStorage.removeItem(PENDING);
  } catch {
    return null;
  }
  return handoff(readTurns().map(({ role, text }) => ({ role, text })));
}

/**
 * The assistant, for visitors without a project yet: answers at once from the
 * site's own information, with a film when it helps, and always one tap from
 * a person ("Talk to Younes" opens a ticket; a guest signs in first and the
 * ticket is waiting, transcript attached, when they come back).
 */
export function AssistantChat({ lang, t, signedIn, onHandoff }: {
  lang: Locale; t: DockT; signedIn: boolean; onHandoff: (ticket: Handoff) => void;
}) {
  const a = t.assistant;
  const pathname = usePathname();
  const [turns, setTurns] = useState<Turn[]>(readTurns);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-30)));
    } catch {}
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const history = turns.slice(-6).map(({ role, text: x }) => ({ role, text: x }));
    setTurns((all) => [...all, { role: "user", text: q }]);
    try {
      const r = await api.post<{ answer: string; sources: Turn["sources"]; film: string; handoff: boolean }>("/assistant/ask/", { question: q, lang, history });
      setTurns((all) => [...all, { role: "assistant", text: r.answer, sources: r.sources, film: r.film, handoff: r.handoff }]);
    } catch {
      setTurns((all) => [...all, { role: "assistant", text: a.error, handoff: true }]);
    } finally {
      setBusy(false);
    }
  };

  const talk = (inline?: boolean) => signedIn ? (
    <button type="button" onClick={() => onHandoff(handoff(turns.map(({ role, text: x }) => ({ role, text: x }))))}
      className={cn("hud flex items-center gap-1.5 text-ember-400 hover:underline", inline && "self-start border border-ember-700/70 px-2.5 py-1.5 hover:border-ember-400 hover:no-underline")}>
      <UserRound aria-hidden className="size-3.5" />{a.talk}
    </button>
  ) : (
    <Link href={`/${lang}/login?next=${encodeURIComponent(pathname)}`} onClick={() => {
      try {
        sessionStorage.setItem(PENDING, "1");
      } catch {}
    }}
      className={cn("hud flex items-center gap-1.5 text-ember-400 hover:underline", inline && "self-start border border-ember-700/70 px-2.5 py-1.5 hover:border-ember-400 hover:no-underline")}>
      <UserRound aria-hidden className="size-3.5" />{t.support.signIn}
    </Link>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ol ref={list} data-lenis-prevent aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 [overscroll-behavior:contain]">
        <li className="flex items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-ember-400"><Bot aria-hidden className="size-4" /></span>
          <span className="rounded-[1.15rem] rounded-tl-md border border-line bg-cell px-3.5 py-2.5 text-ink">{a.hello}</span>
        </li>
        {turns.length === 0 && (
          <li className="flex flex-wrap gap-2 pl-10">
            {a.suggestions.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)}
                className="border border-line px-3 py-1.5 text-left text-sm text-muted transition-colors hover:border-ember-400 hover:text-ink">{q}</button>
            ))}
          </li>
        )}
        {turns.map((turn, i) => turn.role === "user" ? (
          <li key={i} className="ml-auto max-w-[85%] rounded-[1.15rem] rounded-tr-md border border-ember-700/70 bg-ember-500/[0.13] px-3.5 py-2.5 text-ink [overflow-wrap:anywhere]">{turn.text}</li>
        ) : (
          <li key={i} className="flex max-w-[94%] items-start gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-ember-400"><Bot aria-hidden className="size-4" /></span>
            <span className="flex min-w-0 flex-col gap-2">
              <span className="whitespace-pre-line rounded-[1.15rem] rounded-tl-md border border-line bg-cell px-3.5 py-2.5 text-ink [overflow-wrap:anywhere]">{turn.text}</span>
              {turn.film === "howto" && <ShareCard lang={lang} t={t} share="howto" />}
              {/* Not something the assistant can settle: the way to a person, right here. */}
              {turn.handoff && talk(true)}
              {turn.sources && turn.sources.length > 0 && (
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  {turn.sources.map((src) => (
                    <Link key={src.url} href={`/${lang}${src.url.startsWith("/") ? src.url : `/${src.url}`}`} className="hud flex items-center gap-1 text-ember-400 hover:underline">
                      {src.title}<ArrowUpRight aria-hidden className="size-3" />
                    </Link>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
        {busy && <li className="hud pl-10 text-faint">{a.thinking}…</li>}
      </ol>
      <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-cell px-2 py-2">
        <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-1">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={a.placeholder} aria-label={a.placeholder} maxLength={600}
            className="h-10 min-w-0 flex-1 bg-transparent px-2 text-base text-ink placeholder:text-faint focus:outline-none" />
          <Button type="submit" variant="ember" size="sm" loading={busy} disabled={!text.trim()} className="h-10 w-10 shrink-0 px-0" aria-label={a.placeholder}>
            <Send aria-hidden className="size-4" />
          </Button>
        </form>
        <span className="flex items-center justify-between gap-3 px-2 pb-1">
          {talk()}
          {turns.length > 0 && <button type="button" onClick={() => setTurns([])} className="hud text-faint hover:text-ink">{a.clear}</button>}
        </span>
      </div>
    </div>
  );
}
