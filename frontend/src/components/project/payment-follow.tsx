"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { Engagement, PaymentState } from "@/lib/lifecycle";
import { BootText } from "@/motion/glitch";

type P = Dictionary["project"]["pay"];

// The payment this page follows lives in the address (?payment=): set by the
// way back from Chargily or PayPal's page, or by the PayPal popup
// (followPayment). Another project's address follows nothing.
const listeners = new Set<() => void>();
let seen: { search: string; id: number | null } | null = null;

function fromUrl(): number | null {
  if (seen?.search !== location.search) {
    const v = new URLSearchParams(location.search).get("payment");
    seen = { search: location.search, id: v && /^\d+$/.test(v) ? Number(v) : null };
  }
  return seen.id;
}

function setUrl(id: number | null) {
  const url = new URL(location.href);
  if (id === null) url.searchParams.delete("payment");
  else url.searchParams.set("payment", String(id));
  history.replaceState(history.state, "", url);
}

const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  read: fromUrl,
};

export function followPayment(id: number | null) {
  setUrl(id);
  listeners.forEach((l) => l());
}

const POLL_MS = 2500;
const SLOW_AFTER_MS = 45_000;

type Step = "done" | "active" | "failed" | "waiting";

function Node({ state, label, last }: { state: Step; label: string; last?: boolean }) {
  return (
    <li className={cn("flex min-w-0 items-center gap-3", !last && "flex-1")}>
      <span className={cn(
        "flex size-6 shrink-0 items-center justify-center border transition-colors duration-[var(--dur-standard)]",
        state === "done" ? "border-ember-500 bg-ember-500 text-bg [animation:step-in_var(--dur-standard)_var(--ease-out)]"
          : state === "active" ? "border-ember-400 text-ember-400" : state === "failed" ? "border-err text-err" : "border-line text-faint",
      )}>
        {state === "done" ? <Check aria-hidden className="size-3.5" /> : state === "failed" ? <X aria-hidden className="size-3.5" />
          : <span aria-hidden className="size-1.5 bg-current" style={state === "active" ? { animation: "live-pulse 1.6s ease-in-out infinite" } : undefined} />}
      </span>
      <span className={cn("hud truncate", state === "waiting" ? "text-faint" : "text-ink")}>{label}</span>
      {!last && (
        <span aria-hidden className="relative hidden h-0.5 min-w-6 flex-1 bg-line sm:block">
          {state === "done" && <span className="pay-fill absolute inset-0 bg-ember-500" />}
        </span>
      )}
    </li>
  );
}

/**
 * After paying online, the project follows that payment until it settles:
 * page opened, paid at the provider, confirmed here. It asks every few
 * seconds (the server chases a late provider notice), refreshes the project
 * once it is paid so the progress bar fills, and says plainly what happened
 * when it didn't go through.
 */
export function PaymentFollow({ p, engagement, reload }: { p: P; engagement: Engagement; reload: () => Promise<void> }) {
  const id = useSyncExternalStore(store.subscribe, store.read, () => null);
  const [state, setState] = useState<PaymentState | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (id === null) return;
    let alive = true;
    let timer: number | undefined;
    const started = Date.now();
    const poll = async () => {
      try {
        const s = await api.get<PaymentState>(`/payments/${id}/`);
        if (!alive) return;
        setState(s);
        if (s.status === "pending") {
          setSlow(Date.now() - started > SLOW_AFTER_MS);
          timer = window.setTimeout(poll, Date.now() - started > 3 * SLOW_AFTER_MS ? 4 * POLL_MS : POLL_MS);
        } else if (s.status === "paid") {
          await reload();
        }
      } catch (err) {
        if (!alive) return;
        // Not this client's payment: stop following. A dropped connection: keep asking.
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) followPayment(null);
        else timer = window.setTimeout(poll, 2 * POLL_MS);
      }
    };
    poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [id, reload]);

  // Another project's payment (a stale address) is not shown here.
  if (id === null || !state || state.id !== id || !engagement.charges.some((c) => c.id === state.charge)) return null;

  const tr = p.track;
  const provider = tr.providers[state.provider];
  const charge = engagement.charges.find((c) => c.id === state.charge);
  const paid = state.status === "paid";
  const over = ["failed", "canceled", "expired"].includes(state.status);
  const held = state.status === "pending" && !!state.detail;
  const message = paid ? fill(tr.paid, { label: charge?.label ?? "" })
    : state.status === "canceled" ? tr.canceled : over ? tr.failed
      : held ? fill(tr.held, { provider }) : slow ? tr.slow : fill(tr.waiting, { provider });

  return (
    <section aria-live="polite" className={cn("relative overflow-hidden border-t border-line px-6 py-6 md:px-10",
      paid ? "bg-ember-500/[0.06]" : over ? "bg-err/[0.05]" : "bg-cell")}>
      {!paid && !over && <span aria-hidden className="pay-busy absolute inset-x-0 top-0 h-px w-1/3" />}
      <div className="flex items-start justify-between gap-4">
        <p className="hud text-muted">{tr.title}</p>
        {(paid || over || held) && (
          <button type="button" onClick={() => followPayment(null)} className="hud text-faint transition-colors hover:text-ink">{tr.close}</button>
        )}
      </div>
      <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <Node state="done" label={tr.opened} />
        <Node state={paid ? "done" : over ? "failed" : "active"} label={fill(tr.atProvider, { provider })} />
        <Node state={paid ? "done" : "waiting"} label={tr.confirmed} last />
      </ol>
      <p key={message} className={cn("mt-4 text-sm leading-relaxed", paid ? "text-ink" : over ? "text-err" : "text-muted")}>
        <BootText text={message} />
      </p>
    </section>
  );
}
