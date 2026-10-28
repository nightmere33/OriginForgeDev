"use client";

import { useSyncExternalStore } from "react";

/**
 * Two short tones for the conversation, synthesized (no audio files): a
 * soft rising "tick" when a message leaves, a two-note chime when one
 * arrives. Quiet by design (peak gain 0.06), muted with one switch that the
 * browser remembers. Browsers only allow sound after the visitor has
 * interacted with the page; until then the tones are skipped, silently.
 */
const KEY = "of:chat-sound";
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;

function enabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode: the switch still works for this page.
  }
  listeners.forEach((l) => l());
}

export function useSound(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    enabled,
    () => true,
  );
  return [on, setSound];
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  return ctx.state === "running" ? ctx : null;
}

function tone(freqs: [number, number][], length: number) {
  if (!enabled()) return;
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const [freq, at] of freqs) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + at);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.06, now + at + length);
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.06, now + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + length);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + at);
    osc.stop(now + at + length + 0.02);
  }
}

export const playSent = () => tone([[740, 0]], 0.09);
export const playReceived = () => tone([[660, 0], [880, 0.085]], 0.16);
