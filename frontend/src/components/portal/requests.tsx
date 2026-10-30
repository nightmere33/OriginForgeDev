"use client";

import { useLiveRefresh } from "@/lib/live";
import { ReviewPanel } from "@/components/reviews/review-form";
import { fill } from "@/i18n/fill";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, Download, Mail, MessageCircle, Phone, Trash2 } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import { api, ApiError, type User } from "@/lib/api-client";
import { day, money, stageOf, type ProjectRequest, type RequestSummary } from "@/lib/lifecycle";
import { fetchSession, useSession } from "@/lib/session";
import { Button, ButtonLink } from "@/components/ui/button";
import { Beside, Field, Select, Textarea, formatBytes } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { StatusPill } from "@/components/ui/status";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { GridFill } from "@/components/ui/grid-fill";
import { BrandIcon } from "@/components/ui/brand-icon";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { scrollToElement } from "@/motion/smooth";
import { ContractPanel } from "@/components/project/contract-panel";
import { Conversation } from "@/components/project/conversation";
import { ExtrasPanel, InvoiceList } from "@/components/project/extras";
import { CarePanel, KeyDates, PlanCard } from "@/components/project/overview";
import { DueCharge, PaymentsLedger } from "@/components/project/payments-panel";
import { PaymentFollow } from "@/components/project/payment-follow";
import { openProjectTab, ProjectTabs, TabPanel, useProjectTab, type TabSpec } from "@/components/project/project-tabs";
import { ProposalBuilder } from "@/components/project/proposal-builder";
import { ProposalCard } from "@/components/project/proposal-card";
import { RevisionsPanel } from "@/components/project/revisions";
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
  // A new request, any move on one, or a new message refreshes the list live.
  useLiveRefresh(() => setVersion((v) => v + 1), undefined, { messages: true });
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

/** Delete an unsent draft (asks once, inline). */
function DeleteDraft({ t, reference, onDeleted, className }: { t: T; reference: string; onDeleted?: () => void; className?: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    await api.delete(`/requests/${encodeURIComponent(reference)}/`).then(onDeleted, () => setBusy(false));
  };
  return (
    <span className={cn("absolute z-10 flex items-center gap-3", className)}>
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

/** A project hub on its way: its header, stage track, tabs and first panel, in outline. */
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
      <div className="flex gap-6 border-b border-line px-6 py-4 md:px-10">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-3 w-16" />)}
      </div>
      <div className="flex flex-col gap-3 px-6 py-8 md:px-10">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

/** What is waiting, worded for the side reading it. */
function waitingText(t: T, side: Side, w: RequestSummary["waiting"]) {
  if (!w) return "";
  return side === "client" ? t.portal.cards.waiting[w] : t.studio.waiting[w];
}

/** Waiting on this side (an ember light), or on the other (a quiet note). */
const waitingOnMe = (side: Side, w: RequestSummary["waiting"]) =>
  side === "client" ? ["pay", "offer", "review", "sign", "answer"].includes(w) : ["proof", "offer_studio", "new"].includes(w);

/** The studio inbox: one row per request, with the plan, what is waiting and new messages. */
function RequestRows({ lang, t, items, base }: { lang: Locale; t: T; items: ProjectRequest[]; base: string }) {
  if (!items.length) return <p className="px-6 py-16 text-muted md:px-10">{t.portal.empty}</p>;
  return (
    <ul className="divide-y divide-line border-t border-line">
      {items.map((r) => {
        const s = r.summary;
        return (
          <li key={r.reference}>
            <Link href={`${base}/${r.reference}`} className="group/row grid gap-3 px-6 py-5 transition-colors hover:bg-cell md:grid-cols-[8rem_1fr_auto_auto] md:items-center md:px-10">
              <span className="hud text-faint">{r.reference}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-ink">{r.title || "·"}</span>
                <span className="text-sm text-faint">
                  {r.client ? `${r.client.full_name} · ` : ""}{r.service_title ?? "·"} · {day(lang, r.created_at)}
                </span>
                {(s?.plan || s?.waiting) && (
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {s.plan && <span className="hud text-muted">{fill(t.portal.cards.plan, { plan: s.plan })}</span>}
                    {s.waiting && <Hud tone={waitingOnMe("studio", s.waiting) ? "ember" : "faint"} dot={waitingOnMe("studio", s.waiting)}>{waitingText(t, "studio", s.waiting)}</Hud>}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                {s?.unread ? (
                  <span className="hud flex items-center gap-1.5 text-ember-400"><MessageCircle aria-hidden className="size-3.5" />{fill(t.portal.cards.unread, { n: s.unread })}</span>
                ) : null}
                <StatusPill status={statusOf(r)} label={statusLabel(t, r)} />
              </span>
              <ArrowUpRight aria-hidden className="hidden size-4 text-faint transition-colors group-hover/row:text-ember-400 md:block" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The client's projects as cards: status, what is next and on whom, how
 * much is paid, the plan, and new messages. A draft reopens in the wizard.
 */
function ProjectCards({ lang, t, items, onChange }: { lang: Locale; t: T; items: ProjectRequest[]; onChange: () => void }) {
  if (!items.length) return <p className="border-t border-line px-6 py-16 text-muted md:px-10">{t.portal.empty}</p>;
  return (
    <ul className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
      {items.map((r) => {
        const draft = r.status === "draft";
        const s = r.summary;
        const href = draft ? `/${lang}/start?draft=${encodeURIComponent(r.reference)}` : `/${lang}/portal/requests/${r.reference}`;
        const mine = s && waitingOnMe("client", s.waiting);
        return (
          <li key={r.reference} className="relative bg-bg">
            {draft && <DeleteDraft t={t} reference={r.reference} onDeleted={onChange} className="right-5 top-5" />}
            <Link href={href} className="group/card flex h-full flex-col gap-5 px-6 py-6 transition-colors hover:bg-cell md:px-7">
              <span className={cn("flex items-center justify-between gap-3", draft && "pr-8")}>
                <span className="hud text-faint">{r.reference}</span>
                {!draft && <StatusPill status={statusOf(r)} label={statusLabel(t, r)} />}
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="text-lg leading-snug text-ink-strong">{r.title || "·"}</span>
                <span className="text-sm text-faint">{r.service_title ?? "·"} · {day(lang, r.created_at)}</span>
              </span>
              {s && s.total > 0 && (
                <span className="flex flex-col gap-2">
                  <span aria-hidden className="relative block h-1.5 bg-line">
                    <span className="pay-fill absolute inset-y-0 left-0 bg-ember-500" style={{ width: `${s.percent}%`, "--d": "0.1s" } as CSSProperties} />
                  </span>
                  <span className="hud flex justify-between gap-3 text-faint">
                    <span>{fill(t.portal.cards.paid, { percent: s.percent })}</span>
                    <span className="tabular-nums">{money(lang, s.paid, s.currency || "DZD")} / {money(lang, s.total, s.currency || "DZD")}</span>
                  </span>
                </span>
              )}
              <span className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                {draft ? (
                  <span className="hud text-ember-400">{t.portal.continueDraft}</span>
                ) : s?.waiting ? (
                  <Hud tone={mine ? "ember" : "faint"} dot={mine} live={mine}>{waitingText(t, "client", s.waiting)}</Hud>
                ) : (
                  <Hud tone="faint">{s?.plan ? fill(t.portal.cards.plan, { plan: s.plan }) : t.portal.cards.none}</Hud>
                )}
                <span className="flex items-center gap-3">
                  {s?.unread ? (
                    <span className="hud flex items-center gap-1.5 text-ember-400"><MessageCircle aria-hidden className="size-3.5" />{fill(t.portal.cards.unread, { n: s.unread })}</span>
                  ) : null}
                  <ArrowUpRight aria-hidden className="size-4 text-faint transition-colors group-hover/card:text-ember-400" />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
      <GridFill count={items.length} cols={["sm:2", "xl:3"]} />
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
      <ReviewInvites lang={lang} t={t} />
      {!user.onboarded && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cell px-6 py-3 md:px-10">
          <Hud tone="ink" dot>{t.portal.onboardBanner}</Hud>
          <Link href={`/${lang}/welcome?next=${encodeURIComponent(`/${lang}/portal`)}`} className="hud text-ember-400 hover:underline">{t.portal.onboardCta}</Link>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-6 py-4 md:px-10">
        <Hud tone="muted">{t.portal.requests} · {items.length}</Hud>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/${lang}/portal/settings`} variant="ghost" size="sm">{t.portal.settings}</ButtonLink>
          <Button variant="ghost" size="sm" onClick={logout}>{t.auth.logout}</Button>
          <ButtonLink href={`/${lang}/start`} variant="ember" size="sm" arrow>{t.portal.new}</ButtonLink>
        </div>
      </div>
      <ProjectCards lang={lang} t={t} items={items} onChange={refreshItems} />
    </>
  );
}

/** Reviews Younes asked for (a project done before the platform, like MediGate). */
function ReviewInvites({ lang, t }: { lang: Locale; t: T }) {
  const [invites, setInvites] = useState<{ token: string; project: string }[]>([]);
  useEffect(() => {
    api.get<{ invites?: { token: string; project: string }[] }>("/reviews/mine/").then((d) => setInvites(d.invites ?? []), () => undefined);
  }, []);
  return invites.map((i) => (
    <div key={i.token} className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cell px-6 py-3 md:px-10">
      <Hud tone="ink" dot>{fill(t.portal.reviewInvite, { project: i.project })}</Hud>
      <Link href={`/${lang}/reviews/invite/${i.token}`} className="hud text-ember-400 hover:underline">{t.portal.reviewInviteCta}</Link>
    </div>
  ));
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
  // Grouped like every other amount: "78 000 – 101 000 DZD".
  const num = (n: number | null | undefined) => (n == null ? "?" : money(lang, n, "").trim());
  const range = (low: number | null | undefined, high: number | null | undefined, currency: string) => `${num(low)} – ${num(high)} ${currency}`;
  const rows = [
    { k: t.studio.budget, v: req.budget_min || req.budget_max ? range(req.budget_min, req.budget_max, req.budget_currency) : "" },
    { k: t.studio.clientEstimate, v: req.estimate_low ? range(req.estimate_low, req.estimate_high, req.estimate_currency) : "" },
    { k: t.studio.deadline, v: req.deadline ? `${day(lang, req.deadline)}${req.deadline_flexible ? " · flexible" : ""}` : "" },
    ...(req.choices ?? []).map((c) => ({ k: c.factor, v: c.choice })),
    { k: say(lang, brief.goal), v: req.objectives },
    ...briefRows(lang, req.service ?? "", req.brief ?? {}).map((r) => ({ k: r.label, v: r.value })),
    { k: t.studio.features, v: req.features.map((f) => featureLabel(lang, f)).join(" · ") },
    { k: say(lang, brief.details), v: req.requirements },
    { k: t.studio.links, v: req.reference_links },
    { k: t.start.showcase.title, v: req.wants_nda ? t.start.showcase.keep : t.start.showcase.show },
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

/** Every file of the project, newest first, with where it came from. */
function Files({ lang, t, side, req }: { lang: Locale; t: T; side: Side; req: ProjectRequest }) {
  const files = req.files ?? req.attachments.filter((a) => !a.is_voice).map((a) => ({ ...a, source: "request" as const }));
  const sources = side === "client" ? t.project.files.sources : t.project.files.studioSources;
  if (!files.length) return <p className="text-muted">{t.project.files.empty}</p>;
  return (
    <ul className="grid gap-px border border-line bg-line sm:grid-cols-2">
      {files.map((a) => (
        <li key={a.id} className="bg-bg">
          <a href={a.url} className="group/file flex items-center gap-3 px-4 py-3.5 text-sm text-ink transition-colors hover:bg-cell">
            <Download aria-hidden className="size-4 shrink-0 text-faint transition-colors group-hover/file:text-ember-400" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate">{a.original_name}</span>
              <span className="hud text-faint">{sources[a.source]} · {day(lang, a.created_at)}</span>
            </span>
            <span className="hud shrink-0 text-faint">{formatBytes(a.size)}</span>
          </a>
        </li>
      ))}
      <GridFill count={files.length} cols={["sm:2"]} />
    </ul>
  );
}

function Header({ lang, t, req, back }: { lang: Locale; t: T; req: ProjectRequest; back: string }) {
  const stopped = ["declined", "withdrawn", "expired"].includes(req.status) || ["cancelled", "expired"].includes(req.engagement?.status ?? "");
  const plan = req.engagement?.plan.name || req.summary?.plan;
  return (
    <>
      <div className="border-t border-line px-6 py-8 md:px-10">
        <Link href={back} className="hud -my-3 inline-flex min-h-11 items-center text-muted hover:text-ink">← {t.portal.requests}</Link>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Hud tone="faint">{req.reference} · {req.service_title ?? "·"} · {day(lang, req.created_at)}</Hud>
            <h2 className="mt-2 text-h3 tracking-[-0.02em] text-ink-strong">{req.engagement?.title || req.title}</h2>
          </div>
          <span className="flex flex-wrap items-center gap-3">
            {plan && <span className="hud border border-line-strong px-2.5 py-1 text-ink">{fill(t.portal.cards.plan, { plan })}</span>}
            <StatusPill status={stopped ? "declined" : statusOf(req)} label={statusLabel(t, req)} />
          </span>
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

/** The one thing this side should do now, or null. `contract` is the signing panel, built by the Hub. */
function nextAction(lang: Locale, t: T, side: Side, req: ProjectRequest, reload: () => Promise<void>, contract: ReactNode): ReactNode {
  const props = { lang, t, side, reload };
  const open = req.proposals?.find((p) => p.status === "sent");
  const eng = req.engagement;
  if (eng) {
    if (side === "client") {
      const due = eng.charges.some((c) => c.status === "due");
      const review = eng.status === "client_review" || eng.milestones.some((m) => m.status === "review");
      // The final payment falls due as the work goes to review: test it first, then pay.
      if (due && review) {
        return (
          <div className="flex flex-col gap-8">
            <ClientReview {...props} engagement={eng} />
            <div className="border-t border-line pt-8"><DueCharge {...props} engagement={eng} reference={req.reference} /></div>
          </div>
        );
      }
      if (due) return <DueCharge {...props} engagement={eng} reference={req.reference} />;
      if (review) return <ClientReview {...props} engagement={eng} />;
      // Signed while waiting in the queue: the deposit is asked when its turn comes.
      if (eng.status === "awaiting_deposit") return <p className="max-w-2xl leading-relaxed text-ink">{t.project.pay.depositLaterLead}</p>;
    }
    // Studio: a signed project waiting for its deposit (kept for its turn, or asked by a date).
    const deposit = eng.charges.find((c) => c.kind === "deposit");
    if (side === "studio" && eng.status === "awaiting_deposit" && deposit) {
      const text = deposit.status === "due" && deposit.due_at ? fill(t.project.pay.depositWaiting, { date: day(lang, deposit.due_at) }) : t.project.pay.depositKept;
      return (
        <p className="max-w-2xl leading-relaxed text-ink">
          {text}{" "}
          <Link href={`/${lang}/studio/requests/${req.reference}?tab=payments`} className="text-ember-400 underline-offset-4 hover:underline">{t.project.pay.openPayments}</Link>
        </p>
      );
    }
    return null;
  }
  if (req.contract?.status === "pending") {
    return side === "client" ? contract : <p className="text-muted">{t.project.contract.waiting}</p>;
  }
  if (open?.can_respond) return <ProposalCard {...props} proposal={open} />;
  if (open) return <p className="text-muted">{side === "client" ? t.project.proposal.waitingYounes : t.project.proposal.waitingClient}</p>;
  return null;
}

/**
 * One project, in tabs: Overview (what's next, the plan, key dates, care,
 * the request), Payments (schedule, extras and offers, invoices), Progress
 * (milestones, tasks, updates, revision rounds), Messages, Files, Contract.
 * The open tab is in the address, so every notification lands on its tab.
 */
function Hub({ lang, t, side, req, reload, user, top }: { lang: Locale; t: T; side: Side; req: ProjectRequest; reload: () => Promise<void>; user: User; top?: ReactNode }) {
  const props = { lang, t, side, reload };
  // While the signature is written, the panel stays put whatever the live refresh brings.
  const [signing, setSigning] = useState(false);
  const idBase = `project-${req.reference}`;
  const onSigning = async (phase: "start" | "failed" | "done") => {
    if (phase !== "done") return setSigning(phase === "start");
    await reload();
    setSigning(false);
    openProjectTab("overview");
    // The deposit replaces the long sheet: bring it into view once it is drawn.
    setTimeout(() => {
      const step = document.getElementById(`${idBase}-next`);
      if (step) scrollToElement(step);
    }, 80);
  };
  const contract = req.contract && (
    <ContractPanel {...props} contract={req.contract} reference={req.reference} defaultName={user.full_name} onSigning={onSigning} />
  );
  const action = signing ? contract : nextAction(lang, t, side, req, reload, contract);
  const eng = req.engagement;
  const open = req.proposals?.find((p) => p.status === "sent");
  const accepted = req.proposals?.find((p) => p.status === "accepted");
  const history = (req.proposals ?? []).filter((p) => p !== open || !action).filter((p) => p !== accepted || !eng);
  const canPropose = side === "studio" && !eng && !req.contract && ["submitted", "in_review", "clarification", "proposal_sent"].includes(req.status)
    && (req.proposals?.length ?? 0) < 3 && (!open || open.from_client);
  const tb = t.project.tabs;

  const paymentsWaiting = !!eng && (side === "client"
    ? eng.charges.some((c) => c.status === "due" || c.status === "proposed")
    : eng.charges.some((c) => c.proofs.some((p) => p.status === "pending")));
  const reviewWaiting = !!eng && side === "client" && (eng.status === "client_review" || eng.milestones.some((m) => m.status === "review"));
  const tabs: TabSpec[] = [
    { key: "overview", label: tb.overview, dot: !!action && !paymentsWaiting && !reviewWaiting },
    ...(eng ? [{ key: "payments" as const, label: tb.payments, dot: paymentsWaiting }, { key: "progress" as const, label: tb.progress, dot: reviewWaiting }] : []),
    { key: "messages", label: tb.messages, badge: req.unread || undefined },
    { key: "files", label: tb.files },
    ...(req.contract ? [{ key: "contract" as const, label: tb.contract, dot: req.contract.status === "pending" && side === "client" }] : []),
  ];
  const [tab, setTab] = useProjectTab(tabs);
  const nothing = side === "client" && req.status !== "draft" && <p className="border-t border-line px-6 py-6 text-muted md:px-10">{t.project.nothingToDo}</p>;

  return (
    <>
      <Header lang={lang} t={t} req={req} back={side === "client" ? `/${lang}/portal` : `/${lang}/studio/requests`} />
      {top}
      {side === "client" && eng && <PaymentFollow p={t.project.pay} engagement={eng} reload={reload} />}
      <ProjectTabs label={tb.label} tabs={tabs} active={tab} onChange={setTab} idBase={idBase} />
      <TabPanel idBase={idBase} active={tab}>
        {tab === "overview" && (
          <>
            {action ? <NextStep t={t} id={`${idBase}-next`}>{action}</NextStep> : nothing}
            {canPropose && <Panel title={t.project.proposal.title}><ProposalBuilder lang={lang} t={t} reload={reload} req={req} /></Panel>}
            {eng && (
              <Panel title={side === "client" ? t.project.plan.title : t.project.plan.studioTitle}>
                <div className="flex flex-col gap-6">
                  <PlanCard {...props} engagement={eng} confidential={eng.nda} />
                  <KeyDates lang={lang} t={t} engagement={eng} />
                </div>
              </Panel>
            )}
            {eng && ["live", "closed"].includes(eng.status) && (
              <Panel title={t.project.care.title}><CarePanel {...props} engagement={eng} reference={req.reference} onReported={() => setTab("messages")} /></Panel>
            )}
            {side === "client" && eng && ["live", "closed"].includes(eng.status) && (
              <Panel title={t.project.review.title}><ReviewPanel r={t.project.review} reference={req.reference} user={user} /></Panel>
            )}
            {!eng && history.length > 0 && (
              <Panel title={t.project.proposal.history}>
                <div className="divide-y divide-line border-y border-line">
                  {history.map((p) => <ProposalCard key={p.id} {...props} proposal={p} compact />)}
                </div>
              </Panel>
            )}
            <Panel title={t.portal.details}><Details lang={lang} t={t} req={req} /></Panel>
          </>
        )}

        {tab === "payments" && eng && (
          <>
            {side === "client" && eng.charges.some((c) => c.status === "due") && (
              <NextStep t={t}><DueCharge {...props} engagement={eng} reference={req.reference} /></NextStep>
            )}
            <Panel title={t.project.pay.title}><PaymentsLedger {...props} engagement={eng} /></Panel>
            {(side === "studio" || eng.charges.some((c) => c.kind === "extra")) && (
              <Panel title={t.project.extras.title}><ExtrasPanel {...props} engagement={eng} reference={req.reference} /></Panel>
            )}
            <Panel title={t.project.invoices.title}><InvoiceList lang={lang} t={t} engagement={eng} /></Panel>
          </>
        )}

        {tab === "progress" && eng && (
          <>
            {reviewWaiting && <NextStep t={t}><ClientReview {...props} engagement={eng} /></NextStep>}
            <Panel title={t.project.work.title}><WorkPanel {...props} engagement={eng} /></Panel>
            <Panel title={t.project.revisions.title}><RevisionsPanel {...props} engagement={eng} /></Panel>
          </>
        )}

        {tab === "messages" && (
          <Panel title={t.project.chat.title}>
            <Conversation lang={lang} t={t} side={side} reference={req.reference} enabled={req.status !== "draft"} onOpenTab={setTab}
              state={req.summary?.chat} closesAt={req.summary?.chat_closes_at} />
          </Panel>
        )}

        {tab === "files" && <Panel title={t.project.tabs.files}><Files lang={lang} t={t} side={side} req={req} /></Panel>}

        {tab === "contract" && req.contract && (
          <>
            <Panel title={t.project.contract.title}>{contract}</Panel>
            {accepted && <Panel title={t.project.proposal.title}><ProposalCard {...props} proposal={accepted} /></Panel>}
            {eng && history.length > 0 && (
              <Panel title={t.project.proposal.history}>
                <div className="divide-y divide-line border-y border-line">
                  {history.map((p) => <ProposalCard key={p.id} {...props} proposal={p} compact />)}
                </div>
              </Panel>
            )}
          </>
        )}
      </TabPanel>
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
      {items ? <RequestRows lang={lang} t={t} items={items} base={`/${lang}/studio/requests`} /> : <Loading t={t} />}
    </>
  );
}

function ClientBar({ t, req }: { t: T; req: ProjectRequest }) {
  const c = req.client;
  if (!c) return null;
  const wa = c.whatsapp.replace(/[^\d]/g, "");
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-5 md:px-10">
      <Avatar name={c.full_name} src={c.avatar_url} className="size-9" />
      <Hud tone="faint" className="mr-auto">{t.studio.client} · {c.full_name}{c.company ? ` · ${c.company}` : ""}{c.country ? ` · ${c.country}` : ""}</Hud>
      <ButtonLink href={`mailto:${c.email}`} variant="secondary" size="sm"><Mail aria-hidden className="size-3.5" />{c.email}</ButtonLink>
      {c.phone && <ButtonLink href={`tel:${c.phone}`} variant="secondary" size="sm"><Phone aria-hidden className="size-3.5" />{c.phone}</ButtonLink>}
      {wa && <ButtonLink href={`https://wa.me/${wa}`} variant="secondary" size="sm"><BrandIcon name="whatsapp" />WhatsApp</ButtonLink>}
      {(c.instagram || (c.contact_channel === "instagram" && c.contact_handle)) && (() => {
        const handle = (c.instagram || c.contact_handle).replace(/^@/, "");
        return <ButtonLink href={`https://instagram.com/${encodeURIComponent(handle)}`} variant="secondary" size="sm"><BrandIcon name="instagram" />Instagram · @{handle}</ButtonLink>;
      })()}
      {c.messenger && (
        <ButtonLink href={`https://m.me/${encodeURIComponent(c.messenger)}`} variant="secondary" size="sm"><MessageCircle aria-hidden className="size-3.5" />Messenger</ButtonLink>
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
    <div className="grid gap-4 border-t border-line px-6 py-6 md:grid-cols-[14rem_1fr_auto] md:items-start md:px-10">
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
        {(a) => <Textarea id={a.id} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={note} placeholder={t.studio.notePlaceholder} onChange={(e) => setNote(e.target.value)} rows={1} className="h-12 min-h-12" />}
      </Field>
      <Beside from="md">
        <Button variant="ember" disabled={!to} loading={busy} onClick={apply}>{t.studio.apply}</Button>
      </Beside>
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
