"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, MessageCircle, Minus, Search, X } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { day, type ProjectRequest } from "@/lib/lifecycle";
import { useLiveRefresh } from "@/lib/live";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Conversation } from "@/components/project/conversation";
import { setDockClear, smooth } from "@/motion/smooth";
import type { Side, T } from "@/components/project/shared";

const PROJECT = /^\/(?:en|fr)\/(portal|studio)\/requests\/([^/?#]+)/;
// Signing in, signing up and the welcome steps have no conversations to show.
const QUIET = /^\/(?:en|fr)\/(login|register|reset|verify-email|welcome)(?:\/|$)/;
const STORE = "of:dock";

type Dock = { list: boolean; open: string[]; min: string[] };
const EMPTY: Dock = { list: false, open: [], min: [] };

/** The windows survive page changes and reloads within the visit. */
function readDock(): Dock {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
    if (v && Array.isArray(v.open) && Array.isArray(v.min)) return { list: !!v.list, open: v.open.slice(-3), min: v.min };
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
 * The conversations, on every page once signed in. The launcher opens the
 * list (the studio's grouped by client, then project; a client's by
 * project); a pick opens that thread in its own window along the bottom
 * edge, up to three side by side, each one minimisable, so several clients
 * can be answered at once without leaving the page. On a phone one thread
 * fills the screen. A project's own Messages tab already shows its thread:
 * no window for it there.
 */
export function ChatDock({ lang, t }: { lang: Locale; t: T }) {
  const user = useSession();
  const pathname = usePathname();
  const params = useSearchParams();
  const onPage = PROJECT.exec(pathname)?.[2] ?? null;
  const onTab = onPage && params.get("tab") === "messages" ? onPage : null;
  const side: Side = user?.is_developer ? "studio" : "client";
  const enabled = !!user && !QUIET.test(pathname);
  const room = useSyncExternalStore(subscribeRoom, readRoom, () => 1);
  const phone = room === 0;
  const [items, setItems] = useState<ProjectRequest[] | null>(null);
  const [dock, setDock] = useState<Dock>(readDock);
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
    () => fold(() => setDock((d) => ({ list: false, open: d.open, min: [...new Set([...d.min, ...d.open])] }))), [fold]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(dock));
    } catch {}
  }, [dock]);

  const fetchList = useCallback(() => {
    if (!enabled) return;
    api.get<{ results: ProjectRequest[] }>("/requests/").then((r) => setItems(r.results.filter((x) => x.status !== "draft")), () => undefined);
  }, [enabled]);
  useEffect(() => fetchList(), [fetchList]);
  useLiveRefresh(fetchList, undefined, { messages: true });

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

  // Windows, most recent first: the newest sits next to the launcher.
  const windows = dock.open.filter((ref) => ref !== onTab).reverse().slice(0, Math.max(room, 1));
  const phoneThread = phone && !dock.list ? windows.find((ref) => !dock.min.includes(ref)) : undefined;
  const unread = (items ?? []).reduce((n, r) => n + (r.summary?.unread ?? 0), 0);

  const openThread = (ref: string) =>
    setDock((d) => ({
      list: phone ? false : d.list,
      open: [...d.open.filter((r) => r !== ref), ref].slice(-3),
      min: d.min.filter((r) => r !== ref),
    }));
  const closeThread = (ref: string) => setDock((d) => ({ ...d, open: d.open.filter((r) => r !== ref), min: d.min.filter((r) => r !== ref) }));
  const toggleMin = (ref: string) =>
    setDock((d) => ({ ...d, min: d.min.includes(ref) ? d.min.filter((r) => r !== ref) : [...d.min, ref] }));
  const openList = () => setDock((d) => ({ ...d, list: true }));

  const list = (
    <ThreadList lang={lang} t={t} side={side} items={items} current={onPage} onPick={openThread}
      onClose={phone ? putAway : closeList} phone={phone} />
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
              <ThreadWindow lang={lang} t={t} side={side} reference={phoneThread} req={byRef.get(phoneThread)} phone
                onBack={openList} onMinimize={putAway} onClose={() => closeThread(phoneThread)} />
            )}
            {cap}
          </div>
        ) : (
          <div className="fixed bottom-4 right-4 z-[46]">{launcherButton}</div>
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
        <ThreadWindow key={ref} lang={lang} t={t} side={side} reference={ref} req={byRef.get(ref)} minimized={dock.min.includes(ref)}
          onMinimize={() => toggleMin(ref)} onClose={() => closeThread(ref)} />
      ))}
    </div>
  );
}

/** Who and what a thread is about, from the side reading it. */
function threadNames(t: T, side: Side, req?: ProjectRequest, reference?: string) {
  if (side === "studio") return { title: req?.client?.full_name ?? reference ?? "", sub: req ? `${req.title || req.reference} · ${req.reference}` : "" };
  return { title: req?.title || reference || "", sub: `${t.project.chat.withYounes} · ${req?.reference ?? reference ?? ""}` };
}

function ThreadWindow({ lang, t, side, reference, req, minimized = false, phone = false, onMinimize, onClose, onBack }: {
  lang: Locale; t: T; side: Side; reference: string; req?: ProjectRequest; minimized?: boolean; phone?: boolean;
  onMinimize: () => void; onClose: () => void; onBack?: () => void;
}) {
  const c = t.project.chat;
  const { title, sub } = threadNames(t, side, req, reference);
  const unread = req?.summary?.unread ?? 0;
  const base = side === "client" ? `/${lang}/portal/requests` : `/${lang}/studio/requests`;
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
          <Avatar name={title} src={side === "studio" ? req?.client?.avatar_url : undefined} studio={side === "client"} className="size-7" />
          <span className="flex min-w-0 flex-col">
            <span className={cn("truncate text-sm", unread && minimized ? "text-ink-strong" : "text-ink")}>{title}</span>
            {sub && !minimized && <span className="hud truncate text-faint">{sub}</span>}
          </span>
          {minimized && unread > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1.5 text-[0.65rem] tabular-nums text-on-ember">{unread}</span>
          )}
        </button>
        {!minimized && (
          <Link href={`${base}/${reference}?tab=messages`} aria-label={c.openProject} title={c.openProject} className={icon}>
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
        <Conversation lang={lang} t={t} side={side} reference={reference} enabled variant="dock" paused={minimized}
          state={req?.summary?.chat} closesAt={req?.summary?.chat_closes_at} />
      </div>
    </section>
  );
}

function ThreadList({ lang, t, side, items, current, onPick, onClose, phone }: {
  lang: Locale; t: T; side: Side; items: ProjectRequest[] | null; current: string | null;
  onPick: (ref: string) => void; onClose: () => void; phone: boolean;
}) {
  const c = t.project.chat;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (r: ProjectRequest) =>
    !q || [r.title, r.reference, r.client?.full_name, r.client?.email].some((s) => s?.toLowerCase().includes(q));
  const shown = (items ?? []).filter(matches);
  const open = shown.filter((r) => r.summary?.chat !== "closed").sort(byActivity);
  const closed = shown.filter((r) => r.summary?.chat === "closed").sort(byActivity);

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

  return (
    <>
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-line pl-4 pr-1", phone ? "h-14" : "h-12")}>
        <span className="flex-1 text-sm text-ink-strong">{c.conversations}</span>
        <button type="button" onClick={onClose} aria-label={c.close}
          className="flex size-9 items-center justify-center text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
          <X aria-hidden className="size-4" />
        </button>
      </header>
      {side === "studio" && (items?.length ?? 0) > 4 && (
        <label className="flex shrink-0 items-center gap-2 border-b border-line px-4">
          <Search aria-hidden className="size-3.5 shrink-0 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.search} aria-label={c.search}
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-faint focus:outline-none sm:text-sm" />
        </label>
      )}
      <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]">
        {items === null ? (
          <p className="hud p-6 text-faint">{t.common.loading}</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-muted">{c.none}</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-muted">{c.noMatch}</p>
        ) : (
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
        )}
      </div>
    </>
  );
}
