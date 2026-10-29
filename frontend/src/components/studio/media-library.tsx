"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api } from "@/lib/api-client";
import { formatBytes } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useGuard } from "@/components/portal/requests";

type Original = { id: number; title: string; language: string; kind: string; name: string; size: number; width: number; height: number; duration: number; caption: string; download: string };
type Web = { kind: string; language: string; title: string; width: number; height: number; duration: number; url: string; size: number };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const btn = "hud inline-flex h-10 items-center gap-2 border px-4 transition-colors";

function CopyCaption({ text, labels }: { text: string; labels: { copy: string; copied: string } }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(id);
  }, [done]);
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true), () => undefined)}
      className={`${btn} border-line-strong text-ink hover:border-ember-400`}>
      {done ? <Check aria-hidden className="size-3.5 text-ember-400" /> : <Copy aria-hidden className="size-3.5" />}
      {done ? labels.copied : labels.copy}
    </button>
  );
}

/**
 * Studio → Media: the films in full quality to publish from a phone, each
 * with its caption ready to paste, then the site's own web cuts.
 */
export function StudioMedia({ lang, t }: { lang: Locale; t: Pick<Dictionary, "studio" | "common"> }) {
  const user = useGuard(lang, true);
  const m = t.studio.dash.media;
  const [data, setData] = useState<{ originals: Original[]; web: Web[] } | null>(null);
  useEffect(() => {
    if (user) api.get<{ originals: Original[]; web: Web[] }>("/studio/media/").then(setData, () => undefined);
  }, [user]);

  if (!data) return <div className="border-t border-line"><SkeletonRows label={t.common.loading} rows={4} /></div>;
  return (
    <div className="border-t border-line">
      <section className="border-b border-line px-6 py-8 md:px-10">
        <Hud tone="faint" as="h3">{m.originals}</Hud>
        {!data.originals.length ? (
          <p className="mt-4 text-muted">{m.none}</p>
        ) : (
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {data.originals.map((f) => (
              <li key={f.id} className="flex flex-col gap-4 py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-ink-strong">{f.title}</span>
                  <Hud tone="faint">{[f.language.toUpperCase(), f.width && `${f.width}×${f.height}`, f.duration && clock(f.duration), formatBytes(f.size)].filter(Boolean).join(" · ")}</Hud>
                </div>
                {f.caption && <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted">{f.caption}</p>}
                <span className="flex flex-wrap gap-2">
                  <a href={f.download} download={f.name} className={`${btn} border-transparent bg-ember-500 font-bold text-on-ember hover:bg-ember-400`}>
                    <Download aria-hidden className="size-3.5" />{m.download}
                  </a>
                  {f.caption && <CopyCaption text={f.caption} labels={m} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.web.length > 0 && (
        <section className="px-6 py-8 md:px-10">
          <Hud tone="faint" as="h3">{m.web}</Hud>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {data.web.map((f) => (
              <li key={`${f.kind}-${f.language}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <span className="flex flex-col gap-1">
                  <span className="text-ink">{f.title}</span>
                  <Hud tone="faint">{[f.language.toUpperCase(), `${f.width}×${f.height}`, f.duration && clock(f.duration), f.size && formatBytes(f.size)].filter(Boolean).join(" · ")}</Hud>
                </span>
                <a href={f.url} download className={`${btn} border-line-strong text-ink hover:border-ember-400`}>
                  <Download aria-hidden className="size-3.5" />{m.download}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
