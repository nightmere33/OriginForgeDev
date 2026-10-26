import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { CaseStudySummary, GalaxyItem } from "@/lib/types";
import { Accented, Hud } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { ButtonLink } from "@/components/ui/button";
import LoopVideo from "@/components/media/loop-video";
import ReelPlate from "@/components/media/reel-plate";
import ScrollMedia from "@/components/media/scroll-media";
import { cn } from "@/lib/cn";

/**
 * 01 / Selected work. Gapless dense grid (2 columns):
 *   row 1: featured · featured
 *   row 2: the motion study, full width, three films side by side
 *   row 3: archive · archive
 */
export default function WorkSection({
  lang, t, work, galaxy,
}: {
  lang: Locale;
  t: Dictionary;
  work: CaseStudySummary[];
  galaxy: GalaxyItem[];
}) {
  const featured = work.filter((w) => w.featured && w.category !== "motion");
  const motion = work.find((w) => w.featured && w.category === "motion");
  const archive = work.filter((w) => !w.featured).slice(0, 2);
  const films = motion ? pickFilms(galaxy) : [];

  return (
    <SectionShell id="work" ruler={t.work.label}>
      <SectionEyebrow index={t.work.index} label={t.work.label} annotation={t.work.annotation} />
      <SectionHeading title={<Accented parts={t.work.title} />} lead={t.work.lead} />

      <div data-reveal-group className="grid grid-flow-dense gap-px border-t border-line bg-line md:grid-cols-2">
        {featured.map((study, i) => (
          <WorkCell key={study.slug} lang={lang} t={t} study={study} index={i + 1}>
            {study.cover_video ? (
              <ReelPlate accent={study.accent} ratio={study.cover_width / study.cover_height}>
                <LoopVideo src={study.cover_video} av1={study.cover_video_av1} poster={study.cover_image} width={study.cover_width} height={study.cover_height} />
              </ReelPlate>
            ) : null}
          </WorkCell>
        ))}

        {motion && (
          <WorkCell lang={lang} t={t} study={motion} index={featured.length + 1} wide>
            {/* Three films side by side, each at its own scroll depth. */}
            <div className="relative grid h-full grid-cols-3 overflow-hidden bg-bg-sunken">
              <div aria-hidden className="absolute inset-0 [background:radial-gradient(120%_80%_at_50%_120%,color-mix(in_srgb,var(--ember-500)_18%,var(--bg)),transparent_60%)]" />
              {films.map(({ clip, label }, i) => (
                <ReelPlate key={clip.id} accent={clip.accent} label={label} depth={[0.45, -0.3, 0.6][i]} shared>
                  <LoopVideo src={clip.file} av1={clip.file_av1} poster={clip.poster} width={clip.width} height={clip.height} />
                </ReelPlate>
              ))}
            </div>
          </WorkCell>
        )}

        {archive.map((study, i) => (
          <Link
            key={study.slug}
            href={`/${lang}/work/${study.slug}`}
            data-reveal="contents"
            className="group/cell flex flex-col justify-between gap-10 bg-bg p-6 transition-colors duration-[var(--dur-standard)] hover:bg-cell focus-visible:outline-offset-[-2px] md:p-8"
          >
            <div className="flex items-center justify-between">
              <Hud tone="muted">{t.work.more}</Hud>
              <Hud tone="faint">{String(featured.length + (motion ? 2 : 1) + i).padStart(2, "0")}</Hud>
            </div>
            <div>
              <h3 className="text-h3 tracking-[-0.02em] text-ink-strong">{study.title}</h3>
              <p className="mt-2 max-w-md leading-relaxed text-muted">{study.tagline}</p>
              <p className="hud mt-5 text-faint">{study.stack.join(" · ")}</p>
            </div>
            <ArrowUpRight aria-hidden className="size-5 self-end text-faint transition-[color,translate] duration-[var(--dur-standard)] group-hover/cell:-translate-y-0.5 group-hover/cell:translate-x-0.5 group-hover/cell:text-ember-400" />
          </Link>
        ))}
      </div>

      <div className="flex justify-center border-t border-line px-6 py-10">
        <ButtonLink href={`/${lang}/work`} variant="secondary" arrow>
          {t.work.all}
        </ButtonLink>
      </div>
    </SectionShell>
  );
}

function WorkCell({
  lang, t, study, index, wide, children,
}: {
  lang: Locale;
  t: Dictionary;
  study: CaseStudySummary;
  index: number;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/${lang}/work/${study.slug}`}
      data-reveal="contents"
      className={cn("group/cell flex flex-col bg-bg focus-visible:outline-offset-[-2px]", wide && "md:col-span-2")}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-2.5 md:px-8">
        <Hud tone="muted" className="transition-colors duration-[var(--dur-micro)] group-hover/cell:text-ink">
          {t.categories[study.category]} · {study.year}
        </Hud>
        <Hud tone="faint">{String(index).padStart(2, "0")}</Hud>
      </div>
      {/* Phones get taller media, so a 9:16 film is large enough to read. */}
      <div className={cn("relative overflow-hidden", wide ? "aspect-[5/4] sm:aspect-[21/9]" : "aspect-[4/5] sm:aspect-[16/10]")}>
        <ScrollMedia className="h-full w-full">
          <div className="h-full w-full transition-transform duration-700 ease-out group-hover/cell:scale-[1.03]">{children}</div>
        </ScrollMedia>
        <span aria-hidden className="tick left-2 top-2 opacity-60" />
        <span aria-hidden className="tick bottom-2 right-2 opacity-60" />
      </div>
      <div className="flex items-start justify-between gap-6 p-6 md:p-8">
        <div>
          <div className="flex items-center gap-3">
            {study.logo_mark && (
              // eslint-disable-next-line @next/next/no-img-element -- brand mark (SVG/PNG)
              <img src={study.logo_mark} alt="" className="size-9 shrink-0" />
            )}
            <h3 className="text-h3 tracking-[-0.02em] text-ink-strong">{study.title}</h3>
          </div>
          <p className="mt-2 max-w-xl leading-relaxed text-muted">{study.tagline}</p>
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center border border-line-strong text-ink transition-colors duration-[var(--dur-micro)] group-hover/cell:border-transparent group-hover/cell:bg-steel-50 group-hover/cell:text-steel-950">
          <ArrowUpRight aria-hidden className="size-5" />
          <span className="sr-only">{t.work.open}</span>
        </span>
      </div>
    </Link>
  );
}

/** Three films from three different products for the wide motion cell. */
function pickFilms(galaxy: GalaxyItem[]): { clip: GalaxyItem; label: string }[] {
  const want = [["mg-intro", "MediGate"], ["of-ignite", "OriginForge"], ["alq-brand", "Alquilar"]] as const;
  const picked = want
    .map(([name, label]) => ({ clip: galaxy.find((g) => g.file.includes(`/${name}-web.`)), label }))
    .filter((f): f is { clip: GalaxyItem; label: (typeof want)[number][1] } => !!f.clip);
  return picked.length === 3 ? picked : galaxy.slice(0, 3).map((clip) => ({ clip, label: clip.title }));
}
