"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";

const BARS = 40;
const RATES = [1, 1.5, 2] as const;
const peaksCache = new Map<string, Promise<number[]>>();

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A stand-in shape when the browser can't decode the file (a WebM note on old Safari): steady, never random per render. */
function fallbackPeaks(seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const wave = 0.55 + 0.35 * Math.sin(i / 3.1);
    return Math.max(0.18, Math.min(1, wave * (0.6 + ((h >>> 0) % 1000) / 2500)));
  });
}

/** The note's loudness in BARS slices (RMS, normalised to the loudest), computed once per file. */
function peaksOf(url: string): Promise<number[]> {
  let p = peaksCache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.arrayBuffer();
      const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      const buffer = await new Ctx(1, 44100, 44100).decodeAudioData(data);
      const ch = buffer.getChannelData(0);
      const size = Math.floor(ch.length / BARS) || 1;
      const rms = Array.from({ length: BARS }, (_, i) => {
        let sum = 0;
        for (let j = i * size; j < Math.min(ch.length, (i + 1) * size); j++) sum += ch[j] * ch[j];
        return Math.sqrt(sum / size);
      });
      const max = Math.max(...rms, 1e-4);
      return rms.map((v) => Math.max(0.12, v / max));
    })();
    peaksCache.set(url, p);
  }
  return p;
}

/**
 * A voice note as a waveform: play and pause, click or drag the wave to
 * seek, 1x / 1.5x / 2x. The shape is the note's own loudness, computed when
 * the player comes into view. There is deliberately no download control.
 */
export function VoicePlayer({ src, duration, mine, labels }: {
  src: string; duration: number | null; mine: boolean; labels: { play: string; pause: string; voice: string };
}) {
  const root = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(duration ?? 0);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const dragging = useRef(false);

  // The wave is read only once the note is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      peaksOf(src).then(setPeaks, () => setPeaks(fallbackPeaks(src)));
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  // Smooth progress while playing (timeupdate fires only ~4 times a second).
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const step = () => {
      const a = audio.current;
      if (a && a.duration && !dragging.current) setProgress(a.currentTime / a.duration);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      // One note at a time, like every messenger.
      document.querySelectorAll<HTMLAudioElement>("audio[data-voice]").forEach((x) => x !== a && x.pause());
      a.playbackRate = rate;
      a.play().catch(() => setPlaying(false));
    } else {
      a.pause();
    }
  };

  const seekTo = (e: PointerEvent<HTMLDivElement>) => {
    const a = audio.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setProgress(x);
    if (a && a.duration) a.currentTime = x * a.duration;
  };

  const bars = peaks ?? Array.from({ length: BARS }, () => 0.18);
  const shown = playing || progress > 0 ? progress * length : length;

  return (
    <div ref={root} className="flex w-[17rem] max-w-full items-center gap-3 py-0.5">
      <button type="button" onClick={toggle} aria-label={playing ? labels.pause : labels.play}
        className={cn("flex size-9 shrink-0 items-center justify-center transition-colors duration-[var(--dur-micro)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400",
          mine ? "bg-ember-500 text-on-ember hover:bg-ember-600" : "bg-steel-50 text-steel-950 hover:bg-steel-200")}>
        {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="ml-0.5 size-4" />}
      </button>
      <div role="slider" tabIndex={0} aria-label={labels.voice} aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(progress * length)}
        aria-valuetext={`${clock(progress * length)} / ${clock(length)}`}
        onKeyDown={(e) => {
          const a = audio.current;
          if (!a?.duration || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
          e.preventDefault();
          a.currentTime = Math.min(a.duration, Math.max(0, a.currentTime + (e.key === "ArrowRight" ? 5 : -5)));
          setProgress(a.currentTime / a.duration);
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e);
        }}
        onPointerMove={(e) => dragging.current && seekTo(e)}
        onPointerUp={() => (dragging.current = false)}
        className="flex h-8 min-w-0 flex-1 cursor-pointer touch-none items-center justify-between gap-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400">
        {bars.map((h, i) => (
          <span key={i} aria-hidden
            className={cn("min-w-px max-w-[3px] flex-1 transition-[height,background-color] duration-300 ease-out",
              (i + 0.5) / BARS <= progress ? (mine ? "bg-ember-400" : "bg-ink") : "bg-line-strong")}
            style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </div>
      <span className="flex w-9 shrink-0 flex-col items-end gap-0.5">
        <span className="hud tabular-nums text-muted">{clock(shown)}</span>
        <button type="button" onClick={() => {
          const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
          setRate(next);
          if (audio.current) audio.current.playbackRate = next;
        }} className="hud text-faint hover:text-ink">{rate}x</button>
      </span>
      <audio ref={audio} data-voice src={src} preload="metadata" className="hidden"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
        onContextMenu={(e) => e.preventDefault()} />
    </div>
  );
}
