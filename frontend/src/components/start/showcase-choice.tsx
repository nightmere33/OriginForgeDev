"use client";

import { EyeOff, Sparkles } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * Once it's live: show the project in the portfolio, or keep it
 * confidential. Two cards, one native radio each (keyboard and screen
 * readers get a real radio group). It sets the contract's portfolio clause
 * and whether a case study is drafted at launch.
 */
export function ShowcaseChoice({ s, confidential, onChange }: { s: Dictionary["start"]["showcase"]; confidential: boolean; onChange: (confidential: boolean) => void }) {
  const options = [
    { value: false, icon: Sparkles, title: s.show, help: s.showHelp },
    { value: true, icon: EyeOff, title: s.keep, help: s.keepHelp },
  ];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="hud mb-3 text-muted">{s.title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const on = confidential === o.value;
          return (
            <label key={String(o.value)}
              className={cn(
                "group/opt flex cursor-pointer gap-4 border px-5 py-4 transition-[border-color,background-color,box-shadow] duration-[var(--dur-micro)]",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ember-400",
                on ? "border-ember-400 bg-ember-500/[0.06] shadow-[inset_0_0_0_1px_var(--ember-400)]" : "border-line bg-cell hover:border-line-strong",
              )}>
              <input type="radio" name="showcase" className="sr-only" checked={on} onChange={() => onChange(o.value)} />
              <o.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0 transition-colors", on ? "text-ember-400" : "text-faint group-hover/opt:text-muted")} />
              <span className="flex flex-col gap-1">
                <span className={cn("text-sm", on ? "text-ink-strong" : "text-ink")}>{o.title}</span>
                <span className="text-sm leading-relaxed text-faint">{o.help}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
