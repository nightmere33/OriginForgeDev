import { Plus } from "lucide-react";

/**
 * Hairline disclosure list on native <details>: keyboard, screen readers and
 * no-JS all work without help. The panel opens with the 0fr→1fr grid trick
 * (DESIGN.md §5) — no height animation.
 */
export function Accordion({ items }: { items: { id: string | number; question: string; answer: string }[] }) {
  return (
    <div className="divide-y divide-line border-t border-line">
      {items.map((item) => (
        <details key={item.id} className="group/acc" data-reveal>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 px-6 py-6 text-lg text-ink transition-colors duration-[var(--dur-micro)] hover:text-ink-strong md:px-10 [&::-webkit-details-marker]:hidden">
            <span className="max-w-3xl">{item.question}</span>
            <Plus
              aria-hidden
              className="mt-1 size-4 shrink-0 text-ember-400 transition-transform duration-[var(--dur-standard)] ease-out group-open/acc:rotate-45"
            />
          </summary>
          <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-[var(--dur-standard)] ease-out group-open/acc:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <p className="max-w-3xl px-6 pb-8 leading-relaxed text-muted md:px-10">{item.answer}</p>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
