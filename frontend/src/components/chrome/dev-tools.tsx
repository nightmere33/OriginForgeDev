"use client";

import { useEffect } from "react";

/**
 * react-scan (render highlighting) and react-grab (copy a component's source
 * location) in development only. The NODE_ENV check is compile-time, so the
 * imports are dropped from production bundles. Set
 * NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS=1 to profile without instrumentation,
 * or localStorage "of:no-devtools" = "1" for a clean visual-QA session
 * (their hover overlays tint whatever is under the cursor).
 */
export default function DevTools() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS) return;
    try {
      if (localStorage.getItem("of:no-devtools") === "1") return;
    } catch {
      // Storage blocked: keep the tools.
    }
    import("react-scan").then(({ scan }) => scan({ enabled: true, showToolbar: true }));
    import("react-grab");
  }, []);
  return null;
}
