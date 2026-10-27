"use client";

import { useEffect, useRef, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";

const MIN_THUMB = 28;
const IDLE_MS = 900;
const PAD = 4;

/**
 * A scrolling panel with the instrument's own scrollbar (asset pack).
 *
 * The viewport stays a native scroll container, so wheel, touch, keyboard,
 * momentum and screen readers behave as everywhere else; only the browser's
 * bar is hidden and redrawn as a hairline rail with a steel thumb. The thumb
 * appears while scrolling or hovering, widens under the pointer, turns ember
 * while dragged, and a click on the rail glides there. Lenis leaves it alone
 * (data-lenis-prevent). Where nothing overflows, there is no bar.
 */
export function ScrollArea({
  children, className, viewportClassName, ...props
}: ComponentProps<"div"> & { viewportClassName?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number } | null>(null);

  useEffect(() => {
    const vp = viewport.current;
    const r = root.current;
    const th = thumb.current;
    const rl = rail.current;
    if (!vp || !r || !th || !rl) return;
    let frame = 0;
    let idle = 0;
    const place = () => {
      frame = 0;
      const { clientHeight: view, scrollHeight: full, scrollTop } = vp;
      const overflow = full - view > 1;
      r.toggleAttribute("data-overflow", overflow);
      if (!overflow) return;
      const track = view - PAD * 2;
      const h = Math.max(MIN_THUMB, (track * view) / full);
      const y = PAD + (scrollTop / (full - view)) * (track - h);
      th.style.height = `${h}px`;
      th.style.transform = `translate3d(0, ${y}px, 0)`;
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const onScroll = () => {
      queue();
      r.setAttribute("data-scrolling", "");
      clearTimeout(idle);
      idle = window.setTimeout(() => !drag.current && r.removeAttribute("data-scrolling"), IDLE_MS);
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(queue);
    ro.observe(vp);
    if (content.current) ro.observe(content.current);
    place();
    return () => {
      vp.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(idle);
    };
  }, []);

  // Dragging the thumb maps its travel onto the content's.
  const onThumbDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const vp = viewport.current;
    if (!vp || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, top: vp.scrollTop };
    root.current?.setAttribute("data-dragging", "");
  };
  const onThumbMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const vp = viewport.current;
    const th = thumb.current;
    if (!vp || !th || !drag.current) return;
    const track = vp.clientHeight - PAD * 2 - th.offsetHeight;
    const ratio = (vp.scrollHeight - vp.clientHeight) / Math.max(1, track);
    vp.scrollTop = drag.current.top + (e.clientY - drag.current.y) * ratio;
  };
  const onThumbUp = () => {
    drag.current = null;
    root.current?.removeAttribute("data-dragging");
  };
  // A click on the rail glides so the thumb's centre lands under the pointer.
  const onRailDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const vp = viewport.current;
    const th = thumb.current;
    if (!vp || !th || e.target !== e.currentTarget) return;
    const box = e.currentTarget.getBoundingClientRect();
    const at = (e.clientY - box.top - th.offsetHeight / 2) / Math.max(1, box.height - th.offsetHeight);
    vp.scrollTo({ top: at * (vp.scrollHeight - vp.clientHeight), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div ref={root} className={cn("group/scroll relative min-h-0", className)} {...props}>
      <div ref={viewport} data-lenis-prevent className={cn("scroll-bare overflow-y-auto overscroll-contain", viewportClassName)}>
        <div ref={content}>{children}</div>
      </div>
      <div
        ref={rail}
        aria-hidden
        onPointerDown={onRailDown}
        className={cn(
          "absolute inset-y-0 right-0 hidden w-3 cursor-pointer opacity-0 transition-opacity duration-300",
          "group-data-[overflow]/scroll:block group-hover/scroll:opacity-100 group-data-[scrolling]/scroll:opacity-100 group-data-[dragging]/scroll:opacity-100",
        )}
      >
        <span className="pointer-events-none absolute inset-y-1 right-[5px] w-px bg-line" />
        <div
          ref={thumb}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
          className="group/thumb absolute right-0 top-0 flex w-3 cursor-grab justify-center will-change-transform active:cursor-grabbing"
        >
          <span
            className={cn(
              "h-full w-0.5 bg-steel-450 transition-[width,background-color] duration-200",
              "group-hover/thumb:w-1.5 group-hover/thumb:bg-ink group-data-[dragging]/scroll:w-1.5 group-data-[dragging]/scroll:bg-ember-400",
            )}
          />
        </div>
      </div>
    </div>
  );
}
