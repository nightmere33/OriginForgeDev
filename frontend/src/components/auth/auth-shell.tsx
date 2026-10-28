import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { getGalaxy } from "@/lib/content";
import { cn } from "@/lib/cn";
import { Hud } from "@/components/ui/hud";
import { SectionShell } from "@/components/ui/section-shell";
import { GlitchLabel } from "@/motion/glitch";
import { BootText, MosaicGlitch, TearGroup } from "./auth-fx";

export type AuthMode = "login" | "register" | "reset" | "verify" | "welcome";
type Shell = Dictionary["auth"]["shell"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The sign-in frame. Left: the claim, with a mosaic of real project stills
 * that tears in on arrival and what the client space holds decoding in.
 * Right: a framed console (corner ticks, Sign in / Create account tabs, the
 * form, a line on how the connection and password are protected).
 */
export default async function AuthShell({
  lang, shell, mode, title, lead, children,
}: { lang: Locale; shell: Shell; mode: AuthMode; title: string[]; lead?: string; children: ReactNode }) {
  // One still per project: the studio's own work, not stock.
  const galaxy = await getGalaxy().catch(() => []);
  const seen = new Set<string>();
  const stills = galaxy.filter((g) => g.poster && !seen.has(g.slug) && seen.add(g.slug)).slice(0, 6);
  const [before, accent, after] = title;

  return (
    <SectionShell id="auth" className="min-h-[calc(100svh-var(--nav-h))]">
      <div className="grid min-h-[calc(100svh-var(--nav-h))] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="relative isolate flex min-h-[24rem] flex-col justify-between gap-16 overflow-hidden border-b border-line px-6 py-8 md:px-10 lg:border-b-0 lg:border-r lg:py-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: "radial-gradient(70% 55% at 15% 105%, color-mix(in srgb, var(--ember-500) 20%, transparent), transparent 70%)" }} />

          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between gap-4">
              <Hud tone="muted" dot live>ORIGINFORGE · {shell.kicker}</Hud>
              <span className="hud inline-flex items-center gap-1.5 text-faint">
                <LockKeyhole aria-hidden className="size-3 text-ok" />
                {shell.secure}
              </span>
            </div>
            {stills.length >= 3 && (
              <figure aria-hidden className="hidden max-w-xl lg:block">
                <MosaicGlitch className="border border-line">
                  {/* Always a full grid: 6 = 3×2, 5 = the first spans two, 4 = 2×2, 3 = one row. */}
                  <TearGroup start={120} step={70} className={cn("grid auto-rows-[7.75rem] gap-px bg-line", stills.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
                    {stills.slice(0, 6).map((s, i) => (
                      <div key={s.id} className={cn("relative overflow-hidden bg-cell", stills.length === 5 && i === 0 && "col-span-2")}>
                        {/* Decorative 640px stills from the galaxy feed. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.poster!} alt="" decoding="async" className="h-full w-full object-cover opacity-80 grayscale-[0.55] contrast-[1.05]" />
                      </div>
                    ))}
                  </TearGroup>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent" />
                </MosaicGlitch>
                <figcaption className="hud mt-3 flex justify-between text-faint">
                  <span>{shell.work}</span>
                  <span>{String(stills.length).padStart(2, "0")} / {shell.projects}</span>
                </figcaption>
              </figure>
            )}
          </div>

          <div>
            <span aria-hidden className="of-mark mb-8 block size-12" />
            <h1 className="text-h2 tracking-[-0.035em] text-ink-strong">
              {before}
              <span className="serif-accent"><BootText text={accent ?? ""} delay={160} /></span>
              {after}
            </h1>
            {lead && <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">{lead}</p>}
            {mode !== "welcome" && (
              <ol className="mt-10 hidden max-w-lg gap-px border border-line bg-line sm:grid sm:grid-cols-2">
                {shell.features.map((f, i) => (
                  <li key={f} className="flex items-baseline gap-3 bg-bg/85 px-4 py-3">
                    <span className="hud text-ember-400">{pad(i + 1)}</span>
                    <span className="text-sm text-muted"><BootText text={f} delay={420 + i * 130} /></span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12 md:px-10">
          <div className="relative w-full max-w-[28rem]">
            <span aria-hidden className="tick -left-[6px] -top-[6px]" />
            <span aria-hidden className="tick -right-[6px] -top-[6px]" />
            <span aria-hidden className="tick -bottom-[6px] -left-[6px]" />
            <span aria-hidden className="tick -bottom-[6px] -right-[6px]" />
            <TearGroup start={60} step={0}>
              <div className="border border-line bg-raised/70 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
                  <Hud tone="ink" dot live>AUTH / <BootText text={shell.console[mode]} delay={90} /></Hud>
                  <Hud tone="faint">{shell.session}</Hud>
                </div>
                {(mode === "login" || mode === "register") && (
                  <nav aria-label={shell.tabsLabel} className="grid grid-cols-2 border-b border-line">
                    {(["login", "register"] as const).map((m) => (
                      <Link
                        key={m}
                        href={`/${lang}/${m}`}
                        aria-current={m === mode ? "page" : undefined}
                        className={cn(
                          "hud relative flex h-11 items-center justify-center transition-colors duration-[var(--dur-micro)]",
                          m === mode ? "text-ink" : "text-faint hover:bg-cell hover:text-ink",
                        )}
                      >
                        {m === mode ? <BootText text={shell.tabs[m]} delay={200} /> : <GlitchLabel text={shell.tabs[m]} />}
                        {m === mode && <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-ember-400" />}
                      </Link>
                    ))}
                  </nav>
                )}
                {/* The forms read the query string (?next, ?oauth), so they render on the client. */}
                <div className="px-5 py-7 sm:px-7"><Suspense fallback={<div className="min-h-80" />}>{children}</Suspense></div>
                <p className="flex gap-2.5 border-t border-line px-5 py-4 text-xs leading-relaxed text-faint">
                  <LockKeyhole aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ok" />
                  {shell.secureNote}
                </p>
              </div>
            </TearGroup>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
