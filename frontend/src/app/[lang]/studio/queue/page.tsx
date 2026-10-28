import type { Metadata } from "next";
import { Suspense } from "react";
import { lang as rootLang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import { Accented } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { QueueBoard } from "@/components/studio/queue-board";

export const metadata: Metadata = { robots: { index: false } };

// Per-user data: the frame is static, the content loads on the client.
export default async function Page() {
  const lang = await rootLang();
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  const d = t.studio.dash;
  return (
    <SectionShell id="studio-queue" ruler={d.tabs.queue}>
      <SectionEyebrow index="·" label={d.tabs.queue} />
      <SectionHeading title={<Accented parts={d.queuePage.title} />} lead={d.queuePage.lead} />
      <StudioTabs lang={lang} labels={d.tabs} active="queue" />
      <Suspense fallback={null}>
        <QueueBoard lang={lang} t={{ studio: t.studio, common: t.common, project: t.project }} />
      </Suspense>
    </SectionShell>
  );
}
