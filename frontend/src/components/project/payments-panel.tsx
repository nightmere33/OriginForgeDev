"use client";

import { SecurePayments } from "@/components/ui/secure-payments";
import { useEffect, useId, useState } from "react";
import { ArrowUpRight, FileText, Lock, Paperclip } from "lucide-react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { Equivalent } from "@/lib/currency";
import { cents, dateTime, day, money, type Charge, type Engagement, type PaymentInstructions, type Proof } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { followPayment } from "./payment-follow";
import { PaymentProgress } from "./payment-progress";
import { PayPalButton } from "./paypal-button";
import { CopyValue, ErrorLine, errorText, timeLeft, type PanelProps } from "./shared";

const CHARGE_TONE: Record<Charge["status"], string> = {
  scheduled: "submitted", due: "proposal_sent", paid: "paid", expired: "declined", void: "archived",
};
type Method = "card" | "paypal" | "ccp" | "baridimob" | "cash" | "usdt";
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

let instructionsCache: Promise<PaymentInstructions> | null = null;

function ChargeRow({ lang, t, charge }: Pick<PanelProps, "lang" | "t"> & { charge: Charge }) {
  const s = t.project.pay;
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
      <span className="text-ink">
        {charge.label} <span className="hud text-faint">{charge.percent} %</span>
      </span>
      <span className="hud text-faint">
        {charge.status === "paid" && charge.paid_at
          ? fill(s.paidOn, { date: day(lang, charge.paid_at) }) + (charge.paid_by ? ` · ${fill(s.paidVia, { method: s.methods[charge.paid_by] })}` : "")
          : charge.status === "due" && charge.due_at ? (charge.overdue ? s.overdue : fill(s.payBy, { date: day(lang, charge.due_at) })) : ""}
      </span>
      <span className="flex items-center justify-between gap-4 sm:justify-end">
        <span className="font-mono tabular-nums text-ink">{money(lang, charge.amount, charge.currency)}</span>
        <StatusPill status={charge.overdue ? "declined" : CHARGE_TONE[charge.status]} label={charge.overdue ? s.overdue : s.statuses[charge.status]} />
      </span>
    </div>
  );
}

function ProofLine({ lang, t, proof }: Pick<PanelProps, "lang" | "t"> & { proof: Proof }) {
  const s = t.project.pay;
  const text = proof.status === "pending" ? fill(s.proofPending, { date: day(lang, proof.created_at) })
    : proof.status === "rejected" ? fill(s.proofRejected, { note: proof.review_note }) : s.proofApproved;
  return (
    <p className={cn("flex items-start gap-2 text-sm", proof.status === "rejected" ? "text-err" : proof.status === "approved" ? "text-ok" : "text-muted")}>
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-current" />
      <span>{s[proof.method]} · {text}</span>
    </p>
  );
}

/** The latest card or PayPal attempt, when it says something the client should know. */
function AttemptLine({ lang, t, charge }: Pick<PanelProps, "lang" | "t"> & { charge: Charge }) {
  const s = t.project.pay;
  const last = charge.payments[0];
  if (!last) return null;
  const provider = s.track.providers[last.provider];
  const amount = last.provider_amount ? cents(lang, last.provider_amount, last.provider_currency) : "";
  const text = last.status === "failed" ? fill(s.attempt.failed, { provider, date: day(lang, last.created_at) })
    : last.status === "pending" && last.detail ? fill(s.attempt.held, { provider, amount }) : "";
  if (!text) return null;
  return (
    <p className={cn("flex items-start gap-2 text-sm", last.status === "failed" ? "text-err" : "text-muted")}>
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-current" />
      <span>{text}</span>
    </p>
  );
}

/** Card through Chargily: its secure page, back here afterwards. */
function CardPay({ t, charge }: Pick<PanelProps, "t"> & { charge: Charge }) {
  const s = t.project.pay;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const go = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.post<{ url: string }>(`/charges/${charge.id}/checkout/`, { provider: "chargily" });
      window.location.assign(res.url);
    } catch (err) {
      setBusy(false);
      setError(errorText(t, err, "provider", "status"));
    }
  };
  return (
    <div className="flex flex-col gap-5 border border-line bg-bg-sunken px-5 py-5 [animation:step-in_var(--dur-standard)_var(--ease-out)]">
      <div className="flex items-center gap-4">
        {/* eslint-disable @next/next/no-img-element -- small static marks, one per theme */}
        <img src="/brand/pay/cib.svg" alt="CIB" width={52} height={28} className="hidden h-7 w-auto [[data-theme=light]_&]:block" />
        <img src="/brand/pay/cib-dark.svg" alt="CIB" width={52} height={28} className="h-7 w-auto [[data-theme=light]_&]:hidden" />
        <img src="/brand/pay/edahabia.svg" alt="Edahabia" width={52} height={28} className="h-7 w-auto" />
        {/* eslint-enable @next/next/no-img-element */}
        <span className="hud ml-auto flex items-center gap-1.5 text-faint"><Lock aria-hidden className="size-3" />Chargily</span>
      </div>
      <p className="text-sm leading-relaxed text-muted">{s.cardLead}</p>
      <ErrorLine>{error}</ErrorLine>
      <Button variant="ember" loading={busy} onClick={go}>
        {busy ? s.opening : s.cardGo}<ArrowUpRight aria-hidden className="size-4" />
      </Button>
    </div>
  );
}

/** PayPal in its popup; a DZD charge shows the dollar quote and where its rate comes from. */
function PayPalPay({ lang, t, charge }: Pick<PanelProps, "lang" | "t"> & { charge: Charge }) {
  const s = t.project.pay;
  const quote = charge.online.paypal;
  const [error, setError] = useState<string>();
  if (!quote) return null;
  const conv = quote.conversion;
  return (
    <div className="flex flex-col gap-5 border border-line bg-bg-sunken px-5 py-5 [animation:step-in_var(--dur-standard)_var(--ease-out)]">
      <div>
        <p className="hud text-faint">{s.youPay}</p>
        <p className="mt-1 font-mono text-2xl tabular-nums tracking-[-0.03em] text-ink-strong">{cents(lang, quote.amount, quote.currency)}</p>
        {conv && (
          <p className="hud mt-2 text-faint">
            {fill(s.conversion, {
              amount: money(lang, charge.amount, charge.currency), rate: Number(conv.rate).toFixed(2),
              source: conv.source === "manual" ? s.rateManual : conv.source, time: conv.updated_at ? dateTime(lang, conv.updated_at) : "",
            })}
          </p>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-sm text-faint"><Lock aria-hidden className="mt-1 size-3 shrink-0" />{s.locked}</p>
      </div>
      <p className="text-sm leading-relaxed text-muted">{s.paypalLead}</p>
      <PayPalButton lang={lang} p={s} chargeId={charge.id} clientId={quote.client_id} currency={quote.currency}
        onApproved={(id) => followPayment(id)} onError={(err) => setError(err ? errorText(t, err, "provider", "status") : s.paypalError)} />
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}

/** Client: how to pay one due charge: online right away, or by hand and then "I've paid" with the receipt. */
function PayCharge({ lang, t, reload, charge, reference, engagement }: PanelProps & { charge: Charge; reference: string; engagement: Engagement }) {
  const s = t.project.pay;
  const online = charge.online;
  const [method, setMethod] = useState<Method>(online.chargily ? "card" : online.paypal ? "paypal" : "ccp");
  const [info, setInfo] = useState<PaymentInstructions | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [payer, setPayer] = useState("");
  const [ref, setRef] = useState("");
  const [txHash, setTxHash] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const fileId = useId();

  useEffect(() => {
    instructionsCache ??= api.get<PaymentInstructions>("/payments/instructions/");
    instructionsCache.then(setInfo, () => {
      instructionsCache = null;
    });
  }, []);

  const waiting = charge.proofs.some((p) => p.status === "pending");
  // Card is for dinars (Chargily), PayPal for any currency; "Soon" while their keys aren't set.
  // Cash by hand only where Younes allowed it in the proposal.
  const offered: Method[] = [
    ...(charge.currency === "DZD" ? (["card"] as const) : []), "paypal", "ccp", "baridimob",
    ...(info?.usdt_address ? (["usdt"] as const) : []), ...(engagement.cash_allowed ? (["cash"] as const) : []),
  ];
  const open = (m: Method) => (m === "card" ? !!online.chargily : m === "paypal" ? !!online.paypal : true);
  const manual = method !== "card" && method !== "paypal";

  const send = async () => {
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    form.append("method", method);
    if (receipt) form.append("receipt", receipt);
    form.append("payer_name", payer);
    form.append("transfer_reference", ref);
    form.append("tx_hash", txHash.trim());
    form.append("note", note);
    try {
      await api.post(`/charges/${charge.id}/proofs/`, form);
      setReceipt(null);
      await reload();
    } catch (err) {
      setError(errorText(t, err, "tx_hash", "receipt", "method"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PaymentProgress lang={lang} p={s} engagement={engagement} compact />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud text-faint">{charge.label} · {charge.percent} %</p>
          <p className="mt-2 font-mono text-3xl tabular-nums tracking-[-0.03em] text-ink-strong md:text-4xl">{money(lang, charge.amount, charge.currency)}</p>
          <Equivalent lang={lang} amount={charge.amount} currency={charge.currency} className="hud mt-2 block text-faint" />
        </div>
        {charge.due_at && (
          <Hud tone={charge.overdue ? "ember" : "ink"} dot live={!charge.overdue}>
            {fill(s.payBy, { date: day(lang, charge.due_at) })} · {timeLeft(t, charge.due_at)}
          </Hud>
        )}
      </div>
      {charge.kind === "deposit" && <p className="text-sm text-faint">{s.windowNote}</p>}

      {charge.proofs.length > 0 && <div className="flex flex-col gap-2">{charge.proofs.map((p) => <ProofLine key={p.id} lang={lang} t={t} proof={p} />)}</div>}
      <AttemptLine lang={lang} t={t} charge={charge} />

      {!waiting && (
        <>
          <div>
            <p className="hud mb-3 text-muted">{s.how}</p>
            <div role="radiogroup" aria-label={s.how} className="flex flex-wrap gap-2">
              {offered.map((m) => open(m) ? (
                <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                  className={cn("hud border px-3 py-2 transition-colors duration-[var(--dur-micro)]",
                    method === m ? "border-ember-400 text-ink shadow-[inset_0_0_0_1px_var(--ember-400)]" : "border-line text-muted hover:border-line-strong hover:text-ink")}>
                  {s[m]}
                </button>
              ) : (
                <span key={m} aria-disabled className="hud flex items-center gap-2 border border-dashed border-line px-3 py-2 text-faint">
                  {s[m]} <span className="text-[0.62rem] text-ember-400">{s.soon}</span>
                </span>
              ))}
              {info && !info.usdt_address && (
                <span aria-disabled className="hud flex items-center gap-2 border border-dashed border-line px-3 py-2 text-faint">
                  {s.usdt} <span className="text-[0.62rem] text-ember-400">{s.soon}</span>
                </span>
              )}
            </div>
          </div>

          {method === "card" && online.chargily && <CardPay key="card" t={t} charge={charge} />}
          {method === "paypal" && online.paypal && <PayPalPay key="paypal" lang={lang} t={t} charge={charge} />}
          {info && method === "usdt" && (
            <div className="border border-line bg-bg-sunken px-5">
              <div className="border-b border-line py-4">
                <p className="hud text-faint">{s.sendExactly}</p>
                <p className="mt-1 font-mono text-2xl tabular-nums text-ink-strong">{charge.usdt_amount}&nbsp;USDT</p>
                <p className="hud mt-2 text-faint">
                  {fill(s.rateLine, {
                    rate: info.usdt_rate.toFixed(2), source: info.rate_source === "manual" ? s.rateManual : info.rate_source,
                    time: info.rate_updated_at ? dateTime(lang, info.rate_updated_at) : "",
                  })}
                </p>
              </div>
              <CopyValue t={t} label={`${s.walletAddress} · ${info.usdt_network}`} value={info.usdt_address} />
              <p className="flex gap-2 border-t border-line py-3 text-sm text-warn">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-warn" />
                {s.networkWarning}
              </p>
            </div>
          )}
          {info && (method === "ccp" || method === "baridimob") && (
            <div className="border border-line bg-bg-sunken px-5">
              {method === "ccp" ? (
                <>
                  <CopyValue t={t} label={s.account} value={info.ccp_account} />
                  <CopyValue t={t} label={s.key} value={info.ccp_key} />
                  <CopyValue t={t} label={s.holder} value={info.ccp_holder} />
                  <CopyValue t={t} label={s.address} value={info.ccp_address} />
                </>
              ) : (
                <>
                  <CopyValue t={t} label={s.rip} value={info.baridimob_rip} />
                  <CopyValue t={t} label={s.holder} value={info.ccp_holder} />
                </>
              )}
              <p className="border-t border-line py-3 text-sm text-muted first:border-t-0">{fill(s.reference, { ref: reference })}</p>
            </div>
          )}
          {info && method === "cash" && info.cash_note && <p className="whitespace-pre-line text-muted">{info.cash_note}</p>}

          {manual && <div className="flex flex-col gap-5 border-t border-line pt-6">
            <p className="text-ink">{s.iPaid}</p>
            {method === "usdt" ? (
              <Field label={s.txHash} help={s.txHelp} error={txHash && !TX_HASH.test(txHash.trim()) ? "0x…" : undefined}>
                {(a) => (
                  <Input id={a.id} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={txHash} spellCheck={false}
                    autoCapitalize="off" autoCorrect="off" placeholder="0x" onChange={(e) => setTxHash(e.target.value)} className="font-mono text-sm" />
                )}
              </Field>
            ) : method !== "cash" ? (
              <>
                <div className="flex flex-col gap-2">
                  <span className="hud text-muted">{s.receipt}</span>
                  <label htmlFor={fileId}
                    className="flex cursor-pointer items-center gap-3 border border-dashed border-line-strong bg-cell px-4 py-4 text-sm text-muted transition-colors hover:border-ember-400 hover:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ember-400">
                    {receipt ? <FileText aria-hidden className="size-4 text-ember-400" /> : <Paperclip aria-hidden className="size-4" />}
                    <span className="min-w-0 truncate">{receipt?.name ?? t.start.filesLabel}</span>
                    <input id={fileId} type="file" accept="image/*,.pdf,.heic" className="sr-only"
                      onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={s.payerName}>{(a) => <Input id={a.id} value={payer} onChange={(e) => setPayer(e.target.value)} />}</Field>
                  <Field label={s.transferRef}>{(a) => <Input id={a.id} value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
                </div>
              </>
            ) : (
              <Field label={s.cashNote}>{(a) => <Textarea id={a.id} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-12" />}</Field>
            )}
            <ErrorLine>{error}</ErrorLine>
            <Button variant="ember" disabled={method === "usdt" ? !TX_HASH.test(txHash.trim()) : method !== "cash" && !receipt} loading={busy} onClick={send}>{s.send}</Button>
          </div>}
        </>
      )}
    </div>
  );
}

/** Studio: check a receipt, confirm cash, ask for the next payment. */
function StudioCharge({ lang, t, reload, charge }: PanelProps & { charge: Charge }) {
  const st = t.studio;
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string>();

  const run = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    setError(undefined);
    try {
      await api.post(path, body);
      setRejecting(null);
      setNote("");
      await reload();
    } catch (err) {
      setError(errorText(t, err, "note"));
    } finally {
      setBusy("");
    }
  };

  const pending = charge.proofs.filter((p) => p.status === "pending");
  if (!pending.length && charge.status !== "due" && !(charge.status === "scheduled" && charge.kind === "milestone")) return null;

  return (
    <div className="mb-4 flex flex-col gap-4 border border-line bg-cell px-5 py-5">
      {pending.map((p) => (
        <div key={p.id} className="flex flex-col gap-3">
          <p className="text-ink">
            {t.project.pay[p.method]} · {day(lang, p.created_at)}
            {p.payer_name && <span className="text-muted"> · {p.payer_name}</span>}
            {p.transfer_reference && <span className="font-mono text-muted"> · {p.transfer_reference}</span>}
          </p>
          {p.tx_hash && (
            <div className="flex flex-col gap-1">
              <a href={p.explorer_url} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-ink underline-offset-4 hover:text-ember-400 hover:underline">{p.tx_hash}</a>
              {p.crypto_amount && <p className="hud text-faint">{fill(t.project.pay.quote, { amount: p.crypto_amount, rate: Number(p.crypto_rate).toFixed(2) })}</p>}
            </div>
          )}
          {p.note && <p className="text-sm text-muted">{p.note}</p>}
          {rejecting === p.id && (
            <Field label={st.rejectNote}>{(a) => <Textarea id={a.id} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-12" />}</Field>
          )}
          <div className="flex flex-wrap gap-3">
            {p.receipt_url && (
              <a href={p.receipt_url} target="_blank" rel="noreferrer" className="hud inline-flex h-9 items-center gap-2 border border-line-strong px-4 text-ink hover:border-ember-400">
                <FileText aria-hidden className="size-3.5" />{st.viewReceipt}
              </a>
            )}
            {rejecting === p.id ? (
              <Button variant="secondary" size="sm" disabled={!note.trim()} loading={busy === `r${p.id}`}
                onClick={() => run(`r${p.id}`, `/proofs/${p.id}/review/`, { decision: "reject", note })}>{st.rejectPayment}</Button>
            ) : (
              <>
                <Button variant="ember" size="sm" loading={busy === `a${p.id}`} onClick={() => run(`a${p.id}`, `/proofs/${p.id}/review/`, { decision: "approve" })}>
                  {st.approvePayment} · {money(lang, charge.amount, charge.currency)}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRejecting(p.id)}>{st.rejectPayment}</Button>
              </>
            )}
          </div>
        </div>
      ))}
      {!pending.length && charge.status === "due" && (
        <Button variant="secondary" size="sm" loading={busy === "cash"} onClick={() => run("cash", `/charges/${charge.id}/cash/`)}>
          {st.recordCash} · {charge.label}
        </Button>
      )}
      {charge.status === "scheduled" && charge.kind === "milestone" && (
        <Button variant="secondary" size="sm" loading={busy === "req"} onClick={() => run("req", `/charges/${charge.id}/request/`)}>
          {st.requestPayment} · {charge.label}
        </Button>
      )}
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}

/** The client's next payment, on its own (used as the "next step"). */
export function DueCharge(props: PanelProps & { engagement: Engagement; reference: string }) {
  const due = props.engagement.charges.find((c) => c.status === "due");
  return due ? <PayCharge {...props} charge={due} /> : null;
}

export function PaymentsLedger(props: PanelProps & { engagement: Engagement }) {
  const { lang, t, side, engagement } = props;
  const total = engagement.charges.filter((c) => c.status !== "void").reduce((n, c) => n + c.amount, 0);
  // The client reads the progress bar (each share labelled under it); the
  // studio also keeps the ledger rows beside its actions.
  return (
    <div>
      {side === "studio" && engagement.charges.map((c) => <StudioCharge key={c.id} {...props} charge={c} />)}
      <PaymentProgress lang={lang} p={t.project.pay} engagement={engagement} />
      {side === "studio" && (
        <div className="mt-8 divide-y divide-line border-y border-line">
          {engagement.charges.map((c) => <ChargeRow key={c.id} lang={lang} t={t} charge={c} />)}
          <div className="flex items-baseline justify-between py-4">
            <span className="hud text-faint">{t.project.pay.total}</span>
            <span className="font-mono tabular-nums text-ink-strong">{money(lang, total, engagement.currency)}</span>
          </div>
        </div>
      )}
      {side === "client" && <SecurePayments labels={t.trust} compact className="mt-8" />}
    </div>
  );
}
