"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Bot, CircleCheck, CornerUpLeft, FileText, LifeBuoy, Lock, Mic, NotebookPen, Paperclip, Receipt, Send, ShieldCheck, SmilePlus, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { fill } from "@/i18n/fill";
import { useLiveRefresh } from "@/lib/live";
import { api } from "@/lib/api-client";
import { day, money, REACTIONS, type Attachment, type ChatState, type Message } from "@/lib/lifecycle";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatBytes, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { ImageViewer } from "@/components/chat/image-viewer";
import { ShareCard } from "@/components/chat/share-card";
import { COMMANDS, type Share } from "@/lib/support";
import { playReceived, playSent, useSound } from "@/components/chat/sounds";
import { VoicePlayer } from "@/components/chat/voice-player";
import { clock, useVoice } from "@/components/chat/voice-recorder";
import { CHARGE_TONE } from "./payments-panel";
import type { ProjectTab } from "./project-tabs";
import { ErrorLine, errorText, type PanelProps } from "./shared";

// Messages arrive live over the socket (lib/live); the poll is only a safety net.
const POLL_MS = 90_000;
// Bubbles from the same side within this gap read as one group.
const GROUP_MS = 5 * 60_000;
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

type Viewer = { src: string; alt: string } | null;

const intl = (lang: string) => (lang === "fr" ? "fr-FR" : "en-GB");
const timeOf = (lang: string, iso: string) => new Intl.DateTimeFormat(intl(lang), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayKey = (iso: string) => new Date(iso).toDateString();

function dayLabel(lang: string, c: PanelProps["t"]["project"]["chat"], iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return c.today;
  if (d.toDateString() === yesterday.toDateString()) return c.yesterday;
  return new Intl.DateTimeFormat(intl(lang), { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" }).format(d);
}

/** Text with its links made clickable (they open in a new tab, without the referrer). */
export function Linked({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <p className={cn("whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]", className)}>
      {parts.map((part, i) => i % 2 ? (
        <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="underline decoration-current/40 underline-offset-4 hover:decoration-current">{part}</a>
      ) : <Fragment key={i}>{part}</Fragment>)}
    </p>
  );
}

function AttachmentView({ a, mine, t, onImage }: { a: Attachment; mine: boolean; t: PanelProps["t"]; onImage: (v: Viewer) => void }) {
  const c = t.project.chat;
  if (a.is_voice) return <VoicePlayer src={a.url} duration={a.duration} mine={mine} labels={{ play: c.play, pause: c.pause, voice: c.voice }} />;
  if (IMAGE.test(a.original_name)) {
    return (
      <button type="button" onClick={() => onImage({ src: a.url, alt: a.original_name })} aria-label={`${c.image}: ${a.original_name}`}
        className="group/img block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
        {/* Private, per-user files: served by Django with an access check, not by next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.original_name} loading="lazy" className="max-h-72 w-full max-w-[16rem] object-cover transition-transform duration-700 ease-out group-hover/img:scale-[1.03]" />
      </button>
    );
  }
  return (
    <a href={a.url} className="flex items-center gap-2 text-sm text-ink hover:text-ember-400">
      <Paperclip aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{a.original_name}</span>
      <span className="hud shrink-0 text-faint">{formatBytes(a.size)}</span>
    </a>
  );
}

/** A card for something that happened elsewhere: an extra cost or offer, a progress update, a problem report, a proposal, a shared link or film. */
function Card({ lang, t, side, m, open, onImage }: Pick<PanelProps, "lang" | "t" | "side"> & { m: Message; open: (tab: ProjectTab, label?: string) => ReactNode; onImage: (v: Viewer) => void }) {
  const c = t.project.chat.cards;
  if (m.kind === "share" && m.data?.share) return <ShareCard lang={lang} t={t} share={m.data.share} />;
  if (m.kind === "proposal" && m.proposal) {
    const p = m.proposal;
    const s = t.project.chat.proposal;
    const event = m.data?.event as keyof typeof s.events | undefined;
    return (
      <div className="flex flex-col gap-3 border border-line bg-cell px-4 py-4">
        <span className="flex items-center justify-between gap-3">
          <Hud tone="ember" as="span"><FileText aria-hidden className="size-3" />{p.kind === "counter" ? s.counter : s.offer} · {fill(s.version, { n: p.version })}</Hud>
          {event && s.events[event] && <span className="hud text-faint">{s.events[event]}</span>}
        </span>
        <span className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-ink-strong">{fill(s.plan, { plan: p.plan_name })} · {fill(s.days, { n: p.timeline_days })}</span>
          <span className="font-mono tabular-nums text-ink">{money(lang, p.price, p.currency)}</span>
        </span>
        {m.body && <Linked text={m.body} className="text-sm text-muted" />}
        {open("overview", s.open)}
      </div>
    );
  }
  if (m.kind === "charge" && m.charge) {
    const ch = m.charge;
    const statuses = side === "client" ? t.project.extras.statuses : t.project.extras.studioStatuses;
    return (
      <div className="flex flex-col gap-3 border border-line bg-cell px-4 py-4">
        <span className="flex items-center justify-between gap-3">
          <Hud tone="ember" as="span"><Receipt aria-hidden className="size-3" />{ch.optional ? c.offer : c.extra}</Hud>
          <StatusPill status={CHARGE_TONE[ch.status]} label={statuses[ch.status]} />
        </span>
        <span className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-ink-strong">{ch.label}</span>
          <span className="font-mono tabular-nums text-ink">{money(lang, ch.amount, ch.currency)}</span>
        </span>
        {ch.extends_days > 0 && <span className="hud text-ember-400">{fill(t.project.extras.extendsBadge, { days: ch.extends_days })}</span>}
        {ch.description && <Linked text={ch.description} className="text-sm text-muted" />}
        {open("payments")}
      </div>
    );
  }
  if (m.kind === "update" && m.update) {
    const u = m.update;
    const images = u.attachments.filter((a) => IMAGE.test(a.original_name));
    return (
      <div className="flex flex-col gap-3 border border-line bg-cell px-4 py-4">
        <Hud tone="ember" as="span"><Sparkles aria-hidden className="size-3" />{c.update}</Hud>
        <span className="text-ink-strong">{u.title}</span>
        {u.body && <Linked text={u.body} className="text-sm text-muted" />}
        {images.length > 0 && (
          <div className={cn("grid gap-1", images.length > 1 && "grid-cols-2")}>
            {images.slice(0, 4).map((a) => (
              <button key={a.id} type="button" onClick={() => onImage({ src: a.url, alt: a.original_name })} className="group/img block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.original_name} loading="lazy" className="aspect-video w-full object-cover transition-transform duration-700 ease-out group-hover/img:scale-[1.03]" />
              </button>
            ))}
          </div>
        )}
        {open("progress")}
      </div>
    );
  }
  if (m.kind === "issue") {
    return (
      <div className="flex flex-col gap-2 border border-ember-700 bg-ember-500/[0.06] px-4 py-4">
        <Hud tone="ember" as="span"><LifeBuoy aria-hidden className="size-3" />{c.issue}</Hud>
        <Linked text={m.body} className="text-ink" />
      </div>
    );
  }
  return null;
}

/** A maintenance notice (the countdown, the end, an extension), worded in the page's language. */
function careText(lang: PanelProps["lang"], t: PanelProps["t"], m: Message) {
  const c = t.project.chat.care;
  const d = m.data ?? {};
  const until = d.until ? day(lang, d.until) : "";
  switch (d.event) {
    case "started": return fill(c.started, { until });
    case "reminder": return d.days === 1 ? fill(c.lastDay, { until }) : fill(c.reminder, { days: d.days ?? 0, until });
    case "ended": return fill(c.ended, { closes: d.closes ? day(lang, d.closes) : "" });
    case "extended": return fill(c.extended, { until });
    case "closed": return c.closed;
    default: return m.body;
  }
}

/** The eight reactions, in a strip that tears in above the bubble. */
function ReactionPicker({ t, onPick, onClose, align }: { t: PanelProps["t"]; onPick: (emoji: string) => void; onClose: () => void; align: "start" | "end" }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector("button")?.focus();
    const away = (e: PointerEvent) => !strip.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div ref={strip} role="toolbar" aria-label={t.project.chat.react}
      className={cn("absolute bottom-full z-10 mb-2 flex gap-0.5 border border-line-strong bg-raised p-1 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.7)] [animation:step-in_var(--dur-micro)_var(--ease-out)]",
        align === "end" ? "right-0" : "left-0")}>
      {REACTIONS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => onPick(emoji)} aria-label={fill(t.project.chat.reactWith, { emoji })}
          className="flex size-9 items-center justify-center text-lg transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function Conversation({
  lang, t, side, reference, enabled, variant = "panel", onOpenTab, state = "open", closesAt, paused = false, endpoint, reactions = true, notes = false,
}: Omit<PanelProps, "reload"> & {
  reference: string; enabled: boolean;
  /** `dock`: fills the floating window (its own header lives outside). */
  variant?: "panel" | "dock";
  /** On the project page: switch tabs in place; elsewhere the card links to the project. */
  onOpenTab?: (tab: ProjectTab) => void;
  /** Closed: read-only. Ending: maintenance is over and the thread closes at `closesAt`. */
  state?: ChatState;
  closesAt?: string | null;
  /** A minimised window: it keeps up to date without marking anything seen. */
  paused?: boolean;
  /** Another thread with the same message shape (a support ticket); a project's own conversation by default. */
  endpoint?: string;
  reactions?: boolean;
  /** The studio can leave internal notes (tickets). */
  notes?: boolean;
}) {
  const c = t.project.chat;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sound, setSound] = useSound();
  const [note, setNote] = useState(false);
  const [slashAt, setSlashAt] = useState(0);
  const url = endpoint ?? `/requests/${reference}/messages/`;
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastSeen = useRef<number | null>(null);
  const stick = useRef(true);
  const fileId = useId();
  const mine = useCallback((m: Message) => (side === "studio") === m.from_studio, [side]);
  const hidden = useRef(paused);
  useEffect(() => {
    hidden.current = paused;
  }, [paused]);

  const load = useCallback(
    // Seen only when actually seen: a thread in a hidden tab or a minimised window reads without marking (peek).
    () => api.get<Message[]>(`${url}${document.visibilityState === "visible" && !hidden.current ? "" : "?peek=1"}`).then((next) => {
      const prev = lastSeen.current;
      // A tone for what the other side just sent (never on the first load).
      if (prev !== null && next.some((m) => m.id > prev && !mine(m))) playReceived();
      lastSeen.current = next.length ? next[next.length - 1].id : 0;
      setMessages(next);
    }, () => undefined),
    [url, mine],
  );

  useLiveRefresh(load, reference, { messages: true });

  // Restored from minimised: what came in meanwhile is seen now.
  useEffect(() => {
    if (!paused && enabled) load();
  }, [paused, enabled, load]);

  // Poll while the tab is visible; refresh as soon as it comes back.
  useEffect(() => {
    if (!enabled) return;
    load();
    const tick = () => document.visibilityState === "visible" && load();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, load]);

  // The thread got shorter (a phone keyboard opening, the window resized): keep the newest in view.
  useEffect(() => {
    const el = list.current;
    if (!el || !enabled) return;
    const keep = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    keep.observe(el);
    return () => keep.disconnect();
  }, [enabled]);

  // Newest at the bottom: follow new messages unless the reader scrolled up to read.
  const count = messages?.length ?? 0;
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = async (attachment: File | null, extra: Record<string, string> = {}) => {
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    form.append("body", (attachment && extra.voice) || extra.share ? "" : body);
    if (note) form.append("internal", "1");
    if (attachment) form.append("file", attachment);
    if (replyTo) form.append("reply_to", String(replyTo.id));
    Object.entries(extra).forEach(([k, v]) => form.append(k, v));
    try {
      const msg = await api.post<Message>(url, form);
      stick.current = true;
      lastSeen.current = Math.max(lastSeen.current ?? 0, msg.id);
      // The live refresh may have brought it already.
      setMessages((m) => (m?.some((x) => x.id === msg.id) ? m : [...(m ?? []), msg]));
      setReplyTo(null);
      playSent();
      if (!extra.voice) {
        setBody("");
        setFile(null);
      }
      setNote(false);
    } catch (err) {
      setError(errorText(t, err, "file", "body", "reply_to", "share"));
    } finally {
      setBusy(false);
    }
  };

  const react = async (m: Message, emoji: string) => {
    setPicker(null);
    try {
      const res = await api.post<{ reactions: Message["reactions"] }>(`/messages/${m.id}/react/`, { emoji });
      setMessages((all) => all?.map((x) => (x.id === m.id ? { ...x, reactions: res.reactions } : x)) ?? all);
    } catch (err) {
      setError(errorText(t, err, "emoji"));
    }
  };

  const jump = (id: number) => {
    const el = list.current;
    const target = el?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    if (!el || !target) return;
    el.scrollTo({ top: target.offsetTop - el.clientHeight / 2 + target.offsetHeight / 2, behavior: "smooth" });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  };

  const startReply = (m: Message) => {
    setReplyTo(m);
    setSelected(null);
    input.current?.focus();
  };

  // Grow the box with what is typed, up to six lines.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 26 + 24)}px`;
  }, [body]);

  const voice = useVoice(
    (f, secs) => send(f, { voice: "1", duration: String(secs) }),
    (why) => setError(why === "denied" ? c.micDenied : c.unsupported),
  );

  if (!enabled) return <p className="text-muted">{c.draftFirst}</p>;
  const dock = variant === "dock";
  const lastMine = [...(messages ?? [])].reverse().find(mine);
  const base = side === "client" ? `/${lang}/portal/requests` : `/${lang}/studio/requests`;
  const openTab = (tab: ProjectTab, label?: string) => {
    const text = label ?? (tab === "payments" ? c.cards.toPayments : c.cards.toProgress);
    return onOpenTab ? (
      <button type="button" onClick={() => onOpenTab(tab)} className="hud flex w-fit items-center gap-1.5 text-ember-400 hover:underline">
        {text}<ArrowUpRight aria-hidden className="size-3" />
      </button>
    ) : (
      <Link href={`${base}/${reference}${tab === "overview" ? "" : `?tab=${tab}`}`} className="hud flex w-fit items-center gap-1.5 text-ember-400 hover:underline">
        {text}<ArrowUpRight aria-hidden className="size-3" />
      </Link>
    );
  };
  // A command typed alone ("/how", "/pay"): the menu offers what matches.
  const slash = body.startsWith("/") && !/\s/.test(body) ? COMMANDS.filter((x) => x.cmd.startsWith(body.slice(1).toLowerCase())) : [];
  const pick = Math.min(slashAt, Math.max(0, slash.length - 1));
  const share = (what: Share) => {
    setSlashAt(0);
    send(null, { share: what });
  };
  const quoteText = (q: NonNullable<Message["reply_to"]>) =>
    q.body || (q.kind === "voice" ? c.quotedVoice : q.kind === "file" ? c.quotedFile : c.quotedCard);
  const nameOf = (m: { from_studio: boolean; sender_name: string }) => ((side === "studio") === m.from_studio ? c.you : m.from_studio ? "Younes" : m.sender_name);

  const rows: ReactNode[] = [];
  (messages ?? []).forEach((m, i, all) => {
    const prev = all[i - 1];
    const next = all[i + 1];
    const own = mine(m);
    const card = m.kind !== "text";
    if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) {
      rows.push(
        <li key={`d${m.id}`} role="separator" className="flex items-center gap-3 py-2">
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="hud text-faint">{dayLabel(lang, c, m.created_at)}</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </li>,
      );
    }
    if (m.kind === "event") {
      const ev = c.events;
      const text = m.data?.auto ? ev.autoSolved : ev[(m.data?.status ?? "open") as keyof typeof ev];
      rows.push(
        <li key={m.id} data-msg={m.id} className="my-2 flex justify-center">
          <span className="hud flex items-center gap-2 text-faint"><CircleCheck aria-hidden className="size-3.5" />{text}</span>
        </li>,
      );
      return;
    }
    if (m.kind === "transcript") {
      rows.push(
        <li key={m.id} data-msg={m.id} className="my-3">
          <details className="border border-line bg-cell px-3.5 py-2.5 text-sm">
            <summary className="hud flex cursor-pointer list-none items-center gap-2 text-faint [&::-webkit-details-marker]:hidden">
              <Bot aria-hidden className="size-3.5 text-ember-400" />{c.transcript}
            </summary>
            <ol className="mt-3 flex flex-col gap-2">
              {(m.data?.messages ?? []).map((x, i) => (
                <li key={i} className={cn("[overflow-wrap:anywhere]", x.role === "user" ? "text-ink" : "text-muted")}>
                  <span className="hud mr-2 text-faint">{x.role === "user" ? m.sender_name : t.project.chat.spaces.assistant}</span>{x.text}
                </li>
              ))}
            </ol>
          </details>
        </li>,
      );
      return;
    }
    if (m.kind === "care") {
      // Notices sit in the middle of the thread, like the day rules.
      rows.push(
        <li key={m.id} data-msg={m.id} className="my-3 flex justify-center">
          <span className="flex max-w-[92%] items-start gap-2 border border-line bg-cell px-3.5 py-2 text-sm text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ember-400" />
            <span><span className="sr-only">{c.care.label}: </span>{careText(lang, t, m)}</span>
          </span>
        </li>,
      );
      return;
    }
    const joins = (a?: Message, b?: Message) => !!a && !!b && a.kind === "text" && b.kind === "text" && mine(a) === mine(b)
      && dayKey(a.created_at) === dayKey(b.created_at) && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < GROUP_MS;
    const first = !joins(prev, m);
    const last = !joins(m, next);
    const showActions = selected === m.id || picker === m.id;
    rows.push(
      <li key={m.id} data-msg={m.id}
        className={cn("group/msg relative flex flex-col", own ? "items-end" : "items-start", first ? "mt-3" : "mt-0.5", card && "mt-4")}>
        {first && !own && <span className="hud mb-1 pl-10 pr-1 text-faint">{nameOf(m)}</span>}
        {m.internal && <span className="hud mb-1 flex items-center gap-1.5 px-1 text-ember-400"><NotebookPen aria-hidden className="size-3" />{c.internal}</span>}
        <div className={cn("relative flex items-end gap-2", dock ? "max-w-[94%]" : "max-w-[86%] sm:max-w-[78%]", own ? "flex-row-reverse" : "flex-row")}>
          {/* The other side's face closes each of their groups, as in a messenger. */}
          {!own && (last ? <Avatar name={m.sender_name} src={m.sender_avatar} studio={m.from_studio} className="size-8 self-end" />
            : <span aria-hidden className="w-8 shrink-0" />)}
          <div
            onDoubleClick={reactions ? () => react(m, REACTIONS[0]) : undefined}
            onClick={(e) => {
              // Touch: a tap shows the actions; links, buttons and the player keep their own clicks.
              if ((e.target as HTMLElement).closest("a,button,[role=slider]")) return;
              if (matchMedia("(hover: none)").matches) setSelected((s) => (s === m.id ? null : m.id));
            }}
            className={cn(
              "relative min-w-0 transition-[box-shadow,background-color] duration-500",
              card ? "w-[min(22rem,80vw)]" : cn(
                "border px-3.5 py-2.5",
                m.internal ? "border-dashed border-ember-700/70 bg-transparent text-ink"
                  : own ? "border-ember-700/70 bg-ember-500/[0.13] text-ink" : "border-line bg-cell text-ink",
                // One soft shape per group: the corners on the sender's side tighten where bubbles touch.
                "rounded-[1.15rem]",
                own ? cn(!first && "rounded-tr-md", !last && "rounded-br-md") : cn(!first && "rounded-tl-md", !last && "rounded-bl-md"),
                m.attachment && IMAGE.test(m.attachment.original_name) && !m.body && "overflow-hidden p-0",
              ),
              flash === m.id && "shadow-[0_0_0_2px_var(--ember-400)]",
            )}>
            {m.reply_to && (
              <button type="button" onClick={() => jump(m.reply_to!.id)} aria-label={c.jump}
                className={cn("mb-2 flex w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden border-l-2 py-0.5 pl-2.5 text-left",
                  own ? "border-ember-400/70" : "border-line-strong")}>
                <span className="hud text-faint">{nameOf(m.reply_to)}</span>
                <span className="line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]">{quoteText(m.reply_to)}</span>
              </button>
            )}
            {card ? (
              <Card lang={lang} t={t} side={side} m={m} open={openTab} onImage={setViewer} />
            ) : (
              <>
                {m.body && <Linked text={m.body} />}
                {m.attachment && <div className={cn(m.body && "mt-2")}><AttachmentView a={m.attachment} mine={own} t={t} onImage={setViewer} /></div>}
              </>
            )}
            {m.reactions.length > 0 && (
              <span className={cn("absolute -bottom-3 flex gap-0.5", own ? "right-2" : "left-2")}>
                {m.reactions.map((r) => (
                  <button key={r.emoji} type="button" onClick={() => react(m, r.emoji)} aria-pressed={r.mine}
                    aria-label={`${fill(c.reactWith, { emoji: r.emoji })} · ${r.count}`}
                    className={cn("flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs leading-none transition-transform duration-150 hover:scale-110",
                      r.mine ? "border-ember-700 bg-raised" : "border-line bg-raised")}>
                    <span>{r.emoji}</span>{r.count > 1 && <span className="tabular-nums text-muted">{r.count}</span>}
                  </button>
                ))}
              </span>
            )}
          </div>
          {/* In a dock window the actions float over the bubble's corner, so the text keeps the width. */}
          <div className={cn("flex shrink-0 items-center gap-0.5 transition-opacity duration-[var(--dur-micro)]",
            dock ? cn("absolute -top-4 z-10 border border-line bg-raised shadow-[0_10px_24px_-14px_rgb(0_0_0/0.8)]", own ? "left-0" : "right-0") : "pb-1",
            showActions ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 [@media(hover:none)]:hidden",
            showActions && "[@media(hover:none)]:flex")}>
            {reactions && (
              <button type="button" onClick={() => setPicker((p) => (p === m.id ? null : m.id))} aria-label={c.react} aria-expanded={picker === m.id}
                className="flex size-8 items-center justify-center text-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
                <SmilePlus aria-hidden className="size-4" />
              </button>
            )}
            <button type="button" onClick={() => startReply(m)} aria-label={c.reply}
              className="flex size-8 items-center justify-center text-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-400">
              <CornerUpLeft aria-hidden className="size-4" />
            </button>
          </div>
          {picker === m.id && <ReactionPicker t={t} align={own ? "end" : "start"} onPick={(emoji) => react(m, emoji)} onClose={() => setPicker(null)} />}
        </div>
        {(last || card) && (
          <span className={cn("hud mt-1.5 px-1 text-faint", m.reactions.length > 0 && "mt-4")}>
            {timeOf(lang, m.created_at)}{m === lastMine && m.read_at ? ` · ${c.seen}` : ""}
          </span>
        )}
      </li>,
    );
  });

  return (
    <div className={cn("flex min-h-0 flex-col", dock && "h-full")}>
      <ol ref={list} data-lenis-prevent aria-live="polite" aria-label={c.title}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className={cn("relative flex flex-col overflow-y-auto overflow-x-hidden px-3 pb-4 pt-2 [overscroll-behavior:contain] md:px-4",
          dock ? "min-h-0 flex-1" : "h-[min(38rem,68dvh)] border border-line bg-bg-sunken")}>
        {messages === null ? (
          <li className="hud m-auto text-faint">{t.common.loading}</li>
        ) : messages.length === 0 ? (
          <li className="m-auto max-w-xs text-center text-sm text-faint">{c.empty}</li>
        ) : rows}
      </ol>

      {state === "ending" && closesAt && (
        <p className={cn("flex items-start gap-2 border-line bg-ember-500/[0.06] px-4 py-2.5 text-sm text-muted", dock ? "border-t" : "border border-t-0")}>
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ember-400" />
          {fill(c.ending, { date: day(lang, closesAt) })}
        </p>
      )}
      {state === "closed" ? (
        <div className={cn("flex items-start gap-3 border-line bg-cell px-4 py-4", dock ? "border-t" : "border border-t-0")}>
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
          <span className="flex flex-col gap-1">
            <span className="text-sm text-ink">{c.closed}</span>
            <span className="text-sm text-faint">{side === "studio" ? c.closedStudio : c.closedClient}</span>
          </span>
        </div>
      ) : voice.seconds !== null ? (
        <div className={cn("flex items-center gap-4 border-line bg-cell px-4 py-3", dock ? "border-t" : "border border-t-0")}>
          <Hud tone="ember" dot live as="span">{c.recording} · {clock(voice.seconds)}</Hud>
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => voice.stop(false)}><X aria-hidden className="size-3.5" />{c.cancel}</Button>
            <Button variant="ember" size="sm" onClick={() => voice.stop(true)}><Square aria-hidden className="size-3" />{c.stop}</Button>
          </span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (slash.length && !file) share(slash[pick].share);
            else if (body.trim() || file) send(file);
          }}
          className={cn("relative flex flex-col border-line bg-cell", dock ? "border-t" : "border border-t-0", note && "bg-ember-500/[0.05]")}
        >
          {slash.length > 0 && (
            <ul role="listbox" aria-label={c.commands.title}
              className="absolute inset-x-2 bottom-full z-20 mb-2 border border-line-strong bg-raised py-1 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.8)] [animation:step-in_var(--dur-micro)_var(--ease-out)]">
              {slash.map((x, i) => (
                <li key={x.cmd} role="option" aria-selected={i === pick} onPointerDown={(e) => e.preventDefault()} onClick={() => share(x.share)}
                  onPointerMove={() => setSlashAt(i)}
                  className={cn("flex cursor-pointer items-baseline gap-3 px-3.5 py-2 text-sm", i === pick ? "bg-cell text-ink" : "text-muted")}>
                  <span className="font-mono text-ember-400">/{x.cmd}</span>
                  <span className="min-w-0 truncate">{c.commands[x.cmd as keyof typeof c.commands]}</span>
                </li>
              ))}
            </ul>
          )}
          {replyTo && (
            <div className="flex items-start gap-3 border-b border-line px-4 py-2.5 [animation:step-in_var(--dur-micro)_var(--ease-out)]">
              <CornerUpLeft aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ember-400" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="hud text-faint">{fill(c.replyingTo, { name: nameOf(replyTo) })}</span>
                <span className="truncate text-sm text-muted">{replyTo.body || (replyTo.attachment?.is_voice ? c.quotedVoice : replyTo.attachment ? c.quotedFile : c.quotedCard)}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={c.cancelReply} className="text-faint hover:text-ink"><X aria-hidden className="size-4" /></button>
            </div>
          )}
          {file && (
            <p className="flex items-center gap-2 px-4 pt-2 text-sm text-muted">
              <Paperclip aria-hidden className="size-3.5" />
              <span className="min-w-0 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label={c.cancel} className="text-faint hover:text-err"><X aria-hidden className="size-3.5" /></button>
            </p>
          )}
          <div className="flex items-end gap-1 px-2 py-2">
            <label htmlFor={fileId} title={c.attach}
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center text-muted hover:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ember-400">
              <Paperclip aria-hidden className="size-4" />
              <span className="sr-only">{c.attach}</span>
              <input id={fileId} type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {/* The field wraps its textarea (the typing effect): the wrapper takes the row. */}
            <div className="min-w-0 flex-1">
            <Textarea
              bare
              ref={input}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (slash.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                  e.preventDefault();
                  setSlashAt((i) => (i + (e.key === "ArrowDown" ? 1 : slash.length - 1)) % slash.length);
                  return;
                }
                if (slash.length && (e.key === "Tab" || e.key === "Enter")) {
                  e.preventDefault();
                  share(slash[pick].share);
                  return;
                }
                if (slash.length && e.key === "Escape") {
                  setBody("");
                  return;
                }
                // Enter sends where there is a keyboard; Shift+Enter (or any Enter on a phone) is a new line.
                if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey || matchMedia("(pointer: fine)").matches)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              name="message"
              rows={1}
              aria-label={note ? c.internalToggle : c.placeholder}
              placeholder={note ? c.internalToggle : c.placeholder}
              className="block max-h-44 min-h-10 w-full resize-none bg-transparent px-2 py-2 leading-[1.625rem] text-ink placeholder:text-faint focus:outline-none"
            />
            </div>
            {notes && side === "studio" && (
              <button type="button" onClick={() => setNote((n) => !n)} title={c.internalToggle} aria-pressed={note}
                className={cn("flex size-10 shrink-0 items-center justify-center hover:text-ink", note ? "text-ember-400" : "text-faint")}>
                <NotebookPen aria-hidden className="size-4" />
                <span className="sr-only">{c.internalToggle}</span>
              </button>
            )}
            <button type="button" onClick={() => setSound(!sound)} title={sound ? c.soundOn : c.soundOff} aria-pressed={sound}
              className="hidden size-10 shrink-0 items-center justify-center text-faint hover:text-ink sm:flex">
              {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
              <span className="sr-only">{sound ? c.soundOn : c.soundOff}</span>
            </button>
            {body.trim() || file ? (
              <Button type="submit" variant="ember" size="sm" loading={busy} className="h-10 w-10 shrink-0 px-0" aria-label={c.send}>
                <Send aria-hidden className="size-4" />
              </Button>
            ) : (
              <button type="button" onClick={voice.start} disabled={busy} title={c.record}
                className="flex size-10 shrink-0 items-center justify-center text-muted hover:text-ember-400 disabled:opacity-40">
                <Mic aria-hidden className="size-4" />
                <span className="sr-only">{c.record}</span>
              </button>
            )}
          </div>
        </form>
      )}
      {error && <div className={cn("mt-2", dock && "px-4 pb-2")}><ErrorLine>{error}</ErrorLine></div>}
      <ImageViewer image={viewer} onClose={() => setViewer(null)} closeLabel={c.closeImage} />
    </div>
  );
}
