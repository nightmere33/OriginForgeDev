import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "muted" | "faint" | "ink" | "ember";

const tones: Record<Tone, string> = {
  muted: "text-muted",
  faint: "text-faint",
  ink: "text-ink",
  ember: "text-ember-400",
};

/** Mono uppercase micro-label: the one voice for every annotation. */
export function Hud({
  as: Tag = "p", tone = "muted", dot, live, className, children,
}: {
  as?: ElementType;
  tone?: Tone;
  /** A 6px square before the label; `live` pulses it (status only). */
  dot?: boolean;
  live?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("hud inline-flex items-center gap-2", tones[tone], className)}>
      {dot && (
        <span
          aria-hidden
          className="inline-block size-1.5 shrink-0 bg-ember-500"
          style={live ? { animation: "live-pulse 2.4s ease-in-out infinite" } : undefined}
        />
      )}
      {children}
    </Tag>
  );
}

/** Headline with exactly one serif contrast phrase: [before, accent, after?]. */
export function Accented({ parts }: { parts: string[] }) {
  const [before, accent, after] = parts;
  return (
    <>
      {before}
      <span className="serif-accent">{accent}</span>
      {after}
    </>
  );
}
