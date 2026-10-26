"use client";

/**
 * One clip, two files: AV1 (about half the size) and H.264 (plays everywhere).
 * The choice is made before anything downloads, per device:
 *
 *   - phones get AV1 only when it is hardware-decoded (powerEfficient), so a
 *     page of looping clips never drains the battery in software;
 *   - desktops also take software AV1 when the browser says it is smooth;
 *   - everything else, and any doubt, gets H.264.
 *
 * Testing: localStorage["of:codec"] = "av1" | "h264" forces one.
 */

export type VideoSources = { h264: string; av1?: string | null; width: number; height: number };

/** AV1 Main profile, 8-bit; level from the frame size (2.1 / 3.0 / 3.1 / 4.0). */
function av1Type(width: number, height: number) {
  const px = width * height;
  const level = px <= 640 * 360 ? "01" : px <= 640 * 640 ? "04" : px <= 1280 * 720 ? "05" : "08";
  return `video/mp4; codecs="av01.0.${level}M.08"`;
}

const verdicts = new Map<string, Promise<boolean>>();

function forced(): "av1" | "h264" | null {
  try {
    const v = localStorage.getItem("of:codec");
    return v === "av1" || v === "h264" ? v : null;
  } catch {
    return null;
  }
}

/** Whether this device should be served AV1 at this size (cached per size). */
export function prefersAv1(width: number, height: number): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const force = forced();
  if (force) return Promise.resolve(force === "av1");
  const type = av1Type(width, height);
  const cached = verdicts.get(type);
  if (cached) return cached;
  const verdict = (async () => {
    if (!document.createElement("video").canPlayType(type)) return false;
    const phone = matchMedia("(pointer: coarse)").matches;
    const caps = navigator.mediaCapabilities;
    if (!caps?.decodingInfo) return !phone; // no way to ask: desktops only
    try {
      const info = await caps.decodingInfo({
        type: "file",
        video: { contentType: type, width, height, bitrate: 1_000_000, framerate: 24 },
      });
      return info.supported && (info.powerEfficient || (info.smooth && !phone));
    } catch {
      return false;
    }
  })();
  verdicts.set(type, verdict);
  return verdict;
}

/** The URL to load for these sources on this device. */
export async function pickVideo({ h264, av1, width, height }: VideoSources): Promise<string> {
  return av1 && (await prefersAv1(width, height)) ? av1 : h264;
}
