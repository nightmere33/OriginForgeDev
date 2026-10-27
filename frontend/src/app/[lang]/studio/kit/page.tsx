import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { StudioKit } from "@/components/studio/kit";

export const metadata: Metadata = { robots: { index: false } };

// The asset pack: live building blocks, for the developer only.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const d = t.studio.dash;
  return (
    <SectionShell id="studio-kit" ruler={d.tabs.kit}>
      <SectionEyebrow index="·" label={d.tabs.kit} />
      <SectionHeading title={<Accented parts={d.kitPage.title} />} lead={d.kitPage.lead} />
      <StudioTabs lang={lang} labels={d.tabs} active="kit" />
      <Suspense fallback={null}>
        <StudioKit lang={lang} />
      </Suspense>
    </SectionShell>
  );
}
