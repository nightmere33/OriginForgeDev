"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/dictionaries";
import { useSession } from "@/lib/session";

/** The footer's account link: "Log in" for visitors, their own space once signed in. */
export function AccountLink({ lang, labels, className }: {
  lang: Locale; labels: { login: string; studio: string; portal: string }; className?: string;
}) {
  const user = useSession();
  const to = user ? { href: `/${lang}/${user.is_developer ? "studio" : "portal"}`, label: user.is_developer ? labels.studio : labels.portal }
    : { href: `/${lang}/login`, label: labels.login };
  return <Link href={to.href} className={className}>{to.label}</Link>;
}
