import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fill, getDictionary, hasLocale } from "@/i18n/dictionaries";
import { getPlans, getPricing, getServices, getSite } from "@/lib/content";
import { Mail, MessageCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Hud } from "@/components/ui/hud";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import StartWizard from "@/components/start/start-wizard";
import { WaitlistForm } from "@/components/start/waitlist-form";

export async function generateMetadata({ params }: PageProps<"/[lang]/start">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.nav.start, description: t.start.lead, alternates: { canonical: `/${lang}/start` } };
}

export default async function StartPage({ params }: PageProps<"/[lang]/start">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [t, services, site, plans] = await Promise.all([getDictionary(lang), getServices(lang), getSite(lang), getPlans(lang)]);
  // Every service's calculator factors, so switching service is instant.
  const slugs = ["", ...services.map((x) => x.slug)];
  const pricing = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [slug, await getPricing(lang, slug)] as const)));
  const wa = site.whatsapp.replace(/[^\d]/g, "");

  return (
    <SectionShell id="start" ruler={t.nav.start}>
      <SectionEyebrow index="·" label={t.nav.start} annotation={t.services.annotation} />
      <SectionHeading title={<Accented parts={t.start.title} />} lead={t.start.lead} />
      {/* The wizard reads ?service= from the URL, so it renders on the client;
          the frame and heading above are static. */}
      {!site.is_available ? (
        // Capacity switch (admin → Site settings): requests paused, contact open.
        <div className="border-t border-line px-6 py-[var(--chapter)] md:px-10">
          <h2 className="text-h2 tracking-[-0.035em] text-ink-strong">
            <Accented parts={t.start.pausedTitle} />
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            {/* Paused by the project cap: say so. Paused by hand: Younes's own note. */}
            {site.at_capacity ? t.start.atCapacity : site.availability || t.start.pausedText}
          </p>
          {site.available_from && (
            <Hud tone="ember" dot className="mt-6">
              {fill(t.start.availableFrom, {
                date: new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(site.available_from)),
              })}
            </Hud>
          )}
          <div className="mt-10 border-t border-line pt-8">
            <h3 className="text-lg text-ink-strong">{t.start.waitlistTitle}</h3>
            <p className="mt-2 max-w-xl text-muted">{t.start.waitlistText}</p>
            <div className="mt-6"><WaitlistForm lang={lang} s={t.start} /></div>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            {site.email && (
              <ButtonLink href={`mailto:${site.email}`} variant="primary">
                <Mail aria-hidden className="size-3.5" />
                {t.start.contact}
              </ButtonLink>
            )}
            {wa && (
              <ButtonLink href={`https://wa.me/${wa}`} variant="secondary">
                <MessageCircle aria-hidden className="size-3.5" />
                WhatsApp
              </ButtonLink>
            )}
          </div>
        </div>
      ) : (
      <div className="border-t border-line">
        <Suspense fallback={<div className="min-h-[32rem]" />}>
          <StartWizard
            lang={lang}
            t={{ start: t.start, auth: t.auth, common: t.common, trust: t.trust }}
            services={services.map((x) => ({ slug: x.slug, title: x.title, summary: x.summary }))}
            plans={plans}
            pricing={pricing}
          />
        </Suspense>
      </div>
      )}
    </SectionShell>
  );
}
