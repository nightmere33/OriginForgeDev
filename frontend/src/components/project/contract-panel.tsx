"use client";

import { useId, useState, type CSSProperties } from "react";
import { Printer } from "lucide-react";
import { fill } from "@/i18n/fill";
import type { Locale } from "@/i18n/dictionaries";
import { api } from "@/lib/api-client";
import { dateTime, day, type Contract } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { ChoiceChip, Field, Input } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";
import { ErrorLine, errorText, type PanelProps, type T } from "./shared";
import { signatureFont } from "./signature-font";

/** How long the signature takes to write, the date to settle and the seal to press, before the page moves on. */
const SIGNING_MS = 3200;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A clean printable page of the contract (the browser saves it as PDF). */
function printContract(contract: Contract, reference: string) {
  const signature = contract.signed_at
    ? `\n\n${contract.signed_name} · ${new Date(contract.signed_at).toISOString()}\nSHA-256 ${contract.sha256}`
    : "";
  const html = `<!doctype html><html lang="${contract.language}"><meta charset="utf-8"><title>${reference}</title>
<style>body{margin:2.5cm auto;max-width:42rem;font:11pt/1.6 Georgia,serif;color:#111}pre{white-space:pre-wrap;font:inherit}</style>
<pre>${escapeHtml(contract.body + signature)}</pre><script>onload=()=>print()</script></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── The sheet ─────────────────────────────────────────────────────────────

type Row = { label: string; percent: string; amount: string; when: string };
type Block =
  | { kind: "heading"; n: string; text: string }
  | { kind: "label"; text: string }
  | { kind: "para"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "schedule"; rows: Row[] };

const SCHEDULE_ROW = /^- (.+?): (\d+) % \((.+?)\), (.+)$/;

/**
 * The stored text, typeset: its first two lines are the title and the
 * reference, "N. Title" lines are clauses, "- " lines are lists (payment
 * lines become a table), a line ending in ":" labels what follows. Only the
 * presentation changes: the words are exactly the ones that were hashed.
 */
function parse(body: string): { title: string; sub: string; blocks: Block[] } {
  const lines = body.split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join("\n") });
    para = [];
  };
  for (const raw of lines.slice(2)) {
    const line = raw.trimEnd();
    const heading = /^(\d+)\.\s+(.+)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (!line.trim()) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "heading", n: heading[1], text: heading[2] });
    } else if (line.startsWith("- ")) {
      flush();
      const row = SCHEDULE_ROW.exec(line);
      if (row) {
        const r = { label: row[1], percent: row[2], amount: row[3], when: row[4] };
        if (last?.kind === "schedule") last.rows.push(r);
        else blocks.push({ kind: "schedule", rows: [r] });
      } else if (last?.kind === "bullets") last.items.push(line.slice(2));
      else blocks.push({ kind: "bullets", items: [line.slice(2)] });
    } else if (/:\s*$/.test(line) && line.length < 40) {
      flush();
      blocks.push({ kind: "label", text: line.replace(/\s*:\s*$/, "") });
    } else para.push(line);
  }
  flush();
  return { title: lines[0] ?? "", sub: lines[1] ?? "", blocks };
}

/** A name in a hand: each stroke draws while the line is uncovered left to right, then the ink settles. */
function Signature({ name, writing, faint, label }: { name: string; writing?: boolean; faint?: boolean; label: string }) {
  const id = useId().replace(/:/g, "");
  const size = Math.min(62, Math.max(32, 880 / Math.max(name.length, 1)));
  return (
    <svg viewBox="0 0 420 110" role="img" aria-label={`${label}: ${name}`} className={cn("h-24 w-full max-w-[24rem] overflow-visible", faint && "opacity-35")}>
      <defs>
        <mask id={`${id}-reveal`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="480" height="150">
          <rect x="-20" y="-20" width="480" height="150" fill="#fff" className="sign-reveal"
            style={{ transformOrigin: "-20px 0", ...(writing ? { animation: "sign-reveal 1.7s cubic-bezier(0.45, 0.05, 0.35, 1) both" } : {}) }} />
        </mask>
      </defs>
      <text x="6" y="76" mask={`url(#${id}-reveal)`} className={cn(signatureFont.className, "sign-stroke")}
        style={{
          fontSize: size, fill: "currentColor", stroke: "currentColor", strokeWidth: 0.7, strokeLinecap: "round",
          // Each glyph's outline is dashed and drawn in, then the ink fills it.
          ...(writing ? {
            strokeDasharray: 260, ["--len" as string]: 260, fillOpacity: 0,
            animation: "sign-stroke 1.7s cubic-bezier(0.45, 0.05, 0.35, 1) both, sign-ink 0.7s 1.15s ease-out forwards",
          } : {}),
        } as CSSProperties}>
        {name}
      </text>
    </svg>
  );
}

function SheetBlock({ b }: { b: Block }) {
  switch (b.kind) {
    case "heading":
      return (
        <h4 className="mt-9 flex items-baseline gap-3 border-t border-[var(--paper-line)] pt-5 text-[0.95rem] font-semibold tracking-[-0.01em]">
          <span className="font-mono text-xs tabular-nums text-[var(--ember-700)]">{b.n.padStart(2, "0")}</span>{b.text}
        </h4>
      );
    case "label":
      return <p className="mt-4 font-mono text-[0.68rem] font-medium uppercase tracking-[0.15em] text-[var(--paper-muted)]">{b.text}</p>;
    case "para":
      return <p className="mt-3 whitespace-pre-line">{b.text}</p>;
    case "bullets":
      return (
        <ul className="mt-2 flex flex-col gap-1.5">
          {b.items.map((x, i) => <li key={i} className="flex gap-3"><span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-[var(--paper-muted)]" />{x}</li>)}
        </ul>
      );
    case "schedule":
      return (
        <table className="mt-3 w-full border-collapse text-left text-[0.9rem]">
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i} className="border-y border-[var(--paper-line)] align-top">
                <td className="py-2.5 pr-4">{r.label}</td>
                <td className="py-2.5 pr-4 font-mono tabular-nums text-[var(--paper-muted)]">{r.percent} %</td>
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono tabular-nums">{r.amount}</td>
                <td className="py-2.5 text-[var(--paper-muted)]">{r.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

/**
 * The agreement on a white sheet: letterhead, parties, numbered clauses,
 * the payment schedule as a table, and two signature blocks. Younes's is
 * already signed; the client's shows their typed name live while they type,
 * is written in one stroke when they sign, then the date and the
 * fingerprint seal stamp in.
 */
export function ContractSheet({ lang, t, contract, reference, preview, writing }: {
  lang: Locale; t: T; contract: Contract; reference: string;
  /** The name being typed, shown faint in the client's block until it is signed. */
  preview?: string;
  /** Just signed in this visit: play the signing. */
  writing?: { name: string; at: string } | null;
}) {
  const s = t.project.contract;
  const { title, sub, blocks } = parse(contract.body);
  const signed = writing ?? (contract.signed_at ? { name: contract.signed_name, at: contract.signed_at } : null);
  return (
    <article aria-label={s.title} lang={contract.language}
      className="relative mx-auto w-full max-w-[52rem] border border-[var(--paper-line)] bg-[var(--paper)] px-6 py-10 text-[0.95rem] leading-relaxed text-[var(--paper-ink)] [color-scheme:light] sm:px-12 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-[var(--paper-ink)] pb-6">
        <div>
          <p className="font-display text-xl font-[760] tracking-[-0.02em] [font-stretch:125%]">ORIGINFORGE</p>
          <p className="mt-1 text-sm text-[var(--paper-muted)]">Younes Ouali · Full-stack developer</p>
        </div>
        <div className="text-right font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[var(--paper-muted)]">
          <p>{reference}</p>
          <p className="mt-1">{day(lang, contract.created_at)}</p>
        </div>
      </header>

      <div className="py-8 text-center">
        <h3 className="font-display text-2xl font-[620] tracking-[-0.02em] [font-stretch:125%] sm:text-3xl">{title}</h3>
        <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-[var(--paper-muted)]">{sub}</p>
      </div>

      {blocks.map((b, i) => <SheetBlock key={i} b={b} />)}

      <section aria-label={s.signedOnline} className="mt-12 grid gap-10 border-t border-[var(--paper-ink)] pt-8 sm:grid-cols-2">
        <div className="flex flex-col">
          <p className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.15em] text-[var(--paper-muted)]">{s.provider}</p>
          <Signature name="Younes Ouali" label={s.provider} />
          <span aria-hidden className="h-px bg-[var(--paper-ink)]" />
          <p className="mt-2 text-sm">Younes Ouali · OriginForge</p>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[var(--paper-muted)]">{s.date} · {day(lang, contract.created_at)}</p>
        </div>
        <div className="relative flex flex-col">
          <p className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.15em] text-[var(--paper-muted)]">{s.client}</p>
          {signed ? (
            <Signature key={writing ? "writing" : "signed"} name={signed.name} writing={!!writing} label={s.client} />
          ) : preview && preview.trim().length >= 3 ? (
            <Signature name={preview.trim()} faint label={s.signHere} />
          ) : (
            <span className="flex h-24 items-end pb-3 text-sm italic text-[var(--paper-muted)]">{s.signHere}</span>
          )}
          <span aria-hidden className={cn("h-px", signed ? "bg-[var(--paper-ink)]" : "bg-[repeating-linear-gradient(90deg,var(--paper-muted)_0_4px,transparent_4px_8px)]")} />
          <p className="mt-2 text-sm">{signed ? signed.name : s.pending}</p>
          {signed && (
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[var(--paper-muted)]"
              style={writing ? { animation: "step-in 0.5s 1.6s var(--ease-out) both" } : undefined}>
              {s.signedOnline} · {dateTime(lang, signed.at)}
            </p>
          )}
          {signed && contract.sha256 && (
            <div aria-label={`${s.fingerprint} SHA-256 ${contract.sha256}`}
              className="sign-seal pointer-events-none absolute -right-2 -top-4 flex w-44 rotate-[-7deg] flex-col items-center gap-1 border-2 border-[var(--ember-700)] px-3 py-2 text-center text-[var(--ember-700)] sm:-right-4"
              style={writing ? { animation: "seal-press 0.5s 2.1s cubic-bezier(0.2, 0.9, 0.3, 1.2) both" } : undefined}>
              <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em]">{s.stamp}</span>
              <span className="font-mono text-[0.6rem] tracking-[0.08em]">SHA-256</span>
              <span className="break-all font-mono text-[0.58rem] leading-tight">{contract.sha256.slice(0, 16)}<br />{contract.sha256.slice(16, 32)}…</span>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}

export function ContractPanel({
  lang, t, side, reload, contract, reference, defaultName,
}: PanelProps & { contract: Contract; reference: string; defaultName: string }) {
  const s = t.project.contract;
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState<{ name: string; at: string } | null>(null);
  const [error, setError] = useState<string>();
  const pending = contract.status === "pending" && !writing;

  const sign = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/contracts/${contract.id}/sign/`, { signed_name: name, agree });
      // The signature is written on the sheet before the page moves on to the deposit.
      setWriting({ name: name.trim(), at: new Date().toISOString() });
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => reload(), reduce ? 600 : SIGNING_MS);
    } catch (err) {
      setError(errorText(t, err, "agree", "signed_name"));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {pending && side === "client" && <p className="max-w-2xl leading-relaxed text-muted">{s.lead}</p>}
      <ContractSheet lang={lang} t={t} contract={contract} reference={reference} preview={pending && side === "client" ? name : undefined} writing={writing} />

      {pending && side === "client" ? (
        <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-5">
          <Field label={s.name}>
            {(a) => <Input id={a.id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="font-serif text-lg italic sm:max-w-md" />}
          </Field>
          <ChoiceChip label={s.agree} checked={agree} onChange={(e) => setAgree(e.target.checked)} className="sm:max-w-xl" />
          <ErrorLine>{error}</ErrorLine>
          <Button variant="ember" disabled={!agree || name.trim().length < 3} loading={busy} onClick={sign}>{s.sign}</Button>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[52rem] flex-wrap items-center justify-between gap-4">
          {contract.signed_at || writing ? (
            <Hud tone="ink" dot>{fill(s.signed, { name: writing?.name ?? contract.signed_name, date: dateTime(lang, writing?.at ?? contract.signed_at!) })}</Hud>
          ) : (
            <Hud tone="muted">{s.waiting}</Hud>
          )}
          {!writing && (
            <Button variant="ghost" size="sm" onClick={() => printContract(contract, reference)}>
              <Printer aria-hidden className="size-3.5" />{s.print}
            </Button>
          )}
        </div>
      )}
      {contract.signed_at && !writing && (
        <p className="hud mx-auto w-full max-w-[52rem] break-all text-faint">{s.fingerprint} · SHA-256 {contract.sha256}</p>
      )}
    </div>
  );
}
