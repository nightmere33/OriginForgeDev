"use client";

import { useEffect, useState } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { day } from "@/lib/lifecycle";
import { Hud } from "@/components/ui/hud";
import { DecodeText } from "@/motion/glitch";

type S = Dictionary["start"];
export type QueuePreview = {
  direct: boolean; queued: boolean; position: number | null; start: string | null; active: number; capacity: number;
  reply_hours: number; review_hours: number; paused: boolean; available_from: string | null;
};

/**
 * The studio's places and the line in front of them: filled squares for
 * projects in progress, hollow ones for requests waiting, and an ember
 * square for "you". Drawn in, one square after another.
 */
export function QueueStrip({ active, capacity, position, you }: { active: number; capacity: number; position: number; you: string }) {
  const places = Math.max(capacity, active, 1);
  const ahead = Math.max(0, position - 1);
  const cells = [
    ...Array.from({ length: places }, (_, i) => (i < active ? "busy" : "free")),
    ...Array.from({ length: Math.min(ahead, 8) }, () => "wait"),
    "you",
  ];
  return (
    <div aria-hidden className="flex flex-wrap items-center gap-1.5">
      {cells.map((c, i) => (
        <span key={i} className="relative flex items-center" style={{ animation: `step-in 360ms var(--ease-out) ${i * 50}ms both` }}>
          {i === places && <span className="mx-1.5 h-4 w-px bg-line-strong" />}
          <span
            className={cn(
              "block size-3.5 border",
              c === "busy" && "border-steel-300 bg-steel-300",
              c === "free" && "border-line-strong",
              c === "wait" && "border-steel-450",
              c === "you" && "border-ember-400 bg-ember-500 shadow-[0_0_12px_rgb(255_106_26/0.6)]",
            )}
          />
          {c === "you" && <span className="hud ml-2 text-ember-400">{you}</span>}
        </span>
      ))}
    </div>
  );
}

function hoursText(s: S, p: Pick<QueuePreview, "reply_hours" | "review_hours">) {
  return fill(s.queue.hours, { min: p.reply_hours, max: p.review_hours });
}

/** What a new request for this service meets right now (the request form). */
export function QueueNotice({ lang, s, service, title, className }: { lang: Locale; s: S; service: string; title?: string; className?: string }) {
  const [data, setData] = useState<{ key: string; value: QueuePreview } | null>(null);
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      api.get<QueuePreview>(`/queue/?service=${encodeURIComponent(service)}`).then((value) => alive && setData({ key: service, value }), () => undefined);
    }, 120);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [service]);
  const p = data?.key === service ? data.value : null;
  if (!p) return <div className={cn("min-h-[5.5rem] border border-line", className)} aria-hidden />;

  const hours = hoursText(s, p);
  if (p.direct || !p.queued) {
    return (
      <div key={service} className={cn("flex flex-col gap-2 border border-line bg-cell px-5 py-4 [animation:step-in_var(--dur-standard)_var(--ease-out)]", className)}>
        <Hud tone="ink" dot>{p.direct ? fill(s.queue.direct, { service: title ?? "" }) : s.queue.open}</Hud>
        <p className="text-sm text-muted">{hours}</p>
      </div>
    );
  }
  return (
    <div key={service} role="status" className={cn("relative flex flex-col gap-4 overflow-hidden border border-ember-400/50 bg-ember-500/[0.05] px-5 py-5 [animation:step-in_var(--dur-standard)_var(--ease-out)]", className)}>
      <Hud tone="ember" dot live>{p.paused ? s.queue.paused : fill(s.queue.full, { active: p.active, capacity: p.capacity || p.active })}</Hud>
      <p className="text-ink">
        <DecodeText text={fill(s.queue.join, { n: p.position ?? 1 })} />
        {p.start && <> {fill(s.queue.start, { date: day(lang, p.start) })}</>}
      </p>
      <QueueStrip active={p.active} capacity={p.capacity} position={p.position ?? 1} you={s.queue.you} />
      <p className="text-sm text-muted">{hours} {s.queue.told}</p>
    </div>
  );
}

/** Where a sent request stands (client space): position, estimated start, the promise. */
export function QueueCard({ lang, s, queue, hours }: { lang: Locale; s: S; queue: { position: number; start: string | null; active: number; capacity: number }; hours?: Pick<QueuePreview, "reply_hours" | "review_hours"> }) {
  return (
    <div role="status" className="flex flex-col gap-4 border border-ember-400/50 bg-ember-500/[0.05] px-6 py-6 md:px-8">
      <Hud tone="ember" dot live>{s.queue.inQueue}</Hud>
      <p className="font-mono text-4xl tabular-nums tracking-[-0.02em] text-ink-strong">
        <DecodeText digits text={`#${queue.position}`} />
      </p>
      <p className="text-ink">{queue.start ? fill(s.queue.start, { date: day(lang, queue.start) }) : s.queue.soon}</p>
      <QueueStrip active={queue.active} capacity={queue.capacity} position={queue.position} you={s.queue.you} />
      <p className="text-sm text-muted">{hours ? hoursText(s, hours) : ""} {s.queue.told}</p>
    </div>
  );
}
