"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Accented, Hud } from "@/components/ui/hud";
import { Button, ButtonLink } from "@/components/ui/button";

// Inline: an error screen must not depend on loading anything else.
const COPY = {
  en: {
    label: "Error · this page",
    title: ["This page ", "hit a snag", "."],
    body: "Part of it failed to load in your browser. Try again; if it keeps happening, the rest of the site still works.",
    retry: "Try again",
    home: "Back to home",
  },
  fr: {
    label: "Erreur · cette page",
    title: ["Cette page a ", "un souci", "."],
    body: "Une partie n’a pas pu se charger dans votre navigateur. Réessayez ; si cela continue, le reste du site fonctionne toujours.",
    retry: "Réessayer",
    home: "Retour à l’accueil",
  },
};

// A tab opened before a deploy asks for code that changed: one fresh load fixes it.
const STALE = /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i;
const RELOADED = "of:stale-reload";

/** A page that failed: the nav and footer stay, this panel takes the page's place. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const { lang } = useParams<{ lang: string }>();
  const t = lang === "fr" ? COPY.fr : COPY.en;
  useEffect(() => {
    console.error(error);
    const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (!STALE.test(text)) return;
    try {
      // Once a minute at most, so a real outage never loops.
      if (Date.now() - Number(sessionStorage.getItem(RELOADED) || 0) < 60_000) return;
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      return;
    }
    location.reload();
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[70svh] max-w-[1280px] flex-col items-start justify-center gap-6 px-6 py-24 md:px-10">
      <Hud dot tone="ember">{t.label}</Hud>
      <h1 className="max-w-3xl text-h1 tracking-[-0.03em] text-ink-strong">
        <Accented parts={t.title} />
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-muted">{t.body}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Button variant="ember" onClick={() => retry()}>{t.retry}</Button>
        <ButtonLink href={`/${lang === "fr" ? "fr" : "en"}`} variant="secondary">{t.home}</ButtonLink>
      </div>
    </section>
  );
}
