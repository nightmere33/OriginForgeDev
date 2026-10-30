import type { Metadata } from "next";
import Image from "next/image";
import { sized } from "@/lib/sized";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { fill, getDictionary, hasLocale } from "@/i18n/dictionaries";
import { getWork } from "@/lib/content";
import { Accented, Hud } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import LoopVideo from "@/components/media/loop-video";
import ReelPlate from "@/components/media/reel-plate";
import WorkFilter from "@/components/work/work-filter";
import FinalCta from "@/components/landing/final-cta";
import { getSite } from "@/lib/content";
import RevealManager from "@/motion/reveal-manager";

export async function generateMetadata({ params }: PageProps<"/[lang]/work">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return {
    title: t.nav.work,
    description: t.workIndex.lead,
    alternates: { canonical: `/${lang}/work`, languages: { en: "/en/work", fr: "/fr/work" } },
  };
}

export default async function WorkIndex({ params }: PageProps<"/[lang]/work">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [t, work, site] = await Promise.all([getDictionary(lang), getWork(lang), getSite(lang)]);

  const counts = new Map<string, number>();
  work.forEach((w) => counts.set(w.category, (counts.get(w.category) ?? 0) + 1));
  const categories = [...counts].map(([key, count]) => ({ key, count, label: t.categories[key as keyof typeof t.categories] ?? key }));

  return (
    <>
      <SectionShell id="work-index" ruler={t.nav.work}>
        <SectionEyebrow index="·" label={t.nav.work} annotation={fill(t.workIndex.count, { n: work.length })} />
        <SectionHeading title={<Accented parts={t.workIndex.title} />} lead={t.workIndex.lead} />
        <WorkFilter categories={categories} allLabel={t.workIndex.all}>
          <div data-reveal-group className="grid grid-flow-dense gap-px border-t border-line bg-line md:grid-cols-2 lg:grid-cols-3">
            {work.map((study, i) => (
              <Link
                key={study.slug}
                href={`/${lang}/work/${study.slug}`}
                data-category={study.category}
                data-reveal="contents"
                className="group/cell flex flex-col bg-bg focus-visible:outline-offset-[-2px]"
              >
                <div className="flex items-center justify-between border-b border-line px-6 py-2.5">
                  <Hud tone="muted" className="transition-colors group-hover/cell:text-ink">
                    {t.categories[study.category]} · {study.year}
                  </Hud>
                  <Hud tone="faint">{String(i + 1).padStart(2, "0")}</Hud>
                </div>
                <div className="relative aspect-[4/3] overflow-hidden">
                  {study.cover_video ? (
                    <div className="h-full w-full transition-transform duration-700 ease-out group-hover/cell:scale-[1.03]">
                      <ReelPlate accent={study.accent} ratio={study.cover_width / study.cover_height}>
                        <LoopVideo src={study.cover_video} av1={study.cover_video_av1} poster={study.cover_image} width={study.cover_width} height={study.cover_height} />
                      </ReelPlate>
                    </div>
                  ) : study.cover_image ? (
                    // A cover photo where there is no footage (screens composed by build_media.py).
                    <Image src={study.cover_image} alt="" fill quality={82} sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover/cell:scale-[1.03]" />
                  ) : (
                    <TypeCover title={study.title} stack={study.stack} />
                  )}
                </div>
                <div className="flex flex-1 items-start justify-between gap-4 p-6">
                  <div>
                    <div className="flex items-center gap-3">
                      {study.logo_mark && (
                      // eslint-disable-next-line @next/next/no-img-element -- brand mark (SVG/PNG)
                      <img src={sized(study.logo_mark, 96)} alt="" className="size-9 shrink-0" />
                    )}
                      <h2 className="text-h3 tracking-[-0.02em] text-ink-strong">{study.title}</h2>
                    </div>
                    <p className="mt-2 leading-relaxed text-muted">{study.tagline}</p>
                  </div>
                  <ArrowUpRight aria-hidden className="size-5 shrink-0 text-faint transition-[color,translate] group-hover/cell:-translate-y-0.5 group-hover/cell:translate-x-0.5 group-hover/cell:text-ember-400" />
                </div>
              </Link>
            ))}
          </div>
        </WorkFilter>
      </SectionShell>
      <FinalCta lang={lang} t={t} site={site} />
      <RevealManager />
    </>
  );
}

/** Typographic cover for projects without footage: the stack as an instrument read-out. */
function TypeCover({ title, stack }: { title: string; stack: string[] }) {
  return (
    <div className="relative flex h-full flex-col justify-end overflow-hidden bg-bg-sunken p-6">
      {/* Decorative monogram as pseudo-element text: not content, not audited as text. */}
      <span
        aria-hidden
        data-mark={title.slice(0, 2).toUpperCase()}
        className="absolute -right-4 -top-6 font-display text-[9rem] leading-none text-steel-900 [font-stretch:125%] [font-weight:760] before:content-[attr(data-mark)]"
      />
      <ul className="relative flex flex-wrap gap-2">
        {stack.map((s) => (
          <li key={s} className="hud border border-line px-2 py-1 text-muted">
            {s}
          </li>
        ))}
      </ul>
      <span aria-hidden className="tick left-2 top-2 opacity-60" />
      <span aria-hidden className="tick bottom-2 right-2 opacity-60" />
    </div>
  );
}
