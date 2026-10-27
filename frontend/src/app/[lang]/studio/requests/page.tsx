import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { StudioInbox } from "@/components/portal/requests";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const d = t.studio.dash;
  return (
    <SectionShell id="studio-requests" ruler={d.tabs.requests}>
      <SectionEyebrow index="·" label={d.tabs.requests} />
      <SectionHeading title={<Accented parts={d.requestsPage.title} />} lead={d.requestsPage.lead} />
      <StudioTabs lang={lang} labels={d.tabs} active="requests" />
      <Suspense fallback={null}>
        <StudioInbox lang={lang} t={{ portal: t.portal, studio: t.studio, start: t.start, auth: t.auth, common: t.common, project: t.project, trust: t.trust }} />
      </Suspense>
    </SectionShell>
  );
}
