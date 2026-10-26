"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { markNotificationsRead, useNotifications, type AppNotification } from "@/lib/live";
import { DecodeText, tearIn, useDismiss } from "@/motion/glitch";

type Labels = { notifications: string; markAllRead: string; noNotifications: string; open: string };

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
 */
export function NotificationBell({ lang, labels }: { lang: Locale; labels: Labels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  if (!loaded) return null;
  return (
    <div ref={root} className="relative flex border-l border-line">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `${labels.notifications} (${unread})` : labels.notifications}
        onClick={() => setOpen(!open)}
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
          className="absolute right-0 top-full z-50 w-[min(24rem,calc(100vw-2rem))] border border-line bg-raised shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="hud text-ink">{labels.notifications}</span>
            {unread > 0 && (
              <button type="button" onClick={() => markNotificationsRead()} className="hud text-muted hover:text-ember-400">
                {labels.markAllRead}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{labels.noNotifications}</p>
          ) : (
            <ul data-lenis-prevent className="max-h-[60vh] divide-y divide-line overflow-y-auto overscroll-contain">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-cell">
                    <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0", n.read ? "bg-transparent" : "bg-ember-500")} />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className={cn("text-sm", n.read ? "text-muted" : "text-ink-strong")}>{n.title}</span>
                      {n.body && <span className="line-clamp-2 text-sm text-faint">{n.body}</span>}
                      <span className="hud text-faint">{ago(lang, n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
