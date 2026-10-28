import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { ReviewInvitePage } from "@/components/reviews/invite";

export const metadata: Metadata = { robots: { index: false } };

// A personal invitation: the frame is static, the invitation loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const i = t.reviews.invite;
  return (
    <SectionShell id="review-invite" ruler={i.label}>
      <SectionEyebrow index="·" label={i.label} />
      <SectionHeading title={<Accented parts={i.heading} />} lead={i.lead} />
      <Suspense fallback={null}>
        <ReviewInvitePage lang={lang} t={{ project: t.project, auth: t.auth, start: t.start, common: t.common, reviews: t.reviews }} />
      </Suspense>
    </SectionShell>
  );
}
