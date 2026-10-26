import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, locales } from "@/i18n/dictionaries";
import { LEGAL_LABELS, LEGAL_PAGES, legal, type LegalPage } from "@/i18n/legal";
import { cn } from "@/lib/cn";
import { Hud } from "@/components/ui/hud";
import { SectionEyebrow, SectionShell } from "@/components/ui/section-shell";

const isPage = (p: string): p is LegalPage => (LEGAL_PAGES as readonly string[]).includes(p);

export function generateStaticParams() {
  return locales.flatMap((lang) => LEGAL_PAGES.map((page) => ({ lang, page })));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/legal/[page]">): Promise<Metadata> {
  const { lang, page } = await params;
  if (!hasLocale(lang) || !isPage(page)) return {};
  const doc = legal(lang, page);
  return {
    title: doc.title,
    description: doc.lead,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `/${l}/legal/${page}`])) },
  };
}

/** Privacy, terms, cookies and data deletion: one reading layout, the four pages side by side. */
export default async function Page({ params }: PageProps<"/[lang]/legal/[page]">) {
  const { lang, page } = await params;
  if (!hasLocale(lang) || !isPage(page)) notFound();
  const doc = legal(lang, page);
  const slug = (h: string) => h.toLowerCase().normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  return (
    <SectionShell id="legal" ruler={doc.title}>
      <SectionEyebrow index="·" label={doc.title} annotation={doc.updated} />
      <div className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <nav aria-label={doc.title} className="border-b border-line px-6 py-8 md:px-10 lg:border-b-0 lg:border-r lg:py-[var(--chapter)]">
          <div className="flex flex-col gap-8 lg:sticky lg:top-[calc(var(--nav-h)+5rem)]">
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
              {LEGAL_PAGES.map((p) => (
                <li key={p}>
                  <Link
                    href={`/${lang}/legal/${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={cn(
                      "hud flex border px-3 py-2 transition-colors lg:border-x-0 lg:border-t-0 lg:px-0 lg:py-3",
                      p === page ? "border-ember-400 text-ink lg:border-line" : "border-line text-muted hover:text-ink",
                    )}
                  >
                    {p === page && <span aria-hidden className="mr-2 hidden text-ember-400 lg:inline">●</span>}
                    {LEGAL_LABELS[lang][p]}
                  </Link>
                </li>
              ))}
            </ul>
            <ol className="hidden flex-col gap-2 lg:flex">
              {doc.sections.map((s, i) => (
                <li key={s.h}>
                  <a href={`#${slug(s.h)}`} className="text-sm text-faint transition-colors hover:text-ink">
                    <span className="hud mr-3">{String(i + 1).padStart(2, "0")}</span>
                    {s.h}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <article className="px-6 py-10 md:px-10 lg:py-[var(--chapter)]">
          <h1 data-reveal className="max-w-3xl text-h2 tracking-[-0.035em] text-ink-strong">{doc.title}</h1>
          <p data-reveal className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{doc.lead}</p>
          <div className="mt-14 flex max-w-2xl flex-col gap-12">
            {doc.sections.map((s, i) => (
              <section key={s.h} id={slug(s.h)} className="scroll-mt-[calc(var(--nav-h)+4rem)]">
                <h2 className="flex items-baseline gap-4 text-xl text-ink-strong">
                  <Hud tone="faint" as="span">{String(i + 1).padStart(2, "0")}</Hud>
                  {s.h}
                </h2>
                <div className="mt-4 flex flex-col gap-3 border-l border-line pl-6 sm:ml-[1.6rem]">
                  {s.p.map((p) => <p key={p} className="leading-relaxed text-muted">{p}</p>)}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </SectionShell>
  );
}
