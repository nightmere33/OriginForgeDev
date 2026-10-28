"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_VOICE_S = 300;
// Chrome/Firefox record Opus in WebM; Safari records AAC in MP4.
const VOICE_TYPES = [["audio/webm;codecs=opus", "webm"], ["audio/mp4", "m4a"], ["audio/webm", "webm"], ["audio/ogg;codecs=opus", "ogg"]] as const;

/** Record a voice note (up to 5 minutes): start, then stop to send or to throw it away. */
export function useVoice(onDone: (file: File, seconds: number) => void, onError: (msg: "denied" | "unsupported") => void) {
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

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
