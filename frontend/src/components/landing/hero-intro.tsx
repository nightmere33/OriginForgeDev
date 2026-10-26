"use client";

import { useEffect } from "react";
import { gsap } from "@/motion/gsap";
import { BEATS, atBeat, introClock } from "@/motion/intro";

/**
 * The hero's own intro beats (DESIGN.md §6): the OF mark ignites (an ember
 * bloom that cools to steel), then the wordmark letters rise one by one with
 * a single specular sweep. Elements start hidden by the pre-paint
 * `data-intro-hide` rule; with no intro they simply stay visible.
 */
export default function HeroIntro() {
  useEffect(() => {
    if (introClock.done) return;
    const mark = document.querySelector<HTMLElement>("[data-hero-mark]");
    const glow = document.querySelector<HTMLElement>("[data-hero-glow]");
    const letters = gsap.utils.toArray<HTMLElement>("[data-wm-letter]");
    // The letters' parent carries the steel fill and its sheen layer.
    const word = letters[0]?.parentElement ?? null;

    const tl = gsap.timeline({ paused: true });
    if (mark) tl.fromTo(mark, { autoAlpha: 0, scale: 0.86, filter: "blur(10px) brightness(2.2)" }, {
      autoAlpha: 1, scale: 1, filter: "blur(0px) brightness(1)", duration: 1.1, ease: "power3.out", clearProps: "filter,transform",
    }, BEATS.mark);
    if (glow) tl.fromTo(glow, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 1.6, ease: "power2.out" }, BEATS.mark);
    if (letters.length) tl.fromTo(letters, { autoAlpha: 0, yPercent: 40, filter: "blur(6px)" }, {
      autoAlpha: 1, yPercent: 0, filter: "blur(0px)", duration: 0.8, ease: "power3.out", stagger: 0.04, clearProps: "filter,transform",
    }, BEATS.letters);
    if (word) {
      // One sheen glides through the glyphs on a gentle ease, fading in as it
      // enters and out as it leaves, so it never pops on or off.
      const at = BEATS.letters + 0.35;
      tl.fromTo(word, { "--sheen-x": "-40%" }, { "--sheen-x": "140%", duration: 1.8, ease: "sine.inOut" }, at);
      tl.fromTo(word, { "--sheen-a": 0 }, { "--sheen-a": 1, duration: 0.6, ease: "sine.out" }, at);
      tl.to(word, { "--sheen-a": 0, duration: 0.7, ease: "sine.in" }, at + 1.1);
    }

    // Drive the timeline from the shared intro clock, so input fast-forward
    // and return-visit speed apply here too.
    const sync = () => {
      tl.time(Math.min(introClock.t, tl.duration()));
      if (introClock.done || introClock.t >= tl.duration()) gsap.ticker.remove(sync);
    };
    gsap.ticker.add(sync);
    const stop = atBeat(BEATS.end, () => tl.progress(1), gsap.ticker);
    return () => {
      gsap.ticker.remove(sync);
      stop();
      tl.progress(1).kill();
    };
  }, []);

  return null;
}
