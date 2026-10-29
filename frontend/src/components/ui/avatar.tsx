import { cn } from "@/lib/cn";

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "·";

/**
 * A person's picture, or their initials on a quiet disc. `studio` without a
 * picture shows the OriginForge mark instead. Decorative: the name is always
 * written next to it.
 */
export function Avatar({ name, src, studio, className = "size-8" }: { name: string; src?: string; studio?: boolean; className?: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 384 px WebP made by the server; the box sets the size
      <img src={src} alt="" width={96} height={96} loading="lazy" decoding="async"
        className={cn("shrink-0 rounded-full object-cover shadow-[0_0_0_1px_var(--line)]", className)} />
    );
  }
  if (studio) {
    return (
      <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg", className)}>
        <span className="of-mark block size-[58%]" />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-cell font-mono text-[0.62rem] tracking-[0.04em] text-muted", className)}>
      {initials(name)}
    </span>
  );
}
