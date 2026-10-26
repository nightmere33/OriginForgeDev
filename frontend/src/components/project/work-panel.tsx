"use client";

import { ForgeVideo } from "@/components/media/forge-video";
import { useId, useState } from "react";
import { Check, Circle, CircleDot, ImagePlus } from "lucide-react";
import { fill } from "@/i18n/fill";
import { api } from "@/lib/api-client";
import { dateTime, day, type Attachment, type Engagement, type EngagementStatus, type Milestone, type Task } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { ErrorLine, errorText, timeLeft, type PanelProps } from "./shared";

const MILESTONE_TONE: Record<Milestone["status"], string> = {
  planned: "submitted", active: "in_review", review: "proposal_sent", approved: "accepted", changes: "clarification",
};
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;

/** Which studio buttons each project status offers (mirrors the server table). */
const STUDIO_ACTIONS: Partial<Record<EngagementStatus, ("ready_for_review" | "hold" | "resume" | "go_live" | "cancel")[]>> = {
  awaiting_deposit: ["cancel"],
  in_development: ["ready_for_review", "hold", "cancel"],
  client_review: ["hold", "cancel"],
  on_hold: ["resume", "cancel"],
  awaiting_balance: ["go_live"],
};

function useAction(t: PanelProps["t"], reload: PanelProps["reload"]) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string>();
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      setError(errorText(t, err, "note", "title", "decision"));
      return false;
    } finally {
      setBusy("");
    }
  };
  return { busy, error, run };
}

function Media({ items }: { items: Attachment[] }) {
  const visual = items.filter((a) => IMAGE.test(a.original_name) || VIDEO.test(a.original_name));
  const other = items.filter((a) => !visual.includes(a));
  return (
    <>
      {visual.length > 0 && (
        <div className={cn("mt-4 grid gap-2", visual.length > 1 && "sm:grid-cols-2")}>
          {visual.map((a) => VIDEO.test(a.original_name) ? (
            // Progress previews play here but are not offered for download: final files unlock with the balance.
            <ForgeVideo key={a.id} src={a.url} playsInline preload="metadata" aria-label={a.original_name} className="aspect-video w-full border border-line" videoClassName="object-contain" />
          ) : (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group/img block overflow-hidden border border-line bg-bg-sunken">
              {/* Private, per-user files: served by Django with an access check, not by next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.original_name} loading="lazy" className="aspect-video w-full object-cover transition-transform duration-700 ease-out group-hover/img:scale-[1.03]" />
            </a>
          ))}
        </div>
      )}
      {other.map((a) => (
        <a key={a.id} href={a.url} className="mt-2 block text-sm text-muted underline-offset-4 hover:text-ember-400 hover:underline">{a.original_name}</a>
      ))}
    </>
  );
}

/** Client decision on a milestone or on the whole delivery. */
function ReviewBox({
  t, reload, intro, revisionsLeft, revisionsTotal, onApprove, onChanges,
}: Pick<PanelProps, "t" | "reload"> & {
  intro: string;
  revisionsLeft: number;
  revisionsTotal: number;
  onApprove: () => Promise<unknown>;
  onChanges: (note: string) => Promise<unknown>;
}) {
  const w = t.project.work;
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction(t, reload);
  return (
    <div className="flex flex-col gap-4">
      <p className="leading-relaxed text-ink">{intro}</p>
      <Hud tone="muted">{revisionsLeft > 0 ? fill(w.revisionsLeft, { n: revisionsLeft, total: revisionsTotal }) : w.noRevisions}</Hud>
      {writing && (
        <Field label={w.changesNote}>{(a) => <Textarea id={a.id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      )}
      <ErrorLine>{error}</ErrorLine>
      <div className="flex flex-wrap gap-3">
        {writing ? (
          <>
            <Button variant="ember" disabled={!note.trim()} loading={busy === "c"} onClick={() => run("c", () => onChanges(note))}>{w.sendChanges}</Button>
            <Button variant="ghost" onClick={() => setWriting(false)}>{t.common.back}</Button>
          </>
        ) : (
          <>
            <Button variant="ember" loading={busy === "a"} onClick={() => run("a", onApprove)}>{w.approve}</Button>
            {revisionsLeft > 0 && <Button variant="secondary" onClick={() => setWriting(true)}>{w.requestChanges}</Button>}
          </>
        )}
      </div>
    </div>
  );
}

/** The client's decision, when there is one to make (used as the "next step"). */
export function ClientReview({ t, reload, engagement: e }: PanelProps & { engagement: Engagement }) {
  const w = t.project.work;
  const common = { t, reload, revisionsLeft: e.revisions_left, revisionsTotal: e.revision_rounds };
  if (e.status === "client_review") {
    return (
      <ReviewBox {...common} intro={w.reviewReady}
        onApprove={() => api.post(`/engagements/${e.id}/action/`, { action: "approve" })}
        onChanges={(note) => api.post(`/engagements/${e.id}/action/`, { action: "request_changes", note })} />
    );
  }
  const m = e.milestones.find((x) => x.status === "review");
  if (!m) return null;
  return (
    <ReviewBox {...common} intro={`${m.title}. ${w.milestoneReady}`}
      onApprove={() => api.post(`/milestones/${m.id}/review/`, { decision: "approve" })}
      onChanges={(note) => api.post(`/milestones/${m.id}/review/`, { decision: "changes", note })} />
  );
}

function TaskIcon({ status }: { status: Task["status"] }) {
  if (status === "done") return <Check aria-hidden className="size-3.5 text-ok" />;
  if (status === "doing") return <CircleDot aria-hidden className="size-3.5 text-ember-400" />;
  return <Circle aria-hidden className="size-3.5 text-faint" />;
}

const NEXT_TASK: Record<Task["status"], Task["status"]> = { todo: "doing", doing: "done", done: "todo" };

function StudioTools({ t, reload, engagement: e }: PanelProps & { engagement: Engagement }) {
  const st = t.studio;
  const { busy, error, run } = useAction(t, reload);
  const [task, setTask] = useState({ title: "", eta: "" });
  const [update, setUpdate] = useState({ title: "", body: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fileId = useId();
  const actions = STUDIO_ACTIONS[e.status] ?? [];

  return (
    <div className="flex flex-col gap-8 border border-line bg-cell px-5 py-6 md:px-6">
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {actions.map((a) => a === "cancel" ? (
            confirmCancel ? (
              <span key={a} className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted">{st.cancelConfirm}</span>
                <Button variant="secondary" size="sm" loading={busy === a} onClick={() => run(a, () => api.post(`/engagements/${e.id}/action/`, { action: a }))}>{st.actions.cancel}</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>{t.common.back}</Button>
              </span>
            ) : (
              <Button key={a} variant="ghost" size="sm" onClick={() => setConfirmCancel(true)}>{st.actions.cancel}</Button>
            )
          ) : (
            <Button key={a} variant={a === "go_live" || a === "ready_for_review" ? "ember" : "secondary"} size="sm"
              disabled={a === "go_live" && !e.ready_to_go_live} loading={busy === a}
              onClick={() => run(a, () => api.post(`/engagements/${e.id}/action/`, { action: a }))}>
              {st.actions[a]}
            </Button>
          ))}
        </div>
      )}

      {["in_development", "client_review", "on_hold"].includes(e.status) && (
        <>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const ok = await run("task", () => api.post(`/engagements/${e.id}/tasks/`, {
                title: task.title, eta: task.eta ? new Date(task.eta).toISOString() : null,
                milestone: e.milestones.find((m) => m.status === "active")?.id ?? null,
              }));
              if (ok) setTask({ title: "", eta: "" });
            }}
          >
            <Field label={st.taskTitle}>{(a) => <Input id={a.id} value={task.title} onChange={(ev) => setTask((x) => ({ ...x, title: ev.target.value }))} />}</Field>
            <Field label={st.eta}>{(a) => <Input id={a.id} type="datetime-local" value={task.eta} onChange={(ev) => setTask((x) => ({ ...x, eta: ev.target.value }))} className="[color-scheme:dark]" />}</Field>
            <Button type="submit" variant="secondary" disabled={!task.title.trim()} loading={busy === "task"}>{st.addTask}</Button>
          </form>

          <form
            className="flex flex-col gap-4 border-t border-line pt-6"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const form = new FormData();
              form.append("title", update.title);
              form.append("body", update.body);
              files.forEach((f) => form.append("files", f));
              const ok = await run("update", () => api.post(`/engagements/${e.id}/updates/`, form));
              if (ok) {
                setUpdate({ title: "", body: "" });
                setFiles([]);
              }
            }}
          >
            <p className="hud text-muted">{st.postUpdate}</p>
            <Field label={st.updateTitle}>{(a) => <Input id={a.id} value={update.title} onChange={(ev) => setUpdate((x) => ({ ...x, title: ev.target.value }))} />}</Field>
            <Field label={st.updateBody}>{(a) => <Textarea id={a.id} value={update.body} onChange={(ev) => setUpdate((x) => ({ ...x, body: ev.target.value }))} />}</Field>
            <label htmlFor={fileId} className="flex cursor-pointer items-center gap-3 border border-dashed border-line-strong px-4 py-3 text-sm text-muted hover:border-ember-400 hover:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ember-400">
              <ImagePlus aria-hidden className="size-4" />
              <span className="min-w-0 truncate">{files.length ? files.map((f) => f.name).join(", ") : st.updateFiles}</span>
              <input id={fileId} type="file" multiple accept="image/*,video/*,.pdf" className="sr-only" onChange={(ev) => setFiles(Array.from(ev.target.files ?? []).slice(0, 10))} />
            </label>
            <Button type="submit" variant="ember" disabled={!update.title.trim()} loading={busy === "update"}>{st.post}</Button>
          </form>
        </>
      )}
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}

export function WorkPanel(props: PanelProps & { engagement: Engagement }) {
  const { lang, t, side, reload, engagement: e } = props;
  const w = t.project.work;
  const { busy, run } = useAction(t, reload);
  const approved = e.milestones.filter((m) => m.status === "approved").length;
  const doneTasks = e.tasks.filter((x) => x.status === "done").length;
  const pct = Math.max(e.milestones.length ? approved / e.milestones.length : 0, e.tasks.length ? doneTasks / e.tasks.length : 0);
  const finished = ["awaiting_balance", "live", "closed"].includes(e.status);
  const progress = finished ? 1 : pct;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <div className="flex items-baseline justify-between">
            <Hud tone="faint">{w.progress}</Hud>
            <span className="font-mono tabular-nums text-ink">{Math.round(progress * 100)} %</span>
          </div>
          <div aria-hidden className="mt-3 h-px w-full bg-line">
            <div className="h-px bg-ember-500 transition-[width] duration-700 ease-out" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        {e.deadline && !finished && (
          <div><p className="hud text-faint">{w.deadline}</p><p className="mt-1 text-ink">{day(lang, e.deadline)} · <span className="text-muted">{timeLeft(t, `${e.deadline}T18:00:00`)}</span></p></div>
        )}
        {e.production_at && <div><p className="hud text-faint">{t.project.stages.live}</p><p className="mt-1 text-ink">{fill(w.liveSince, { date: day(lang, e.production_at) })}</p></div>}
        {e.maintenance_ends_at && <div><p className="hud text-faint">{e.plan_name}</p><p className="mt-1 text-ink">{fill(w.maintenanceUntil, { date: day(lang, e.maintenance_ends_at) })}</p></div>}
        <div><p className="hud text-faint">{t.project.proposal.revisionsLabel}</p><p className="mt-1 text-ink">{fill(t.studio.revisionsUsed, { used: e.revisions_used, total: e.revision_rounds })}</p></div>
      </div>
      {e.status === "on_hold" && <Hud tone="ember" dot>{w.onHold}</Hud>}

      {side === "studio" && <StudioTools {...props} />}

      {e.milestones.length > 0 && (
        <div>
          <p className="hud text-faint">{w.milestones}</p>
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {e.milestones.map((m, i) => (
              <li key={m.id} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-ink"><span className="hud mr-3 text-faint">{String(i + 1).padStart(2, "0")}</span>{m.title}</span>
                  <span className="flex flex-wrap items-center gap-3">
                    {m.due_date && m.status !== "approved" && <span className="hud text-faint">{day(lang, m.due_date, false)}</span>}
                    <StatusPill status={MILESTONE_TONE[m.status]} label={w.statuses[m.status]} />
                  </span>
                </div>
                {m.client_note && <p className="border-l-2 border-line-strong pl-4 text-sm text-muted">{m.client_note}</p>}
                {side === "studio" && ["planned", "active", "changes"].includes(m.status) && (
                  <div className="flex gap-2">
                    {m.status !== "active" && (
                      <Button variant="ghost" size="sm" loading={busy === `ma${m.id}`} onClick={() => run(`ma${m.id}`, () => api.post(`/milestones/${m.id}/move/`, { status: "active" }))}>{t.studio.milestoneMoves.active}</Button>
                    )}
                    {m.status !== "planned" && (
                      <Button variant="secondary" size="sm" loading={busy === `mr${m.id}`} onClick={() => run(`mr${m.id}`, () => api.post(`/milestones/${m.id}/move/`, { status: "review" }))}>{t.studio.milestoneMoves.review}</Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {e.tasks.length > 0 && (
        <div>
          <p className="hud text-faint">{w.tasks}</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {e.tasks.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                {side === "studio" ? (
                  <button type="button" aria-label={`${x.title}: ${w.taskStatuses[NEXT_TASK[x.status]]}`} disabled={busy === `t${x.id}`}
                    onClick={() => run(`t${x.id}`, () => api.patch(`/tasks/${x.id}/`, { status: NEXT_TASK[x.status] }))}
                    className="flex size-6 items-center justify-center border border-line hover:border-ember-400">
                    <TaskIcon status={x.status} />
                  </button>
                ) : (
                  <span className="flex size-6 items-center justify-center"><TaskIcon status={x.status} /></span>
                )}
                <span className={cn("min-w-0 flex-1", x.status === "done" ? "text-muted line-through decoration-line-strong" : "text-ink")}>{x.title}</span>
                <span className="hud text-faint">
                  {x.status === "done" ? w.done : x.eta ? timeLeft(t, x.eta) : w.taskStatuses[x.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="hud text-faint">{w.updates}</p>
        {e.updates.length === 0 ? (
          <p className="mt-3 text-muted">{w.noUpdates}</p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {e.updates.map((u) => (
              <li key={u.id} className="relative border-l border-line pb-8 pl-6 last:pb-0">
                <span aria-hidden className="absolute -left-[3.5px] top-1.5 size-1.5 bg-ember-500" />
                <Hud tone="faint">{dateTime(lang, u.created_at)}</Hud>
                <p className="mt-2 text-lg text-ink-strong">{u.title}</p>
                {u.body && <p className="mt-2 whitespace-pre-line leading-relaxed text-muted">{u.body}</p>}
                <Media items={u.attachments} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
