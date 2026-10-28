"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize2, MessageCircle, Minimize2, X } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { day, type ProjectRequest } from "@/lib/lifecycle";
import { useLiveRefresh } from "@/lib/live";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";
import { Conversation } from "@/components/project/conversation";
import type { T } from "@/components/project/shared";

const PROJECT = /^\/(?:en|fr)\/(portal|studio)\/requests\/([^/?#]+)/;
const AREA = /^\/(?:en|fr)\/(portal|studio)(?:\/|$)/;

/**
 * The conversation, anywhere in the client space and the studio: a launcher
 * at the bottom right with the unread count, a compact window that grows to
 * the full window, the list of conversations when no project is open. On a
 * project page it opens that project's thread; on its Messages tab it steps
 * aside (the thread is already on the page).
 */
export function ChatDock({ lang, t }: { lang: Locale; t: T }) {
  const user = useSession();
  const pathname = usePathname();
  const params = useSearchParams();
  const area = AREA.exec(pathname)?.[1];
  const onPage = PROJECT.exec(pathname)?.[2] ?? null;
  const side = user?.is_developer ? "studio" : "client";
  const [items, setItems] = useState<ProjectRequest[] | null>(null);
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  // Picked from the list; a project page always shows its own thread.
  const [picked, setPicked] = useState<string | null>(null);
  const active = onPage ?? picked;
  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const c = t.project.chat;
  const enabled = !!user && !!area && (area === "studio") === !!user.is_developer;

  const fetchList = useCallback(() => {
    if (!enabled) return;
    api.get<{ results: ProjectRequest[] }>("/requests/").then((r) => setItems(r.results.filter((x) => x.status !== "draft")), () => undefined);
  }, [enabled]);
  useEffect(() => fetchList(), [fetchList]);
  useLiveRefresh(fetchList, undefined, { messages: true });

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      setOpen(false);
      launcher.current?.focus();
    };
    document.addEventListener("keydown", esc);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (!enabled) return null;
  if (onPage && params.get("tab") === "messages") return null;

  const unread = (items ?? []).reduce((n, r) => n + (r.summary?.unread ?? 0), 0);
  const current = items?.find((r) => r.reference === active);
  const sorted = [...(items ?? [])].sort((a, b) => (b.summary?.unread ?? 0) - (a.summary?.unread ?? 0) || b.updated_at.localeCompare(a.updated_at));

  return (
    <>
      {open && wide && (
        // Full window: the page dims behind it; a click outside brings the compact window back.
        <div aria-hidden onClick={() => setWide(false)} className="fixed inset-0 z-[54] hidden bg-bg/70 backdrop-blur-sm [animation:step-in_var(--dur-standard)_var(--ease-out)] sm:block" />
      )}
      {open && (
        <div ref={panel} tabIndex={-1} role="dialog" aria-modal="false" aria-label={current?.title ?? c.conversations}
          className={cn(
            "fixed z-[55] flex flex-col border border-line-strong bg-bg shadow-[0_32px_80px_-32px_rgb(0_0_0/0.85)] outline-none",
            "origin-bottom-right [animation:dock-in_var(--dur-standard)_var(--ease-out)]",
            "inset-0 sm:inset-auto",
            wide ? "sm:inset-4 md:inset-8 xl:left-1/2 xl:w-[72rem] xl:-translate-x-1/2" : "sm:bottom-24 sm:right-5 sm:h-[min(38rem,calc(100dvh-10rem))] sm:w-[25rem]",
          )}>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2">
            {active && !onPage ? (
              <button type="button" onClick={() => setPicked(null)} aria-label={c.conversations}
                className="flex size-10 items-center justify-center text-muted hover:text-ink"><ArrowLeft aria-hidden className="size-4" /></button>
            ) : <span className="w-2" />}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-ink-strong">{current ? current.title : c.conversations}</span>
              {current && <span className="hud truncate text-faint">{current.reference}{side === "studio" && current.client ? ` · ${current.client.full_name}` : ""}</span>}
            </span>
            <button type="button" onClick={() => setWide((w) => !w)} aria-label={wide ? c.collapse : c.expand} title={wide ? c.collapse : c.expand}
              className="hidden size-10 items-center justify-center text-muted hover:text-ink sm:flex">
              {wide ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
            </button>
            <button type="button" onClick={() => {
              setOpen(false);
              launcher.current?.focus();
            }} aria-label={c.close} className="flex size-10 items-center justify-center text-muted hover:text-ink">
              <X aria-hidden className="size-4" />
            </button>
          </header>
          {active ? (
            <Conversation key={active} lang={lang} t={t} side={side} reference={active} enabled variant="dock" />
          ) : (
            <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]">
              {items === null ? (
                <p className="hud p-6 text-faint">{t.common.loading}</p>
              ) : sorted.length === 0 ? (
                <p className="p-6 text-sm text-muted">{c.none}</p>
              ) : (
                <>
                  <p className="px-4 pb-2 pt-4 text-sm text-faint">{c.pick}</p>
                  <ul className="divide-y divide-line border-t border-line">
                    {sorted.map((r) => (
                      <li key={r.reference}>
                        <button type="button" onClick={() => setPicked(r.reference)}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cell focus-visible:bg-cell focus-visible:outline-none">
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className={cn("truncate text-sm", r.summary?.unread ? "text-ink-strong" : "text-ink")}>{r.title || r.reference}</span>
                            <span className="hud truncate text-faint">
                              {r.reference}{side === "studio" && r.client ? ` · ${r.client.full_name}` : ""} · {day(lang, r.updated_at, false)}
                            </span>
                          </span>
                          {r.summary?.unread ? (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1.5 text-[0.65rem] tabular-nums text-on-ember">{r.summary.unread}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <button ref={launcher} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={unread ? `${c.open} · ${fill(t.portal.cards.unread, { n: unread })}` : c.open}
        className={cn(
          "fixed bottom-5 right-5 z-[45] flex size-14 items-center justify-center border transition-[background-color,border-color,transform] duration-[var(--dur-micro)] active:translate-y-px",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400",
          open ? "border-line-strong bg-raised text-ink max-sm:hidden" : "border-transparent bg-steel-50 text-steel-950 shadow-[0_18px_48px_-20px_rgb(0_0_0/0.7)] hover:bg-steel-200",
        )}>
        {open ? <X aria-hidden className="size-5" /> : <MessageCircle aria-hidden className="size-5" />}
        {!open && unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center bg-ember-500 px-1 text-[0.65rem] tabular-nums text-on-ember"
            style={{ animation: "live-pulse 2.4s ease-in-out infinite" }}>{unread}</span>
        )}
      </button>
    </>
  );
}
