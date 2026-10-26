"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrencySwitcher } from "@/lib/currency";
import { ThemeToggle } from "@/lib/theme";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationBell } from "./notification-bell";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";
import { gsap } from "@/motion/gsap";
import { BEATS, atBeat, introClock } from "@/motion/intro";

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

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

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
            onClick={() => setOpen(!open)}
            className="flex w-12 items-center justify-center border-l border-line text-ink md:hidden"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-12 z-50 flex flex-col bg-steel-950 md:hidden">
          <ul className="divide-y divide-line border-b border-line">
            {links.map((link, i) => (
              <li key={link.href}>
                <Link href={link.href} className="flex items-baseline gap-4 px-6 py-5 font-display text-h3 text-ink-strong [font-stretch:125%]">
                  <span className="hud text-faint">{String(i + 1).padStart(2, "0")}</span>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={account.href} className="hud flex px-6 py-5 text-muted">
                {account.label}
              </Link>
            </li>
          </ul>
          <div className="mt-auto flex flex-col gap-4 p-6">
            <ThemeToggle labels={{ light: t.themeLight, dark: t.themeDark }} className="h-12 w-full border border-line" />
            <Link
              href={`/${lang}/start`}
              className="flex h-12 w-full items-center justify-center bg-ember-500 font-mono text-hud font-bold uppercase tracking-[0.12em] text-on-ember"
            >
              {t.start}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
