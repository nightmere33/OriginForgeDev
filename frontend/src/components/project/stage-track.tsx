"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { STAGES, type Stage } from "@/lib/lifecycle";
import { cn } from "@/lib/cn";
import type { T } from "./shared";

/**
 * The 10-stage journey as an instrument scale: a rail across the top (ember
 * where the project has been, a slow ember light on the current stage, as on
 * the payment bar), then each stage's number with a tick or a live dot, and
 * its name on a line of its own. Scrolls sideways on phones, current stage
 * in view.
 */
export function StageTrack({ t, stage, stopped }: { t: T; stage: Stage; stopped?: boolean }) {
  const at = STAGES.indexOf(stage);
  const list = useRef<HTMLOListElement>(null);
  // Phones: bring the current stage to the middle of the strip, sideways only.
  useEffect(() => {
    const ol = list.current;
    const li = ol?.children[at] as HTMLElement | undefined;
    if (ol && li && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = li.offsetLeft - (ol.clientWidth - li.offsetWidth) / 2;
  }, [at]);
  return (
    <div className="border-t border-line">
      <ol ref={list} className="flex snap-x overflow-x-auto [scrollbar-width:none] xl:grid xl:grid-cols-10 xl:overflow-visible">
        {STAGES.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          return (
            <li
              key={s}
              aria-current={state === "now" ? "step" : undefined}
              className={cn(
                "relative flex min-w-[9.5rem] shrink-0 snap-center flex-col gap-3 border-r border-line px-5 pb-6 pt-6 last:border-r-0 xl:min-w-0 xl:px-4",
                state === "now" && "bg-cell",
              )}
            >
              <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5",
                state === "done" ? "bg-ember-500" : state === "now" ? (stopped ? "bg-err" : "pay-due") : "bg-line")} />
              <span className="flex items-center justify-between gap-2">
                <span className={cn("hud tabular-nums", state === "now" ? (stopped ? "text-err" : "text-ember-400") : state === "done" ? "text-muted" : "text-faint")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {state === "done" ? <Check aria-hidden className="size-3.5 text-ember-400" />
                  : state === "now" && !stopped ? <span aria-hidden className="size-1.5 bg-ember-500" style={{ animation: "live-pulse 2.4s ease-in-out infinite" }} /> : null}
              </span>
              <span className={cn("text-sm leading-snug", state === "now" ? "text-ink-strong" : state === "done" ? "text-muted" : "text-faint")}>
                {t.project.stages[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
