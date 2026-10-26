"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/motion/gsap";
import { cn } from "@/lib/cn";

/**
 * Image Scale & Fade (DESIGN.md §6): media grows from 0.92 to full size as it
 * enters, then dims as it leaves the top of the screen. Scrub-linked, so it
 * reverses on scroll-back. Reduced motion: static.
 *
 * The dimming is a black layer's opacity, not a CSS filter on the media: a
 * filter repaints the video under it every frame, opacity stays on the GPU.
 */
export default function ScrollMedia({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(el, { scale: 0.92 }, {
        scale: 1, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "top 55%", scrub: 0.4 },
      });
      gsap.fromTo(shade.current, { opacity: 0 }, {
        opacity: 0.65, ease: "none",
        scrollTrigger: { trigger: el, start: "bottom 40%", end: "bottom top", scrub: 0.4 },
      });
    });
    return () => mm.revert();
  }, { scope: ref });
  return (
    <div ref={ref} className={cn("relative", className)} style={{ transformOrigin: "50% 60%" }}>
      {children}
      <div ref={shade} aria-hidden className="pointer-events-none absolute inset-0 bg-black opacity-0" />
    </div>
  );
}
