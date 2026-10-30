"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/dictionaries";
import type { SiteFilm } from "@/lib/types";

/** A support ticket (docs/SUPPORT.md), as the API lists it. */
export type Ticket = {
  reference: string;
  subject: string;
  category: "question" | "problem" | "billing" | "project" | "other";
  status: "open" | "pending" | "solved" | "closed";
  origin: "client" | "studio" | "assistant";
  tier: string;
  tier_label: string;
  priority: number;
  target_hours: number;
  due_at: string | null;
  overdue: boolean;
  first_reply_at: string | null;
  solved_at: string | null;
  closed_at: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  unread: number;
  request: { reference: string; title: string } | null;
  /** Studio only. */
  user?: { id: number; full_name: string; email: string; avatar_url: string };
};

export type Standing = { tier: string; label: string; hours: number; priority: number };

export const isTicket = (ref: string) => ref.startsWith("TK-");
export const ASSISTANT = "assistant";

/** What a slash command can share; the card is drawn on each side in its language. */
export type Share = "howto" | "showreel" | "start" | "plans" | "pay" | "work";
export const COMMANDS: { cmd: string; share: Share }[] = [
  { cmd: "how-start", share: "howto" },
  { cmd: "showreel", share: "showreel" },
  { cmd: "start", share: "start" },
  { cmd: "plans", share: "plans" },
  { cmd: "pay", share: "pay" },
  { cmd: "work", share: "work" },
];

/** Ask the dock to open a thread (a project, a ticket, or the assistant) from anywhere on the page. */
export function openThread(reference: string) {
  window.dispatchEvent(new CustomEvent("of:open-thread", { detail: reference }));
}

export type TicketDraft = { request?: string; category?: string; subject?: string; body?: string };

/** Any page can start a ticket in the messenger, already about a project (a bug after it closed). */
export function newTicket(draft: TicketDraft = {}) {
  window.dispatchEvent(new CustomEvent("of:new-ticket", { detail: draft }));
}

const films = new Map<string, Promise<Partial<Record<"showreel" | "howto", SiteFilm>>>>();

/** The site's own films in this language (English where none), fetched once per page life. */
export function useSiteFilms(lang: Locale) {
  const [value, setValue] = useState<Partial<Record<"showreel" | "howto", SiteFilm>> | null>(null);
  useEffect(() => {
    let alive = true;
    if (!films.has(lang)) {
      films.set(lang, fetch(`/api/content/site/?lang=${lang}`, { headers: { Accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : {}))
        .then((s: { films?: Partial<Record<"showreel" | "howto", SiteFilm>> }) => s.films ?? {}, () => ({})));
    }
    films.get(lang)!.then((f) => alive && setValue(f));
    return () => {
      alive = false;
    };
  }, [lang]);
  return value;
}
