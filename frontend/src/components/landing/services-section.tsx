import Link from "next/link";
import {
  AppWindow, ArrowRight, Bot, Clapperboard, CreditCard, Gamepad2, Layers, MonitorSmartphone, Smartphone, type LucideIcon,
} from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { Price } from "@/lib/currency";
import type { Service } from "@/lib/types";
import { Accented, Hud } from "@/components/ui/hud";
import { SectionEyebrow, SectionHeading, SectionShell } from "@/components/ui/section-shell";

const ICONS: Record<string, LucideIcon> = {
  layers: Layers,
  "monitor-smartphone": MonitorSmartphone,
  smartphone: Smartphone,
  "credit-card": CreditCard,
  "gamepad-2": Gamepad2,
  "app-window": AppWindow,
  bot: Bot,
  clapperboard: Clapperboard,
};

/**
 * 02 / Services. Six services on a gapless grid: 1 column on phones, 2 on
 * tablets, 3 on desktop (6 divides evenly by all three, so no dead cells).
 * Each cell is a link into the request wizard with the service preselected.
 * Games are taken on request: one line under the grid, not a cell.
 */
export default function ServicesSection({ lang, t, services }: { lang: Locale; t: Dictionary; services: Service[] }) {
  return (
    <SectionShell id="services" ruler={t.services.label}>
      <SectionEyebrow index={t.services.index} label={t.services.label} annotation={t.services.annotation} />
      <SectionHeading title={<Accented parts={t.services.title} />} lead={t.services.lead} />

      <div data-reveal-group className="grid grid-flow-dense gap-px border-t border-line bg-line md:grid-cols-2 lg:grid-cols-3">
        {services.map((service, i) => {
          const Icon = ICONS[service.icon] ?? Layers;
          return (
            <Link
              key={service.slug}
              href={`/${lang}/start?service=${service.slug}`}
              data-reveal="contents"
              className="group/svc relative flex flex-col bg-bg transition-colors duration-[var(--dur-standard)] hover:bg-cell focus-visible:outline-offset-[-2px]"
            >
              {/* Ember rule draws across the top on hover: the cell is a door. */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-ember-500 transition-transform duration-[var(--dur-standard)] ease-out group-hover/svc:scale-x-100"
              />
              <div className="flex items-center justify-between border-b border-line px-6 py-2.5 md:px-8">
                <Hud tone="faint">{String(i + 1).padStart(2, "0")}</Hud>
                <Icon aria-hidden className="size-4 text-ember-400" />
              </div>
              <div className="flex flex-1 flex-col p-6 md:p-8">
                <h3 className="text-h3 tracking-[-0.02em] text-ink-strong">{service.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{service.summary}</p>
                {service.deliverables.length > 0 && (
                  <ul className="mt-6 space-y-2" aria-label={t.services.deliverables}>
                    {service.deliverables.map((d) => (
                      <li key={d} className="flex items-baseline gap-3 text-sm text-muted">
                        <span aria-hidden className="inline-block size-1 shrink-0 translate-y-[-2px] bg-steel-450" />
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-4 md:px-8">
                <div className="flex flex-col gap-1">
                  {service.timeline && (
                    <Hud tone="faint">
                      {t.services.timeline} · {service.timeline}
                    </Hud>
                  )}
                  {service.prices.length ? (
                    // The visitor's currency: set price, or "≈" at the live rate.
                    <Price lang={lang} prices={service.prices} labels={t.services.price} className="hud text-muted" />
                  ) : (
                    <Hud tone="muted">{t.services.onRequest}</Hud>
                  )}
                </div>
                <span className="hud flex items-center gap-2 text-ink">
                  {t.services.cta}
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 text-ember-400 transition-transform duration-[var(--dur-standard)] ease-out group-hover/svc:translate-x-0.5"
                  />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-6 py-5 text-sm text-muted md:px-10">
        <Gamepad2 aria-hidden className="size-4 text-ember-400" />
        {t.services.alsoOnRequest}
        {/* A full-height tap target on phones (the line itself stays compact). */}
        <Link href={`/${lang}/start?service=game`} className="hud -my-3 inline-flex min-h-11 items-center gap-2 text-ink transition-colors hover:text-ember-400">
          {t.services.alsoOnRequestCta}
          <ArrowRight aria-hidden className="size-3.5 text-ember-400" />
        </Link>
      </p>
    </SectionShell>
  );
}
