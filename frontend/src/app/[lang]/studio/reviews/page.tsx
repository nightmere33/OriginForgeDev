import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { ReviewModeration } from "@/components/reviews/moderation";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the queue loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const m = t.studio.reviews;
  return (
    <SectionShell id="studio-reviews" ruler={m.title}>
      <SectionEyebrow index="·" label={m.title} />
      <SectionHeading title={<Accented parts={m.heading} />} lead={m.lead} />
      <Suspense fallback={null}>
        <ReviewModeration lang={lang} t={{ studio: t.studio, common: t.common }} />
      </Suspense>
    </SectionShell>
  );
}
