import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { getPlans, getPricing, getServices } from "@/lib/content";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import StartWizard from "@/components/start/start-wizard";

export async function generateMetadata({ params }: PageProps<"/[lang]/start">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.nav.start, description: t.start.lead, alternates: { canonical: `/${lang}/start` } };
}

export default async function StartPage({ params }: PageProps<"/[lang]/start">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [t, services, plans] = await Promise.all([getDictionary(lang), getServices(lang), getPlans(lang)]);
  // Every service's calculator factors, so switching service is instant.
  const slugs = ["", ...services.map((x) => x.slug)];
  const pricing = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [slug, await getPricing(lang, slug)] as const)));

  return (
    <SectionShell id="start" ruler={t.nav.start}>
      <SectionEyebrow index="·" label={t.nav.start} annotation={t.services.annotation} />
      <SectionHeading title={<Accented parts={t.start.title} />} lead={t.start.lead} />
      {/* The wizard reads ?service= from the URL, so it renders on the client;
          the frame and heading above are static. Requests are never turned
          away: when the studio is full they join the queue (the wizard says so). */}
      <div className="border-t border-line">
        <Suspense fallback={<div className="min-h-[32rem]" />}>
          <StartWizard
            lang={lang}
            t={{ start: t.start, auth: t.auth, common: t.common, trust: t.trust, phoneInput: t.phoneInput }}
            services={services.map((x) => ({ slug: x.slug, title: x.title, summary: x.summary }))}
            plans={plans}
            pricing={pricing}
          />
        </Suspense>
      </div>
    </SectionShell>
  );
}
