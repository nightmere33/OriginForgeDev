"use client";

import { useEffect, useRef, useState } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BootText, tearIn } from "@/motion/glitch";

type P = Dictionary["project"]["pay"];
type Started = { id: number; url: string; order_id: string; provider_amount: string; provider_currency: string };
type Buttons = { render: (el: HTMLElement) => Promise<void>; close: () => Promise<void> };
type PayPalSdk = { Buttons: (options: Record<string, unknown>) => Buttons };

const sdks = new Map<string, Promise<PayPalSdk>>();

/**
 * PayPal's own script, once per currency (an order must be in the currency
 * the script was loaded with), each under its own namespace.
 */
function loadSdk(clientId: string, currency: string, lang: Locale): Promise<PayPalSdk> {
  const ns = `paypal_${currency}`;
  const key = `${clientId}:${currency}:${lang}`;
  let sdk = sdks.get(key);
  if (!sdk) {
    sdk = new Promise<PayPalSdk>((resolve, reject) => {
      const scope = window as unknown as Record<string, PayPalSdk | undefined>;
      if (scope[ns]) return resolve(scope[ns]);
      const query = new URLSearchParams({
        "client-id": clientId, currency, intent: "capture", components: "buttons",
        "disable-funding": "paylater,venmo", locale: lang === "fr" ? "fr_FR" : "en_US",
      });
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?${query}`;
      script.async = true;
      script.setAttribute("data-namespace", ns);
      script.onload = () => (scope[ns] ? resolve(scope[ns]) : reject(new Error("PayPal script without its buttons")));
      script.onerror = () => {
        sdks.delete(key);
        script.remove();
        reject(new Error("PayPal script blocked"));
      };
      document.head.append(script);
    });
    sdks.set(key, sdk);
  }
  return sdk;
}

/**
 * Pay with PayPal (or a card PayPal accepts) in PayPal's popup over the page.
 * The order is made on our server when the payer clicks (the quote is locked
 * then), and captured on our server when they approve; `onApproved` hands the
 * payment to the page, which follows it until it is confirmed. The buttons
 * follow the theme (white on dark, black on light) and tear in like the rest
 * of the interface. If PayPal's script is blocked, its own page still works.
 */
export function PayPalButton({ lang, p, chargeId, clientId, currency, onApproved, onError }: {
  lang: Locale; p: P; chargeId: number; clientId: string; currency: string;
  onApproved: (paymentId: number) => void; onError: (err: unknown) => void;
}) {
  const theme = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const started = useRef<Started | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "blocked" | "busy">("loading");
  const [note, setNote] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const handlers = useRef({ onApproved, onError });
  useEffect(() => {
    handlers.current = { onApproved, onError };
  });

  useEffect(() => {
    let alive = true;
    let buttons: Buttons | null = null;
    loadSdk(clientId, currency, lang).then(async (paypal) => {
      const el = host.current;
      if (!alive || !el) return;
      buttons = paypal.Buttons({
        style: { layout: "vertical", color: theme === "light" ? "black" : "white", shape: "rect", label: "pay", height: 48, tagline: false },
        createOrder: async () => {
          setNote("");
          started.current = await api.post<Started>(`/charges/${chargeId}/checkout/`, { provider: "paypal" });
          return started.current.order_id;
        },
        // Shown only once PayPal has drawn them: no blank frame, no jump.
        onInit: () => {
          if (!alive) return;
          setPhase("ready");
          requestAnimationFrame(() => tearIn(host.current));
        },
        onApprove: async () => {
          const payment = started.current;
          if (!payment) return;
          setPhase("busy");
          const state = await api.post<{ status: string }>(`/payments/${payment.id}/approved/`).catch(() => null);
          // The tracker above follows it from here; the button is free again
          // (a refused payment can be tried once more, as a new order).
          handlers.current.onApproved(payment.id);
          setPhase("ready");
          if (state?.status === "failed") setNote(p.paypalError);
        },
        onCancel: () => setNote(p.paypalClosed),
        onError: (err: unknown) => {
          setPhase("ready");
          handlers.current.onError(err);
        },
      });
      el.replaceChildren();
      await buttons.render(el);
    }).catch(() => {
      if (alive) setPhase("blocked");
    });
    return () => {
      alive = false;
      buttons?.close().catch(() => undefined);
    };
  }, [clientId, currency, lang, theme, chargeId, p.paypalClosed, p.paypalError]);

  // PayPal's own page, when its script can't run here (a blocker, a strict browser).
  const viaPage = async () => {
    setRedirecting(true);
    try {
      const res = await api.post<Started>(`/charges/${chargeId}/checkout/`, { provider: "paypal" });
      window.location.assign(res.url);
    } catch (err) {
      setRedirecting(false);
      handlers.current.onError(err);
    }
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {/* The height of PayPal's two buttons and its line, kept while it loads. */}
      <div className="relative min-h-[7.25rem]">
        {phase === "loading" && (
          <div role="status" aria-label={p.paypalLoading} className="absolute inset-0 flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {/* PayPal's frame is a light page: on our dark scheme the browser would
            paint it an opaque backdrop. The same scheme keeps it see-through. */}
        <div ref={host} className={cn("relative [color-scheme:light] transition-opacity duration-[var(--dur-standard)]",
          phase === "loading" ? "opacity-0" : phase === "busy" ? "pointer-events-none opacity-30" : "opacity-100")} />
        {phase === "busy" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span aria-hidden className="relative block h-px w-40 overflow-hidden bg-line"><span className="pay-busy absolute inset-y-0 left-0 w-1/3" /></span>
            <p role="status" className="hud text-ink"><BootText text={p.confirming} /></p>
          </div>
        )}
      </div>
      {phase === "blocked" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{p.paypalBlocked}</p>
          <Button variant="secondary" loading={redirecting} onClick={viaPage}>{p.paypalGo}</Button>
        </div>
      )}
      {note && <p role="status" className="text-sm text-muted">{note}</p>}
    </div>
  );
}
