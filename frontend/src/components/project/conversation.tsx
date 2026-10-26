"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Mic, Paperclip, Send, Square, X } from "lucide-react";
import { useLiveRefresh } from "@/lib/live";
import { api } from "@/lib/api-client";
import { dateTime, type Message } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { formatBytes, Textarea } from "@/components/ui/field";
import { Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";
import { ErrorLine, errorText, type PanelProps } from "./shared";

// Messages arrive live over the socket (lib/live); the poll is only a safety net.
const POLL_MS = 90_000;
const MAX_VOICE_S = 300;
// Chrome/Firefox record Opus in WebM; Safari records AAC in MP4.
const VOICE_TYPES = [["audio/webm;codecs=opus", "webm"], ["audio/mp4", "m4a"], ["audio/webm", "webm"], ["audio/ogg;codecs=opus", "ogg"]] as const;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function useVoice(onDone: (file: File, seconds: number) => void, onError: (msg: "denied" | "unsupported") => void) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const keep = useRef(true);
  const started = useRef(0);

  const stop = useCallback((send: boolean) => {
    keep.current = send;
    rec.current?.stop();
  }, []);

  useEffect(() => {
    if (seconds === null) return;
    const timer = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSeconds(s);
      if (s >= MAX_VOICE_S) stop(true);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds === null, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => rec.current?.stream.getTracks().forEach((track) => track.stop()), []);

  const start = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return onError("unsupported");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return onError("denied");
    }
    const type = VOICE_TYPES.find(([mime]) => MediaRecorder.isTypeSupported?.(mime));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type[0] } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const secs = Math.round((Date.now() - started.current) / 1000);
      setSeconds(null);
      rec.current = null;
      if (!keep.current || !chunks.length || secs < 1) return;
      const mime = recorder.mimeType || type?.[0] || "audio/webm";
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      onDone(new File(chunks, `voice-${Date.now()}.${ext}`, { type: mime.split(";")[0] }), secs);
    };
    rec.current = recorder;
    keep.current = true;
    started.current = Date.now();
    recorder.start(250);
    setSeconds(0);
  };

  return { seconds, start, stop };
}

export function Conversation({ lang, t, side, reference, enabled }: Omit<PanelProps, "reload"> & { reference: string; enabled: boolean }) {
  const c = t.project.chat;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const list = useRef<HTMLOListElement>(null);
  const fileId = useId();

  const load = useCallback(
    () => api.get<Message[]>(`/requests/${reference}/messages/`).then(setMessages, () => undefined),
    [reference],
  );

  useLiveRefresh(load, reference, { messages: true });

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

  // Newest at the bottom, like every messenger.
  const count = messages?.length ?? 0;
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = async (attachment: File | null, extra: Record<string, string> = {}) => {
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    form.append("body", attachment && extra.voice ? "" : body);
    if (attachment) form.append("file", attachment);
    Object.entries(extra).forEach(([k, v]) => form.append(k, v));
    try {
      const msg = await api.post<Message>(`/requests/${reference}/messages/`, form);
      setMessages((m) => [...(m ?? []), msg]);
      if (!extra.voice) {
        setBody("");
        setFile(null);
      }
    } catch (err) {
      setError(errorText(t, err, "file", "body"));
    } finally {
      setBusy(false);
    }
  };

  const voice = useVoice(
    (f, secs) => send(f, { voice: "1", duration: String(secs) }),
    (why) => setError(why === "denied" ? c.micDenied : c.unsupported),
  );

  if (!enabled) return <p className="text-muted">{c.draftFirst}</p>;
  const mine = (m: Message) => (side === "studio") === m.from_studio;
  const lastMine = [...(messages ?? [])].reverse().find(mine);

  return (
    <div className="flex flex-col">
      <ol ref={list} data-lenis-prevent aria-live="polite"
        className="flex max-h-[32rem] min-h-[12rem] flex-col gap-4 overflow-y-auto border border-line bg-bg-sunken p-4 [overscroll-behavior:contain] md:p-5">
        {messages === null ? (
          <li className="hud text-faint">{t.common.loading}</li>
        ) : messages.length === 0 ? (
          <li className="my-auto text-center text-sm text-faint">{c.empty}</li>
        ) : messages.map((m) => (
          <li key={m.id} className={cn("flex max-w-[88%] flex-col gap-1.5", mine(m) ? "self-end items-end" : "self-start items-start")}>
            <Hud tone="faint" as="span">{mine(m) ? c.you : m.from_studio ? "Younes" : m.sender_name} · {dateTime(lang, m.created_at)}</Hud>
            <div className={cn("border px-4 py-3", mine(m) ? "border-ember-700 bg-ember-500/10" : "border-line bg-cell")}>
              {m.body && <p className="whitespace-pre-line break-words leading-relaxed text-ink">{m.body}</p>}
              {m.attachment && (m.attachment.is_voice ? (
                <div className="flex flex-col gap-1">
                  <Hud tone="muted" as="span"><Mic aria-hidden className="size-3" />{c.voice}{m.attachment.duration ? ` · ${clock(m.attachment.duration)}` : ""}</Hud>
                  <audio controls preload="none" src={m.attachment.url} className="h-9 w-64 max-w-full" />
                </div>
              ) : (
                <a href={m.attachment.url} className={cn("flex items-center gap-2 text-sm text-ink hover:text-ember-400", m.body && "mt-2")}>
                  <Paperclip aria-hidden className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{m.attachment.original_name}</span>
                  <span className="hud shrink-0 text-faint">{formatBytes(m.attachment.size)}</span>
                </a>
              ))}
            </div>
            {m === lastMine && m.read_at && <Hud tone="faint" as="span">{c.read}</Hud>}
          </li>
        ))}
      </ol>

      {voice.seconds !== null ? (
        <div className="flex items-center gap-4 border border-t-0 border-line bg-cell px-4 py-3">
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
            if (body.trim() || file) send(file);
          }}
          className="flex flex-col border border-t-0 border-line bg-cell"
        >
          <Textarea
            bare
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
            name="message"
            rows={2}
            aria-label={c.placeholder}
            placeholder={c.placeholder}
            className="w-full resize-none bg-transparent px-4 py-3 text-ink placeholder:text-faint focus:outline-none"
          />
          {file && (
            <p className="flex items-center gap-2 px-4 pb-2 text-sm text-muted">
              <Paperclip aria-hidden className="size-3.5" />
              <span className="min-w-0 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label={c.cancel} className="text-faint hover:text-err"><X aria-hidden className="size-3.5" /></button>
            </p>
          )}
          <div className="flex items-center gap-1 border-t border-line px-2 py-2">
            <label htmlFor={fileId} title={c.attach}
              className="flex size-9 cursor-pointer items-center justify-center text-muted hover:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ember-400">
              <Paperclip aria-hidden className="size-4" />
              <span className="sr-only">{c.attach}</span>
              <input id={fileId} type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" onClick={voice.start} disabled={busy} title={c.record}
              className="flex size-9 items-center justify-center text-muted hover:text-ember-400 disabled:opacity-40">
              <Mic aria-hidden className="size-4" />
              <span className="sr-only">{c.record}</span>
            </button>
            <Button type="submit" variant="primary" size="sm" disabled={!body.trim() && !file} loading={busy} className="ml-auto">
              <Send aria-hidden className="size-3.5" />{c.send}
            </Button>
          </div>
        </form>
      )}
      <div className="mt-2"><ErrorLine>{error}</ErrorLine></div>
    </div>
  );
}
