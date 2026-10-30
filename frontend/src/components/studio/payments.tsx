"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { day, money } from "@/lib/lifecycle";
import { useLiveRefresh } from "@/lib/live";
import { Hud } from "@/components/ui/hud";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useGuard } from "@/components/portal/requests";

type Row = { id: number; amount: number; currency: string; reference: string; project: string; client: string; label: string };
type Data = {
  proofs: (Row & { method: string; submitted_at: string; payer_name: string; transfer_reference: string; has_receipt: boolean })[];
  due: (Row & { status: string; due_at: string | null })[];
  recent: (Row & { provider: string; paid_at: string })[];
};
type T = Pick<Dictionary, "studio" | "common">;

function Section({ title, count, tone, children }: { title: string; count: number; tone?: "ember"; children: ReactNode }) {
  return (
    <section className="border-t border-line">
      <div className="flex items-center justify-between gap-4 px-6 py-5 md:px-10">
        <Hud tone={tone && count ? "ember" : "muted"} dot={!!(tone && count)}>{title}</Hud>
        <span className="font-mono text-sm tabular-nums text-faint">{count}</span>
      </div>
      {children}
    </section>
  );
}

/** One payment line: what, who, how much, and a door into the project's Payments tab. */
function Line({ lang, base, row, meta, open }: { lang: Locale; base: string; row: Row; meta: string; open: string }) {
  return (
    <li>
      <Link href={`${base}/requests/${row.reference}?tab=payments`}
        className="group/pay grid gap-2 px-6 py-4 transition-colors duration-[var(--dur-micro)] hover:bg-cell md:grid-cols-[8rem_minmax(0,1fr)_auto_auto] md:items-center md:gap-6 md:px-10">
        <span className="hud text-faint">{row.reference}</span>
        <span className="min-w-0">
          <span className="block truncate text-ink">{row.project} · {row.label}</span>
          <span className="block truncate text-sm text-faint">{row.client} · {meta}</span>
        </span>
        <span className="font-mono tabular-nums text-ink-strong">{money(lang, row.amount, row.currency)}</span>
        <span className="hud hidden items-center gap-2 text-muted group-hover/pay:text-ember-400 md:flex">
          {open}
          <ArrowUpRight aria-hidden className="size-4" />
        </span>
      </Link>
    </li>
  );
}

export function StudioPayments({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const d = t.studio.dash;
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(() => api.get<Data>("/studio/payments/").then(setData, () => undefined), []);
  useLiveRefresh(load);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user || !data) return <SkeletonRows label={t.common.loading} rows={5} />;
  const base = `/${lang}/studio`;
  const empty = (text: string) => <p className="border-t border-line px-6 py-8 text-sm text-faint md:px-10">{text}</p>;
  const list = "divide-y divide-line border-t border-line";

  return (
    <div>
      <Section title={d.proofs} count={data.proofs.length} tone="ember">
        {data.proofs.length ? (
          <ul className={list}>
            {data.proofs.map((p) => (
              <Line key={p.id} lang={lang} base={base} row={p} open={d.open}
                meta={[p.method, fill(d.submitted, { date: day(lang, p.submitted_at) }), p.transfer_reference].filter(Boolean).join(" · ")} />
            ))}
          </ul>
        ) : empty(d.noProofs)}
      </Section>
      <Section title={d.dueTitle} count={data.due.length}>
        {data.due.length ? (
          <ul className={list}>
            {data.due.map((c) => (
              <Line key={c.id} lang={lang} base={base} row={c} open={d.open} meta={c.due_at ? fill(d.dueOn, { date: day(lang, c.due_at) }) : ""} />
            ))}
          </ul>
        ) : empty(d.noDue)}
      </Section>
      <Section title={d.recent} count={data.recent.length}>
        {data.recent.length ? (
          <ul className={list}>
            {data.recent.map((p) => (
              <Line key={p.id} lang={lang} base={base} row={p} open={d.open} meta={`${p.provider} · ${day(lang, p.paid_at)}`} />
            ))}
          </ul>
        ) : empty(d.noRecent)}
      </Section>
    </div>
  );
}
