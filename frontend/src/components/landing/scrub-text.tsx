"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/motion/gsap";

/**
 * Scrubbing Text Reveal (DESIGN.md §6): each word's opacity runs 0.15 → 1 in
 * reading order as the paragraph crosses the viewport. The dimmed start state
 * is applied only once the paragraph enters from the bottom edge
 * (immediateRender: false), so the text is solid until then — for readers who
 * never scroll this far and for contrast audits. Reduced motion: always solid.
 */
export default function ScrubText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useGSAP(() => {
    const words = gsap.utils.toArray<HTMLElement>("[data-word]", ref.current);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(words, { opacity: 0.15 }, {
        opacity: 1, ease: "none", stagger: 0.1, immediateRender: false,
        scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom 45%", scrub: true },
      });
    });
    return () => mm.revert();
  }, { scope: ref });

  return (
    <p ref={ref} className={className}>
      {text.split(" ").map((word, i) => (
        <span key={i} data-word className="inline">
          {word}{" "}
        </span>
      ))}
    </p>
  );
}
