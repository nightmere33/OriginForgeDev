"use client";

import Link from "next/link";
import { ArrowUpRight, Clapperboard, CreditCard, LayoutGrid, Rocket, ShieldCheck } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import FilmPlayer from "@/components/media/film-player";
import { Hud } from "@/components/ui/hud";
import { useSiteFilms, type Share } from "@/lib/support";
import type { T } from "@/components/project/shared";

const ICONS = { howto: Clapperboard, showreel: Clapperboard, start: Rocket, plans: ShieldCheck, pay: CreditCard, work: LayoutGrid };

/**
 * What a slash command sends: a film to watch right in the thread, or a link
 * with a line about it. Drawn from a key, so each side reads it in its own
 * language and the film is the one cut in that language.
 */
export function ShareCard({ lang, t, share }: { lang: Locale; t: T; share: Share }) {
  const s = t.project.chat.share;
  const films = useSiteFilms(lang);
  const Icon = ICONS[share] ?? LayoutGrid;
  const film = share === "howto" || share === "showreel" ? films?.[share] : undefined;
  const title = { howto: s.howto, showreel: s.showreel, start: s.start, plans: s.plans, pay: s.pay, work: s.work }[share];
  const lead = { howto: s.howtoLead, showreel: s.showreelLead, start: s.startLead, plans: s.plansLead, pay: s.payLead, work: s.workLead }[share];
  const href = { start: `/${lang}/start`, plans: `/${lang}#services`, work: `/${lang}/work` }[share as "start" | "plans" | "work"];

  return (
    <div className="flex flex-col gap-3 border border-line bg-cell px-4 py-4">
      <Hud tone="ember" as="span"><Icon aria-hidden className="size-3" />{title}</Hud>
      <p className="text-sm leading-relaxed text-muted">{lead}</p>
      {film && (
        <FilmPlayer thumb film={{ h264: film.file, av1: film.av1, width: film.width, height: film.height }} poster={film.poster}
          title={title} duration={film.duration} labels={{ watch: s.watch, close: t.project.chat.close }} />
      )}
      {href && (
        <Link href={href} className="hud flex w-fit items-center gap-1.5 text-ember-400 hover:underline">
          {s.open}<ArrowUpRight aria-hidden className="size-3" />
        </Link>
      )}
    </div>
  );
}
