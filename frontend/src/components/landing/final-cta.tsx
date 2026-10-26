import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { GalaxyItem, SiteSettings } from "@/lib/types";
import { ButtonLink } from "@/components/ui/button";
import { SectionShell } from "@/components/ui/section-shell";
import LoopVideo from "@/components/media/loop-video";

/**
 * The closing door. Mega headline with an Inline Typography Image (DESIGN.md
 * §0 plan): a live product loop set into the sentence between its two halves.
 */
export default function FinalCta({
  lang, t, site, clip,
}: {
  lang: Locale;
  t: Dictionary;
  site: SiteSettings;
  clip?: GalaxyItem;
}) {
  const [before, accent] = t.cta.title;
  return (
    <SectionShell id="contact" ruler={t.nav.start} className="overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%]" style={{ background: "radial-gradient(60% 80% at 50% 110%, rgb(255 106 26 / 0.18), color-mix(in srgb, var(--ember-500) 18%, var(--bg)) 40%, transparent 75%)" }} />
      <div className="relative px-6 py-[var(--chapter)] text-center md:px-10">
        <h2 data-reveal className="mx-auto max-w-6xl text-mega tracking-[-0.04em] text-ink-strong">
          {before}
          {clip && (
            <span aria-hidden className="relative mx-[0.12em] inline-block h-[0.82em] w-[0.5em] translate-y-[0.06em] overflow-hidden border border-line-strong align-baseline">
              <LoopVideo src={clip.file} av1={clip.file_av1} poster={clip.poster} width={clip.width} height={clip.height} />
            </span>
          )}{" "}
          <span className="serif-accent">{accent}</span>
        </h2>
        <p data-reveal className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
          {t.cta.lead}
        </p>
        <div data-reveal className="mt-10 flex flex-col items-center gap-5">
          <ButtonLink href={`/${lang}/start`} variant="ember" arrow>
            {t.cta.primary}
          </ButtonLink>
          {site.email && (
            <p className="hud text-faint">
              {t.cta.email}{" "}
              <a href={`mailto:${site.email}`} className="text-ink underline-offset-4 hover:text-ember-400 hover:underline">
                {site.email}
              </a>
            </p>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
