import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioInbox } from "@/components/portal/requests";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <SectionShell id="studio" ruler={t.studio.title.join("")}>
      <SectionEyebrow index="·" label={t.studio.title.join("")} />
      <SectionHeading title={<Accented parts={t.studio.title} />} lead={t.studio.lead} />
      <Suspense fallback={null}>
        <StudioInbox lang={lang} t={{ portal: t.portal, studio: t.studio, start: t.start, auth: t.auth, common: t.common, project: t.project, trust: t.trust }} />
      </Suspense>
    </SectionShell>
  );
}
