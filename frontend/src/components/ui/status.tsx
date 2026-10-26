import { cn } from "@/lib/cn";

const tones: Record<string, string> = {
  submitted: "text-muted [--dot:var(--steel-300)]",
  in_review: "text-warn [--dot:var(--warn)]",
  clarification: "text-warn [--dot:var(--warn)]",
  proposal_sent: "text-ember-400 [--dot:var(--ember-400)]",
  accepted: "text-ok [--dot:var(--ok)]",
  paid: "text-ok [--dot:var(--ok)]",
  declined: "text-err [--dot:var(--err)]",
  withdrawn: "text-faint [--dot:var(--steel-600)]",
  archived: "text-faint [--dot:var(--steel-600)]",
  draft: "text-faint [--dot:var(--steel-450)]",
  expired: "text-faint [--dot:var(--err)]",
  // Projects
  awaiting_deposit: "text-ember-400 [--dot:var(--ember-400)]",
  in_development: "text-ok [--dot:var(--ok)]",
  client_review: "text-ember-400 [--dot:var(--ember-400)]",
  awaiting_balance: "text-ember-400 [--dot:var(--ember-400)]",
  live: "text-ok [--dot:var(--ok)]",
  on_hold: "text-warn [--dot:var(--warn)]",
  closed: "text-faint [--dot:var(--steel-450)]",
  cancelled: "text-err [--dot:var(--err)]",
};

/** One tone per lifecycle stage (DESIGN.md §5). */
export function StatusPill({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <span className={cn("hud inline-flex items-center gap-2 border border-line px-2.5 py-1", tones[status] ?? "text-muted", className)}>
      <span aria-hidden className="size-1.5 bg-[var(--dot)]" />
      {label}
    </span>
  );
}
