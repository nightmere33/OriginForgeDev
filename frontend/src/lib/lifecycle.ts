/**
 * The client lifecycle as the API returns it (backend/engagements/lifecycle.py).
 * The server decides what each side may do (`can_respond`, `allowed_moves`,
 * `revisions_left`…); the UI only renders those answers.
 */
import type { Locale } from "@/i18n/dictionaries";
import type { Currency } from "./types";

export type Attachment = {
  id: string;
  original_name: string;
  size: number;
  is_voice: boolean;
  duration: number | null;
  created_at: string;
  uploaded_by_developer: boolean;
  url: string;
};

export type Proposal = {
  id: number;
  version: number;
  kind: "offer" | "counter";
  status: "sent" | "accepted" | "declined" | "countered" | "superseded" | "expired";
  from_client: boolean;
  title: string;
  scope: string;
  deliverables: string[];
  exclusions: string[];
  note: string;
  price: number;
  currency: Currency;
  plan_name: string;
  maintenance_days: number;
  revision_rounds: number;
  reply_hours: number;
  deposit_percent: number;
  schedule: { label: string; percent: number }[];
  timeline_days: number;
  milestones: { title: string; days: number }[];
  nda: boolean;
  allow_cash: boolean;
  /** Off: accept or decline only (a fixed price, or the final offer). */
  negotiable: boolean;
  /** Days to pay the deposit after signing; 0 = asked when its turn comes in the queue. */
  deposit_days: number;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  can_respond: boolean;
  can_counter: boolean;
};

export type Contract = {
  id: number;
  status: "pending" | "signed" | "void";
  language: string;
  body: string;
  sha256: string;
  signed_name: string;
  signed_at: string | null;
  created_at: string;
};

export type Proof = {
  id: number;
  method: "ccp" | "baridimob" | "cash" | "usdt";
  status: "pending" | "approved" | "rejected";
  payer_name: string;
  transfer_reference: string;
  tx_hash: string;
  crypto_amount: string | null;
  crypto_rate: string | null;
  explorer_url: string;
  note: string;
  review_note: string;
  created_at: string;
  receipt_url: string | null;
  receipt_name: string;
};

export type Invoice = {
  id: number;
  number: string;
  issued_at: string;
  label: string;
  amount: number;
  currency: Currency;
  method: string;
  emailed_at: string | null;
  reference: string;
  /** The PDF (drawn on first download). */
  url: string;
};

export type ChargeStatus = "proposed" | "scheduled" | "due" | "paid" | "declined" | "expired" | "void";

export type Charge = {
  id: number;
  /** `extra`: a cost outside the contract, or an optional offer. */
  kind: "deposit" | "milestone" | "balance" | "extra";
  label: string;
  description: string;
  /** An extra the client may decline. */
  optional: boolean;
  /** More maintenance: days added to the plan once paid. */
  extends_days: number;
  percent: number;
  amount: number;
  currency: Currency;
  status: ChargeStatus;
  due_at: string | null;
  paid_at: string | null;
  answered_at: string | null;
  created_at: string | null;
  overdue: boolean;
  /** A scheduled part the client may pay before it is asked for. */
  can_pay_early: boolean;
  invoice: Invoice | null;
  usdt_amount: string | null;
  /** The online methods open for it while due, with what each would take. */
  online: {
    chargily?: { amount: number; currency: "DZD" };
    paypal?: {
      amount: string; currency: "USD" | "EUR"; client_id: string;
      /** A DZD charge paid through PayPal: the live rate the quote comes from. */
      conversion?: { rate: string; source: string; updated_at: string | null };
    };
  };
  payments: OnlinePayment[];
  paid_by: PayMethod | null;
  proofs: Proof[];
};

export type PayMethod = "cash" | "ccp" | "baridimob" | "chargily" | "paypal" | "usdt";

/** A card (Chargily) or PayPal attempt at a charge. */
export type OnlinePayment = {
  id: number;
  provider: "chargily" | "paypal";
  status: "pending" | "paid" | "failed" | "canceled" | "expired" | "refunded";
  provider_amount: string | null;
  provider_currency: string;
  /** The provider's reason for a refusal or a hold. */
  detail: string;
  created_at: string;
  paid_at: string | null;
};

/** What the return page follows (GET /payments/<id>/). */
export type PaymentState = OnlinePayment & { amount: number; currency: Currency; charge: number; charge_status: ChargeStatus };

export type Milestone = {
  id: number;
  order: number;
  title: string;
  description: string;
  due_date: string | null;
  status: "planned" | "active" | "review" | "approved" | "changes";
  client_note: string;
  approved_at: string | null;
};

export type Task = {
  id: number;
  milestone: number | null;
  order: number;
  title: string;
  status: "todo" | "doing" | "done";
  eta: string | null;
  done_at: string | null;
};

export type ProgressUpdate = { id: number; title: string; body: string; attachments: Attachment[]; created_at: string };

/** One round of changes the client asked for (on the whole work, or on a milestone). */
export type Revision = { id: number; number: number; milestone: string | null; note: string; created_at: string };

/** The plan as signed: what it includes. */
export type PlanTerms = { code: string; name: string; maintenance_days: number; revision_rounds: number; reply_hours: number };

export type EngagementStatus =
  | "awaiting_deposit" | "in_development" | "client_review" | "awaiting_balance" | "live" | "closed"
  | "on_hold" | "cancelled" | "expired";

export type Engagement = {
  id: number;
  title: string;
  status: EngagementStatus;
  price: number;
  currency: Currency;
  plan_name: string;
  plan: PlanTerms;
  maintenance_days: number;
  /** Rounds in the plan plus the ones Younes granted. */
  revision_rounds: number;
  revisions_used: number;
  revisions_granted: number;
  revisions_left: number;
  timeline_days: number;
  nda: boolean;
  started_at: string | null;
  deadline: string | null;
  production_at: string | null;
  maintenance_ends_at: string | null;
  closed_at: string | null;
  charges: Charge[];
  milestones: Milestone[];
  tasks: Task[];
  updates: ProgressUpdate[];
  revisions: Revision[];
  ready_to_go_live: boolean;
  /** Younes allowed cash by hand for this client (in the proposal). */
  cash_allowed: boolean;
};

export const REACTIONS = ["\u2764\ufe0f", "\u{1F44D}", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F525}", "\u{1F64F}", "\u2705"] as const;

export type Reaction = { emoji: string; count: number; mine: boolean };

export type Message = {
  id: number;
  /**
   * Cards for something that happened elsewhere: `charge`, `update`, `issue`, `care`, `proposal`;
   * `share` is a slash command's card; tickets add `transcript` (the assistant chat) and `event` (a status note).
   */
  kind: "text" | "charge" | "update" | "issue" | "care" | "proposal" | "share" | "transcript" | "event";
  from_studio: boolean;
  sender_name: string;
  /** The sender's profile picture, or "". */
  sender_avatar: string;
  body: string;
  /** A card's facts, worded here in the page's language. */
  data: {
    event?: "started" | "reminder" | "ended" | "extended" | "closed" | "sent" | "countered" | "accepted" | "declined";
    days?: number; until?: string; closes?: string;
    share?: "howto" | "showreel" | "start" | "plans" | "pay" | "work";
    status?: "open" | "pending" | "solved" | "closed"; auto?: boolean;
    messages?: { role: "user" | "assistant"; text: string }[];
  };
  /** The version a proposal card is about, as it stands now. */
  proposal?: { id: number; version: number; kind: "offer" | "counter"; status: string; price: number; currency: Currency; plan_name: string; timeline_days: number; negotiable: boolean; expires_at: string } | null;
  /** Tickets: Younes's own note, never shown to the client. */
  internal?: boolean;
  attachment: Attachment | null;
  reply_to: { id: number; from_studio: boolean; sender_name: string; body: string; kind: string } | null;
  charge: Pick<Charge, "id" | "kind" | "label" | "description" | "optional" | "extends_days" | "amount" | "currency" | "status" | "due_at" | "paid_at"> | null;
  update: ProgressUpdate | null;
  reactions: Reaction[];
  read_at: string | null;
  created_at: string;
};

/** What a project card shows without opening it (the request list). */
export type RequestSummary = {
  plan: string;
  paid: number;
  total: number;
  percent: number;
  currency: Currency | "";
  /** What is waiting, and on whom: the client pays / answers an offer / reviews / signs / answers a proposal; the studio answers a new request, checks a receipt or a counter-offer. */
  waiting: "" | "pay" | "offer" | "proof" | "review" | "sign" | "answer" | "offer_studio" | "new";
  unread: number;
  deadline: string | null;
  maintenance_ends_at: string | null;
  engagement_status: EngagementStatus | "";
  /** What the conversation allows: open; ending (maintenance over, closes at `chat_closes_at`); closed (read-only). */
  chat: ChatState;
  chat_closes_at: string | null;
};

export type ChatState = "open" | "ending" | "closed";

export type ProjectRequest = {
  reference: string;
  service: string | null;
  service_title: string | null;
  title: string;
  objectives: string;
  requirements: string;
  features: string[];
  /** The service's own answers (components/start/briefs.ts). */
  brief: Record<string, string | string[]>;
  /** Waiting in the queue: where it stands (engagements/queue.py), else null. */
  queue: { position: number; start: string | null; active: number; capacity: number } | null;
  /** The calculator options picked, labelled in the reader's language (detail only). */
  choices?: { factor: string; choice: string }[];
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: Currency;
  deadline: string | null;
  deadline_flexible: boolean;
  reference_links: string;
  language: string;
  plan: string | null;
  options: Record<string, string>;
  estimate_low: number | null;
  estimate_high: number | null;
  estimate_currency: Currency | "";
  wants_nda: boolean;
  status: string;
  status_label: string;
  status_note: string;
  engagement_status: EngagementStatus | null;
  attachments: Attachment[];
  allowed_moves: string[];
  summary: RequestSummary;
  created_at: string;
  updated_at: string;
  client?: {
    id: number; full_name: string; email: string; company: string; phone: string; whatsapp: string; instagram: string; messenger: string; country: string;
    avatar_url: string; contact_channel: string; contact_channel_label: string; contact_handle: string; heard_from_label: string; heard_from_detail: string;
  };
  // Detail only:
  proposals?: Proposal[];
  contract?: Contract | null;
  engagement?: Engagement | null;
  unread?: number;
  /** Every file of the project (voice notes stay in the chat), newest first. */
  files?: (Attachment & { source: "request" | "chat" | "update" })[];
};

export type PaymentInstructions = {
  ccp_account: string;
  ccp_key: string;
  ccp_holder: string;
  ccp_address: string;
  baridimob_rip: string;
  cash_note: string;
  usdt_address: string;
  usdt_network: string;
  usdt_rate: number;
  rate_source: string;
  rate_updated_at: string | null;
  rate_stale: boolean;
};

// ── Formatting ──────────────────────────────────────────────────────────

const intl = (lang: Locale) => (lang === "fr" ? "fr-FR" : "en-GB");

export function money(lang: Locale, amount: number, currency: string) {
  // Grouped with thin spaces in both languages: "180 000 DZD".
  return `${new Intl.NumberFormat(intl(lang)).format(amount).replace(/[  ,]/g, " ")} ${currency}`;
}

/** An amount with cents (a PayPal quote): "309.53 USD", "309,53 USD" in French, grouped like `money`. */
export function cents(lang: Locale, value: string | number, currency: string) {
  const parts = new Intl.NumberFormat(intl(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(Number(value));
  return `${parts.map((x) => (x.type === "group" ? " " : x.value)).join("")} ${currency}`;
}

// French writes the first of the month "1er" ("le 1er août"); Intl gives "1".
const firstOfMonth = (lang: Locale, text: string) => (lang === "fr" ? text.replace(/^1(?=\s)/, "1er") : text);

export function day(lang: Locale, iso: string, withYear = true) {
  return firstOfMonth(lang, new Intl.DateTimeFormat(intl(lang), { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(new Date(iso)));
}

export function dateTime(lang: Locale, iso: string) {
  return firstOfMonth(lang, new Intl.DateTimeFormat(intl(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)));
}

/**
 * "about 3 days left" / "2 hours left" / "1 day late": whole units, rounded the
 * way people say them. Returns the number and unit so copy stays translatable.
 */
export function remaining(iso: string, now = Date.now()): { n: number; unit: "minute" | "hour" | "day"; late: boolean } {
  const ms = new Date(iso).getTime() - now;
  const late = ms < 0;
  const abs = Math.abs(ms);
  const hours = abs / 3_600_000;
  if (hours >= 24) return { n: Math.round(hours / 24), unit: "day", late };
  if (hours >= 1) return { n: Math.round(hours), unit: "hour", late };
  return { n: Math.max(1, Math.round(abs / 60_000)), unit: "minute", late };
}

/** Where a request is in the 10-stage journey shown by the stage track. */
export const STAGES = ["request", "review", "proposal", "contract", "deposit", "development", "client_review", "balance", "live", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export function stageOf(req: ProjectRequest): Stage {
  const eng = req.engagement;
  if (eng) {
    return ({
      awaiting_deposit: "deposit", in_development: "development", on_hold: "development", client_review: "client_review",
      awaiting_balance: "balance", live: "live", closed: "closed", cancelled: "closed", expired: "deposit",
    } as const)[eng.status];
  }
  if (req.contract?.status === "pending" || req.status === "accepted") return "contract";
  if (req.status === "proposal_sent") return "proposal";
  if (["in_review", "clarification"].includes(req.status)) return "review";
  return "request";
}
