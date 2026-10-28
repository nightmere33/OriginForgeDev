/**
 * Can this device carry the WebGL galaxy? Probed once, before the canvas
 * mounts, as getartcraft.com does: a context that fails inside three.js
 * throws from the renderer's set-up, and the page should never find out.
 *
 * - WebGL 2 only: three.js dropped WebGL 1 (r163), and old GPUs and many
 *   Windows 7 drivers offer nothing newer.
 * - `failIfMajorPerformanceCaveat` refuses a context the browser would draw
 *   in software (a blocklisted GPU); the renderer's name catches the software
 *   rasterisers that still get through.
 * - Two CPU cores or two GB of memory or less: the poster mosaic instead.
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const GAVE_UP_KEY = "of:galaxy-off";

let cached: string | null | undefined;

/** Why the galaxy should not run here, or null when it can. */
export function galaxyBlocker(): string | null {
  if (cached === undefined) cached = probe();
  return cached;
}

function probe(): string | null {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "reduced-motion";
  if (nav.connection?.saveData) return "save-data";
  if ((nav.hardwareConcurrency || 4) <= 2 || (nav.deviceMemory ?? 4) <= 2) return "low-end";
  if (gaveUp()) return "gave-up";
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return "no-webgl2";
    // Chrome and Safari mask RENDERER; Firefox answers it directly (and warns on the extension).
    let renderer = String(gl.getParameter(gl.RENDERER));
    if (/webkit webgl/i.test(renderer)) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    }
    // Browsers cap live contexts: hand the probe's back before the real canvas asks.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return SOFTWARE.test(renderer) ? "software" : null;
  } catch {
    return "no-webgl2";
  }
}

/** The galaxy failed or could not keep up here: posters for the rest of the visit. */
export function giveUpGalaxy() {
  cached = "gave-up";
  try {
    sessionStorage.setItem(GAVE_UP_KEY, "1");
  } catch {
    // Storage blocked: the module cache still holds it until a reload.
  }
}

function gaveUp() {
  try {
    return sessionStorage.getItem(GAVE_UP_KEY) === "1";
  } catch {
    return false;
  }
}
