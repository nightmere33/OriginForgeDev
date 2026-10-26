"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { dateTime, type Contract } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { ChoiceChip, Field, Input } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { ErrorLine, errorText, type PanelProps } from "./shared";

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

export function ContractPanel({
  lang, t, side, reload, contract, reference, defaultName,
}: PanelProps & { contract: Contract; reference: string; defaultName: string }) {
  const s = t.project.contract;
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = contract.status === "pending";

  const sign = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/contracts/${contract.id}/sign/`, { signed_name: name, agree });
      await reload();
    } catch (err) {
      setError(errorText(t, err, "agree", "signed_name"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {pending && side === "client" && <p className="max-w-2xl leading-relaxed text-muted">{s.lead}</p>}
      <div
        tabIndex={0}
        aria-label={s.title}
        className="max-h-[28rem] overflow-y-auto border border-line bg-bg-sunken px-5 py-5 text-[0.95rem] leading-relaxed text-ink [overscroll-behavior:contain] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400 md:px-8"
        data-lenis-prevent
      >
        <p className="whitespace-pre-line">{contract.body}</p>
      </div>

      {pending && side === "client" ? (
        <div className="flex flex-col gap-5">
          <Field label={s.name}>
            {(a) => <Input id={a.id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="font-serif text-lg italic sm:max-w-md" />}
          </Field>
          <ChoiceChip label={s.agree} checked={agree} onChange={(e) => setAgree(e.target.checked)} className="sm:max-w-xl" />
          <ErrorLine>{error}</ErrorLine>
          <Button variant="ember" disabled={!agree || name.trim().length < 3} loading={busy} onClick={sign}>{s.sign}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {contract.signed_at ? (
            <Hud tone="ink" dot>{fill(s.signed, { name: contract.signed_name, date: dateTime(lang, contract.signed_at) })}</Hud>
          ) : (
            <Hud tone="muted">{s.waiting}</Hud>
          )}
          <Button variant="ghost" size="sm" onClick={() => printContract(contract, reference)}>
            <Printer aria-hidden className="size-3.5" />{s.print}
          </Button>
        </div>
      )}
      {contract.signed_at && (
        <p className="hud break-all text-faint">{s.fingerprint} · SHA-256 {contract.sha256}</p>
      )}
    </div>
  );
}
