import { Hud, Accented } from "@/components/ui/hud";
import { ButtonLink } from "@/components/ui/button";
import { fill, type Dictionary, type Locale } from "@/i18n/dictionaries";
import type { GalaxyItem, SiteSettings } from "@/lib/types";
import GalaxyLoader from "./galaxy-loader";
import HeroIntro from "./hero-intro";
import WordmarkLetters from "./wordmark-letters";
import { WORDMARK_FILL } from "./wordmark-fill";

const WORD = "ORIGINFORGE";

/**
 * Cinematic Center hero (DESIGN.md §1): the OF mark is the forge mouth the
 * galaxy pours out of; the wordmark, the line and the two CTAs sit on top.
 * Everything that sells is server-rendered and above the fold — the galaxy
 * is an enhancement layered underneath.
 */
export default function Hero({
  lang, t, galaxy, site,
}: {
  lang: Locale;
  t: Dictionary;
  galaxy: GalaxyItem[];
  site: SiteSettings;
}) {
  const mosaic = galaxy.slice(0, 12);
  return (
    // The section neither clips nor isolates: the wordmark's letters fly out of
    // it to the section-title stack. The backdrop has its own clipped layer.
    <section id="hero" data-ruler="OriginForge" className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 isolate overflow-hidden">
      {/* Atmosphere: forge-mouth glow + edge vignette (DESIGN.md §7). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          data-hero-glow
          data-intro-hide
          className="absolute left-1/2 top-[46%] h-[70vmin] w-[110vmin] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-90 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgb(255 106 26 / 0.22), color-mix(in srgb, var(--ember-500) 18%, var(--bg)) 45%, transparent 75%)" }}
        />
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, var(--steel-990) 100%)" }} />
      </div>

      {/* Fallback backdrop: posters of the same clips, faded once WebGL is live. */}
      <div
        aria-hidden
        className="hero-mosaic pointer-events-none absolute inset-0 -z-10 grid grid-cols-3 gap-6 p-6 opacity-30 blur-[2px] transition-opacity duration-1000 sm:grid-cols-4 lg:grid-cols-6 [[data-galaxy=on]_&]:opacity-0"
      >
        {mosaic.map((item, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- decorative, tiny, pre-sized posters
          <img
            key={item.id}
            src={item.poster}
            alt=""
            width={item.width}
            height={item.height}
            loading="lazy"
            decoding="async"
            className="h-auto w-full object-cover"
            style={{ transform: `translateY(${(i % 3) * 24}px)` }}
          />
        ))}
      </div>

      <GalaxyLoader items={galaxy} lang={lang} label={t.work.open} />
      </div>
      <HeroIntro />
      <WordmarkLetters />

      {/* Above the ruler's frosted patches (z-39): the wordmark letters end up in the title stack. */}
      <div className="pointer-events-none relative z-[41] mx-auto flex min-h-[calc(100svh-var(--nav-h))] max-w-[1280px] flex-col items-center justify-center px-6 py-16 text-center md:px-10">
        <span aria-hidden data-hero-mark data-intro-hide className="of-mark mb-6 block size-14 drop-shadow-[0_0_24px_rgb(255_106_26/0.35)] md:size-20" />

        <p className="relative font-display text-wordmark uppercase leading-[0.9] tracking-[-0.02em] [font-stretch:125%] [font-weight:760]">
          <span className="sr-only">OriginForge</span>
          {/* The specular sheen is a second layer of the letters' own fill, so it only
              ever lights the glyphs; the intro glides it across (hero-intro.tsx). */}
          <span
            aria-hidden
            className="steel-text relative inline-flex"
            style={{ backgroundImage: WORDMARK_FILL }}
          >
            {WORD.split("").map((ch, i) => (
              <span key={i} data-wm-letter data-intro-hide className="inline-block">
                {ch}
              </span>
            ))}
          </span>
        </p>

        <div data-reveal-group data-reveal-intro className="relative mt-8 flex w-full max-w-3xl flex-col items-center">
          {/* Scrim: a soft pocket of the page colour so the sales layer always reads over the galaxy. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-x-24 -inset-y-16 -z-10"
            style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--bg) 82%, transparent), color-mix(in srgb, var(--bg) 50%, transparent) 55%, transparent)" }}
          />
          <h1 data-reveal data-intro-hide className="text-h1 tracking-[-0.03em] text-ink-strong">
            <Accented parts={t.hero.title} />
          </h1>
          <p data-reveal data-intro-hide className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            {t.hero.lead}
          </p>
          <div data-reveal data-intro-hide className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href={`/${lang}/start`} variant="ember" arrow>
              {t.hero.primary}
            </ButtonLink>
            <ButtonLink href={`/${lang}/work`} variant="secondary" className="bg-steel-950/70 backdrop-blur-sm">
              {t.hero.secondary}
            </ButtonLink>
          </div>
          <div data-reveal data-intro-hide className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {site.is_available && (
              <Hud tone="muted" dot live>
                {site.availability || t.hero.available}
              </Hud>
            )}
            <Hud tone="faint">{t.hero.disciplines}</Hud>
            <Hud tone="faint">{fill(t.hero.replies, { hours: site.reply_hours })}</Hud>
          </div>
        </div>
      </div>
    </section>
  );
}
