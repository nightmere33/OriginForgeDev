"use client";

import { useSyncExternalStore } from "react";
import "./globals.css";

const noop = () => () => {};

/**
 * The last resort, when the root layout itself fails: no fonts, nav or
 * dictionary to lean on, so it stands alone on the design tokens.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  // Read after hydration (the server has no address bar to go on).
  const fr = useSyncExternalStore(noop, () => location.pathname.startsWith("/fr"), () => false);
  return (
    <html lang={fr ? "fr" : "en"}>
      <body className="grain min-h-dvh bg-bg text-ink">
        <main className="mx-auto flex min-h-dvh max-w-[1280px] flex-col items-start justify-center gap-6 px-6 md:px-10">
          <p className="hud inline-flex items-center gap-2 text-ember-400">
            <span aria-hidden className="inline-block size-1.5 bg-ember-500" />
            OriginForge
          </p>
          <h1 className="max-w-3xl text-h1 tracking-[-0.03em] text-ink-strong">
            {fr ? "Le site n’a pas pu se charger." : "The site couldn’t load."}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            {fr
              ? "Un problème est survenu dans votre navigateur. Réessayez dans un instant."
              : "Something went wrong in your browser. Give it another try in a moment."}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="hud inline-flex h-12 items-center bg-ember-500 px-6 font-bold text-on-ember hover:bg-ember-600"
            >
              {fr ? "Réessayer" : "Try again"}
            </button>
            <a href={fr ? "/fr" : "/en"} className="hud inline-flex h-12 items-center border border-line-strong px-6 font-bold text-ink hover:border-ink">
              {fr ? "Accueil" : "Home"}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
