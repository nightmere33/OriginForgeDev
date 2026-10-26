import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import Parallax from "./parallax";

/**
 * A film shown as a lit plate on a sunken stage (DESIGN.md §5): 9:16 for the
 * product ads, or the media's own `ratio` (16:9 screen captures). The plate
 * always has the clip's aspect, so nothing is cropped, and it carries no
 * device bezel: the films already contain their own phones and laptops.
 *
 * The plate is sized from the stage with container units: as large as fits,
 * whatever the cell's shape. `fill` is the share of the stage height it may
 * take (less when a caption sits below).
 */
export default function ReelPlate({
  children, accent, label, depth = 0, shared, ratio = 9 / 16, className, plateClassName,
}: {
  children: ReactNode;
  /** Project tint for the underglow and the plate's halo. */
  accent?: string;
  /** Optional HUD caption under the plate (e.g. the product name). */
  label?: string;
  /** Scroll parallax for the plate (see Parallax); 0 keeps it still. */
  depth?: number;
  /** Several plates on one stage: no own backdrop, and glows may overlap. */
  shared?: boolean;
  /** Width / height of the media: 9:16 films by default, 16:9 for screen captures. */
  ratio?: number;
  className?: string;
  plateClassName?: string;
}) {
  return (
    <div
      className={cn("relative flex h-full w-full items-center justify-center", !shared && "overflow-hidden bg-bg-sunken", className)}
      style={{ containerType: "size", "--reel-accent": accent || "var(--ember-500)" } as CSSProperties}
    >
      {/* Stage light: the accent rising from the floor, an ember haze under it. */}
      <div aria-hidden className="absolute inset-x-[8%] bottom-[-38%] h-[78%] rounded-[50%] opacity-55 blur-3xl [background:radial-gradient(closest-side,var(--reel-accent),transparent)]" />
      {!shared && <div aria-hidden className="absolute inset-0 [background:radial-gradient(120%_80%_at_50%_120%,color-mix(in_srgb,var(--ember-500)_18%,var(--bg)),transparent_60%)]" />}

      <Parallax depth={depth} className="relative flex h-full items-center justify-center">
        <figure
          style={{ aspectRatio: String(ratio), width: `min(${ratio > 1 ? 88 : 84}cqw, ${label ? 76 : 86}cqh * ${ratio})` }}
          className={cn("relative m-0 transition-transform duration-700 ease-[var(--ease-out)] group-hover/cell:-translate-y-1.5", plateClassName)}>
          <div className="absolute inset-0 overflow-hidden border border-line-strong bg-steel-990 shadow-[0_36px_90px_-36px_var(--reel-accent)] transition-shadow duration-700 group-hover/cell:shadow-[0_44px_110px_-30px_var(--reel-accent)]">
            {children}
            {/* A faint glass edge so light footage still reads as a plate on black. */}
            <span aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05),inset_0_1px_0_rgb(255_255_255/0.08)]" />
          </div>
          {/* Registration marks on the plate's corners: the instrument language. */}
          <span aria-hidden className="tick -left-[6px] -top-[6px]" />
          <span aria-hidden className="tick -right-[6px] -top-[6px]" />
          <span aria-hidden className="tick -bottom-[6px] -left-[6px]" />
          <span aria-hidden className="tick -bottom-[6px] -right-[6px]" />
          {label && (
            <figcaption className="hud absolute inset-x-0 top-full mt-3 truncate text-center text-faint">{label}</figcaption>
          )}
        </figure>
      </Parallax>
    </div>
  );
}
