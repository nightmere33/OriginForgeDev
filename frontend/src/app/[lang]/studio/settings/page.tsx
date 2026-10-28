import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { StudioSettings } from "@/components/studio/settings";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const d = t.studio.dash;
  return (
    <SectionShell id="studio-settings" ruler={d.tabs.settings}>
      <SectionEyebrow index="·" label={d.tabs.settings} />
      <SectionHeading title={<Accented parts={d.settingsPage.title} />} lead={d.settingsPage.lead} />
      <StudioTabs lang={lang} labels={d.tabs} active="settings" />
      <Suspense fallback={null}>
        <StudioSettings lang={lang} t={{ studio: t.studio, common: t.common }} />
      </Suspense>
    </SectionShell>
  );
}
