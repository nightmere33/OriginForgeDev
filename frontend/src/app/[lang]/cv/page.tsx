import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { hasLocale } from "@/i18n/dictionaries";
import { getCredentials, getSite, getTech, getWork } from "@/lib/content";
import { getCv } from "@/content/cv";
import { ButtonLink } from "@/components/ui/button";
import PrintButton from "@/components/cv/print-button";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({ params }: PageProps<"/[lang]/cv">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  return { title: "CV · Younes Ouali", description: getCv(lang).title, alternates: { canonical: `/${lang}/cv` } };
}

const TECH_GROUPS: Record<string, { en: string; fr: string }> = {
  language: { en: "Languages", fr: "Langages" },
  web: { en: "Web", fr: "Web" },
  mobile: { en: "Mobile", fr: "Mobile" },
  data: { en: "Data & backend", fr: "Données & backend" },
  automation: { en: "Automation", fr: "Automatisation" },
  motion: { en: "Motion & 3D", fr: "Motion & 3D" },
  infra: { en: "Infrastructure", fr: "Infrastructure" },
  embedded: { en: "Networks & embedded", fr: "Réseaux & embarqué" },
};

/**
 * The CV: one A4 sheet (DESIGN.md §2 Paper), rendered from the same CMS data
 * as the site. On screen it sits on the dark frame with download/print
 * actions; in print (and in the generated PDF) only the sheet remains.
 */
export default async function CvPage({ params }: PageProps<"/[lang]/cv">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [site, work, tech, credentials] = await Promise.all([getSite(lang), getWork(lang), getTech(), getCredentials()]);
  const cv = getCv(lang);

  const groups = Object.entries(TECH_GROUPS)
    .map(([key, label]) => ({ label: label[lang], items: tech.filter((x) => x.category === key).map((x) => x.name) }))
    .filter((g) => g.items.length);
  const host = new URL(SITE_URL).host;
  const contact = [
    site.location,
    site.email,
    host,
    site.github_url.replace(/^https?:\/\/(www\.)?/, ""),
    site.linkedin_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
    site.phone,
  ].filter(Boolean);

  return (
    <div className="px-4 py-10 print:p-0 md:py-16">
      <div data-print-hide className="mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-end gap-3">
        <PrintButton label={cv.labels.print} />
        <ButtonLink href={`/cv/younes-ouali-cv-${lang}.pdf`} variant="ember">
          <Download aria-hidden className="size-3.5" />
          {cv.labels.download}
        </ButtonLink>
      </div>

      <article
        className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-[var(--paper)] px-[12mm] py-[13mm] text-[13px] leading-[1.5] text-[var(--paper-ink)] print:h-[297mm] print:min-h-0 print:overflow-hidden print:px-[11mm] print:py-[10mm] print:text-[10.4px] print:leading-[1.42] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.8)] [print-color-adjust:exact] print:shadow-none"
      >
        <header className="flex items-start justify-between gap-6 border-b border-[var(--paper-line)] pb-5 print:pb-3">
          <div>
            <h1 className="font-display text-[34px] leading-none print:text-[28px] tracking-[-0.03em] [font-stretch:125%] [font-weight:720]">Younes Ouali</h1>
            <p className="mt-2 max-w-[120mm] text-[14px] text-[var(--paper-muted)]">{cv.title}</p>
          </div>
          <span aria-hidden className="block size-11 shrink-0 bg-[var(--paper-ink)] [mask:url(/brand/of-mark-512.png)_center/contain_no-repeat]" />
        </header>

        <div className="mt-6 grid grid-cols-[1fr_62mm] gap-8 print:mt-4 print:gap-6">
          <div className="flex flex-col gap-6 print:gap-3.5">
            <CvSection label={cv.labels.profile}>
              <p>{cv.profile}</p>
            </CvSection>

            <CvSection label={cv.labels.experience}>
              <div className="flex flex-col gap-4 print:gap-2.5">
                {cv.experience.map((x) => (
                  <div key={x.role + x.org} className="break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold">
                        {x.role} <span className="font-normal text-[var(--paper-muted)]">· {x.org}</span>
                      </p>
                      <p className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--paper-muted)]">{x.period}</p>
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {x.points.map((p) => (
                        <li key={p} className="relative pl-3.5 before:absolute before:left-0 before:top-[0.6em] before:size-[5px] before:bg-[var(--ember-700)]">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CvSection>

            <CvSection label={cv.labels.projects}>
              <ul className="flex flex-col gap-2">
                {work.map((w) => (
                  <li key={w.slug} className="break-inside-avoid">
                    <span className="font-semibold">{w.title}</span>
                    {w.year ? <span className="text-[var(--paper-muted)]"> · {w.year}</span> : null}
                    <span>: {w.tagline}</span>
                    <span className="block font-mono text-[10.5px] text-[var(--paper-muted)]">{w.stack.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </CvSection>

            <CvSection label={cv.labels.education}>
              <ul className="flex flex-col gap-2">
                {cv.education.map((e) => (
                  <li key={e.degree} className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className="font-semibold">{e.degree}</span>
                      <span className="block text-[var(--paper-muted)]">{e.school}</span>
                    </span>
                    {e.period && <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--paper-muted)]">{e.period}</span>}
                  </li>
                ))}
              </ul>
            </CvSection>
          </div>

          <aside className="flex flex-col gap-6 border-l border-[var(--paper-line)] pl-6 print:gap-3.5 print:pl-5">
            <CvSection label={cv.labels.contact}>
              <ul className="flex flex-col gap-1 break-all">
                {contact.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </CvSection>
            <CvSection label={cv.labels.skills}>
              <dl className="flex flex-col gap-2">
                {groups.map((g) => (
                  <div key={g.label}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--paper-muted)]">{g.label}</dt>
                    <dd>{g.items.join(", ")}</dd>
                  </div>
                ))}
              </dl>
            </CvSection>
            <CvSection label={cv.labels.languages}>
              <p>{cv.languages}</p>
            </CvSection>
            <CvSection label={cv.labels.certificates}>
              <ul className="flex flex-col gap-1.5">
                {groupCredentials(credentials).map((c) => (
                  <li key={c.issuer + c.titles[0]} className="leading-snug">
                    <span className="font-semibold">{c.issuer}</span>
                    {c.year ? <span className="text-[var(--paper-muted)]"> · {c.year}</span> : null}
                    <span className="block text-[var(--paper-muted)]">{c.titles.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </CvSection>
          </aside>
        </div>
      </article>
    </div>
  );
}

/** One line per issuer: nine courses from one school read as one credential. */
function groupCredentials(list: Awaited<ReturnType<typeof getCredentials>>) {
  const groups = new Map<string, { issuer: string; year: string; titles: string[] }>();
  for (const c of list) {
    const g = groups.get(c.issuer) ?? { issuer: c.issuer, year: "", titles: [] };
    g.titles.push(c.title);
    if (c.issued_on && c.issued_on.slice(0, 4) > g.year) g.year = c.issued_on.slice(0, 4);
    groups.set(c.issuer, g);
  }
  return [...groups.values()];
}

// Sections may break; only headings keep with what follows (print-paged-media §3).
function CvSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--ember-700)] [break-after:avoid]">
        <span aria-hidden className="inline-block size-[5px] bg-[var(--ember-700)]" />
        {label}
      </h2>
      {children}
    </section>
  );
}
