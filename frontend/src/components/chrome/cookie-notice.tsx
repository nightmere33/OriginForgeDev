"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cookie } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { BootText, GlitchLabel, tearIn } from "@/motion/glitch";

const KEY = "of:cookie-notice";

/**
 * The site sets only essential cookies, so there is nothing to consent to:
 * this is a notice, shown once, with a link to the cookie policy. It never
 * covers the opening screen: it waits until the visitor scrolls past most of
 * the first screen (or 15 seconds). On phones it is a slim bottom bar.
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
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      removeEventListener("scroll", onScroll);
    };
    const reveal = () => {
      stop();
      setShow(true);
    };
    const onScroll = () => {
      if (scrollY > innerHeight * 0.6) reveal();
    };
    timer = window.setTimeout(reveal, 15000);
    addEventListener("scroll", onScroll, { passive: true });
    return stop;
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
      className={
        "fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-raised/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm " +
        "sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-[23rem] sm:border sm:p-3.5 sm:shadow-[0_24px_48px_-24px_rgb(0_0_0/0.7)]"
      }
    >
      <Cookie aria-hidden className="size-4 shrink-0 text-ember-400" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
        <BootText text={labels.text} delay={120} />{" "}
        <Link href={`/${lang}/legal/cookies`} className="text-ink underline-offset-4 hover:text-ember-400 hover:underline">
          <GlitchLabel text={labels.more} />
        </Link>
      </p>
      <button type="button" onClick={close} className="hud shrink-0 border border-line-strong px-3 py-2 text-ink transition-colors hover:border-ember-400 hover:text-ember-400">
        <GlitchLabel text={labels.ok} />
      </button>
    </div>
  );
}
