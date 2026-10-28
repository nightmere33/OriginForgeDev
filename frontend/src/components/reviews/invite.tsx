"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { fetchSession, useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Hud } from "@/components/ui/hud";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthGate } from "@/components/start/auth-gate";
import { BootText } from "@/motion/glitch";
import { ReviewForm } from "./review-form";

type T = Pick<Dictionary, "project" | "auth" | "start" | "common" | "reviews">;
type Info = {
  project: { slug: string; title: string; accent?: string; logo?: string | null; mark?: string | null };
  tagline: string; name: string; email_hint: string; used: boolean; matches: boolean;
};

/**
 * A review invitation for a project done before the platform: the project
 * (logo, line), then sign in or sign up with the invited address, then the
 * same review form clients use in their project hub.
 */
export function ReviewInvitePage({ lang, t }: { lang: Locale; t: T }) {
  const { token } = useParams<{ token: string }>();
  const i = t.reviews.invite;
  const user = useSession();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const load = useCallback(
    // Unknown, used up or expired: the page says so.
    () => api.get<Info>(`/reviews/invites/${encodeURIComponent(token)}/`).then(setInfo, () => setInfo(null)),
    [token],
  );
  useEffect(() => {
    if (user !== undefined) load();
  }, [user, load]);

  if (info === undefined || user === undefined) {
    return (
      <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4 border-t border-line px-6 py-10 md:px-10">
        <Skeleton className="size-14" /><Skeleton className="h-8 w-2/3 max-w-lg" /><Skeleton className="h-4 w-1/2 max-w-md" />
      </div>
    );
  }
  if (info === null) return <p className="border-t border-line px-6 py-16 text-muted md:px-10">{i.expired}</p>;

  const p = info.project;
  return (
    <div className="grid border-t border-line lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="flex flex-col gap-6 border-line px-6 py-10 md:px-10 lg:border-r">
        {p.mark ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small logo from the media server
          <img src={p.mark} alt="" width={56} height={56} className="size-14 object-contain [animation:step-in_var(--dur-standard)_var(--ease-out)]" />
        ) : <span aria-hidden className="size-3" style={{ background: p.accent || "var(--ember-500)" }} />}
        <h2 className="text-h2 tracking-[-0.035em] text-ink-strong"><BootText text={fill(i.title, { project: p.title })} /></h2>
        {info.tagline && <p className="text-lg leading-relaxed text-muted">{info.tagline}</p>}
        <Link href={`/${lang}/work/${p.slug}`} className="hud inline-flex w-fit items-center gap-2 text-muted transition-colors hover:text-ember-400">
          {t.reviews.aboutProject.replace("{project}", p.title)}<ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
        <p className="mt-auto flex gap-3 text-sm leading-relaxed text-faint">
          <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ember-400" />{i.note}
        </p>
      </aside>
      <div className="flex flex-col gap-6 px-6 py-10 md:px-10">
        {info.used || sent ? (
          <Hud tone="ink" dot><BootText text={i.thanks} /></Hud>
        ) : !user ? (
          <>
            <p className="text-muted">{fill(i.signIn, { email: info.email_hint })}</p>
            <AuthGate lang={lang} t={{ start: t.start, auth: t.auth, common: t.common }} onSignedIn={() => fetchSession(true).then(load)} />
          </>
        ) : !info.matches ? (
          <div className="flex flex-col gap-4">
            <Hud tone="ember" dot>{fill(i.otherEmail, { email: info.email_hint })}</Hud>
            <Button variant="secondary" size="sm" onClick={() => api.post("/auth/logout/").then(() => fetchSession(true)).then(load)}>{i.switch}</Button>
          </div>
        ) : (
          <ReviewForm r={t.project.review} user={user} initial={null} sendTo={`/reviews/invites/${encodeURIComponent(token)}/`} onDone={() => setSent(true)} />
        )}
      </div>
    </div>
  );
}
