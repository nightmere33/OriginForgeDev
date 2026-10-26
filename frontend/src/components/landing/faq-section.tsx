import type { Dictionary } from "@/i18n/dictionaries";
import type { FAQ } from "@/lib/types";
import { Accented } from "@/components/ui/hud";
import { Accordion } from "@/components/ui/accordion";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";

export default function FaqSection({ t, faqs, index }: { t: Dictionary; faqs: FAQ[]; index?: string }) {
  if (!faqs.length) return null;
  return (
    <SectionShell id="faq" ruler={t.faq.label}>
      <SectionEyebrow index={index ?? t.faq.index} label={t.faq.label} annotation={t.faq.annotation} />
      <SectionHeading title={<Accented parts={t.faq.title} />} />
      <Accordion items={faqs} />
    </SectionShell>
  );
}
