import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { PortalRequest } from "@/components/portal/requests";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <SectionShell id="portal-request" ruler={t.portal.title.join("")}>
      <SectionEyebrow index="·" label={t.portal.title.join("")} />
      <SectionHeading title={<Accented parts={t.portal.title} />} />
      <Suspense fallback={null}>
        <PortalRequest lang={lang} t={{ portal: t.portal, studio: t.studio, start: t.start, auth: t.auth, common: t.common, project: t.project, trust: t.trust }} />
      </Suspense>
    </SectionShell>
  );
}
