import { AtSign, Download, Mail, MessageCircle, MessagesSquare } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { Credential, SiteSettings, Tech } from "@/lib/types";
import { Hud } from "@/components/ui/hud";
import { ButtonLink } from "@/components/ui/button";
import { CopyHandle } from "@/components/ui/copy-handle";
import { SectionEyebrow, SectionShell } from "@/components/ui/section-shell";
import ScrubText from "./scrub-text";

/**
 * 05 / About: the scrubbed statement, then a gapless 2×2 of proof —
 * education, certificates, daily stack, and how to reach Younes.
 */
export default function AboutSection({
  lang, t, site, tech, credentials,
}: {
  lang: Locale;
  t: Dictionary;
  site: SiteSettings;
  tech: Tech[];
  credentials: Credential[];
}) {
  const stack = groupBy(tech, (x) => x.category);
  const whatsapp = site.whatsapp.replace(/[^\d]/g, "");

  return (
    <SectionShell id="about" ruler={t.about.label}>
      <SectionEyebrow index={t.about.index} label={t.about.label} annotation={site.location || t.about.annotation} />

      <div className="px-6 pb-[var(--chapter)] pt-[var(--chapter)] md:px-10">
        <ScrubText
          text={t.about.statement}
          className="max-w-5xl font-display text-h2 leading-[1.08] tracking-[-0.035em] text-ink-strong [font-stretch:125%] [font-weight:620]"
        />
        {site.about.length > 0 && (
          <div className="mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
            {site.about.map((para, i) => (
              <p key={i} data-reveal className="leading-relaxed text-muted">
                {para}
              </p>
            ))}
          </div>
        )}
      </div>

      <div data-reveal-group className="grid grid-flow-dense gap-px border-t border-line bg-line md:grid-cols-2">
        <div data-reveal="contents" className="bg-bg p-6 md:p-8">
          <Hud tone="faint">{t.about.education}</Hud>
          <p className="mt-4 text-h3 leading-snug tracking-[-0.02em] text-ink-strong [font-family:var(--font-display)] [font-stretch:125%] [font-weight:620]">
            {t.about.educationTitle}
          </p>
          <p className="mt-2 text-muted">{t.about.educationSchool}</p>
        </div>

        <div data-reveal="contents" className="bg-bg p-6 md:row-span-2 md:p-8">
          <Hud tone="faint">{t.about.credentials}</Hud>
          <ul className="mt-4 divide-y divide-line">
            {credentials.map((c) => (
              <li key={`${c.title}-${c.issuer}`} className="flex items-baseline justify-between gap-4 py-3">
                <span className="text-ink">{c.title}</span>
                <span className="hud shrink-0 text-right text-faint">
                  {c.issuer}
                  {c.issued_on ? ` · ${c.issued_on.slice(0, 4)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div data-reveal="contents" className="bg-bg p-6 md:p-8">
          <Hud tone="faint">{t.about.stack}</Hud>
          <dl className="mt-4 space-y-3">
            {Object.entries(stack).map(([category, items]) => (
              <div key={category} className="grid grid-cols-[7.5rem_1fr] gap-4">
                <dt className="hud pt-0.5 text-faint">{category}</dt>
                <dd className="text-sm leading-relaxed text-muted">{items.map((x) => x.name).join(" · ")}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div data-reveal="contents" className="flex flex-wrap items-center gap-3 bg-bg p-6 md:col-span-2 md:p-8">
          <Hud tone="faint" className="mr-auto">{t.about.contact}</Hud>
          {site.email && (
            <ButtonLink href={`mailto:${site.email}`} variant="secondary" size="sm">
              <Mail aria-hidden className="size-3.5" />
              {site.email}
            </ButtonLink>
          )}
          {whatsapp && (
            <ButtonLink href={`https://wa.me/${whatsapp}`} variant="secondary" size="sm">
              <MessageCircle aria-hidden className="size-3.5" />
              WhatsApp
            </ButtonLink>
          )}
          {site.instagram_url && (
            <ButtonLink href={site.instagram_url} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">
              <AtSign aria-hidden className="size-3.5" />
              Instagram
            </ButtonLink>
          )}
          {site.discord_username && (
            <CopyHandle value={site.discord_username} label={`Discord · ${site.discord_username}`} copiedLabel={t.footer.copied}
              icon={<MessagesSquare aria-hidden className="size-3.5" />} />
          )}
          <ButtonLink href={`/${lang}/cv`} variant="primary" size="sm">
            <Download aria-hidden className="size-3.5" />
            {t.about.cv}
          </ButtonLink>
        </div>
      </div>
    </SectionShell>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  language: "Languages",
  web: "Web",
  mobile: "Mobile",
  data: "Data",
  automation: "Automation",
  motion: "Motion & 3D",
  infra: "Infra",
  embedded: "Networks",
};

function groupBy<T>(items: T[], key: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) (out[CATEGORY_LABELS[key(item)] ?? key(item)] ??= []).push(item);
  return out;
}
