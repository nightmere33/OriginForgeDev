import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ember" | "secondary" | "ghost";
type Size = "md" | "sm";

const base =
  "group/btn relative inline-flex w-fit select-none items-center justify-center gap-2 whitespace-nowrap rounded-none " +
  "font-mono font-bold uppercase tracking-[0.12em] text-hud " +
  "transition-[background-color,color,border-color,translate] duration-[var(--dur-micro)] ease-out " +
  "active:translate-y-px data-[loading]:pointer-events-none disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-steel-50 text-steel-950 hover:bg-steel-200",
  ember:
    "bg-ember-500 text-on-ember hover:bg-ember-600 shadow-[0_18px_48px_-24px_rgb(255_106_26/0.55)]",
  secondary: "border border-line-strong bg-transparent text-ink hover:border-transparent hover:bg-steel-50 hover:text-steel-950",
  ghost: "text-muted hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "h-12 px-6",
  sm: "h-9 px-4",
};

type Common = {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  loading?: boolean;
  children: ReactNode;
  className?: string;
};

function Inner({ children, arrow, loading }: Pick<Common, "children" | "arrow" | "loading">) {
  return (
    <>
      <span className={cn("inline-flex items-center gap-2 transition-[opacity,filter] duration-[var(--dur-standard)]", loading && "opacity-0 blur-sm")}>
        {children}
        {arrow && (
          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform duration-[var(--dur-standard)] ease-out group-hover/btn:translate-x-0.5 rtl:rotate-180"
          />
        )}
      </span>
      {loading && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1 bg-current" style={{ animation: `live-pulse 900ms ${i * 150}ms ease-in-out infinite` }} />
          ))}
        </span>
      )}
    </>
  );
}

export function ButtonLink({
  href, variant = "primary", size = "md", arrow, className, children, ...rest
}: Common & Omit<ComponentProps<typeof Link>, "className" | "children">) {
  const external = typeof href === "string" && /^(https?:|mailto:|tel:)/.test(href);
  const classes = cn(base, variants[variant], sizes[size], className);
  if (external) {
    return (
      <a href={href as string} className={classes} {...(href.toString().startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        <Inner arrow={arrow}>{children}</Inner>
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      <Inner arrow={arrow}>{children}</Inner>
    </Link>
  );
}

export function Button({
  variant = "primary", size = "md", arrow, loading, className, children, disabled, type = "button", ...rest
}: Common & Omit<ComponentProps<"button">, "className" | "children">) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...rest}
    >
      <Inner arrow={arrow} loading={loading}>
        {children}
      </Inner>
    </button>
  );
}
