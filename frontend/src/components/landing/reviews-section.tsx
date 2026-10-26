import { BadgeCheck } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import type { PublicReview, ReviewSummary } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Accented, Hud } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";
import { Bar, CountUp, Stars } from "@/components/reviews/stars";

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

/**
 * Verified reviews (backend/reviews): only clients of a delivered project can
 * write one, and each is approved before it shows. Hidden until there is one.
 * The score counts up, the gold fills and glints, the bars grow, the cards
 * rise one by one (all progressive: the server HTML is the final state).
 */
export default function ReviewsSection({
  lang, t, summary, items, index,
}: { lang: Locale; t: Dictionary; summary: ReviewSummary; items: PublicReview[]; index: string }) {
  if (!summary.count || !items.length) return null;
  const r = t.reviews;
  const avg = summary.average ?? 0;
  const date = new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" });
  return (
    <SectionShell id="reviews" ruler={r.label}>
      <SectionEyebrow index={index} label={r.label} annotation={r.annotation} />
      <SectionHeading title={<Accented parts={r.title} />} lead={r.lead} />
      <div className="grid border-t border-line lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <aside className="border-b border-line px-6 py-10 md:px-10 lg:border-b-0 lg:border-r lg:py-14">
          <div data-reveal className="lg:sticky lg:top-[calc(var(--nav-h)+5rem)]">
            <p className="flex items-start font-display leading-none tracking-[-0.05em] text-ink-strong [font-stretch:125%] [font-weight:620]">
              <CountUp value={avg} lang={lang} className="text-[clamp(4.5rem,9vw,8rem)]" />
              <span className="ml-2 mt-[0.4em] text-2xl text-faint">/5</span>
            </p>
            <Stars value={avg} label={fill(r.averageLabel, { n: avg.toFixed(1) })} className="mt-6 h-7" />
            <Hud tone="muted" className="mt-5">{fill(summary.count === 1 ? r.basedOnOne : r.basedOn, { n: summary.count })}</Hud>
            <ul className="mt-8 flex flex-col gap-3" aria-label={r.breakdown}>
              {(["5", "4", "3", "2", "1"] as const).map((k, i) => {
                const n = summary.distribution[k] ?? 0;
                return (
                  <li key={k} className="grid grid-cols-[2.25rem_1fr_2rem] items-center gap-3">
                    <span className="hud text-muted">{k} ★</span>
                    <Bar share={n / summary.count} delay={0.25 + i * 0.08} />
                    <span className="hud text-right tabular-nums text-faint">{n}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-10 flex gap-3 text-sm leading-relaxed text-faint">
              <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ember-400" />
              {r.verifiedNote}
            </p>
          </div>
        </aside>

        <ul data-reveal-group className="grid md:grid-cols-2">
          {items.map((rv, i) => (
            <li
              key={rv.id}
              data-reveal
              // Hairlines are each card's own borders (nothing shows through while a card waits
              // to reveal); an odd last card spans the row, so the grid never has an empty cell.
              className={cn(
                "flex flex-col gap-6 border-b border-line p-6 md:p-8 md:odd:border-r",
                items.length % 2 === 1 && i === items.length - 1 && "md:col-span-2 md:odd:border-r-0",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <Stars value={rv.rating} label={fill(r.ratingLabel, { n: rv.rating })} />
                {rv.published_at && <Hud tone="faint">{date.format(new Date(rv.published_at))}</Hud>}
              </div>
              <blockquote lang={rv.language} className="text-lg leading-relaxed text-ink">
                <span aria-hidden className="mr-1 font-serif text-3xl leading-none text-ember-400">&ldquo;</span>
                {rv.body}
              </blockquote>
              {rv.reply && (
                <div className="border-l border-ember-400/60 pl-4">
                  <Hud tone="faint">{r.replyFrom}</Hud>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{rv.reply}</p>
                </div>
              )}
              <footer className="mt-auto flex items-center gap-3 border-t border-line pt-5">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center border border-line-strong font-mono text-sm text-ink">{initials(rv.display_name)}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-ink-strong">{rv.display_name}</span>
                  <span className="truncate text-sm text-faint">{[rv.display_role, rv.project_label].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="hud ml-auto inline-flex shrink-0 items-center gap-1.5 text-ok">
                  <BadgeCheck aria-hidden className="size-3.5" />
                  {r.verified}
                </span>
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
