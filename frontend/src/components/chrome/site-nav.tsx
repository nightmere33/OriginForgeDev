"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrencySwitcher } from "@/lib/currency";
import { ThemeToggle } from "@/lib/theme";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationBell } from "./notification-bell";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";
import { gsap } from "@/motion/gsap";
import { BEATS, atBeat, introClock } from "@/motion/intro";
import { BootText, GlitchLabel } from "@/motion/glitch";

type NavText = Dictionary["nav"];

export default function SiteNav({ lang, t }: { lang: Locale; t: NavText }) {
  const pathname = usePathname();
  const user = useSession();
  // The menu remembers the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);

  // Intro: the nav cells drop in on the nav beat. Runs after this component
  // hydrated; until then the pre-paint [data-intro-hide] rule keeps them hidden.
  useEffect(() => {
    if (introClock.done) return;
    const items = gsap.utils.toArray<HTMLElement>("#site-nav [data-nav-item]");
    return atBeat(BEATS.nav, () => {
      gsap.fromTo(items, { autoAlpha: 0, y: -6 }, {
        autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power2.out", clearProps: "all",
      });
    }, gsap.ticker);
  }, []);

  // Counts openings, so the labels decode afresh each time the menu opens.
  const [openings, setOpenings] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);
  const toggle = () => {
    if (!open) setOpenings((n) => n + 1);
    setOpen(!open);
  };

  const links = [
    { href: `/${lang}/work`, label: t.work, match: `/${lang}/work` },
    { href: `/${lang}#services`, label: t.services },
    { href: `/${lang}#process`, label: t.process },
    { href: `/${lang}#about`, label: t.about },
  ];
  const account = user ? { href: `/${lang}/${user.is_developer ? "studio" : "portal"}`, label: user.is_developer ? t.studio : t.portal } : { href: `/${lang}/login`, label: t.login };

  return (
    <header id="site-nav" className="sticky top-0 z-50 border-b border-line bg-steel-950/95 backdrop-blur-sm">
      <nav aria-label="Main" className="flex h-12 items-stretch">
        <Link
          href={`/${lang}`}
          aria-label={t.home}
          data-nav-item
          data-intro-hide
          className="flex w-12 shrink-0 items-center justify-center border-r border-line md:w-14"
        >
          <span aria-hidden className="of-mark size-6" />
        </Link>

        <ul className="hidden items-stretch md:flex">
          {links.map((link) => {
            const active = link.match ? pathname.startsWith(link.match) : false;
            return (
              <li key={link.href} data-nav-item data-intro-hide className="flex">
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "hud flex items-center px-3 transition-colors duration-[var(--dur-micro)] hover:text-ink lg:px-4",
                    active ? "text-ink" : "text-muted",
                  )}
                >
                  {active && <span aria-hidden className="mr-2 inline-block size-1.5 bg-ember-500" />}
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-stretch">
          <div data-nav-item data-intro-hide className="flex border-l border-line">
            <CurrencySwitcher label={t.currency} />
          </div>
          <div data-nav-item data-intro-hide className="flex border-l border-line">
            <LanguageSwitcher lang={lang} pathname={pathname} label={t.language} />
          </div>
          <div data-nav-item data-intro-hide className="flex border-l border-line">
            <ThemeToggle labels={{ light: t.themeLight, dark: t.themeDark }} />
          </div>
          {user && (
            <NotificationBell lang={lang} labels={{ notifications: t.notifications, markAllRead: t.markAllRead, noNotifications: t.noNotifications, open: t.openNotification }} />
          )}
          <Link
            href={account.href}
            data-nav-item
          data-intro-hide
            className="hud hidden items-center border-l border-line px-4 text-muted transition-colors duration-[var(--dur-micro)] hover:text-ink md:flex"
          >
            {user === undefined ? <span className="opacity-0">{t.login}</span> : account.label}
          </Link>
          <Link
            href={`/${lang}/start`}
            data-nav-item
          data-intro-hide
            className="hidden items-center gap-2 bg-ember-500 px-5 font-mono text-hud font-bold uppercase tracking-[0.12em] text-on-ember transition-colors duration-[var(--dur-micro)] hover:bg-ember-600 md:flex"
          >
            {t.start}
          </Link>
          <button
            type="button"
            data-nav-item
          data-intro-hide
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t.close : t.menu}
            onClick={toggle}
            className="flex w-12 items-center justify-center border-l border-line text-ink md:hidden"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </nav>

      {/* In flow inside the sticky header, as on getartcraft.com: it shares the
          header's opaque, blurred surface (a position: fixed overlay here is
          trapped by the header's backdrop-filter and collapses to zero height).
          Its height glides from 0 to its content (grid rows 0fr to 1fr), so the
          page below is pushed down smoothly rather than at once. */}
      <div
        id="mobile-menu"
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-[560ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:hidden",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
        <div
          ref={panel}
          data-lenis-prevent
          className={cn(
            "max-h-[calc(100svh-3rem)] overflow-y-auto overscroll-contain border-t border-line transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
        >
          <ul className="flex flex-col py-2">
            {links.map((link, i) => {
              const active = link.match ? pathname.startsWith(link.match) : false;
              return (
                <li
                  key={link.href}
                  // Rows settle one after another while the panel opens.
                  style={{ transitionDelay: open ? `${90 + i * 55}ms` : "0ms" }}
                  className={cn(
                    "transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
                  )}
                >
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="group/m flex items-center gap-3 px-4 py-3"
                  >
                    <span className="hud w-6 text-faint">{String(i + 1).padStart(2, "0")}</span>
                    {/* The inversion sits on the label, not the row. */}
                    <span
                      className={cn(
                        "hud px-1.5 py-0.5 transition-colors duration-[var(--dur-micro)]",
                        active ? "bg-steel-50 text-steel-950" : "text-muted group-active/m:bg-steel-50 group-active/m:text-steel-950",
                      )}
                    >
                      {open ? <BootText key={openings} text={link.label} delay={120 + i * 55} /> : link.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href={`/${lang}/start`}
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center justify-center gap-2 border-t border-line bg-ember-500 font-mono text-hud font-bold uppercase tracking-[0.12em] text-on-ember active:bg-ember-600"
          >
            <GlitchLabel text={t.start} />
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
          <div className="flex items-stretch border-t border-line">
            {(user
              ? [account, { href: `/${lang}/portal/settings`, label: t.settings }]
              : [account, { href: `/${lang}/register`, label: t.register }]
            ).map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "hud flex h-11 flex-1 items-center justify-center text-muted active:bg-steel-50 active:text-steel-950",
                  i === 0 && "border-r border-line",
                )}
              >
                <GlitchLabel text={item.label} />
              </Link>
            ))}
          </div>
        </div>
        </div>
      </div>
    </header>
  );
}
