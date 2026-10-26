"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/motion/gsap";
import { cn } from "@/lib/cn";

/**
 * Scroll depth: the child drifts against the scroll by `depth` × 48px over the
 * time it crosses the screen, so neighbours at different depths separate as
 * you scroll. Transform only, scrubbed; reduced motion leaves it still.
 */
export default function Parallax({ depth, children, className }: { depth: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el || !depth) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(el, { y: depth * 48 }, {
        y: -depth * 48, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 },
      });
    });
    return () => mm.revert();
  }, { scope: ref, dependencies: [depth] });
  return <div ref={ref} className={cn(depth !== 0 && "will-change-transform", className)}>{children}</div>;
}
