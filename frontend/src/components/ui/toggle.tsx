import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * An on/off switch (asset pack): a native checkbox with role="switch", drawn
 * as a hard-edged track whose knob slides across and lights ember when on.
 * Keyboard, forms and screen readers get the real input.
 */
export function Toggle({ label, className, ...props }: { label: string } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={cn("group/toggle inline-flex w-fit cursor-pointer items-center gap-3 text-sm text-muted has-[:checked]:text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50", className)}>
      <input type="checkbox" role="switch" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 shrink-0 border border-line-strong bg-cell transition-colors duration-[var(--dur-micro)]",
          "peer-checked:border-ember-400 peer-checked:bg-ember-500/15 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ember-400",
          "after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:bg-steel-450 after:transition-[transform,background-color] after:duration-300 after:ease-[cubic-bezier(0.22,1,0.36,1)]",
          "peer-checked:after:translate-x-4 peer-checked:after:bg-ember-400 group-hover/toggle:after:bg-ink peer-checked:group-hover/toggle:after:bg-ember-400",
        )}
      />
      {label}
    </label>
  );
}
