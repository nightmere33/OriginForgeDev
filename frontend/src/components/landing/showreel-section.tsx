"use client";

import { ForgeVideo } from "@/components/media/forge-video";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { Accented, Hud } from "@/components/ui/hud";
import { Button } from "@/components/ui/button";
import { SectionEyebrow, SectionShell } from "@/components/ui/section-shell";
import ReelPlate from "@/components/media/reel-plate";
import { pickVideo } from "@/lib/video";

export type Reel = { file: string; av1?: string | null; poster: string; width: number; height: number };

/**
 * 04 / Showreel: the studio's own launch film in a phone, played with sound
 * only when asked (never autoplay with audio). Native controls appear once
 * it plays, so seeking and full screen work for everyone.
 */
export default function ShowreelSection({ t, reel }: { t: Dictionary; reel: Reel }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  // Chosen on mount, loaded on play (preload="none"): the tap can then call
  // play() at once, which iOS requires for sound.
  const [src, setSrc] = useState(reel.file);
  useEffect(() => {
    let alive = true;
    pickVideo({ h264: reel.file, av1: reel.av1, width: reel.width, height: reel.height }).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [reel.file, reel.av1, reel.width, reel.height]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      v.muted = muted;
      v.play().catch(() => {});
      setStarted(true);
    } else {
      v.pause();
    }
  };

  return (
    <SectionShell id="showreel" ruler={t.reel.label}>
      <SectionEyebrow index={t.reel.index} label={t.reel.label} annotation={t.reel.annotation} />
      <div className="grid lg:grid-cols-2">
        <div className="flex flex-col justify-center px-6 pb-10 pt-[var(--chapter)] md:px-10 lg:pb-[var(--chapter)]">
          <h2 data-reveal className="text-h2 tracking-[-0.035em] text-ink-strong">
            <Accented parts={t.reel.title} />
          </h2>
          <p data-reveal className="mt-5 max-w-md text-lg leading-relaxed text-muted">
            {t.reel.lead}
          </p>
          <div data-reveal className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={toggle} aria-pressed={playing}>
              {playing ? <Pause aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />}
              {playing ? t.reel.pause : t.reel.play}
            </Button>
            {started && (
              <Button
                variant="secondary"
                onClick={() => {
                  const v = video.current;
                  if (!v) return;
                  v.muted = !v.muted;
                  setMuted(v.muted);
                }}
              >
                {muted ? <VolumeX aria-hidden className="size-3.5" /> : <Volume2 aria-hidden className="size-3.5" />}
                {muted ? t.reel.unmute : t.reel.mute}
              </Button>
            )}
          </div>
          <div data-reveal className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            <Hud tone="faint">65 s</Hud>
            <Hud tone="faint">9:16</Hud>
            <Hud tone="faint">three.js · Whisper · ffmpeg</Hud>
          </div>
        </div>
        <div className="relative aspect-[4/5] border-t border-line lg:aspect-auto lg:h-[min(46rem,calc(100svh-6rem))] lg:self-center lg:border-l lg:border-t-0">
          <ReelPlate>
            <ForgeVideo
              ref={video}
              className="h-full w-full"
              videoClassName="object-cover"
              src={src}
              poster={reel.poster}
              width={reel.width}
              height={reel.height}
              preload="none"
              playsInline
              showControls={started}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
              aria-label={t.reel.label}
            />
            {/* Before the first play, the poster itself is the play button. */}
            {!started && (
              <button
                type="button"
                onClick={toggle}
                aria-label={t.reel.play}
                className="group/play absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-transparent to-transparent pb-[9%]"
              >
                {/* Low on the poster, so the film's title card stays readable. */}
                <span className="flex h-12 items-center gap-3 bg-ember-500 pl-4 pr-5 font-mono text-hud font-bold uppercase tracking-[0.12em] text-on-ember shadow-[0_18px_48px_-18px_var(--ember-500)] transition-transform duration-[var(--dur-standard)] ease-[var(--ease-out)] group-hover/play:-translate-y-0.5 group-active/play:translate-y-px">
                  <Play aria-hidden className="size-4" fill="currentColor" />
                  {t.reel.playShort}
                </span>
              </button>
            )}
          </ReelPlate>
          <span aria-hidden className="tick left-3 top-3 opacity-60" />
          <span aria-hidden className="tick bottom-3 right-3 opacity-60" />
        </div>
      </div>
    </SectionShell>
  );
}
