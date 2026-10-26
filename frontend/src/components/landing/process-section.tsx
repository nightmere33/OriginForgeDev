"use client";

import { useRef, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { Accented, Hud } from "@/components/ui/hud";
import { SectionEyebrow, SectionShell } from "@/components/ui/section-shell";
import { gsap, ScrollTrigger, useGSAP } from "@/motion/gsap";
import { cn } from "@/lib/cn";

/**
 * 03 / Process — Pinned Split (DESIGN.md §6). On lg+ the title column is
 * sticky while the eight lifecycle steps scroll; the step nearest the centre
 * is lit and the counter and progress hairline follow it. Sticky (not a GSAP
 * pin) keeps layout native and cheap; GSAP only reads progress. Below lg it
 * is a plain ordered list.
 */
export default function ProcessSection({ t }: { t: Dictionary }) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);
  const steps = t.process.steps;

  useGSAP(() => {
    const el = root.current;
    if (!el) return;
    const items = gsap.utils.toArray<HTMLElement>("[data-step]", el);
    items.forEach((item, i) => {
      ScrollTrigger.create({
        trigger: item,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (self) => self.isActive && setActive(i),
      });
    });
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      if (bar.current) {
        gsap.fromTo(bar.current, { scaleY: 0 }, {
          scaleY: 1, ease: "none",
          scrollTrigger: { trigger: el.querySelector("[data-steps]"), start: "top 55%", end: "bottom 55%", scrub: true },
        });
      }
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <SectionShell id="process" ruler={t.process.label}>
      <SectionEyebrow index={t.process.index} label={t.process.label} annotation={t.process.annotation} />
      <div ref={root} className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="border-line px-6 pb-10 pt-[var(--chapter)] md:px-10 lg:border-r lg:pb-[var(--chapter)]">
          <div className="lg:sticky lg:top-[calc(var(--nav-h)+5rem)]">
            <h2 data-reveal className="text-h2 tracking-[-0.035em] text-ink-strong">
              <Accented parts={t.process.title} />
            </h2>
            <p data-reveal className="mt-5 max-w-md text-lg leading-relaxed text-muted">
              {t.process.lead}
            </p>
            <div aria-hidden className="mt-10 hidden items-end gap-4 lg:flex">
              <span className="font-display text-mega leading-none tracking-[-0.04em] text-ink-strong [font-stretch:125%] tabular-nums">
                {String(active + 1).padStart(2, "0")}
              </span>
              <span className="hud pb-3 text-faint">/ {String(steps.length).padStart(2, "0")}</span>
            </div>
            <p aria-hidden className="hud mt-3 hidden text-ember-400 lg:block">
              {steps[active]?.title}
            </p>
          </div>
        </div>

        <ol data-steps className="relative lg:py-[var(--chapter)]">
          <span aria-hidden className="absolute bottom-0 left-0 top-0 hidden w-px bg-line lg:block" />
          <span ref={bar} aria-hidden className="absolute left-0 top-0 hidden h-full w-px origin-top bg-ember-500 lg:block" />
          {steps.map((step, i) => (
            <li
              key={step.title}
              data-step
              className={cn(
                "border-t border-line px-6 py-8 transition-opacity duration-[var(--dur-standard)] md:px-10 lg:min-h-[38vh] lg:border-t-0 lg:py-10",
                // 70% keeps dimmed body text above 4.5:1 (DESIGN.md §8).
                i === active ? "lg:opacity-100" : "lg:opacity-70",
              )}
            >
              <Hud tone={i === active ? "ember" : "faint"} className="lg:hidden">
                {String(i + 1).padStart(2, "0")}
              </Hud>
              <Hud tone={i === active ? "ember" : "faint"} className="hidden lg:inline-flex">
                {String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
              </Hud>
              <h3 className="mt-3 text-h3 tracking-[-0.02em] text-ink-strong">{step.title}</h3>
              <p className="mt-2 max-w-lg leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}
