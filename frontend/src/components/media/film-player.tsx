"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { pickVideo, type VideoSources } from "@/lib/video";
import { smooth } from "@/motion/smooth";
import { cn } from "@/lib/cn";
import { ForgeVideo } from "./forge-video";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * "Watch the film": the full cut with sound, in a lightbox. A native <dialog>
 * (Esc, focus trap and the inert page behind come for free). The file (AV1 or
 * H.264) is chosen on mount but not downloaded (preload="none"), so the tap
 * can call play() synchronously: iOS only allows sound inside the gesture.
 */
export default function FilmPlayer({
  film, poster, title, duration, labels, className, compact, thumb,
}: {
  film: VideoSources;
  poster?: string | null;
  title: string;
  duration?: number;
  labels: { watch: string; close: string; kicker?: string };
  className?: string;
  /** A small chip (on a media plate) instead of the full button. */
  compact?: boolean;
  /** The poster as a small portrait card beside the label (the how-to film). */
  thumb?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState(film.h264);

  useEffect(() => {
    let alive = true;
    pickVideo(film).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [film]);

  const open = () => {
    const d = dialog.current;
    const v = video.current;
    if (!d || !v) return;
    d.showModal();
    smooth.lenis?.stop();
    v.muted = false;
    v.play().catch(() => {});
  };

  const close = () => dialog.current?.close();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => {
      video.current?.pause();
      smooth.lenis?.start();
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  return (
    <>
      {thumb ? (
        <button type="button" onClick={open} className={cn("group/thumb flex items-center gap-4 text-left", className)}>
          <span className="relative block aspect-[9/16] w-16 shrink-0 overflow-hidden border border-line-strong bg-cell">
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element -- a 64 px crop of the film's own poster
              <img src={poster} alt="" loading="lazy" decoding="async"
                className="size-full object-cover transition-transform duration-700 ease-out group-hover/thumb:scale-105" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="flex size-8 items-center justify-center rounded-full bg-ember-500 text-on-ember shadow-[0_10px_28px_-10px_var(--ember-500)] transition-transform duration-[var(--dur-standard)] group-hover/thumb:scale-110">
                <Play aria-hidden className="size-3.5 translate-x-px" fill="currentColor" />
              </span>
            </span>
          </span>
          <span className="flex flex-col gap-1">
            {labels.kicker && <span className="hud text-ember-400">{labels.kicker}</span>}
            <span className="text-ink transition-colors group-hover/thumb:text-ink-strong">{labels.watch}</span>
            {duration ? <span className="hud text-faint">{clock(duration)}</span> : null}
          </span>
        </button>
      ) : (
      <button
        type="button"
        onClick={open}
        className={cn(
          compact
            ? "hud inline-flex h-9 items-center gap-2 bg-ember-500 px-3 font-bold text-on-ember shadow-[0_14px_36px_-16px_var(--ember-500)] transition-transform duration-[var(--dur-standard)] hover:-translate-y-0.5 active:translate-y-px"
            : "group/btn relative inline-flex h-12 items-center gap-2 border border-line-strong px-6 font-mono text-hud font-bold uppercase tracking-[0.12em] text-ink transition-colors duration-[var(--dur-micro)] hover:border-transparent hover:bg-steel-50 hover:text-steel-950",
          className,
        )}
      >
        <Play aria-hidden className="size-3.5" fill="currentColor" />
        {labels.watch}
        {duration ? <span className={compact ? "opacity-70" : "text-faint group-hover/btn:text-steel-950/60"}>{clock(duration)}</span> : null}
      </button>
      )}

      <dialog
        ref={dialog}
        aria-label={title}
        onClick={(e) => e.target === dialog.current && close()}
        className="m-auto max-h-none max-w-none overflow-visible bg-transparent p-0 text-ink backdrop:bg-black/85 backdrop:backdrop-blur-sm open:flex open:flex-col"
      >
        <div className="flex items-center justify-between gap-6 pb-3">
          <p className="hud text-muted">{title}{duration ? ` · ${clock(duration)}` : ""}</p>
          <button type="button" onClick={close} aria-label={labels.close}
            className="flex size-10 items-center justify-center border border-line-strong text-ink hover:border-transparent hover:bg-steel-50 hover:text-steel-950">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <ForgeVideo
          ref={video}
          src={src}
          poster={poster ?? undefined}
          width={film.width}
          height={film.height}
          playsInline
          preload="none"
          aria-label={title}
          videoClassName="object-contain"
          // As large as the screen allows, both ways, at the film's own aspect.
          style={{ aspectRatio: `${film.width} / ${film.height}`, width: `min(calc(100vw - 2rem), calc((100svh - 7rem) * ${film.width / film.height}), 80rem)` }}
        />
      </dialog>
    </>
  );
}
