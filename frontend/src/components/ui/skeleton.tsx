import { cn } from "@/lib/cn";

/** A placeholder block while data loads (globals.css .skeleton): hidden from assistive tech. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block", className)} />;
}

/**
 * Rows of a list still loading, in the shape of the real rows, so nothing
 * jumps when they arrive. `label` is announced instead.
 */
export function SkeletonRows({ rows = 4, label, className }: { rows?: number; label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("divide-y divide-line border-t border-line", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid gap-3 px-6 py-5 md:grid-cols-[8rem_1fr_auto] md:items-center md:px-10">
          <Skeleton className="h-3 w-20" />
          <span className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3 max-w-sm" />
            <Skeleton className="h-3 w-1/3 max-w-48" />
          </span>
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}
