"use client";

import { useEffect } from "react";
import { gsap } from "./gsap";
import { BEATS, FAST_FORWARD_SPEED, RETURN_SPEED, SEEN_KEY, finishIntro, introClock, onGalaxySettled } from "./intro";

// The pre-paint failsafe shows the page this many ms after navigation
// (globals.css, intro-failsafe); scripts that arrive later find it shown,
// and replaying the intro would hide it again.
const FAILSAFE_MS = 8000;
// The longest the dark stage waits for the galaxy's first frame.
const GALAXY_WAIT_MS = 2500;

/**
 * Advances the intro clock. Every participant (nav, mark, letters, copy,
 * galaxy) animates itself from its own component when the clock passes its
 * beat; nothing here touches another component's DOM, so nothing can run
 * before that component has hydrated.
 *
 * A first visit on a slow connection plays the whole intro too: the stage
 * stays dark until the scripts are in, then waits briefly for the galaxy.
 */
export default function IntroConductor() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Only the home page plays the intro; every other page opens settled.
    const onHome = /^\/(en|fr)\/?$/.test(location.pathname);
    const late = performance.now() > FAILSAFE_MS - 500;
    if (reduced || !onHome || late) {
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

    let started = false;
    let cap = 0;
    let stopWaiting = () => {};
    const start = () => {
      if (started) return;
      started = true;
      clearTimeout(cap);
      stopWaiting();
      // From here the intro's own clock owns the hidden elements; the failsafe
      // restarts with room for the whole intro (globals.css).
      root.dataset.intro = "run";
      events.forEach((e) => addEventListener(e, fastForward, { passive: true }));
      gsap.ticker.add(tick);
    };
    // Never past the failsafe: the clock must own the stage before CSS shows it.
    cap = window.setTimeout(start, Math.min(GALAXY_WAIT_MS, FAILSAFE_MS - 500 - performance.now()));
    stopWaiting = onGalaxySettled(start);

    return () => {
      clearTimeout(cap);
      stopWaiting();
      gsap.ticker.remove(tick);
      events.forEach((e) => removeEventListener(e, fastForward));
      finishIntro();
      delete root.dataset.intro;
    };
  }, []);

  return null;
}
