import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { StudioOverview } from "@/components/studio/overview";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const d = t.studio.dash;
  return (
    <SectionShell id="studio" ruler={d.tabs.overview}>
      <SectionEyebrow index="·" label={d.tabs.overview} />
      <SectionHeading title={<Accented parts={d.overview.title} />} lead={d.overview.lead} />
      <StudioTabs lang={lang} labels={d.tabs} active="overview" />
      <Suspense fallback={null}>
        <StudioOverview lang={lang} t={{ studio: t.studio, portal: t.portal, project: t.project, common: t.common, start: t.start }} />
      </Suspense>
    </SectionShell>
  );
}
