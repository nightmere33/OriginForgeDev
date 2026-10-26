"use client";

import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./gsap";
import { smooth } from "./smooth";

/**
 * One scroll clock for the whole site: Lenis eases the scroll position and
 * is stepped by GSAP's ticker, so ScrollTrigger scrubs, the galaxy and the
 * ruler all read the same frame. Visitors who prefer reduced motion keep
 * native scrolling and nothing is registered.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // lerp 0.1 (Lenis's default glide); touch keeps the phone's native scroll.
    const lenis = new Lenis({ lerp: 0.1, anchors: { offset: -96 } });
    smooth.lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);

    const step = (seconds: number) => lenis.raf(seconds * 1000);
    gsap.ticker.add(step);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(step);
      lenis.destroy();
      smooth.lenis = null;
    };
  }, []);

  return (
    <>
      {children}
      {/* Reads the pathname: on dynamic routes that must sit in Suspense. */}
      <Suspense fallback={null}><RouteScrollReset /></Suspense>
    </>
  );
}

/**
 * Lenis remembers its own target, so a client navigation would glide back to
 * the previous page's offset. Jump to the top on a real navigation, but leave
 * reloads, back/forward (the browser restores those) and #anchors alone.
 */
function RouteScrollReset() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const poppedTo = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      poppedTo.current = location.pathname;
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (pathname === previous.current) return;
    previous.current = pathname;
    const fromHistory = poppedTo.current === pathname;
    poppedTo.current = null;
    if (!fromHistory && !location.hash) smooth.lenis?.scrollTo(0, { immediate: true, force: true });
    // New page, new geometry.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [pathname]);

  return null;
}
