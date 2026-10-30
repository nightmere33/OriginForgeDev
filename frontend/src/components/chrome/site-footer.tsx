import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { cacheLife } from "next/cache";
import { getSite } from "@/lib/content";
import { BrandIcon, type Brand } from "@/components/ui/brand-icon";
import { CopyHandle } from "@/components/ui/copy-handle";
import { SecurePayments } from "@/components/ui/secure-payments";
import { AccountLink } from "./account-link";
import { LEGAL_LABELS, LEGAL_PAGES } from "@/i18n/legal";

export default async function SiteFooter({ lang, t }: { lang: Locale; t: Dictionary }) {
  const site = await getSite(lang);
  const whatsapp = site.whatsapp.replace(/[^\d]/g, "");
  const links: { label: string; href: string; icon: Brand }[] = [
    { label: "WhatsApp", href: whatsapp && `https://wa.me/${whatsapp}`, icon: "whatsapp" },
    { label: "Instagram", href: site.instagram_url, icon: "instagram" },
    { label: "LinkedIn", href: site.linkedin_url, icon: "linkedin" },
    { label: "GitHub", href: site.github_url, icon: "github" },
    { label: "X", href: site.x_url, icon: "x" },
    { label: "Upwork", href: site.upwork_url, icon: "upwork" },
  ];
  const social = links.filter((s) => s.href);
  const pages = [
    { label: t.nav.work, href: `/${lang}/work` },
    { label: t.nav.services, href: `/${lang}#services` },
    { label: t.nav.process, href: `/${lang}#process` },
    { label: t.nav.start, href: `/${lang}/start` },
  ];

  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto grid max-w-[1280px] gap-px border-x border-line bg-line md:grid-cols-[2fr_1fr_1fr]">
        <div className="bg-bg px-6 py-10 md:px-10">
          <span aria-hidden className="of-mark block size-10" />
          <p className="mt-6 font-display text-h3 text-ink-strong [font-stretch:125%]">{t.footer.tagline}</p>
          {site.email && (
            <a href={`mailto:${site.email}`} className="mt-3 inline-block text-muted underline-offset-4 transition-colors hover:text-ember-400 hover:underline">
              {site.email}
            </a>
          )}
        </div>
        <nav aria-label={t.footer.pages} className="bg-bg px-6 py-10 md:px-8">
          <p className="hud text-faint">{t.footer.pages}</p>
          <ul className="mt-4 space-y-2">
            {pages.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="text-muted transition-colors hover:text-ink">
                  {p.label}
                </Link>
              </li>
            ))}
            <li>
              <AccountLink lang={lang} labels={{ login: t.nav.login, studio: t.nav.studio, portal: t.nav.portal }}
                className="text-muted transition-colors hover:text-ink" />
            </li>
          </ul>
        </nav>
        <div className="bg-bg px-6 py-10 md:px-8">
          <p className="hud text-faint">{t.footer.social}</p>
          <ul className="mt-4 space-y-2">
            {social.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 text-muted transition-colors hover:text-ink">
                  <BrandIcon name={s.icon} />
                  {s.label}
                </a>
              </li>
            ))}
            {site.discord_username && (
              <li>
                <CopyHandle look="link" value={site.discord_username} label={`Discord · ${site.discord_username}`} copiedLabel={t.footer.copied}
                  icon={<BrandIcon name="discord" />} />
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto max-w-[1280px] border-x border-line px-6 py-6 md:px-10">
          <SecurePayments labels={t.trust} />
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 border-x border-line px-6 py-4 md:px-10">
          <p className="hud text-faint">
            © <Year /> OriginForge · Younes Ouali. {t.footer.rights}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_PAGES.map((p) => (
              <Link key={p} href={`/${lang}/legal/${p}`} className="hud text-faint hover:text-ink">
                {LEGAL_LABELS[lang][p]}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// Cached so the prerender never reads the clock directly (Cache Components).
async function Year() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}
