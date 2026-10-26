"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { STAGES, type Stage } from "@/lib/lifecycle";
import { cn } from "@/lib/cn";
import type { T } from "./shared";

/**
 * The 10-stage journey as an instrument scale: passed stages ticked, the
 * current one in ember. Scrolls sideways on phones, current stage in view.
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
                "relative flex min-w-[8.5rem] shrink-0 snap-center flex-col gap-3 border-r border-line px-4 py-4 last:border-r-0 xl:min-w-0 xl:px-3",
                state === "now" && "bg-cell",
              )}
            >
              <span aria-hidden className={cn("h-px w-full", state === "done" ? "bg-line-strong" : state === "now" ? (stopped ? "bg-err" : "bg-ember-500") : "bg-line")} />
              <span className={cn("hud flex items-start gap-2", state === "now" ? (stopped ? "text-err" : "text-ember-400") : state === "done" ? "text-muted" : "text-faint")}>
                {state === "done" ? <Check aria-hidden className="size-3" /> : <span aria-hidden>{String(i + 1).padStart(2, "0")}</span>}
                <span className="leading-tight">{t.project.stages[s]}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
