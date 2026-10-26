"use client";

import { useEffect } from "react";
import { gsap } from "./gsap";
import { BEATS, FAST_FORWARD_SPEED, RETURN_SPEED, SEEN_KEY, finishIntro, introClock } from "./intro";

/**
 * Advances the intro clock. Every participant (nav, mark, letters, copy,
 * galaxy) animates itself from its own component when the clock passes its
 * beat; nothing here touches another component's DOM, so nothing can run
 * before that component has hydrated.
 */
export default function IntroConductor() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Only the home page plays the intro; every other page opens settled.
    const onHome = /^\/(en|fr)\/?$/.test(location.pathname);
    if (reduced || !onHome) {
      finishIntro();
      delete root.dataset.intro;
      return;
    }

    let returning = false;
    try {
      returning = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage blocked: treat as a first visit.
    }
    introClock.t = 0;
    introClock.done = false;
    introClock.speed = returning ? RETURN_SPEED : 1;

    const fastForward = () => {
      introClock.speed = Math.max(introClock.speed, FAST_FORWARD_SPEED);
    };
    const events = ["wheel", "pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => addEventListener(e, fastForward, { passive: true }));

    const tick = (_time: number, deltaMs: number) => {
      introClock.t += (Math.min(deltaMs, 100) / 1000) * introClock.speed;
      if (introClock.t >= BEATS.end) {
        gsap.ticker.remove(tick);
        events.forEach((e) => removeEventListener(e, fastForward));
        delete root.dataset.intro;
        try {
          localStorage.setItem(SEEN_KEY, "1");
        } catch {
          // Storage blocked: they get the full intro again next time.
        }
        finishIntro();
      }
    };
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      events.forEach((e) => removeEventListener(e, fastForward));
      finishIntro();
      delete root.dataset.intro;
    };
  }, []);

  return null;
}
