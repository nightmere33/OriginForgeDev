import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { StudioSupport } from "@/components/studio/support-inbox";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const d = t.studio.dash;
  return (
    <SectionShell id="studio-support" ruler={d.tabs.support}>
      <SectionEyebrow index="·" label={d.tabs.support} />
      <SectionHeading title={<Accented parts={d.supportPage.title} />} lead={d.supportPage.lead} />
      <StudioTabs lang={lang} labels={d.tabs} active="support" />
      <Suspense fallback={null}>
        <StudioSupport lang={lang} t={{ portal: t.portal, studio: t.studio, start: t.start, auth: t.auth, common: t.common, project: t.project, trust: t.trust, support: t.support, assistant: t.assistant }} />
      </Suspense>
    </SectionShell>
  );
}
