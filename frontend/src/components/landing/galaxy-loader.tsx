"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { QuietBoundary } from "@/components/ui/quiet-boundary";
import { galaxyBlocker, giveUpGalaxy } from "@/lib/webgl-support";
import type { GalaxyItem } from "@/lib/types";

const ForgeGalaxy = lazy(() => import("./forge-galaxy"));

const hero = () => document.getElementById("hero");

/**
 * Mounts the WebGL galaxy only after the page is idle and in front, so
 * three.js never competes with first paint and a canvas is never born in a
 * background tab (it can come up blank). Until then, and for reduced motion,
 * data saver, a weak device or no WebGL 2 (lib/webgl-support.ts), the
 * server-rendered poster mosaic stays as the hero backdrop. If the galaxy
 * fails later (an error, a lost GPU context, a device that can't keep up),
 * the posters come back and stay for the rest of the visit.
 */
export default function GalaxyLoader({ items, lang, label }: { items: GalaxyItem[]; lang: string; label: string }) {
  const [mount, setMount] = useState(false);

  useEffect(() => {
    if (!items.length || galaxyBlocker()) return;
    let idle = 0;
    let timer = 0;
    const go = () => setMount(true);
    const schedule = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", schedule);
      // Safari has no requestIdleCallback; a short timeout is the fallback.
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(go, { timeout: 1500 });
      else timer = window.setTimeout(go, 600);
    };
    document.addEventListener("visibilitychange", schedule);
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", schedule);
      if (idle) cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, [items.length]);

  if (!mount) return null;
  const fail = () => {
    giveUpGalaxy();
    hero()?.removeAttribute("data-galaxy");
    setMount(false);
  };
  return (
    <QuietBoundary onError={fail}>
      <Suspense fallback={null}>
        <ForgeGalaxy
          items={items}
          lang={lang}
          label={label}
          onReady={() => hero()?.setAttribute("data-galaxy", "on")}
          onFail={fail}
        />
      </Suspense>
    </QuietBoundary>
  );
}
