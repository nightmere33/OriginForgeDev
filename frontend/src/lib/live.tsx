"use client";

/**
 * Live updates: one WebSocket per signed-in visitor (backend `live` app).
 *
 *   notification  an in-app notification arrived
 *   request       a request or its project moved (offer, contract, payment, progress)
 *   message       a new message in a project conversation
 *   resync        (local) the socket came back after a drop: refetch what you show
 *
 * The socket reconnects with backoff, pings so idle proxies keep it, and
 * reopens when the tab or the network comes back. Components subscribe with
 * `useLive`; nothing here ever blocks a page from working without it.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { api } from "./api-client";
import { useSession } from "./session";

export type LiveEvent =
  | { type: "hello" | "pong" | "resync" }
  | { type: "notification"; notification: AppNotification }
  | { type: "request"; id: number; reference: string; action: string }
  | { type: "message"; request: number; reference: string; id: number; sender: number };

export type AppNotification = {
  id: number;
  key: string;
  title: string;
  body: string;
  path: string;
  read: boolean;
  created_at: string | null;
};

const listeners = new Set<(e: LiveEvent) => void>();
let socket: WebSocket | null = null;
let wanted = false;
let retries = 0;
let retryTimer = 0;
let pingTimer = 0;
let everOpened = false;

function socketUrl() {
  const base = process.env.NEXT_PUBLIC_WS_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  return `${base.replace(/\/$/, "")}/ws/live/`;
}

function emit(e: LiveEvent) {
  listeners.forEach((l) => l(e));
}

function open() {
  if (!wanted || (socket && socket.readyState <= WebSocket.OPEN)) return;
  clearTimeout(retryTimer);
  const ws = new WebSocket(socketUrl());
  socket = ws;
  ws.onopen = () => {
    retries = 0;
    // Back after a drop: anything that happened meanwhile was missed.
    if (everOpened) emit({ type: "resync" });
    everOpened = true;
    clearInterval(pingTimer);
    pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 25_000);
  };
  ws.onmessage = (m) => {
    try {
      emit(JSON.parse(m.data) as LiveEvent);
    } catch {
      // Ignore anything that is not ours.
    }
  };
  ws.onclose = (e) => {
    clearInterval(pingTimer);
    if (socket === ws) socket = null;
    // 4401: not signed in (session ended). Stay closed until a session exists again.
    if (!wanted || e.code === 4401) return;
    const delay = Math.min(30_000, 1000 * 2 ** retries) * (0.75 + Math.random() * 0.5);
    retries++;
    retryTimer = window.setTimeout(open, delay);
  };
}

function close() {
  wanted = false;
  clearTimeout(retryTimer);
  clearInterval(pingTimer);
  socket?.close();
  socket = null;
}

/** Mounted once (layout): keeps the socket open while someone is signed in. */
export function LiveConnection() {
  const user = useSession();
  useEffect(() => {
    if (!user) return;
    wanted = true;
    open();
    const wake = () => document.visibilityState === "visible" && open();
    addEventListener("online", open);
    document.addEventListener("visibilitychange", wake);
    return () => {
      removeEventListener("online", open);
      document.removeEventListener("visibilitychange", wake);
      close();
    };
  }, [user]);
  return null;
}

/** Subscribe to live events. The handler may change between renders. */
export function useLive(handler: (e: LiveEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const l = (e: LiveEvent) => ref.current(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/**
 * Refetch when something about `reference` (or, without one, any request)
 * changes, and after a reconnect. Bursts collapse into one refetch.
 */
export function useLiveRefresh(refetch: () => unknown, reference?: string, { messages = false } = {}) {
  const timer = useRef(0);
  useLive((e) => {
    const hit =
      e.type === "resync" ||
      (e.type === "request" && (!reference || e.reference === reference)) ||
      (messages && e.type === "message" && (!reference || e.reference === reference));
    if (!hit) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => refetch(), 150);
  });
  useEffect(() => () => clearTimeout(timer.current), []);
}

// ── Notifications: one shared store for the bell and the toasts ───────────

type Store = { items: AppNotification[]; unread: number; loaded: boolean };
let store: Store = { items: [], unread: 0, loaded: false };
const storeListeners = new Set<() => void>();
const setStore = (next: Store) => {
  store = next;
  storeListeners.forEach((l) => l());
};
const subscribeStore = (l: () => void) => {
  storeListeners.add(l);
  return () => {
    storeListeners.delete(l);
  };
};
const EMPTY: Store = { items: [], unread: 0, loaded: false };

export async function loadNotifications() {
  const data = await api.get<{ unread: number; items: AppNotification[] }>("/live/notifications/").catch(() => null);
  if (data) setStore({ items: data.items, unread: data.unread, loaded: true });
}

export async function markNotificationsRead(ids?: number[]) {
  const ids_ = ids ?? store.items.filter((n) => !n.read).map((n) => n.id);
  setStore({
    ...store,
    items: store.items.map((n) => (ids_.includes(n.id) ? { ...n, read: true } : n)),
    unread: Math.max(0, store.unread - store.items.filter((n) => !n.read && ids_.includes(n.id)).length),
  });
  const res = await api.post<{ unread: number }>("/live/notifications/read/", ids ? { ids } : {}).catch(() => null);
  if (res) setStore({ ...store, unread: res.unread });
}

/** The notification list, kept current by the socket. */
export function useNotifications(onNew?: (n: AppNotification) => void) {
  const user = useSession();
  const snapshot = useSyncExternalStore(subscribeStore, () => store, () => EMPTY);
  useEffect(() => {
    if (user) loadNotifications();
  }, [user]);
  useLive((e) => {
    if (e.type === "notification") {
      if (!store.items.some((n) => n.id === e.notification.id)) {
        setStore({ ...store, items: [e.notification, ...store.items].slice(0, 30), unread: store.unread + 1 });
        onNew?.(e.notification);
      }
    } else if (e.type === "resync") loadNotifications();
  });
  return user ? snapshot : EMPTY;
}
