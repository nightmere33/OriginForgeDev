"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { pickVideo } from "@/lib/video";

/**
 * Silent looping footage that only downloads and plays near the viewport
 * (DESIGN.md §5). The server renders the poster alone; the file is chosen
 * (AV1 or H.264, see lib/video) and set only as the clip approaches, so clips
 * nobody scrolls to cost nothing. Reduced-motion visitors keep the poster.
 * Decorative: the surrounding text carries the meaning, so it is aria-hidden.
 */
export default function LoopVideo({
  src, av1, poster, className, width, height,
}: {
  src: string;
  av1?: string | null;
  poster?: string | null;
  className?: string;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let inView = false;
    let alive = true;
    let chosen: Promise<void> | null = null;
    // Autoplay refused (iOS Low Power Mode, some in-app browsers): the next
    // tap anywhere is a user gesture, where play() is allowed.
    const retry = () => inView && video.play().catch(() => {});
    const start = () =>
      video.play().catch((e: DOMException) => {
        if (e.name === "NotAllowedError") addEventListener("pointerdown", retry, { once: true, passive: true });
      });
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (!inView) {
          video.pause();
          return;
        }
        chosen ??= pickVideo({ h264: src, av1, width, height }).then((url) => {
          if (!alive) return;
          video.preload = "auto";
          video.src = url;
        });
        chosen.then(() => {
          if (alive && inView) start();
        });
      },
      // Start fetching well before it shows, so fast scrolling lands on motion, not a poster.
      { rootMargin: "40% 0px" },
    );
    io.observe(video);
    return () => {
      alive = false;
      io.disconnect();
      removeEventListener("pointerdown", retry);
    };
  }, [src, av1, width, height]);

  return (
    <video
      ref={ref}
      aria-hidden
      className={cn("block h-full w-full object-cover", className)}
      poster={poster ?? undefined}
      width={width}
      height={height}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
    />
  );
}
