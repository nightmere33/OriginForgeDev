import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { getCredentials, getFaqs, getGalaxy, getReviews, getServices, getSite, getTech, getWork } from "@/lib/content";
import Hero from "@/components/landing/hero";
import Marquee from "@/components/ui/marquee";
import WorkSection from "@/components/landing/work-section";
import ServicesSection from "@/components/landing/services-section";
import ProcessSection from "@/components/landing/process-section";
import ShowreelSection from "@/components/landing/showreel-section";
import AboutSection from "@/components/landing/about-section";
import FaqSection from "@/components/landing/faq-section";
import ReviewsSection from "@/components/landing/reviews-section";
import FinalCta from "@/components/landing/final-cta";
import RevealManager from "@/motion/reveal-manager";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Home, ordered by the visitor's decision path (DESIGN.md §0):
 * hook (hero) → prove (work) → explain (services, process) → feel (showreel)
 * → trust (about, reviews, FAQ) → convert (final CTA).
 */
export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const [t, site, galaxy, work, services, tech, credentials, faqs, reviews] = await Promise.all([
    getDictionary(lang), getSite(lang), getGalaxy(), getWork(lang), getServices(lang),
    getTech(), getCredentials(), getFaqs(lang), getReviews(),
  ]);
  const rated = reviews.summary.count > 0 && reviews.items.length > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        "@id": `${SITE_URL}/#studio`,
        name: "OriginForge",
        url: `${SITE_URL}/${lang}`,
        description: t.meta.description,
        founder: { "@id": `${SITE_URL}/#younes` },
        areaServed: "Worldwide",
        address: { "@type": "PostalAddress", addressLocality: "Dellys", addressCountry: "DZ" },
        ...(site.email ? { email: site.email } : {}),
        // Only real, verified, approved reviews: never a made-up rating.
        ...(rated && reviews.summary.average
          ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.summary.average, reviewCount: reviews.summary.count, bestRating: 5, worstRating: 1 } }
          : {}),
      },
      {
        "@type": "Person",
        "@id": `${SITE_URL}/#younes`,
        name: "Younes Ouali",
        jobTitle: "Full-stack developer",
        worksFor: { "@id": `${SITE_URL}/#studio` },
        alumniOf: "Université Mouloud Mammeri de Tizi-Ouzou",
        sameAs: [site.github_url, site.linkedin_url, site.instagram_url].filter(Boolean),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Hero lang={lang} t={t} galaxy={galaxy} site={site} />
      <Marquee items={t.ticker} />
      <WorkSection lang={lang} t={t} work={work} galaxy={galaxy} />
      <ServicesSection lang={lang} t={t} services={services} />
      <ProcessSection t={t} howto={site.films?.howto} />
      {site.films?.showreel?.poster && <ShowreelSection t={t} reel={{ ...site.films.showreel, poster: site.films.showreel.poster }} />}
      <AboutSection lang={lang} t={t} site={site} tech={tech} credentials={credentials} />
      <ReviewsSection lang={lang} t={t} summary={reviews.summary} items={reviews.items} index={t.reviews.index} />
      <FaqSection t={t} faqs={faqs} index={rated ? "07" : t.faq.index} />
      <FinalCta lang={lang} t={t} site={site} clip={galaxy.find((g) => g.file.includes("/of-ignite-web.")) ?? galaxy[0]} />
      <RevealManager />
    </>
  );
}
