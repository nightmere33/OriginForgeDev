"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { QuietBoundary } from "@/components/ui/quiet-boundary";
import { galaxyBlocker, giveUpGalaxy } from "@/lib/webgl-support";
import { settleGalaxy } from "@/motion/intro";
import type { GalaxyItem } from "@/lib/types";

const load = () => import("./forge-galaxy");
const ForgeGalaxy = lazy(load);

const hero = () => document.getElementById("hero");

/**
 * Mounts the WebGL galaxy as soon as the page is up and in front, as
 * getartcraft.com does, so its cards pour out on the intro's beat (the intro
 * waits for its first frame). Its code starts downloading at once, beside
 * hydration, and a canvas is never born in a background tab (it can come up
 * blank). For reduced motion, data saver, a weak device or no WebGL 2
 * (lib/webgl-support.ts) the server-rendered poster mosaic is the backdrop;
 * while the galaxy is on its way (`data-galaxy`) the stage stays dark instead.
 * If it fails later (an error, a lost GPU context, a device that can't keep
 * up), the posters come back and stay for the rest of the visit.
 */
export default function GalaxyLoader({ items, lang, label }: { items: GalaxyItem[]; lang: string; label: string }) {
  const [mount, setMount] = useState(false);

  useEffect(() => {
    if (!items.length || galaxyBlocker()) {
      settleGalaxy("none");
      return;
    }
    hero()?.setAttribute("data-galaxy", "pending");
    let alive = true;
    let raf = 0;
    const visible = () => {
      if (!alive) return;
      if (document.hidden) raf = requestAnimationFrame(visible);
      else setMount(true);
    };
    load().then(visible, () => {
      hero()?.removeAttribute("data-galaxy");
      settleGalaxy("none");
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [items.length]);

  if (!mount) return null;
  const fail = () => {
    giveUpGalaxy();
    hero()?.removeAttribute("data-galaxy");
    settleGalaxy("none");
    setMount(false);
  };
  return (
    <QuietBoundary onError={fail}>
      <Suspense fallback={null}>
        <ForgeGalaxy
          items={items}
          lang={lang}
          label={label}
          onReady={() => {
            hero()?.setAttribute("data-galaxy", "on");
            settleGalaxy("ready");
          }}
          onFail={fail}
        />
      </Suspense>
    </QuietBoundary>
  );
}
