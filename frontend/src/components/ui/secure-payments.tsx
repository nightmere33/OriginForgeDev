import { LockKeyhole } from "lucide-react";
import { cn } from "@/lib/cn";

export type TrustLabels = { title: string; text: string; manual: string };

// Acceptance marks on a transparent hairline cell. Brand colours on paper; on
// the dark theme the marks whose ink is dark (Algérie Poste navy, Chargily
// violet, CIB blue) switch to a lighter tint of the same colour.
const LOGOS: { src: string; dark?: string; alt: string; w: number; h: number; cls: string }[] = [
  { src: "/brand/pay/chargily.svg", dark: "/brand/pay/chargily-dark.svg", alt: "Chargily Pay", w: 68, h: 20, cls: "h-5" },
  // Square marks need more height to read at the same weight.
  { src: "/brand/pay/cib.svg", dark: "/brand/pay/cib-dark.svg", alt: "CIB", w: 28, h: 28, cls: "h-7" },
  { src: "/brand/pay/edahabia.svg", alt: "Edahabia", w: 20, h: 28, cls: "h-7" },
  { src: "/brand/pay/algerie-poste.svg", dark: "/brand/pay/algerie-poste-dark.svg", alt: "Algérie Poste (CCP, BaridiMob)", w: 28, h: 28, cls: "h-7" },
];

function Plate({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <li className="flex h-10 items-center justify-center border border-line px-3" title={label}>
      {children}
    </li>
  );
}

/**
 * "Secured payments": the line and the marks of every way to pay, where money
 * is mentioned (footer, start, payments). PayPal and USDT are set as type, not
 * as their logos.
 */
export function SecurePayments({ labels, compact, className }: { labels: TrustLabels; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", !compact && "md:flex-row md:items-center md:justify-between md:gap-8", className)}>
      <div className="flex max-w-xl gap-3">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
        <p className="text-sm leading-relaxed text-muted">
          <span className="text-ink">{labels.title}.</span> {labels.text}
          {!compact && <> {labels.manual}</>}
        </p>
      </div>
      <ul aria-label={labels.title} className="flex flex-wrap items-center gap-2">
        {LOGOS.map((l) => (
          <Plate key={l.src} label={l.alt}>
            {/* Small static SVG marks: next/image adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.src} alt={l.alt} width={l.w} height={l.h} loading="lazy" decoding="async" className={cn(l.cls, "w-auto", l.dark && "hidden [[data-theme=light]_&]:block")} />
            {l.dark && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.dark} alt={l.alt} width={l.w} height={l.h} loading="lazy" decoding="async" className={cn(l.cls, "w-auto [[data-theme=light]_&]:hidden")} />
            )}
          </Plate>
        ))}
        <Plate label="PayPal">
          <span className="text-[15px] font-bold italic tracking-[-0.02em] text-[var(--mark-paypal-1)]">Pay<span className="text-[var(--mark-paypal-2)]">Pal</span></span>
        </Plate>
        <Plate label="USDT (BEP20)">
          <span className="font-mono text-[12px] font-bold tracking-[0.04em] text-[var(--mark-tether)]">USDT</span>
        </Plate>
      </ul>
    </div>
  );
}
