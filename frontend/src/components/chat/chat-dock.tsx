"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, MessageCircle, Minus, Plus, Search, X } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { day, type ProjectRequest } from "@/lib/lifecycle";
import { useLive, useLiveRefresh } from "@/lib/live";
import { useSession } from "@/lib/session";
import { isTicket, type Ticket } from "@/lib/support";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Conversation } from "@/components/project/conversation";
import { setDockClear, smooth } from "@/motion/smooth";
import type { Side } from "@/components/project/shared";
import { AssistantChat, NewTicket, StandingLine, takeHandoff, TicketThread, type DockT } from "./support";

const PROJECT = /^\/(?:en|fr)\/(portal|studio)\/requests\/([^/?#]+)/;
// Signing in, signing up and the welcome steps have no conversations to show.
const QUIET = /^\/(?:en|fr)\/(login|register|reset|verify-email|welcome)(?:\/|$)/;
const STORE = "of:dock";

type Space = "assistant" | "projects" | "support";
type Dock = { list: boolean; open: string[]; min: string[]; space: Space | null };
type Compose = { subject?: string; body?: string; request?: string; category?: string; transcript?: { role: "user" | "assistant"; text: string }[] };
const EMPTY: Dock = { list: false, open: [], min: [], space: null };

/** The windows survive page changes and reloads within the visit. */
function readDock(): Dock {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
    if (v && Array.isArray(v.open) && Array.isArray(v.min)) return { list: !!v.list, open: v.open.slice(-3), min: v.min, space: v.space ?? null };
  } catch {}
  return EMPTY;
}

// How many conversation windows fit beside the list: 3 from xl, 2 from lg,
// 1 from sm; 0 is a phone, where one conversation fills the screen.
const QUERIES = ["(min-width: 1280px)", "(min-width: 1024px)", "(min-width: 640px)"];
function subscribeRoom(changed: () => void) {
  const lists = QUERIES.map((q) => matchMedia(q));
  lists.forEach((l) => l.addEventListener("change", changed));
  return () => lists.forEach((l) => l.removeEventListener("change", changed));
}
const readRoom = () => {
  const i = QUERIES.findIndex((q) => matchMedia(q).matches);
  return i === -1 ? 0 : 3 - i;
};

const launcherSize = () => (matchMedia("(min-width: 1024px)").matches ? 56 : 44);
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The list grows out of the launcher: a launcher-sized square at the bottom
 * right opens to the full panel while the launcher's light face fades into
 * it, and folds back into that square on close. Clip and opacity only.
 */
function morph(el: HTMLElement, open: boolean, done?: () => void) {
  const s = launcherSize();
  const corner = `inset(calc(100% - ${s}px) 0px 0px calc(100% - ${s}px))`;
  const full = "inset(0px 0px 0px 0px)";
  const shape = el.animate({ clipPath: open ? [corner, full] : [full, corner] },
    { duration: open ? 460 : 300, easing: open ? "cubic-bezier(0.16, 1, 0.3, 1)" : "cubic-bezier(0.55, 0, 0.7, 0.2)", fill: "both" });
  const cap = el.querySelector<HTMLElement>("[data-cap]");
  const face = cap?.animate({ opacity: open ? [1, 0] : [0, 1] }, { duration: open ? 260 : 200, delay: open ? 60 : 100, easing: "linear", fill: "both" });
  shape.onfinish = () => {
    if (open) {
      // Settled: back to the panel's own styles (its shadow, no clip).
      shape.cancel();
      face?.cancel();
    }
    done?.();
  };
}

const byActivity = (a: ProjectRequest, b: ProjectRequest) =>
  (b.summary?.unread ?? 0) - (a.summary?.unread ?? 0) || b.updated_at.localeCompare(a.updated_at);

/**
 * The messenger (docs/SUPPORT.md), on every page. The launcher opens a panel
 * with up to two spaces: the Assistant (guests and people without a request
 * yet), Projects (each sent request's conversation; the studio's grouped by
 * client) and Support (tickets, for everyone signed in). A pick opens that thread in its own window along the
 * bottom edge, up to three side by side, each minimisable, so several people
 * can be answered at once without leaving the page. On a phone one thread
 * fills the screen. A project's own Messages tab already shows its thread.
 * A proposal sent opens its thread on the client's screen by itself.
 */
export function ChatDock({ lang, t }: { lang: Locale; t: DockT }) {
  const user = useSession();
  const pathname = usePathname();
  const params = useSearchParams();
  const onPage = PROJECT.exec(pathname)?.[2] ?? null;
  const onTab = onPage && params.get("tab") === "messages" ? onPage : null;
  const side: Side = user?.is_developer ? "studio" : "client";
  const signedIn = !!user;
  const enabled = !QUIET.test(pathname);
  const room = useSyncExternalStore(subscribeRoom, readRoom, () => 1);
  const phone = room === 0;
  const [items, setItems] = useState<ProjectRequest[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [dock, setDock] = useState<Dock>(readDock);
  const [compose, setCompose] = useState<Compose | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const c = t.project.chat;
  const phoneThreadOpen = phone && !dock.list && dock.open.some((ref) => ref !== onTab && !dock.min.includes(ref));
  const shown = dock.list || phoneThreadOpen;

  // Grows when it opens; when it has folded away, the launcher pops back.
  const wasShown = useRef(shown);
  useLayoutEffect(() => {
    if (shown === wasShown.current) return;
    wasShown.current = shown;
    if (calm()) return;
    if (shown && panel.current) morph(panel.current, true);
    else launcher.current?.animate({ transform: ["scale(0.7)", "scale(1)"], opacity: [0, 1] }, { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [shown]);

  const fold = useCallback((then: () => void) => {
    const el = panel.current;
    if (!el || calm()) return then();
    morph(el, false, then);
  }, []);
  const closeList = useCallback(() => fold(() => setDock((d) => ({ ...d, list: false }))), [fold]);
  // Phone: the cross puts everything away; the launcher brings the list back.
  const putAway = useCallback(
    () => fold(() => setDock((d) => ({ ...d, list: false, min: [...new Set([...d.min, ...d.open])] }))), [fold]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(dock));
    } catch {}
  }, [dock]);

  const fetchList = useCallback(() => {
    if (!enabled || !signedIn) return;
    api.get<{ results: ProjectRequest[] }>("/requests/").then((r) => setItems(r.results.filter((x) => x.status !== "draft")), () => undefined);
    api.get<{ results: Ticket[] }>("/support/tickets/").then((r) => setTickets(r.results), () => undefined);
  }, [enabled, signedIn]);
  useEffect(() => fetchList(), [fetchList]);
  useLiveRefresh(fetchList, undefined, { messages: true });

  const openThread = useCallback((ref: string) => {
    setCompose(null);
    setDock((d) => ({
      ...d,
      list: phone ? false : d.list,
      open: [...d.open.filter((r) => r !== ref), ref].slice(-3),
      min: d.min.filter((r) => r !== ref),
    }));
  }, [phone]);

  // A proposal sent, or a conversation Younes started: it opens on the client's screen by itself.
  useLive((e) => {
    if (side !== "client" || !signedIn) return;
    if (e.type === "request" && e.action === "proposal.sent") openThread(e.reference);
    if (e.type === "ticket" && e.action === "opened" && isTicket(e.reference)) openThread(e.reference);
  });
  // Phone: a conversation fills the screen, so it never follows the visitor
  // to another page (a link tapped, a reload): it waits behind the launcher.
  // What opens a thread on purpose (below, and live events) runs after this.
  useEffect(() => {
    if (!phone) return;
    queueMicrotask(() => setDock((d) => d.list || d.open.some((r) => !d.min.includes(r))
      ? { ...d, list: false, min: [...new Set([...d.min, ...d.open])] } : d));
  }, [pathname, phone]);
  // Any page can open a thread (a ticket in the studio inbox, People → start a conversation)…
  useEffect(() => {
    const open = (e: Event) => openThread((e as CustomEvent<string>).detail);
    // …or start a ticket (a closed project's "Open a ticket").
    const draft = (e: Event) => {
      setCompose((e as CustomEvent<Compose>).detail ?? {});
      setDock((d) => ({ ...d, list: true }));
    };
    window.addEventListener("of:open-thread", open);
    window.addEventListener("of:new-ticket", draft);
    return () => {
      window.removeEventListener("of:open-thread", open);
      window.removeEventListener("of:new-ticket", draft);
    };
  }, [openThread]);
  // …and so can a link from an e-mail or the bell (?ticket=TK-…).
  const asked = params.get("ticket");
  useEffect(() => {
    if (signedIn && asked && isTicket(asked)) queueMicrotask(() => openThread(asked));
  }, [asked, signedIn, openThread]);
  // A guest asked the assistant for Younes, then signed in: the ticket is ready to send.
  useEffect(() => {
    if (!signedIn || !enabled) return;
    const pending = takeHandoff();
    if (pending) queueMicrotask(() => {
      setCompose(pending);
      setDock((d) => ({ ...d, list: true }));
    });
  }, [signedIn, enabled]);

  useEffect(() => {
    if (!dock.list) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      closeList();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [dock.list, closeList]);

  const byRef = useMemo(() => new Map((items ?? []).map((r) => [r.reference, r])), [items]);
  const ticketByRef = useMemo(() => new Map((tickets ?? []).map((x) => [x.reference, x])), [tickets]);

  // Phone: the full-screen chat fits the visible viewport, so the composer
  // stays above the keyboard (fixed layers don't shrink for it), and the page
  // behind holds still.
  useEffect(() => {
    if (!phone || !shown) return;
    const el = panel.current;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    smooth.lenis?.stop();
    const fit = () => {
      if (!el || !vv) return;
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      root.style.overflow = overflow;
      smooth.lenis?.start();
      if (el) {
        el.style.height = "";
        el.style.transform = "";
      }
    };
  }, [phone, shown]);

  // Phone: the launcher steps aside while the visitor scrolls down to read
  // (what is under the corner stays tappable) and comes back on the way up.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    if (!phone || !enabled) return;
    let last = scrollY;
    let raf = 0;
    const check = () => {
      raf = 0;
      const y = scrollY;
      if (Math.abs(y - last) < 12) return;
      setTucked(y > last && y > 120);
      last = y;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [phone, enabled]);

  // The ruler and the section titles stop above the launcher's corner.
  useEffect(() => {
    if (!enabled) return;
    const measure = () => setDockClear(launcherSize());
    measure();
    addEventListener("resize", measure);
    return () => {
      removeEventListener("resize", measure);
      setDockClear(0);
    };
  }, [enabled, room]);

  if (!enabled) return null;

  // Which spaces this person has. The assistant helps those without work with
  // Younes yet (guests, new accounts); once a request is sent, the client
  // talks to Younes directly: Projects, and Support for anything else.
  const spaces: Space[] = !signedIn ? ["assistant"]
    : side === "studio" ? ["support", "projects"]
    : (items?.length ?? 0) > 0 ? ["projects", "support"] : ["assistant", "support"];
  const projectUnread = (items ?? []).reduce((n, r) => n + (r.summary?.unread ?? 0), 0);
  const ticketUnread = (tickets ?? []).reduce((n, x) => n + (x.unread ?? 0), 0);
  const fallback: Space = side === "studio" ? ((tickets ?? []).some((x) => x.status === "open") ? "support" : "projects")
    : projectUnread ? "projects" : ticketUnread ? "support" : spaces[0];
  const space: Space = compose ? "support" : dock.space && spaces.includes(dock.space) ? dock.space : fallback;
  const unread = projectUnread + ticketUnread;

  // Windows, most recent first: the newest sits next to the launcher.
  const windows = signedIn ? dock.open.filter((ref) => ref !== onTab).reverse().slice(0, Math.max(room, 1)) : [];
  const phoneThread = phone && !dock.list ? windows.find((ref) => !dock.min.includes(ref)) : undefined;

  const closeThread = (ref: string) => setDock((d) => ({ ...d, open: d.open.filter((r) => r !== ref), min: d.min.filter((r) => r !== ref) }));
  const toggleMin = (ref: string) =>
    setDock((d) => ({ ...d, min: d.min.includes(ref) ? d.min.filter((r) => r !== ref) : [...d.min, ref] }));
  const openList = () => setDock((d) => ({ ...d, list: true }));
  const pickSpace = (s: Space) => {
    setCompose(null);
    setDock((d) => ({ ...d, space: s }));
  };

  const list = (
    <ThreadList lang={lang} t={t} side={side} items={items} tickets={tickets} current={onPage} space={space} spaces={spaces}
      onSpace={pickSpace} onPick={openThread} onClose={phone ? putAway : closeList} phone={phone} signedIn={signedIn}
      compose={compose} onCompose={setCompose}
      onCreated={(ticket) => {
        setTickets((all) => [ticket, ...(all ?? [])]);
        openThread(ticket.reference);
      }} />
  );
  // The launcher's light face, laid over the panel while it grows out of it.
  const cap = <span data-cap aria-hidden className="pointer-events-none absolute -inset-px bg-steel-50 opacity-0" />;

  const launcherButton = (
    <button ref={launcher} type="button" onClick={openList} aria-haspopup="dialog"
      aria-label={unread ? `${c.open} · ${fill(t.portal.cards.unread, { n: unread })}` : c.open}
      className={cn(
        "pointer-events-auto relative flex size-11 items-center justify-center border border-transparent bg-steel-50 text-steel-950 shadow-[0_18px_48px_-20px_rgb(0_0_0/0.7)] transition-[background-color,transform] duration-[var(--dur-micro)] hover:bg-steel-200 active:translate-y-px lg:size-14",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400",
      )}>
      <MessageCircle aria-hidden className="size-4 lg:size-5" />
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1 text-[0.65rem] tabular-nums text-on-ember"
          style={{ animation: "live-pulse 2.4s ease-in-out infinite" }}>{unread}</span>
      )}
    </button>
  );

  if (phone) {
    return (
      <>
        {shown ? (
          <div ref={panel} role="dialog" aria-modal="true" aria-label={c.conversations} className="fixed inset-x-0 top-0 z-[55] flex h-dvh flex-col bg-bg">
            {dock.list ? list : phoneThread && (
              <ThreadWindow lang={lang} t={t} side={side} reference={phoneThread} req={byRef.get(phoneThread)} ticket={ticketByRef.get(phoneThread)} phone
                onBack={openList} onMinimize={putAway} onClose={() => closeThread(phoneThread)} />
            )}
            {cap}
          </div>
        ) : (
          // Above a bottom bar (the cookie notice); out of the way while
          // scrolling down, unless something unread is waiting.
          <div onFocus={() => setTucked(false)}
            className={cn("fixed bottom-4 right-4 z-[46] transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none",
              tucked && !unread && "pointer-events-none opacity-0")}
            style={{ transform: tucked && !unread ? "translateY(calc(100% + 1rem))" : "translateY(calc(-1 * var(--bottom-bar, 0px)))" }}>
            {launcherButton}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[46] flex flex-row-reverse items-end gap-3">
      {/* The list takes the launcher's corner: it opens out of the icon and folds back into it. */}
      {dock.list ? (
        <div ref={panel} role="dialog" aria-label={c.conversations}
          className="pointer-events-auto relative flex h-[min(36rem,calc(100dvh-6rem))] w-[22rem] flex-col border border-line-strong bg-bg shadow-[0_32px_80px_-32px_rgb(0_0_0/0.85)]">
          {list}
          {cap}
        </div>
      ) : launcherButton}
      {windows.map((ref) => (
        <ThreadWindow key={ref} lang={lang} t={t} side={side} reference={ref} req={byRef.get(ref)} ticket={ticketByRef.get(ref)}
          minimized={dock.min.includes(ref)} onMinimize={() => toggleMin(ref)} onClose={() => closeThread(ref)} />
      ))}
    </div>
  );
}

/** Who and what a thread is about, from the side reading it. */
function threadNames(t: DockT, side: Side, reference: string, req?: ProjectRequest, ticket?: Ticket) {
  if (isTicket(reference)) {
    if (side === "studio") return { title: ticket?.user?.full_name ?? reference, sub: ticket ? `${ticket.subject} · ${reference}` : reference };
    return { title: ticket?.subject ?? reference, sub: `${t.project.chat.withYounes} · ${reference}` };
  }
  if (side === "studio") return { title: req?.client?.full_name ?? reference, sub: req ? `${req.title || req.reference} · ${req.reference}` : "" };
  return { title: req?.title || reference, sub: `${t.project.chat.withYounes} · ${req?.reference ?? reference}` };
}

function ThreadWindow({ lang, t, side, reference, req, ticket, minimized = false, phone = false, onMinimize, onClose, onBack }: {
  lang: Locale; t: DockT; side: Side; reference: string; req?: ProjectRequest; ticket?: Ticket; minimized?: boolean; phone?: boolean;
  onMinimize: () => void; onClose: () => void; onBack?: () => void;
}) {
  const c = t.project.chat;
  const tk = isTicket(reference);
  const { title, sub } = threadNames(t, side, reference, req, ticket);
  const unread = (tk ? ticket?.unread : req?.summary?.unread) ?? 0;
  const base = side === "client" ? `/${lang}/portal/requests` : `/${lang}/studio/requests`;
  const link = tk ? (side === "studio" ? `/${lang}/studio/support?ticket=${reference}` : null) : `${base}/${reference}?tab=messages`;
  const face = side === "studio" ? (tk ? ticket?.user?.avatar_url : req?.client?.avatar_url) : undefined;
  const icon = "flex size-9 shrink-0 items-center justify-center text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400";

  return (
    <section role="dialog" aria-label={`${title}${sub ? ` · ${sub}` : ""}`}
      className={cn(
        "pointer-events-auto flex flex-col bg-bg",
        phone ? "h-full w-full" : "origin-bottom border border-line-strong shadow-[0_32px_80px_-32px_rgb(0_0_0/0.85)] [animation:dock-in_var(--dur-standard)_var(--ease-out)]",
        !phone && (minimized ? "w-[15rem]" : "h-[min(32rem,calc(100dvh-6rem))] w-[21rem]"),
      )}>
      <header className={cn("flex shrink-0 items-center gap-1 border-line pl-2 pr-1", phone ? "h-14 border-b" : "h-12", !minimized && !phone && "border-b")}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label={c.conversations} className={icon}><ArrowLeft aria-hidden className="size-4" /></button>
        )}
        {/* The header itself folds and unfolds the window. */}
        <button type="button" onClick={phone ? undefined : onMinimize} aria-expanded={phone ? undefined : !minimized}
          aria-label={phone ? undefined : minimized ? c.restore : c.minimize}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left">
          <Avatar name={title} src={face} studio={side === "client"} className="size-7" />
          <span className="flex min-w-0 flex-col">
            <span className={cn("truncate text-sm", unread && minimized ? "text-ink-strong" : "text-ink")}>{title}</span>
            {sub && !minimized && <span className="hud truncate text-faint">{sub}</span>}
          </span>
          {minimized && unread > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1.5 text-[0.65rem] tabular-nums text-on-ember">{unread}</span>
          )}
        </button>
        {!minimized && link && (
          <Link href={link} aria-label={c.openProject} title={c.openProject} className={icon}>
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        )}
        {!phone && (
          <button type="button" onClick={onMinimize} aria-label={minimized ? c.restore : c.minimize} title={minimized ? c.restore : c.minimize} className={icon}>
            {minimized ? <ChevronDown aria-hidden className="size-4 rotate-180" /> : <Minus aria-hidden className="size-4" />}
          </button>
        )}
        <button type="button" onClick={phone ? onMinimize : onClose} aria-label={phone ? c.close : c.closeWindow} title={phone ? c.close : c.closeWindow} className={icon}>
          <X aria-hidden className="size-4" />
        </button>
      </header>
      {/* Folded, the thread stays mounted (its draft and scroll) and keeps up to date without marking anything seen. */}
      <div className={cn("min-h-0 flex-1", minimized && "hidden")}>
        {tk ? (
          <TicketThread lang={lang} t={t} side={side} reference={reference} paused={minimized} />
        ) : (
          <Conversation lang={lang} t={t} side={side} reference={reference} enabled variant="dock" paused={minimized}
            state={req?.summary?.chat} closesAt={req?.summary?.chat_closes_at} />
        )}
      </div>
    </section>
  );
}

function ThreadList({ lang, t, side, items, tickets, current, space, spaces, onSpace, onPick, onClose, phone, signedIn, compose, onCompose, onCreated }: {
  lang: Locale; t: DockT; side: Side; items: ProjectRequest[] | null; tickets: Ticket[] | null; current: string | null;
  space: Space; spaces: Space[]; onSpace: (s: Space) => void; onPick: (ref: string) => void; onClose: () => void; phone: boolean;
  signedIn: boolean; compose: Compose | null; onCompose: (c: Compose | null) => void; onCreated: (ticket: Ticket) => void;
}) {
  const c = t.project.chat;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (...fields: (string | undefined)[]) => !q || fields.some((s) => s?.toLowerCase().includes(q));
  const projectUnread = (items ?? []).reduce((n, r) => n + (r.summary?.unread ?? 0), 0);
  const ticketUnread = (tickets ?? []).reduce((n, x) => n + (x.unread ?? 0), 0);
  const counts: Record<Space, number> = { assistant: 0, projects: projectUnread, support: ticketUnread };

  return (
    <>
      <header className={cn("flex shrink-0 items-center gap-1 border-b border-line pl-2 pr-1", phone ? "h-14" : "h-12")}>
        {spaces.length > 1 ? (
          <div role="tablist" aria-label={c.conversations} className="flex min-w-0 flex-1 items-center gap-1">
            {spaces.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={space === s} onClick={() => onSpace(s)}
                className={cn("hud relative flex h-9 items-center gap-1.5 px-2.5 transition-colors", space === s ? "text-ink" : "text-faint hover:text-ink")}>
                {c.spaces[s]}
                {counts[s] > 0 && <span className="inline-flex h-4 min-w-4 items-center justify-center bg-ember-500 px-1 text-[0.6rem] tabular-nums text-on-ember">{counts[s]}</span>}
                {space === s && <span aria-hidden className="absolute inset-x-2 -bottom-[0.4rem] h-px bg-ember-500" />}
              </button>
            ))}
          </div>
        ) : (
          <span className="flex-1 pl-2 text-sm text-ink-strong">{c.spaces[spaces[0]]}</span>
        )}
        <button type="button" onClick={onClose} aria-label={c.close}
          className="flex size-9 shrink-0 items-center justify-center text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
          <X aria-hidden className="size-4" />
        </button>
      </header>

      {space === "assistant" ? (
        <div className="min-h-0 flex-1">
          <AssistantChat lang={lang} t={t} signedIn={signedIn} onHandoff={onCompose} />
        </div>
      ) : space === "support" && compose ? (
        <NewTicket lang={lang} t={t} projects={items ?? []} initial={compose} onCreated={(ticket) => {
          onCompose(null);
          onCreated(ticket);
        }} onCancel={() => onCompose(null)} />
      ) : (
        <>
          {side === "studio" && ((space === "projects" ? items?.length : tickets?.length) ?? 0) > 4 && (
            <label className="flex shrink-0 items-center gap-2 border-b border-line px-4">
              <Search aria-hidden className="size-3.5 shrink-0 text-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.search} aria-label={c.search}
                className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-faint focus:outline-none sm:text-sm" />
            </label>
          )}
          <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]">
            {space === "projects" ? (
              <ProjectList lang={lang} t={t} side={side} items={(items ?? []).filter((r) => matches(r.title, r.reference, r.client?.full_name, r.client?.email))}
                loading={items === null} current={current} onPick={onPick} />
            ) : (
              <TicketList lang={lang} t={t} side={side} tickets={(tickets ?? []).filter((x) => matches(x.subject, x.reference, x.user?.full_name, x.user?.email))}
                loading={tickets === null} onPick={onPick} onNew={side === "client" ? () => onCompose({}) : undefined} />
            )}
          </div>
        </>
      )}
    </>
  );
}

function ProjectList({ lang, t, side, items, loading, current, onPick }: {
  lang: Locale; t: DockT; side: Side; items: ProjectRequest[]; loading: boolean; current: string | null; onPick: (ref: string) => void;
}) {
  const c = t.project.chat;
  const open = items.filter((r) => r.summary?.chat !== "closed").sort(byActivity);
  const closed = items.filter((r) => r.summary?.chat === "closed").sort(byActivity);

  const row = (r: ProjectRequest, nested = false) => {
    const unread = r.summary?.unread ?? 0;
    const closes = r.summary?.chat === "ending" ? r.summary.chat_closes_at : null;
    return (
      <li key={r.reference}>
        <button type="button" onClick={() => onPick(r.reference)} aria-current={r.reference === current || undefined}
          className={cn("flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-cell focus-visible:bg-cell focus-visible:outline-none",
            nested ? "pl-16 pr-4" : "px-4", r.reference === current && "bg-cell")}>
          {!nested && (side === "studio"
            ? <Avatar name={r.client?.full_name ?? "·"} src={r.client?.avatar_url} className="size-9" />
            : <Avatar name="Younes" studio className="size-9" />)}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn("truncate text-sm", unread ? "text-ink-strong" : "text-ink")}>
              {!nested && side === "studio" ? r.client?.full_name : r.title || r.reference}
            </span>
            <span className="hud truncate text-faint">
              {!nested && side === "studio" ? `${r.title || r.reference} · ` : ""}{r.reference} · {day(lang, r.updated_at, false)}
            </span>
            {closes && <span className="hud text-ember-400">{fill(c.closesOn, { date: day(lang, closes, false) })}</span>}
          </span>
          {unread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1.5 text-[0.65rem] tabular-nums text-on-ember">{unread}</span>
          )}
        </button>
      </li>
    );
  };

  // The studio's list: one group per client, their projects under them.
  const grouped = (rows: ProjectRequest[]) => {
    if (side === "client") return <ul className="divide-y divide-line">{rows.map((r) => row(r))}</ul>;
    const groups = new Map<number | string, ProjectRequest[]>();
    rows.forEach((r) => {
      const key = r.client?.id ?? r.reference;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    });
    return (
      <ul className="divide-y divide-line">
        {[...groups.values()].map((projects) => {
          if (projects.length === 1) return row(projects[0]);
          const who = projects[0].client;
          const unread = projects.reduce((n, r) => n + (r.summary?.unread ?? 0), 0);
          return (
            <li key={`client-${who?.id}`}>
              <div className="flex items-center gap-3 px-4 pb-1 pt-3">
                <Avatar name={who?.full_name ?? "·"} src={who?.avatar_url} className="size-9" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate text-sm", unread ? "text-ink-strong" : "text-ink")}>{who?.full_name}</span>
                  <span className="hud text-faint">{fill(c.projects, { n: projects.length })}</span>
                </span>
              </div>
              <ul>{projects.map((r) => row(r, true))}</ul>
            </li>
          );
        })}
      </ul>
    );
  };

  if (loading) return <p className="hud p-6 text-faint">{t.common.loading}</p>;
  if (!items.length) return <p className="p-6 text-sm text-muted">{c.none}</p>;
  return (
    <>
      {open.length > 0 && grouped(open)}
      {closed.length > 0 && (
        <details className="group/closed border-t border-line">
          <summary className="hud flex cursor-pointer list-none items-center justify-between px-4 py-3 text-faint hover:text-ink [&::-webkit-details-marker]:hidden">
            {c.closedList} · {closed.length}
            <ChevronDown aria-hidden className="size-3.5 transition-transform group-open/closed:rotate-180" />
          </summary>
          <div className="opacity-80">{grouped(closed)}</div>
        </details>
      )}
    </>
  );
}

function TicketList({ lang, t, side, tickets, loading, onPick, onNew }: {
  lang: Locale; t: DockT; side: Side; tickets: Ticket[]; loading: boolean; onPick: (ref: string) => void; onNew?: () => void;
}) {
  const s = t.support;
  const active = tickets.filter((x) => x.status === "open" || x.status === "pending");
  const done = tickets.filter((x) => x.status === "solved" || x.status === "closed");
  const row = (x: Ticket) => (
    <li key={x.reference}>
      <button type="button" onClick={() => onPick(x.reference)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-cell focus-visible:bg-cell focus-visible:outline-none">
        {side === "studio" && <Avatar name={x.user?.full_name ?? "·"} src={x.user?.avatar_url} className="size-9" />}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn("truncate text-sm", x.unread ? "text-ink-strong" : "text-ink")}>
            {side === "studio" ? `${x.user?.full_name ?? ""} · ${x.subject}` : x.subject}
          </span>
          <StandingLine lang={lang} t={t} side={side} ticket={x} />
        </span>
        {x.unread > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1.5 text-[0.65rem] tabular-nums text-on-ember">{x.unread}</span>
        )}
      </button>
    </li>
  );
  return (
    <>
      {onNew && (
        <div className="border-b border-line px-4 py-3">
          <button type="button" onClick={onNew}
            className="hud flex h-10 w-full items-center justify-center gap-2 border border-line-strong text-ink transition-colors hover:border-transparent hover:bg-steel-50 hover:text-steel-950">
            <Plus aria-hidden className="size-3.5" />{s.newTicket}
          </button>
        </div>
      )}
      {loading ? (
        <p className="hud p-6 text-faint">{t.common.loading}</p>
      ) : !tickets.length ? (
        <p className="p-6 text-sm leading-relaxed text-muted">{s.empty}</p>
      ) : (
        <>
          {active.length > 0 && <ul className="divide-y divide-line">{active.map(row)}</ul>}
          {done.length > 0 && (
            <details className="group/closed border-t border-line">
              <summary className="hud flex cursor-pointer list-none items-center justify-between px-4 py-3 text-faint hover:text-ink [&::-webkit-details-marker]:hidden">
                {s.statuses.solved} · {done.length}
                <ChevronDown aria-hidden className="size-3.5 transition-transform group-open/closed:rotate-180" />
              </summary>
              <ul className="divide-y divide-line opacity-80">{done.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </>
  );
}
