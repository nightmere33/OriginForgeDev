/**
 * The master intro clock (DESIGN.md §6). One number of seconds that every
 * intro participant reads from its own frame loop, so the choreography stays
 * in sync without a shared timeline object. The conductor advances it; input
 * fast-forwards it; returning visitors play it faster.
 */
export const BEATS = {
  mark: 0,
  letters: 0.35,
  nav: 0.7,
  galaxy: 1,
  copy: 1.05,
  end: 2.8,
} as const;

/** How long the word takes to form out of the mark, from BEATS.letters. */
export const WORD_DUR = 0.85;

export const RETURN_SPEED = 2.2;
export const FAST_FORWARD_SPEED = 6;
export const SEEN_KEY = "of:intro-seen";

export const introClock = {
  t: 0,
  speed: 1,
  done: false,
};

type Listener = () => void;
const doneListeners = new Set<Listener>();

export function onIntroDone(fn: Listener): () => void {
  if (introClock.done) {
    fn();
    return () => {};
  }
  doneListeners.add(fn);
  return () => doneListeners.delete(fn);
}

export function finishIntro() {
  if (introClock.done) return;
  introClock.done = true;
  introClock.t = Math.max(introClock.t, BEATS.end);
  doneListeners.forEach((fn) => fn());
  doneListeners.clear();
}

// Whether the galaxy joins the intro: the clock waits for its first frame
// (up to a cap, intro-conductor) so the cards pour out on their beat, as on
// getartcraft.com, instead of landing after the intro has ended.
let galaxy: "pending" | "ready" | "none" = "pending";
const galaxyListeners = new Set<Listener>();

/** The galaxy loader's verdict: its canvas is up, or it won't run here. */
export function settleGalaxy(state: "ready" | "none") {
  if (galaxy !== "pending") return;
  galaxy = state;
  galaxyListeners.forEach((fn) => fn());
  galaxyListeners.clear();
}

export function onGalaxySettled(fn: Listener): () => void {
  if (galaxy !== "pending") {
    fn();
    return () => {};
  }
  galaxyListeners.add(fn);
  return () => galaxyListeners.delete(fn);
}

/** Resolves when the clock passes `beat` (immediately if already there). */
export function atBeat(beat: number, fn: Listener, ticker: { add(cb: () => void): void; remove(cb: () => void): void }) {
  if (introClock.t >= beat) {
    fn();
    return () => {};
  }
  const check = () => {
    if (introClock.t >= beat) {
      ticker.remove(check);
      fn();
    }
  };
  ticker.add(check);
  return () => ticker.remove(check);
}
