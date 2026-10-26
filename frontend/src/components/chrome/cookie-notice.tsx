"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cookie } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { tearIn } from "@/motion/glitch";

const KEY = "of:cookie-notice";

/**
 * The site sets only essential cookies, so there is nothing to consent to:
 * this is a notice, shown once, with a link to the cookie policy. It waits
 * for the opening animation and never covers the page on load.
 */
export function CookieNotice({ lang, labels }: { lang: Locale; labels: { text: string; more: string; ok: string } }) {
  const [show, setShow] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      // Storage blocked: showing it every visit would nag, so stay quiet.
    }
    if (seen) return;
    const timer = window.setTimeout(() => setShow(true), 2600);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (show) tearIn(box.current);
  }, [show]);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Nothing to remember it in.
    }
    setShow(false);
  };
  return (
    <div
      ref={box}
      role="region"
      aria-label="Cookies"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-start gap-3 border border-line bg-raised p-4 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.7)] sm:inset-x-auto sm:left-6 sm:max-w-sm"
    >
      <Cookie aria-hidden className="mt-0.5 size-4 shrink-0 text-ember-400" />
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-muted">
          {labels.text}{" "}
          <Link href={`/${lang}/legal/cookies`} className="text-ink underline-offset-4 hover:underline">{labels.more}</Link>
        </p>
        <button type="button" onClick={close} className="hud self-start border border-line-strong px-3 py-1.5 text-ink hover:border-ember-400">
          {labels.ok}
        </button>
      </div>
    </div>
  );
}
