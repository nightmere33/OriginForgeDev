"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { clearNotifications, markNotificationsRead, useNotifications, type AppNotification } from "@/lib/live";
import { DecodeText, tearIn, useDismiss } from "@/motion/glitch";
import { ScrollArea } from "@/components/ui/scroll-area";

type Labels = {
  notifications: string; markAllRead: string; noNotifications: string; open: string;
  clearAll: string; clearConfirm: string; clearYes: string; clearKeep: string; dismiss: string;
};

// How long a cleared row takes to fold away before it leaves the list.
const LEAVE_MS = 260;

function ago(lang: Locale, iso: string | null) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (s < 60) return rtf.format(-Math.round(s), "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

/**
 * Nav bell for signed-in visitors: the unread count, a panel that glitches
 * in, and a toast the moment something arrives (live over the socket).
 * Notifications can be dismissed one by one or cleared together (asked
 * once, inline); cleared rows fold away instead of vanishing. The list
 * scrolls in a ScrollArea with the site's own bar.
 * On phones the panel is a full-width sheet under the nav (the bell isn't at
 * the screen edge, so a dropdown anchored to it would spill off the side);
 * from `sm` it drops from the bell.
 */
export function NotificationBell({ lang, labels }: { lang: Locale; labels: Labels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState<Set<number>>(() => new Set());
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const go = (n: AppNotification) => {
    if (!n.read) markNotificationsRead([n.id]);
    setOpen(false);
    if (n.path) router.push(`/${lang}${n.path}`);
  };
  const { items, unread, loaded } = useNotifications((n) => {
    toast(n.title, {
      description: n.body || undefined,
      action: n.path ? { label: labels.open, onClick: () => go(n) } : undefined,
    });
  });
  useDismiss(open, root, setOpen);
  useEffect(() => {
    if (open) tearIn(panel.current);
  }, [open]);

  // Fold the rows away, then clear them on the server.
  const clear = (ids?: number[]) => {
    const going = ids ?? items.map((n) => n.id);
    setLeaving((s) => new Set([...s, ...going]));
    setAsking(false);
    window.setTimeout(() => {
      clearNotifications(ids).finally(() => setLeaving((s) => new Set([...s].filter((id) => !going.includes(id)))));
    }, LEAVE_MS);
  };

  if (!loaded) return null;
  const allLeaving = items.length > 0 && items.every((n) => leaving.has(n.id));
  // Static on phones, so the sheet is placed against the sticky header.
  return (
    <div ref={root} className="flex border-l border-line sm:relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `${labels.notifications} (${unread})` : labels.notifications}
        onClick={() => {
          setOpen(!open);
          setAsking(false);
        }}
        className="relative flex w-12 items-center justify-center text-muted transition-colors duration-[var(--dur-micro)] hover:text-ink"
      >
        <Bell aria-hidden className="size-4" />
        {unread > 0 && (
          <span className="hud absolute right-1.5 top-2 min-w-4 bg-ember-500 px-1 text-center leading-4 text-on-ember">
            <DecodeText text={unread > 9 ? "9+" : String(unread)} />
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={labels.notifications}
          className="absolute inset-x-0 top-full z-50 border-b border-line bg-raised shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)] sm:left-auto sm:w-96 sm:border"
        >
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <span className="hud text-ink">{labels.notifications}</span>
            {asking ? (
              <span className="flex items-center gap-3">
                <span className="hud text-faint">{labels.clearConfirm}</span>
                <button type="button" onClick={() => clear()} className="hud text-err hover:underline">{labels.clearYes}</button>
                <button type="button" onClick={() => setAsking(false)} className="hud text-muted hover:text-ink">{labels.clearKeep}</button>
              </span>
            ) : (
              <span className="flex items-center gap-4">
                {unread > 0 && (
                  <button type="button" onClick={() => markNotificationsRead()} className="hud text-muted transition-colors hover:text-ember-400">
                    {labels.markAllRead}
                  </button>
                )}
                {items.length > 0 && !allLeaving && (
                  <button type="button" onClick={() => setAsking(true)} className="hud text-muted transition-colors hover:text-err">
                    {labels.clearAll}
                  </button>
                )}
              </span>
            )}
          </div>
          {items.length === 0 || allLeaving ? (
            <p className="px-4 py-6 text-sm text-muted [animation:step-in_var(--dur-standard)_var(--ease-out)]">{labels.noNotifications}</p>
          ) : (
            <ScrollArea viewportClassName="max-h-[min(60vh,26rem)]">
              <ul>
                {items.map((n) => {
                  const out = leaving.has(n.id);
                  return (
                    // Folds to nothing (grid rows 1fr → 0fr) while it fades and slides out.
                    <li key={n.id}
                      className={cn(
                        "group/note grid border-b border-line transition-[grid-template-rows,opacity,transform] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] last:border-b-0",
                        out ? "grid-rows-[0fr] translate-x-6 opacity-0" : "grid-rows-[1fr]",
                      )}>
                      <div className="relative min-h-0 overflow-hidden">
                        <button type="button" onClick={() => go(n)} tabIndex={out ? -1 : 0}
                          className="flex w-full gap-3 py-2.5 pl-4 pr-10 text-left transition-colors duration-[var(--dur-micro)] hover:bg-cell sm:py-3">
                          <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0", n.read ? "bg-transparent" : "bg-ember-500")} />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {/* Title and time share a line; phones keep the title to one. */}
                            <span className="flex items-baseline justify-between gap-3">
                              <span className={cn("truncate text-sm sm:whitespace-normal", n.read ? "text-muted" : "text-ink-strong")}>{n.title}</span>
                              <span className="hud shrink-0 text-faint">{ago(lang, n.created_at)}</span>
                            </span>
                            {n.body && <span className="line-clamp-1 text-[13px] leading-snug text-faint sm:line-clamp-2 sm:text-sm">{n.body}</span>}
                          </span>
                        </button>
                        <button type="button" onClick={() => clear([n.id])} aria-label={`${labels.dismiss}: ${n.title}`} tabIndex={out ? -1 : 0}
                          className="absolute right-1 top-1.5 flex size-8 items-center justify-center text-faint transition-[opacity,color] duration-[var(--dur-micro)] hover:text-err focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/note:opacity-100">
                          <X aria-hidden className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
