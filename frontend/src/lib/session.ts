"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, type User } from "./api-client";

// One /me request per page load, shared by every component that asks. A forced
// refresh (sign-in, sign-out, profile save) reaches every mounted component:
// the nav, the bell and the live socket follow without a reload.
let pending: Promise<User | null> | null = null;
let current: User | null | undefined = undefined;
const listeners = new Set<() => void>();

export function fetchSession(force = false): Promise<User | null> {
  if (!pending || force) {
    pending = api.get<User | undefined>("/auth/me/").then((u) => u ?? null).catch(() => null).then((u) => {
      current = u;
      listeners.forEach((l) => l());
      return u;
    });
  }
  return pending;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useSession() {
  const user = useSyncExternalStore(subscribe, () => current, () => undefined);
  useEffect(() => {
    fetchSession();
  }, []);
  return user; // undefined while loading, null when signed out
}
