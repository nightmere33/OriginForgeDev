import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

/**
 * Static stand-in for SiteNav while it resolves the URL (dynamic routes):
 * same 48px bar, logo and primary door, so nothing shifts when it swaps.
 */
export default function NavFallback({ lang, t }: { lang: Locale; t: Dictionary["nav"] }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-steel-950/95 backdrop-blur-sm">
      <div className="flex h-12 items-stretch">
        <Link href={`/${lang}`} aria-label={t.home} className="flex w-12 shrink-0 items-center justify-center border-r border-line md:w-14">
          <span aria-hidden className="of-mark size-6" />
        </Link>
        <Link
          href={`/${lang}/start`}
          className="ml-auto hidden items-center bg-ember-500 px-5 font-mono text-hud font-bold uppercase tracking-[0.12em] text-on-ember md:flex"
        >
          {t.start}
        </Link>
      </div>
    </header>
  );
}
