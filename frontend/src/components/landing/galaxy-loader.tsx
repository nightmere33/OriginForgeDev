"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import type { GalaxyItem } from "@/lib/types";

const ForgeGalaxy = lazy(() => import("./forge-galaxy"));

function canRunGalaxy() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Mounts the WebGL galaxy only after the page is idle, so three.js never
 * competes with first paint. Until then — and for reduced motion, data saver
 * or no WebGL — the server-rendered poster mosaic stays as the hero backdrop.
 */
export default function GalaxyLoader({ items, lang, label }: { items: GalaxyItem[]; lang: string; label: string }) {
  const [mount, setMount] = useState(false);

  useEffect(() => {
    if (!items.length || !canRunGalaxy()) return;
    const go = () => setMount(true);
    // Safari has no requestIdleCallback; a short timeout is the fallback.
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(go, { timeout: 1500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(go, 600);
    return () => clearTimeout(id);
  }, [items.length]);

  if (!mount) return null;
  return (
    <Suspense fallback={null}>
      <ForgeGalaxy
        items={items}
        lang={lang}
        label={label}
        onReady={() => document.getElementById("hero")?.setAttribute("data-galaxy", "on")}
      />
    </Suspense>
  );
}
