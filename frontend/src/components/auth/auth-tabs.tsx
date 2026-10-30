"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Locale } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { GlitchLabel } from "@/motion/glitch";
import { BootText } from "./auth-fx";
import { carry } from "./auth-forms";

type Mode = "login" | "register";
type Props = { lang: Locale; mode: Mode; label: string; tabs: Record<Mode, string> };

/** Sign in | Create account. Switching keeps the way back (?next=). */
export function AuthTabs(props: Props) {
  const params = useSearchParams();
  return <TabsNav {...props} query={carry(params.get("next"))} />;
}

export function TabsNav({ lang, mode, label, tabs, query = "" }: Props & { query?: string }) {
  return (
    <nav aria-label={label} className="grid grid-cols-2 border-b border-line">
      {(["login", "register"] as const).map((m) => (
        <Link
          key={m}
          href={`/${lang}/${m}${query}`}
          aria-current={m === mode ? "page" : undefined}
          className={cn(
            "hud relative flex h-11 items-center justify-center transition-colors duration-[var(--dur-micro)]",
            m === mode ? "text-ink" : "text-faint hover:bg-cell hover:text-ink",
          )}
        >
          {m === mode ? <BootText text={tabs[m]} delay={200} /> : <GlitchLabel text={tabs[m]} />}
          {m === mode && <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-ember-400" />}
        </Link>
      ))}
    </nav>
  );
}
