import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The structural frame shared by every chapter (DESIGN.md §5): a full-bleed
 * top rule, a 1280px railed column, and half-ticks where the rails meet the
 * rule. The rule draws and the ticks pop on first entry (RevealManager).
 * `ruler` registers the section with the scroll instrument.
 */
export function SectionShell({
  id, ruler, children, className, ticks = true,
}: {
  id?: string;
  ruler?: string;
  children: ReactNode;
  className?: string;
  ticks?: boolean;
}) {
  return (
    <section id={id} data-ruler={ruler} data-choreo className={cn("relative", className)}>
      <span aria-hidden data-draw-rule className="absolute inset-x-0 top-0 h-px bg-line" />
      <div className="relative mx-auto max-w-[1280px] border-x border-line">
        {ticks && (
          <>
            <span aria-hidden data-draw-tick className="tick tick-half -left-1.5 -top-[5px] z-[31]" />
            <span aria-hidden data-draw-tick className="tick tick-half -right-1.5 -top-[5px] z-[31]" />
          </>
        )}
        {children}
      </div>
    </section>
  );
}

/** Sticky frosted index band: "01 / Selected work" … annotation. */
export function SectionEyebrow({ index, label, annotation }: { index: string; label: string; annotation?: string }) {
  return (
    <div data-draw-eyebrow className="frost sticky top-[var(--nav-h)] z-30 border-y border-line">
      <div className="flex items-center justify-between gap-4 px-6 py-3 md:px-10">
        <p className="hud text-muted">
          <span className="text-faint">{index}</span>
          <span aria-hidden className="mx-2 text-faint">
            /
          </span>
          {/* A label, not a sentence: pages that reuse their heading ("Your projects.") lose its full stop. */}
          {label.replace(/\.$/, "")}
        </p>
        {annotation && <p className="hud hidden text-faint sm:block">{annotation}</p>}
      </div>
    </div>
  );
}

/** Chapter heading block: H2 (2-3 lines max) + lead, with chapter spacing above. */
export function SectionHeading({ title, lead, children }: { title: ReactNode; lead?: string; children?: ReactNode }) {
  return (
    <div className="px-6 pb-14 pt-[var(--chapter)] md:px-10 md:pb-20">
      <h2 data-reveal className="max-w-5xl text-h2 tracking-[-0.035em] text-ink-strong">
        {title}
      </h2>
      {lead && (
        <p data-reveal className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          {lead}
        </p>
      )}
      {children}
    </div>
  );
}
