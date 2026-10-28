"use client";

import { useLiveRefresh } from "@/lib/live";
import { ReviewPanel } from "@/components/reviews/review-form";
import { fill } from "@/i18n/fill";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Download, Mail, MessageCircle, Phone, Trash2 } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { api, ApiError, type User } from "@/lib/api-client";
import { day, stageOf, type ProjectRequest } from "@/lib/lifecycle";
import { fetchSession, useSession } from "@/lib/session";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Select, Textarea, formatBytes } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { StatusPill } from "@/components/ui/status";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { ContractPanel } from "@/components/project/contract-panel";
import { Conversation } from "@/components/project/conversation";
import { DueCharge, PaymentsLedger } from "@/components/project/payments-panel";
import { ProposalBuilder } from "@/components/project/proposal-builder";
import { ProposalCard } from "@/components/project/proposal-card";
import { NextStep, Panel, type Side, type T } from "@/components/project/shared";
import { StageTrack } from "@/components/project/stage-track";
import { briefFor, briefRows, featureLabel, say } from "@/components/start/briefs";
import { QueueCard } from "@/components/start/queue-notice";
import { ClientReview, WorkPanel } from "@/components/project/work-panel";

export type { ProjectRequest };

/** Signed-out visitors go to login; clients can't open the studio. */
export function useGuard(lang: Locale, developer = false): User | null | undefined {
  const user = useSession();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace(`/${lang}/login?next=${encodeURIComponent(location.pathname)}`);
    else if (user && developer && !user.is_developer) router.replace(`/${lang}/portal`);
  }, [user, developer, lang, router]);
  return user && developer && !user.is_developer ? undefined : user;
}

function useRequests(enabled: boolean, status?: string) {
  const [items, setItems] = useState<ProjectRequest[] | null>(null);
  const [version, setVersion] = useState(0);
  // A new request or any move on one refreshes the list live.
  useLiveRefresh(() => setVersion((v) => v + 1));
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api.get<{ results: ProjectRequest[] }>(`/requests/${status ? `?status=${status}` : ""}`)
      .then((r) => alive && setItems(r.results), () => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [enabled, status, version]);
  return [items, () => setVersion((v) => v + 1)] as const;
}

/** Delete an unsent draft from the list (asks once, inline). */
function DeleteDraft({ t, reference, onDeleted }: { t: T; reference: string; onDeleted?: () => void }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    await api.delete(`/requests/${encodeURIComponent(reference)}/`).then(onDeleted, () => setBusy(false));
  };
  return (
    <span className="absolute right-6 top-5 z-10 flex items-center gap-3 md:right-16 md:top-1/2 md:-translate-y-1/2">
      {ask ? (
        <>
          <button type="button" onClick={remove} disabled={busy} className="hud text-err hover:underline">{t.portal.deleteDraftConfirm}</button>
          <button type="button" onClick={() => setAsk(false)} className="hud text-faint hover:text-ink">{t.portal.deleteDraftKeep}</button>
        </>
      ) : (
        <button type="button" onClick={() => setAsk(true)} aria-label={`${t.portal.deleteDraft} ${reference}`} className="text-faint transition-colors hover:text-err">
          <Trash2 aria-hidden className="size-4" />
        </button>
      )}
    </span>
  );
}

/** The project's stage once there is one, else the request's. */
const statusOf = (req: ProjectRequest) => req.engagement?.status ?? req.engagement_status ?? req.status;
const statusLabel = (t: T, req: ProjectRequest) => {
  const s = statusOf(req);
  return t.project.statuses[s as keyof T["project"]["statuses"]] ?? t.portal.statuses[s as keyof T["portal"]["statuses"]] ?? s;
};

function Loading({ t }: { t: T }) {
  return <SkeletonRows label={t.common.loading} />;
}

/** A project hub on its way: its header, stage track and first panels, in outline. */
function HubLoading({ t }: { t: T }) {
  return (
    <div role="status" aria-label={t.common.loading} className="border-t border-line">
      <div className="flex flex-col gap-3 px-6 py-8 md:px-10">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3 max-w-xl" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="grid grid-cols-4 gap-px border-y border-line bg-line md:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => <span key={i} className={cn("bg-bg px-3 py-4", i > 3 && "hidden md:block")}><Skeleton className="h-2 w-full" /></span>)}
      </div>
      <div className="grid gap-px bg-line lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3 bg-bg px-6 py-8 md:px-10">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestRows({ lang, t, items, base, showClient, onChange }: { lang: Locale; t: T; items: ProjectRequest[]; base: string; showClient?: boolean; onChange?: () => void }) {
  if (!items.length) return <p className="px-6 py-16 text-muted md:px-10">{t.portal.empty}</p>;
  return (
    <ul className="divide-y divide-line border-t border-line">
      {items.map((r) => {
        const draft = r.status === "draft" && !showClient;
        // An unsent draft reopens in the wizard, where it was left.
        const href = draft ? `/${lang}/start?draft=${encodeURIComponent(r.reference)}` : `${base}/${r.reference}`;
        return (
          <li key={r.reference} className="relative">
            {draft && <DeleteDraft t={t} reference={r.reference} onDeleted={onChange} />}
            <Link href={href} className="group/row grid gap-3 px-6 py-5 transition-colors hover:bg-cell md:grid-cols-[8rem_1fr_auto_auto] md:items-center md:px-10">
              <span className="hud text-faint">{r.reference}</span>
              <span>
                <span className="block text-ink">{r.title || "·"}</span>
                <span className="text-sm text-faint">
                  {showClient && r.client ? `${r.client.full_name} · ` : ""}
                  {r.service_title ?? "·"} · {day(lang, r.created_at)}
                </span>
              </span>
              <StatusPill status={statusOf(r)} label={statusLabel(t, r)} />
              <span className={cn("hidden items-center gap-2 md:flex", draft && "md:pr-10")}>
                {draft && <span className="hud text-ember-400">{t.portal.continueDraft}</span>}
                <ArrowUpRight aria-hidden className="size-4 text-faint transition-colors group-hover/row:text-ember-400" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function VerifyBanner({ t, user }: { t: T; user: User }) {
  const [sent, setSent] = useState(false);
  if (user.email_verified) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cell px-6 py-3 md:px-10">
      <Hud tone="ink" dot>{t.portal.verifyBanner}</Hud>
      <button type="button" disabled={sent} onClick={() => api.post("/auth/verify-email/resend/").then(() => setSent(true))} className="hud text-ember-400 hover:underline disabled:text-faint">
        {sent ? t.portal.resent : t.portal.resend}
      </button>
    </div>
  );
}

export function PortalHome({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang);
  const [items, refreshItems] = useRequests(!!user);
  const router = useRouter();
  const logout = async () => {
    await api.post("/auth/logout/");
    await fetchSession(true);
    router.push(`/${lang}`);
    router.refresh();
  };
  if (!user || !items) return <Loading t={t} />;
  return (
    <>
      <VerifyBanner t={t} user={user} />
      {!user.onboarded && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cell px-6 py-3 md:px-10">
          <Hud tone="ink" dot>{t.portal.onboardBanner}</Hud>
          <Link href={`/${lang}/welcome?next=${encodeURIComponent(`/${lang}/portal`)}`} className="hud text-ember-400 hover:underline">{t.portal.onboardCta}</Link>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-4 md:px-10">
        <Hud tone="muted">{t.portal.requests} · {items.length}</Hud>
        <div className="flex gap-3">
          <ButtonLink href={`/${lang}/portal/settings`} variant="ghost" size="sm">{t.portal.settings}</ButtonLink>
          <Button variant="ghost" size="sm" onClick={logout}>{t.auth.logout}</Button>
          <ButtonLink href={`/${lang}/start`} variant="ember" size="sm" arrow>{t.portal.new}</ButtonLink>
        </div>
      </div>
      <RequestRows lang={lang} t={t} items={items} base={`/${lang}/portal/requests`} onChange={refreshItems} />
    </>
  );
}

function useRequest(enabled: boolean) {
  const { ref } = useParams<{ ref: string }>();
  const [req, setReq] = useState<ProjectRequest | null | undefined>(undefined);
  const fetchOne = useCallback(
    () => api.get<ProjectRequest>(`/requests/${encodeURIComponent(ref)}/`).then(setReq, (err) => {
      if (err instanceof ApiError && err.status === 404) setReq(null);
    }),
    [ref],
  );
  useEffect(() => {
    if (enabled) fetchOne();
  }, [enabled, fetchOne]);
  const reload = useCallback(async () => {
    await fetchOne();
  }, [fetchOne]);
  // Progress the other side makes (offers, payments, milestones, messages) shows up at once.
  useLiveRefresh(fetchOne, ref, { messages: true });
  return { req, setReq, reload };
}

function Details({ lang, t, req }: { lang: Locale; t: T; req: ProjectRequest }) {
  // Labelled the way the client was asked (each service has its own questions).
  const brief = briefFor(req.service ?? "");
  const rows = [
    { k: t.studio.budget, v: req.budget_min || req.budget_max ? `${req.budget_min ?? "?"} – ${req.budget_max ?? "?"} ${req.budget_currency}` : "" },
    { k: t.studio.clientEstimate, v: req.estimate_low ? `${req.estimate_low} – ${req.estimate_high} ${req.estimate_currency}` : "" },
    { k: t.studio.deadline, v: req.deadline ? `${day(lang, req.deadline)}${req.deadline_flexible ? " · flexible" : ""}` : "" },
    ...(req.choices ?? []).map((c) => ({ k: c.factor, v: c.choice })),
    { k: say(lang, brief.goal), v: req.objectives },
    ...briefRows(lang, req.service ?? "", req.brief ?? {}).map((r) => ({ k: r.label, v: r.value })),
    { k: t.studio.features, v: req.features.map((f) => featureLabel(lang, f)).join(" · ") },
    { k: say(lang, brief.details), v: req.requirements },
    { k: t.studio.links, v: req.reference_links },
    { k: t.start.nda, v: req.wants_nda ? "✓" : "" },
  ].filter((r) => r.v);
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.k} className="grid gap-2 py-4 md:grid-cols-[12rem_1fr]">
          <dt className="hud text-faint">{r.k}</dt>
          <dd className="whitespace-pre-line break-words leading-relaxed text-ink">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Files({ req }: { req: ProjectRequest }) {
  const files = req.attachments.filter((a) => !a.is_voice);
  if (!files.length) return null;
  return (
    <ul className="mt-4 grid gap-px border border-line bg-line sm:grid-cols-2">
      {files.map((a) => (
        <li key={a.id} className="bg-bg">
          <a href={a.url} className="flex items-center gap-3 px-4 py-3 text-sm text-ink hover:text-ember-400">
            <Download aria-hidden className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate">{a.original_name}</span>
            <span className="hud text-faint">{formatBytes(a.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Header({ lang, t, req, back }: { lang: Locale; t: T; req: ProjectRequest; back: string }) {
  const stopped = ["declined", "withdrawn", "expired"].includes(req.status) || ["cancelled", "expired"].includes(req.engagement?.status ?? "");
  return (
    <>
      <div className="border-t border-line px-6 py-8 md:px-10">
        <Link href={back} className="hud text-muted hover:text-ink">← {t.portal.requests}</Link>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Hud tone="faint">{req.reference} · {req.service_title ?? "·"} · {day(lang, req.created_at)}</Hud>
            <h2 className="mt-2 text-h3 tracking-[-0.02em] text-ink-strong">{req.engagement?.title || req.title}</h2>
          </div>
          <StatusPill status={stopped ? "declined" : statusOf(req)} label={statusLabel(t, req)} />
        </div>
        {req.status_note && (
          <div className="mt-6 border-l-2 border-ember-500 bg-cell px-5 py-4">
            <Hud tone="ember">{t.portal.note}</Hud>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-ink">{req.status_note}</p>
          </div>
        )}
      </div>
      <StageTrack t={t} stage={stageOf(req)} stopped={stopped} />
    </>
  );
}

/** The one thing this side should do now, or null. */
function nextAction(lang: Locale, t: T, side: Side, req: ProjectRequest, reload: () => Promise<void>, user: User): ReactNode {
  const props = { lang, t, side, reload };
  const open = req.proposals?.find((p) => p.status === "sent");
  const eng = req.engagement;
  if (eng) {
    if (side === "client") {
      if (eng.charges.some((c) => c.status === "due")) return <DueCharge {...props} engagement={eng} reference={req.reference} />;
      if (eng.status === "client_review" || eng.milestones.some((m) => m.status === "review")) return <ClientReview {...props} engagement={eng} />;
    }
    return null;
  }
  if (req.contract?.status === "pending") {
    return side === "client"
      ? <ContractPanel {...props} contract={req.contract} reference={req.reference} defaultName={user.full_name} />
      : <p className="text-muted">{t.project.contract.waiting}</p>;
  }
  if (open?.can_respond) return <ProposalCard {...props} proposal={open} />;
  if (open) return <p className="text-muted">{side === "client" ? t.project.proposal.waitingYounes : t.project.proposal.waitingClient}</p>;
  return null;
}

function Hub({ lang, t, side, req, reload, user, top }: { lang: Locale; t: T; side: Side; req: ProjectRequest; reload: () => Promise<void>; user: User; top?: ReactNode }) {
  const props = { lang, t, side, reload };
  const action = nextAction(lang, t, side, req, reload, user);
  const eng = req.engagement;
  const open = req.proposals?.find((p) => p.status === "sent");
  const history = (req.proposals ?? []).filter((p) => p !== open || !action);
  const accepted = req.proposals?.find((p) => p.status === "accepted");
  const canPropose = side === "studio" && !eng && !req.contract && ["submitted", "in_review", "clarification", "proposal_sent"].includes(req.status)
    && (req.proposals?.length ?? 0) < 3 && (!open || open.from_client);

  return (
    <>
      <Header lang={lang} t={t} req={req} back={side === "client" ? `/${lang}/portal` : `/${lang}/studio/requests`} />
      {top}
      {action ? <NextStep t={t}>{action}</NextStep> : side === "client" && req.status !== "draft" && (
        <p className="border-t border-line px-6 py-6 text-muted md:px-10">{t.project.nothingToDo}</p>
      )}

      <div className="grid border-t border-line xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="min-w-0 xl:border-r xl:border-line [&>section:first-child]:border-t-0">
          {canPropose && (
            <Panel title={t.project.proposal.title}><ProposalBuilder lang={lang} t={t} reload={reload} req={req} /></Panel>
          )}
          {side === "client" && eng && ["live", "closed"].includes(eng.status) && (
            <Panel title={t.project.review.title}><ReviewPanel r={t.project.review} reference={req.reference} user={user} /></Panel>
          )}
          {eng && <Panel title={t.project.work.title}><WorkPanel {...props} engagement={eng} /></Panel>}
          {eng && <Panel title={t.project.pay.title}><PaymentsLedger {...props} engagement={eng} /></Panel>}
          {accepted && eng && (
            <Panel title={t.project.proposal.title}><ProposalCard {...props} proposal={accepted} /></Panel>
          )}
          {history.length > 0 && !(accepted && eng && history.length === 1) && (
            <Panel title={t.project.proposal.history}>
              <div className="divide-y divide-line border-y border-line">
                {history.filter((p) => p !== accepted || !eng).map((p) => <ProposalCard key={p.id} {...props} proposal={p} compact />)}
              </div>
            </Panel>
          )}
          {req.contract && req.contract.status !== "pending" && (
            <Panel title={t.project.contract.title}>
              <ContractPanel {...props} contract={req.contract} reference={req.reference} defaultName={user.full_name} />
            </Panel>
          )}
          <Panel title={t.portal.details}>
            <Details lang={lang} t={t} req={req} />
            <Files req={req} />
          </Panel>
        </div>
        <aside className="border-t border-line xl:border-t-0">
          <div className="xl:sticky xl:top-[calc(var(--nav-h)+1rem)]">
            <Panel title={`${t.project.chat.title}${req.unread ? ` · ${req.unread}` : ""}`} className="border-t-0">
              <Conversation lang={lang} t={t} side={side} reference={req.reference} enabled={req.status !== "draft"} />
            </Panel>
          </div>
        </aside>
      </div>
    </>
  );
}

export function PortalRequest({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang);
  const { req, reload } = useRequest(!!user);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || req === undefined) return <HubLoading t={t} />;
  if (req === null) return <p className="px-6 py-16 text-muted md:px-10">{t.common.notFoundText}</p>;

  const withdraw = async () => {
    setBusy(true);
    try {
      await api.post(`/requests/${req.reference}/transition/`, { to: "withdrawn" });
      setConfirming(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Hub lang={lang} t={t} side="client" req={req} reload={reload} user={user}
        top={req.queue ? <div className="border-t border-line px-6 py-8 md:px-10"><QueueCard lang={lang} s={t.start} queue={req.queue} /></div> : undefined} />
      {req.allowed_moves.includes("withdrawn") && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-6 md:px-10">
          {confirming ? (
            <>
              <p className="text-muted">{t.portal.withdrawConfirm}</p>
              <Button variant="secondary" size="sm" loading={busy} onClick={withdraw}>{t.portal.withdraw}</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>{t.common.close}</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>{t.portal.withdraw}</Button>
          )}
        </div>
      )}
    </>
  );
}

const FILTERS = ["", "submitted", "in_review", "clarification", "proposal_sent", "accepted", "declined", "expired", "withdrawn", "archived"] as const;

export function StudioInbox({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const [status, setStatus] = useState<string>("");
  const [items] = useRequests(!!user, status || undefined);
  if (!user) return <Loading t={t} />;
  return (
    <>
      <div role="toolbar" className="flex flex-wrap gap-2 border-t border-line px-6 py-4 md:px-10">
        {FILTERS.map((f) => (
          <button key={f || "all"} type="button" aria-pressed={status === f} onClick={() => setStatus(f)}
            className={cn("hud border px-3 py-2", status === f ? "border-ember-400 text-ink" : "border-line text-muted hover:text-ink")}>
            {f ? t.portal.statuses[f] : t.studio.all}
          </button>
        ))}
      </div>
      {items ? <RequestRows lang={lang} t={t} items={items} base={`/${lang}/studio/requests`} showClient /> : <Loading t={t} />}
    </>
  );
}

function ClientBar({ t, req }: { t: T; req: ProjectRequest }) {
  const c = req.client;
  if (!c) return null;
  const wa = c.whatsapp.replace(/[^\d]/g, "");
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-5 md:px-10">
      <Hud tone="faint" className="mr-auto">{t.studio.client} · {c.full_name}{c.company ? ` · ${c.company}` : ""}{c.country ? ` · ${c.country}` : ""}</Hud>
      <ButtonLink href={`mailto:${c.email}`} variant="secondary" size="sm"><Mail aria-hidden className="size-3.5" />{c.email}</ButtonLink>
      {c.phone && <ButtonLink href={`tel:${c.phone}`} variant="secondary" size="sm"><Phone aria-hidden className="size-3.5" />{c.phone}</ButtonLink>}
      {wa && <ButtonLink href={`https://wa.me/${wa}`} variant="secondary" size="sm"><MessageCircle aria-hidden className="size-3.5" />WhatsApp</ButtonLink>}
      {c.contact_channel === "instagram" && c.contact_handle && (
        <ButtonLink href={`https://instagram.com/${encodeURIComponent(c.contact_handle.replace(/^@/, ""))}`} variant="secondary" size="sm">@{c.contact_handle.replace(/^@/, "")}</ButtonLink>
      )}
      <Hud tone="faint" className="basis-full">
        {fill(t.studio.prefers, { channel: c.contact_channel_label + (c.contact_channel === "discord" && c.contact_handle ? ` (${c.contact_handle})` : "") })}
        {c.heard_from_label ? ` · ${fill(t.studio.foundVia, { source: c.heard_from_label + (c.heard_from_detail ? `: ${c.heard_from_detail}` : "") })}` : ""}
      </Hud>
    </div>
  );
}

/** Request-level moves that are not part of the proposal flow (review, clarification, decline). */
function MoveBar({ t, req, reload }: { t: T; req: ProjectRequest; reload: () => Promise<void> }) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!req.allowed_moves.length) return null;
  const apply = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/requests/${req.reference}/transition/`, { to, note });
      setTo("");
      setNote("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.field("note") ?? err.field("to") ?? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 border-t border-line px-6 py-6 md:grid-cols-[14rem_1fr_auto] md:items-end md:px-10">
      <Field label={t.studio.move}>
        {(a) => (
          <Select id={a.id} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">·</option>
            {req.allowed_moves.map((m) => (
              <option key={m} value={m}>{t.portal.statuses[m as keyof T["portal"]["statuses"]] ?? m}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t.portal.note} error={error}>
        {(a) => <Textarea id={a.id} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={note} placeholder={t.studio.notePlaceholder} onChange={(e) => setNote(e.target.value)} className="min-h-12" />}
      </Field>
      <Button variant="ember" disabled={!to} loading={busy} onClick={apply}>{t.studio.apply}</Button>
    </div>
  );
}

export function StudioRequest({ lang, t }: { lang: Locale; t: T }) {
  const user = useGuard(lang, true);
  const { req, reload } = useRequest(!!user);
  if (!user || req === undefined) return <HubLoading t={t} />;
  if (req === null) return <p className="px-6 py-16 text-muted md:px-10">{t.common.notFoundText}</p>;
  return (
    <Hub lang={lang} t={t} side="studio" req={req} reload={reload} user={user}
      top={<><ClientBar t={t} req={req} /><QueueBar lang={lang} t={t} req={req} reload={reload} /><MoveBar t={t} req={req} reload={reload} /></>} />
  );
}

/** The studio's view of a queued request: its place, and starting it now. */
function QueueBar({ lang, t, req, reload }: { lang: Locale; t: T; req: ProjectRequest; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!req.queue) return null;
  const q = t.studio.dash.queue;
  const take = async () => {
    setBusy(true);
    await api.post(`/studio/queue/${req.reference}/take/`).catch(() => undefined);
    await reload();
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line bg-ember-500/[0.05] px-6 py-4 md:px-10">
      <Hud tone="ember" dot live>{fill(q.position, { n: req.queue.position })}</Hud>
      {req.queue.start && <span className="text-sm text-muted">{fill(t.start.queue.start, { date: day(lang, req.queue.start) })}</span>}
      <Button variant="secondary" size="sm" className="ml-auto" loading={busy} onClick={take}>{q.take}</Button>
    </div>
  );
}
