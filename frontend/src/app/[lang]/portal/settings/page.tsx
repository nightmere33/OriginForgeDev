import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { SettingsPage } from "@/components/portal/settings";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the form loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <SectionShell id="settings" ruler={t.settings.title.join("")}>
      <SectionEyebrow index="·" label={t.settings.title.join("")} />
      <SectionHeading title={<Accented parts={t.settings.title} />} lead={t.settings.lead} />
      <Suspense fallback={null}>
        <SettingsPage lang={lang} t={{ settings: t.settings, start: t.start, portal: t.portal, common: t.common, nav: t.nav, onboarding: t.onboarding, auth: t.auth }} />
      </Suspense>
    </SectionShell>
  );
}
