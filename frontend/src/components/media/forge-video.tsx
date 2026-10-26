"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentProps, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { useParams } from "next/navigation";
import { Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";

const LABELS = {
  en: { play: "Play", pause: "Pause", mute: "Mute", unmute: "Unmute", fullscreen: "Full screen", exitFullscreen: "Exit full screen", seek: "Seek", player: "Video player" },
  fr: { play: "Lecture", pause: "Pause", mute: "Couper le son", unmute: "Activer le son", fullscreen: "Plein écran", exitFullscreen: "Quitter le plein écran", seek: "Position", player: "Lecteur vidéo" },
};
const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
const IDLE_MS = 2200;

type Props = Omit<ComponentProps<"video">, "controls" | "ref"> & {
  /** The <video> itself, for callers that start playback inside their own gesture. */
  ref?: Ref<HTMLVideoElement>;
  /** The frame (size, aspect); the video fills it. */
  className?: string;
  style?: CSSProperties;
  videoClassName?: string;
  /** Hide the bar (e.g. before a custom first-play button is pressed). */
  showControls?: boolean;
};

/**
 * Our own player: the browser's controls never show, so there is no
 * "Download" item, no picture-in-picture, no casting, no context menu, and
 * full screen wraps the frame (with these controls), not the bare video.
 * This stops casual saving; it cannot stop a determined person with dev
 * tools or a screen recorder, so the files are also served from our own
 * origin only (see deploy/nginx/locations.conf).
 */
export function ForgeVideo({ ref, className, style, videoClassName, showControls = true, onPlay, onPause, onVolumeChange, ...video }: Props) {
  const { lang } = useParams<{ lang?: string }>();
  const l = LABELS[lang === "fr" ? "fr" : "en"];
  const frame = useRef<HTMLDivElement>(null);
  const v = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => v.current as HTMLVideoElement, []);
  const fill = useRef<HTMLDivElement>(null);
  const buffered = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(!!video.muted);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(0);
  const scrubbing = useRef(false);

  // Progress runs per frame without re-rendering React; the clock ticks per second.
  useEffect(() => {
    const el = v.current;
    if (!el) return;
    let raf = 0;
    const paint = () => {
      const d = el.duration || 0;
      if (fill.current) fill.current.style.transform = `scaleX(${d ? el.currentTime / d : 0})`;
      if (buffered.current && d && el.buffered.length) buffered.current.style.transform = `scaleX(${el.buffered.end(el.buffered.length - 1) / d})`;
    };
    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      paint();
    };
    const meta = () => setDuration(el.duration || 0);
    const tick = () => setTime(Math.floor(el.currentTime));
    el.addEventListener("playing", start);
    el.addEventListener("pause", stop);
    el.addEventListener("ended", stop);
    el.addEventListener("seeked", paint);
    el.addEventListener("progress", paint);
    el.addEventListener("loadedmetadata", meta);
    el.addEventListener("durationchange", meta);
    el.addEventListener("timeupdate", tick);
    if (el.readyState >= 1) meta();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("playing", start);
      el.removeEventListener("pause", stop);
      el.removeEventListener("ended", stop);
      el.removeEventListener("seeked", paint);
      el.removeEventListener("progress", paint);
      el.removeEventListener("loadedmetadata", meta);
      el.removeEventListener("durationchange", meta);
      el.removeEventListener("timeupdate", tick);
    };
  }, []);

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // While playing, the bar and cursor step aside after a moment of stillness.
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => !v.current?.paused && !scrubbing.current && setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const toggle = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused || el.ended) el.play().catch(() => {});
    else el.pause();
  };
  const toggleMute = () => {
    const el = v.current;
    if (el) el.muted = !el.muted;
  };
  const toggleFull = () => {
    const el = frame.current;
    const vid = v.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else vid?.webkitEnterFullscreen?.(); // iPhone: the system player (it has no download either)
  };
  const seekTo = (t: number) => {
    const el = v.current;
    if (el && el.duration) el.currentTime = Math.max(0, Math.min(el.duration, t));
  };

  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * (v.current?.duration || 0));
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") toggle();
    else if (k === "arrowright") seekTo((v.current?.currentTime ?? 0) + 5);
    else if (k === "arrowleft") seekTo((v.current?.currentTime ?? 0) - 5);
    else if (k === "m") toggleMute();
    else if (k === "f") toggleFull();
    else return;
    e.preventDefault();
    wake();
  };

  const hidden = !showControls || (playing && idle);
  return (
    <div
      ref={frame}
      role="group"
      aria-label={video["aria-label"] ?? l.player}
      tabIndex={showControls ? 0 : -1}
      onKeyDown={showControls ? onKey : undefined}
      onPointerMove={wake}
      onPointerLeave={() => playing && setIdle(true)}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("group/player relative select-none overflow-hidden bg-black outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400", hidden && playing && "cursor-none", className)}
      style={style}
    >
      <video
        ref={v}
        {...video}
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        draggable={false}
        onClick={showControls ? toggle : video.onClick}
        onPlay={(e) => {
          setPlaying(true);
          wake();
          onPlay?.(e);
        }}
        onPause={(e) => {
          setPlaying(false);
          setIdle(false);
          onPause?.(e);
        }}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          onVolumeChange?.(e);
        }}
        className={cn("block h-full w-full", videoClassName)}
      />

      {showControls && !playing && time === 0 && (
        <button type="button" onClick={toggle} aria-label={l.play} className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center bg-ember-500 text-on-ember shadow-[0_18px_48px_-18px_var(--ember-500)] transition-transform duration-[var(--dur-standard)] hover:scale-105">
            <Play aria-hidden className="size-5" fill="currentColor" />
          </span>
        </button>
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-10 text-white transition-opacity duration-300",
          hidden ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <div
          role="slider"
          tabIndex={-1}
          aria-label={l.seek}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={time}
          aria-valuetext={`${clock(time)} / ${clock(duration)}`}
          onPointerDown={(e) => {
            scrubbing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub(e);
          }}
          onPointerMove={(e) => scrubbing.current && scrub(e)}
          onPointerUp={() => {
            scrubbing.current = false;
          }}
          onLostPointerCapture={() => {
            scrubbing.current = false;
          }}
          className="group/seek relative flex h-4 cursor-pointer items-center"
        >
          <div className="relative h-[3px] w-full overflow-hidden bg-white/20 transition-[height] group-hover/seek:h-[5px]">
            <div ref={buffered} className="absolute inset-0 origin-left bg-white/30" style={{ transform: "scaleX(0)" }} />
            <div ref={fill} className="absolute inset-0 origin-left bg-ember-500" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggle} aria-label={playing ? l.pause : l.play} className="flex size-9 items-center justify-center hover:text-ember-400">
            {playing ? <Pause aria-hidden className="size-4" fill="currentColor" /> : <Play aria-hidden className="size-4" fill="currentColor" />}
          </button>
          <button type="button" onClick={toggleMute} aria-label={muted ? l.unmute : l.mute} className="flex size-9 items-center justify-center hover:text-ember-400">
            {muted ? <VolumeX aria-hidden className="size-4" /> : <Volume2 aria-hidden className="size-4" />}
          </button>
          <span className="hud ml-1 tabular-nums text-white/80">{clock(time)} / {clock(duration)}</span>
          <button type="button" onClick={toggleFull} aria-label={full ? l.exitFullscreen : l.fullscreen} className="ml-auto flex size-9 items-center justify-center hover:text-ember-400">
            {full ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
