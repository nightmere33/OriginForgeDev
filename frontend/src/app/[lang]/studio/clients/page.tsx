import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { StudioClients } from "@/components/studio/clients";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const d = t.studio.dash;
  return (
    <SectionShell id="studio-clients" ruler={d.tabs.clients}>
      <SectionEyebrow index="·" label={d.tabs.clients} />
      <SectionHeading title={<Accented parts={d.clientsPage.title} />} lead={d.clientsPage.lead} />
      <StudioTabs lang={lang} labels={d.tabs} active="clients" />
      <Suspense fallback={null}>
        <StudioClients lang={lang} t={{ studio: t.studio, common: t.common }} />
      </Suspense>
    </SectionShell>
  );
}
