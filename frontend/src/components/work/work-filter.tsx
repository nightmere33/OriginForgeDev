"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SPLIT, tearIn, useDecode } from "@/motion/glitch";

function Chip({ label, count, active, onPick }: { label: string; count: number; active: boolean; onPick: () => void }) {
  const { shown, glitching, run } = useDecode(label);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        onPick();
        run();
      }}
      className={cn(
        "hud inline-flex items-center gap-2 border px-3 py-2 transition-colors duration-[var(--dur-micro)]",
        active ? "border-ember-400 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      <span style={glitching ? SPLIT : undefined}>{shown}</span>
      <span className="text-faint">{count}</span>
    </button>
  );
}

/**
 * Category chips over a server-rendered grid. Every cell is in the HTML (so
 * crawlers and no-JS visitors see all work); filtering only toggles `hidden`.
 * The picked chip decodes and the cells that stay tear back in, in order.
 */
export default function WorkFilter({
  categories, allLabel, children,
}: {
  categories: { key: string; label: string; count: number }[];
  allLabel: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState<string>("all");
  const root = useRef<HTMLDivElement>(null);

  const pick = (key: string) => {
    if (key === active) return;
    setActive(key);
    const cells = root.current?.querySelectorAll<HTMLElement>("[data-category]") ?? [];
    let n = 0;
    cells.forEach((cell) => {
      if (key === "all" || cell.dataset.category === key) tearIn(cell, Math.min(n++, 6) * 45);
    });
  };

  return (
    <div ref={root} data-filter={active}>
      <div role="toolbar" aria-label="Filter" className="flex flex-wrap gap-2 border-t border-line px-6 py-4 md:px-10">
        {[{ key: "all", label: allLabel, count: categories.reduce((n, c) => n + c.count, 0) }, ...categories].map((c) => (
          <Chip key={c.key} label={c.label} count={c.count} active={active === c.key} onPick={() => pick(c.key)} />
        ))}
      </div>
      {/* Cells carry data-category; CSS hides the ones that don't match. */}
      <style>{active === "all" ? "" : `[data-filter="${active}"] [data-category]:not([data-category="${active}"]){display:none}`}</style>
      {children}
    </div>
  );
}
