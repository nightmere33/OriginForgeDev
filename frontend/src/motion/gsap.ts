"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export { gsap, ScrollTrigger, useGSAP };

/**
 * DESIGN.md §6: reveals. Factories, never shared objects: GSAP writes into the
 * vars it is given (a timeline's `.to()` stores `parent` on them), so one
 * shared object would chain every later reveal onto that timeline, one after
 * another, and content would appear seconds late.
 */
export const revealFrom = () => ({ autoAlpha: 0, y: 28, filter: "blur(8px)" });
export const revealTo = (extra: gsap.TweenVars = {}): gsap.TweenVars => ({
  autoAlpha: 1,
  y: 0,
  filter: "blur(0px)",
  duration: 0.9,
  ease: "power3.out",
  overwrite: true,
  // A leftover filter keeps text on its own layer and blurs subpixel AA on Windows.
  clearProps: "transform,filter,opacity,visibility",
  ...extra,
});

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

