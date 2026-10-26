"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { ApiError } from "@/lib/api-client";
import { remaining } from "@/lib/lifecycle";
import { Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";

export type T = Pick<Dictionary, "portal" | "studio" | "start" | "auth" | "common" | "project" | "trust">;
export type Side = "client" | "studio";

export type PanelProps = {
  lang: Locale;
  t: T;
  side: Side;
  /** Re-fetch the request after any change; the server is the source of truth. */
  reload: () => Promise<void>;
};

/** "about 3 days left" / "2 hours late", pluralised per language. */
export function timeLeft(t: T, iso: string) {
  const r = remaining(iso);
  const [one, many] = t.project.units[r.unit];
  return fill(r.late ? t.project.late : t.project.left, { n: r.n, unit: r.n === 1 ? one : many });
}

export function errorText(t: T, err: unknown, ...fields: string[]) {
  if (!(err instanceof ApiError)) return t.common.error;
  for (const f of fields) {
    const msg = err.field(f);
    if (msg) return msg;
  }
  return err.field("action") ?? err.field("status") ?? err.message;
}

export function ErrorLine({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-center gap-2 text-sm text-err">
      <span aria-hidden className="size-1.5 shrink-0 bg-err" />
      {children}
    </p>
  );
}

/** A titled band inside the project hub, matching the request detail rows. */
export function Panel({
  title, aside, children, className, id,
}: { title: string; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-label={title} className={cn("border-t border-line", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 pt-6 md:px-10">
        <Hud tone="faint" as="h3">{title}</Hud>
        {aside}
      </div>
      <div className="px-6 pb-8 pt-5 md:px-10">{children}</div>
    </section>
  );
}

/** The one call to action a side has right now: ember rule, raised cell. */
export function NextStep({ t, children }: { t: T; children: ReactNode }) {
  return (
    <section aria-label={t.project.nextStep} className="border-t border-line px-6 py-8 md:px-10">
      <Hud tone="ember" dot live>{t.project.nextStep}</Hud>
      <div className="mt-5 border-l-2 border-ember-500 bg-cell px-5 py-6 md:px-8">{children}</div>
    </section>
  );
}

export function CopyValue({ t, label, value }: { t: T; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="hud text-faint">{label}</p>
        <p className="mt-1 break-all font-mono text-ink">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })}
        className="hud flex shrink-0 items-center gap-1.5 border border-line px-2.5 py-1.5 text-muted hover:border-line-strong hover:text-ink"
      >
        {copied ? <Check aria-hidden className="size-3.5 text-ok" /> : <Copy aria-hidden className="size-3.5" />}
        {copied ? t.project.pay.copied : t.project.pay.copy}
      </button>
    </div>
  );
}

/** Small mono key/value used in proposal and project facts. */
export function Fact({ k, v, className }: { k: string; v: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="hud text-faint">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}
