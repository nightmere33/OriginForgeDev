import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { fill, getDictionary, hasLocale, locales } from "@/i18n/dictionaries";
import { getCaseStudy, getSite, getWork } from "@/lib/content";
import { Hud } from "@/components/ui/hud";
import { ButtonLink } from "@/components/ui/button";
import { SectionShell } from "@/components/ui/section-shell";
import FilmPlayer from "@/components/media/film-player";
import LoopVideo from "@/components/media/loop-video";
import ReelPlate from "@/components/media/reel-plate";
import FinalCta from "@/components/landing/final-cta";
import RevealManager from "@/motion/reveal-manager";

// Prerender every published study; new ones render on first visit and are
// then cached until Django tags them stale.
export async function generateStaticParams() {
  const params: { lang: string; slug: string }[] = [];
  for (const lang of locales) {
    for (const w of await getWork(lang)) params.push({ lang, slug: w.slug });
  }
  return params;
}

export async function generateMetadata({ params }: PageProps<"/[lang]/work/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const study = await getCaseStudy(lang, slug);
  if (!study) return {};
  return {
    title: study.title,
    description: study.tagline,
    alternates: { canonical: `/${lang}/work/${slug}`, languages: { en: `/en/work/${slug}`, fr: `/fr/work/${slug}` } },
    openGraph: { title: `${study.title} · OriginForge`, description: study.tagline, images: study.cover_image ? [study.cover_image] : [] },
  };
}

// The URL data is read inside Suspense: navigating to a study not yet
// prerendered still paints the hairline frame instantly while it streams.
export default function CaseStudyPage({ params }: PageProps<"/[lang]/work/[slug]">) {
  return (
    <Suspense fallback={<CaseStudySkeleton />}>
      <CaseStudy params={params} />
    </Suspense>
  );
}

function CaseStudySkeleton() {
  return (
    <SectionShell ruler="…">
      <div className="h-[46px] border-b border-line" />
      <div className="grid min-h-[70svh] lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div className="flex flex-col justify-center gap-6 px-6 md:px-10">
          <div className="h-20 w-3/4 animate-pulse bg-cell" />
          <div className="h-6 w-2/3 animate-pulse bg-cell" />
        </div>
        <div className="border-t border-line bg-bg-sunken lg:border-l lg:border-t-0" />
      </div>
    </SectionShell>
  );
}

async function CaseStudy({ params }: { params: PageProps<"/[lang]/work/[slug]">["params"] }) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const [t, study, work, site] = await Promise.all([getDictionary(lang), getCaseStudy(lang, slug), getWork(lang), getSite(lang)]);
  if (!study) notFound();

  const index = work.findIndex((w) => w.slug === slug);
  const next = work[(index + 1) % work.length];
  const chapters = [
    { label: t.caseStudy.challenge, text: study.challenge },
    { label: t.caseStudy.approach, text: study.approach },
    { label: t.caseStudy.outcome, text: study.outcome },
  ].filter((c) => c.text);
  const videos = study.media.filter((m) => m.kind === "video");
  const images = study.media.filter((m) => m.kind === "image");
  // Feature photos and clips each lay out by shape: portrait cards 4-up, screens 2-up.
  const tall = (m: { width: number; height: number }) => m.height > m.width;
  const film = study.film
    ? { h264: study.film, av1: study.film_av1, width: study.film_width, height: study.film_height }
    : null;
  const filmLabels = { watch: t.caseStudy.watchFilm, close: t.caseStudy.close };
  const filmTitle = fill(t.caseStudy.filmOf, { title: study.title });
  const links = [
    { href: study.live_url, label: t.caseStudy.visit },
    { href: study.store_url, label: t.caseStudy.store },
    { href: study.repo_url, label: t.caseStudy.repo },
  ].filter((l) => l.href);

  return (
    <>
      <SectionShell id="case" ruler={study.title}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-3 md:px-10">
          <Link href={`/${lang}/work`} className="hud inline-flex items-center gap-2 text-muted hover:text-ink">
            <ArrowLeft aria-hidden className="size-3.5" />
            {t.caseStudy.back}
          </Link>
          <Hud tone="faint">
            {t.categories[study.category]} · {study.year}
          </Hud>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="flex flex-col justify-center px-6 py-[var(--chapter)] md:px-10">
            {study.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- brand vector/PNG, sized by height
              <img data-reveal src={study.logo} alt="" className="mb-8 h-10 w-auto self-start md:h-12" />
            )}
            <h1 data-reveal className="text-mega tracking-[-0.04em] text-ink-strong">
              {study.title}
            </h1>
            <p data-reveal className="mt-6 max-w-xl text-xl leading-relaxed text-ink">
              {study.tagline}
            </p>
            <p data-reveal className="mt-4 max-w-xl leading-relaxed text-muted">
              {study.summary}
            </p>
            {(links.length > 0 || film) && (
              <div data-reveal className="mt-8 flex flex-wrap gap-3">
                {links.map((l, i) => (
                  <ButtonLink key={l.href} href={l.href} variant={i === 0 ? "primary" : "secondary"}>
                    {l.label}
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </ButtonLink>
                ))}
                {film && (
                  <FilmPlayer film={film} poster={study.film_poster} title={filmTitle} duration={study.film_duration} labels={filmLabels} />
                )}
              </div>
            )}
          </div>
          <div className="relative aspect-[4/5] border-t border-line lg:aspect-auto lg:h-[min(46rem,calc(100svh-6rem))] lg:self-center lg:border-l lg:border-t-0">
            {study.cover_video ? (
              <ReelPlate accent={study.accent} ratio={study.cover_width / study.cover_height}>
                <LoopVideo src={study.cover_video} av1={study.cover_video_av1} poster={study.cover_image} width={study.cover_width} height={study.cover_height} />
                {film && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/50 to-transparent pb-5 pt-12">
                    <FilmPlayer film={film} poster={study.film_poster} title={filmTitle} duration={study.film_duration} labels={filmLabels} compact />
                  </div>
                )}
              </ReelPlate>
            ) : (
              <div className="flex h-full items-center justify-center bg-bg-sunken">
                <span aria-hidden className="of-mark size-24 opacity-60" />
              </div>
            )}
          </div>
        </div>

        {/* Instrument read-out: role, client, year, stack. */}
        <dl className="grid grid-flow-dense gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: t.caseStudy.role, v: study.role },
            { k: t.caseStudy.client, v: study.client_name },
            { k: t.caseStudy.year, v: study.year ? String(study.year) : "" },
            { k: t.caseStudy.stack, v: study.stack.join(" · ") },
          ].filter((x) => x.v).map((x) => (
            <div key={x.k} className="bg-bg px-6 py-5 md:px-8">
              <dt className="hud text-faint">{x.k}</dt>
              <dd className="mt-2 text-ink">{x.v}</dd>
            </div>
          ))}
        </dl>
      </SectionShell>

      {study.metrics.length > 0 && (
        <SectionShell id="metrics" ruler={t.caseStudy.metrics}>
          <div data-reveal-group className="grid grid-flow-dense gap-px bg-line sm:grid-cols-3">
            {study.metrics.map((m) => (
              <div key={m.value + m.label} data-reveal="contents" className="bg-bg px-6 py-10 md:px-8">
                <p className="font-display text-h2 leading-none tracking-[-0.035em] text-ink-strong [font-stretch:125%] [font-weight:620]">{m.value}</p>
                <p className="mt-3 max-w-xs text-muted">{m.label}</p>
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {chapters.length > 0 && (
        <SectionShell id="story" ruler={t.caseStudy.challenge}>
          <div className="divide-y divide-line">
            {chapters.map((c, i) => (
              <div key={c.label} className="grid gap-6 px-6 py-14 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:px-10 md:py-20">
                <Hud tone="faint" className="self-start">
                  {String(i + 1).padStart(2, "0")} / {c.label}
                </Hud>
                <p data-reveal className="max-w-3xl text-xl leading-relaxed text-ink">
                  {c.text}
                </p>
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {images.length > 0 && (
        <SectionShell id="features" ruler={t.caseStudy.features}>
          <div className="flex items-center justify-between border-b border-line px-6 py-3 md:px-10">
            <Hud tone="muted">{t.caseStudy.features}</Hud>
            <Hud tone="faint">{String(images.length).padStart(2, "0")}</Hud>
          </div>
          {[images.filter(tall), images.filter((m) => !tall(m))].map((group, g) => group.length > 0 && (
            <div key={g} data-reveal-group className={g === 0 ? "grid grid-cols-2 gap-px bg-line lg:grid-cols-4" : "grid gap-px border-t border-line bg-line first:border-t-0 md:grid-cols-2"}>
              {group.map((m, k) => (
                <figure key={m.id} data-reveal="contents"
                  // Gapless: an odd last screenshot spans the row.
                  className={`group/fig flex flex-col bg-bg ${g === 1 && k === group.length - 1 && group.length % 2 ? "md:col-span-2" : ""}`}>
                  <div className="overflow-hidden bg-bg-sunken">
                    <Image src={m.file} alt={m.caption || study.title} width={m.width} height={m.height} quality={82}
                      sizes={g === 0 ? "(min-width: 1024px) 25vw, 50vw" : "(min-width: 768px) 50vw, 100vw"}
                      className="h-auto w-full transition-transform duration-700 ease-[var(--ease-out)] group-hover/fig:scale-[1.02]" />
                  </div>
                  {m.caption && (
                    <figcaption className="flex items-baseline gap-3 border-t border-line px-5 py-3">
                      <span className="hud text-ember-400">{String(images.indexOf(m) + 1).padStart(2, "0")}</span>
                      <span className="text-sm text-ink">{m.caption}</span>
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          ))}
        </SectionShell>
      )}

      {videos.length > 0 && (
        <SectionShell id="motion" ruler={t.caseStudy.inMotion}>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-3 md:px-10">
            <Hud tone="muted">{t.caseStudy.inMotion}</Hud>
            {film ? (
              <FilmPlayer film={film} poster={study.film_poster} title={filmTitle} duration={study.film_duration} labels={filmLabels} compact />
            ) : (
              <Hud tone="faint">{String(videos.length).padStart(2, "0")}</Hud>
            )}
          </div>
          {[videos.filter((m) => !tall(m)), videos.filter(tall)].map((group, g) => group.length > 0 && (
            <div key={g} className={g === 0 ? "grid gap-px bg-line md:grid-cols-2" : "grid grid-cols-2 gap-px border-t border-line bg-line first:border-t-0 sm:grid-cols-3 lg:grid-cols-4"}>
              {group.map((m) => (
                <figure key={m.id} className="flex flex-col bg-bg">
                  <div className="bg-bg-sunken" style={{ aspectRatio: `${m.width} / ${m.height}` }}>
                    <LoopVideo src={m.file} av1={m.file_av1} poster={m.poster} width={m.width} height={m.height} />
                  </div>
                  {m.caption && <figcaption className="border-t border-line px-5 py-3 text-sm text-ink">{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          ))}
        </SectionShell>
      )}

      {next && next.slug !== slug && (
        <SectionShell id="next" ruler={t.caseStudy.next}>
          <Link href={`/${lang}/work/${next.slug}`} className="group/next flex items-center justify-between gap-6 px-6 py-[var(--chapter)] md:px-10">
            <span>
              <Hud tone="faint">{t.caseStudy.next}</Hud>
              <span className="mt-3 block font-display text-mega leading-none tracking-[-0.04em] text-ink-strong transition-colors [font-stretch:125%] [font-weight:620] group-hover/next:text-ember-400">
                {next.title}
              </span>
            </span>
            <ArrowUpRight aria-hidden className="size-10 shrink-0 text-faint transition-[color,translate] group-hover/next:-translate-y-1 group-hover/next:translate-x-1 group-hover/next:text-ember-400" />
          </Link>
        </SectionShell>
      )}

      <FinalCta lang={lang} t={t} site={site} />
      <RevealManager />
    </>
  );
}
