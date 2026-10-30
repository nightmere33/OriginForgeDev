"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Download, X } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { api, ApiError, upload, type User } from "@/lib/api-client";
import type { Attachment, ProjectRequest } from "@/lib/lifecycle";
import { useCurrency } from "@/lib/currency";
import { useSession } from "@/lib/session";
import type { CarePlan, Currency, Estimate, PricingFactor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Beside, ChoiceChip, Field, FileDrop, Input, Textarea, formatBytes, type DropFile } from "@/components/ui/field";
import { Accented, Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";
import { AuthGate } from "./auth-gate";
import { EstimateReadout, Estimator, planFeatures } from "./estimator";
import { BriefQuestions } from "./brief-questions";
import { briefFor, briefRows, featureLabel, say, type Brief } from "./briefs";
import { SecurePayments } from "@/components/ui/secure-payments";
import { DatePicker } from "@/components/ui/date-picker";
import { EmailCode } from "@/components/auth/email-code";
import { QueueCard, QueueNotice } from "./queue-notice";
import { smooth } from "@/motion/smooth";
import { isValidPhoneNumber } from "libphonenumber-js";
import { PhoneInput } from "@/components/ui/phone-input";
import { BudgetPicker, budgetRanges, convertBudget } from "./budget-picker";
import { ShowcaseChoice } from "./showcase-choice";

type Draft = {
  service: string;
  title: string;
  objectives: string;
  requirements: string;
  features: string[];
  brief: Answers;
  plan: string;
  options: Record<string, string>;
  budget_min: string;
  budget_max: string;
  budget_currency: Currency;
  deadline: string;
  deadline_flexible: boolean;
  reference_links: string;
  wants_nda: boolean;
};

type Answers = Record<string, string | string[]>;

const EMPTY: Draft = {
  service: "", title: "", objectives: "", requirements: "", features: [], brief: {}, plan: "", options: {}, budget_min: "",
  budget_max: "", budget_currency: "DZD", deadline: "", deadline_flexible: true, reference_links: "", wants_nda: false,
};

// The brief comes first: a visitor who isn't signed in fills it on this device
// (kept here, with the contact details), and the account is made when they
// send it. Once signed in, it seeds a new server draft, then this copy goes.
const GUEST_KEY = "of:start-draft";
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.zip,.mp4,.mov,.mp3,.m4a";
const MAX_FILE = 25 * 1024 * 1024;
const MAX_FILES = 10;
const AUTOSAVE_MS = 700;
// Which step owns a server-side field error, so the wizard can jump back to it.
const FIELD_STEP: Record<string, number> = {
  service: 0, title: 1, objectives: 1, requirements: 1, features: 1, brief: 1, plan: 2, budget_min: 2, budget_max: 2,
  deadline: 2, reference_links: 3,
};

type Errors = Partial<Record<keyof Draft | "form" | "phone" | "whatsapp", string>>;
/** `held`: chosen before the account existed; uploaded right after sign-in. */
type Pending = DropFile & { file: File; held?: boolean };
type Contact = Partial<Record<"phone" | "whatsapp" | "instagram" | "messenger" | "company", string>>;
type GuestCopy = Partial<Draft> & { contact?: Contact; waSame?: boolean | null };

function readGuest(): GuestCopy {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY) || "{}") as GuestCopy;
  } catch {
    return {};
  }
}

function forgetGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}
type Service = { slug: string; title: string; summary: string };
type Save = "idle" | "saving" | "saved" | "error";

/**
 * Moving to another service keeps only what still fits it: its features, and
 * the answers its own questions understand.
 */
function fitTo(brief: Brief, features: string[], answers: Answers) {
  const kept: Answers = {};
  for (const q of brief.questions) {
    const a = answers[q.key];
    if (a === undefined) continue;
    if (!("options" in q)) {
      if (typeof a === "string") kept[q.key] = a;
      continue;
    }
    const ok = (v: string) => q.options.some((x) => x.value === v);
    const picked = [a].flat().filter(ok);
    if (picked.length) kept[q.key] = q.kind === "many" ? picked : picked[0];
  }
  return { features: features.filter((f) => brief.features.includes(f)), brief: kept };
}

const isUrlList = (text: string) => text.split("\n").every((l) => !l.trim() || /^https?:\/\/[^\s/]+\.[^\s]+/.test(l.trim()));
const today = () => new Date().toISOString().slice(0, 10);

function fromRequest(r: ProjectRequest): Draft {
  return {
    service: r.service ?? "", title: r.title, objectives: r.objectives, requirements: r.requirements, features: r.features,
    brief: r.brief ?? {},
    plan: r.plan ?? "", options: r.options ?? {}, budget_min: r.budget_min ? String(r.budget_min) : "",
    budget_max: r.budget_max ? String(r.budget_max) : "", budget_currency: r.budget_currency || "DZD",
    deadline: r.deadline ?? "", deadline_flexible: r.deadline_flexible, reference_links: r.reference_links,
    wants_nda: r.wants_nda,
  };
}

/**
 * The API body. `strict` is the final save before submitting; autosaves leave
 * out values that are still being typed (a half URL, a past date) so the
 * server never rejects a keystroke.
 */
function toBody(d: Draft, lang: Locale, strict: boolean) {
  const body: Record<string, unknown> = {
    service: d.service || null, title: d.title.trim(), objectives: d.objectives.trim(), requirements: d.requirements.trim(),
    features: d.features, brief: d.brief, plan: d.plan || null, options: d.options, budget_currency: d.budget_currency,
    deadline_flexible: d.deadline_flexible, wants_nda: d.wants_nda, language: lang,
  };
  const lo = d.budget_min ? Number(d.budget_min) : null;
  const hi = d.budget_max ? Number(d.budget_max) : null;
  if (strict || !(lo && hi && lo > hi)) Object.assign(body, { budget_min: lo, budget_max: hi });
  if (strict || !d.deadline || d.deadline >= today()) body.deadline = d.deadline || null;
  if (strict || isUrlList(d.reference_links)) body.reference_links = d.reference_links;
  return body;
}

const meaningful = (d: Draft) => !!(d.service || d.title.trim() || d.objectives.trim());

export default function StartWizard({
  lang, t, services, plans, pricing,
}: {
  lang: Locale;
  t: Pick<Dictionary, "start" | "auth" | "common" | "trust" | "phoneInput">;
  services: Service[];
  plans: CarePlan[];
  /** Calculator factors per service slug ("" = no service chosen). */
  pricing: Record<string, PricingFactor[]>;
}) {
  const s = t.start;
  const params = useSearchParams();
  const session = useSession();
  const { currency: displayCurrency } = useCurrency();
  const [budgetCustom, setBudgetCustom] = useState(false);
  const [signedIn, setSignedIn] = useState<User | null>(null);
  const user = signedIn ?? session;
  // Signed out: the brief is filled first; the account comes when it is sent.
  const guest = user === null;
  const [gate, setGate] = useState(false);

  const defaultPlan = plans.find((p) => p.highlighted)?.code ?? plans[0]?.code ?? "";
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, plan: defaultPlan });
  const [reference, setReference] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [save, setSave] = useState<Save>("idle");
  // Contact details live on the profile; edits here are saved there on submit.
  const [contactEdits, setContactEdits] = useState<Contact>({});
  const [waSameEdit, setWaSame] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const wizard = useRef<HTMLDivElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  // A new step starts at its top: when the page was scrolled down through the
  // previous one, it glides back to the wizard (at once under reduced motion),
  // and focus moves to the new step's heading for keyboard and screen readers.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const el = wizard.current;
    if (!el) return;
    const offset = 96; // the fixed nav and a little air, as for anchors
    stepHeading.current?.focus({ preventScroll: true });
    // A shorter step shrinks the page and the browser clamps the scroll; one
    // frame later the smooth scroller knows the real position, and the target
    // is measured from it (not from the scroller's last frame).
    const frame = requestAnimationFrame(() => {
      const top = el.getBoundingClientRect().top;
      if (top >= offset) return;
      const target = Math.max(0, scrollY + top - offset);
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (smooth.lenis) smooth.lenis.scrollTo(target, { duration: 0.7, immediate: reduce, force: true });
      else window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; email: string; queue: ProjectRequest["queue"] } | null>(null);
  // Requests are sent from a confirmed address; the code step opens on demand.
  const [askCode, setAskCode] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formId = useId();
  const creating = useRef<Promise<string> | null>(null);
  const dirty = useRef(false);

  // ── Signed out: this device's copy of the brief, else a fresh one ──
  useEffect(() => {
    if (user !== null) return;
    let alive = true;
    // Read from the device's storage like any other source: once, then shown.
    Promise.resolve(readGuest()).then((kept) => {
      if (!alive) return;
      const game = params.get("service") === "game";
      const preset = game ? "" : params.get("service");
      const service = preset && services.some((x) => x.slug === preset) ? preset : kept.service ?? "";
      const { contact, waSame: keptWa, ...fields } = kept;
      setDraft((d) => ({
        ...d, budget_currency: displayCurrency, ...fields, service, plan: fields.plan || d.plan,
        brief: game ? { kind: "game" } : fields.brief ?? ({} as Answers),
      }));
      if (contact) setContactEdits(contact);
      if (keptWa !== undefined) setWaSame(keptWa);
      setResumed(meaningful({ ...EMPTY, ...fields }));
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
    // Once, when the page knows nobody is signed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user === null]);

  // ── Signed out: keep the brief on this device as it is typed ──
  useEffect(() => {
    if (!guest || !loaded || !dirty.current) return;
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify({ ...draft, contact: contactEdits, waSame: waSameEdit }));
    } catch {
      // Storage blocked: the brief lasts for this page.
    }
  }, [guest, loaded, draft, contactEdits, waSameEdit]);

  // ── Signed in: the brief typed before signing in, else the newest server draft (any device) ──
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const kept = readGuest();
    if (meaningful({ ...EMPTY, ...kept })) {
      // Just signed in (here, or back from Google / Facebook): the brief becomes a new draft.
      Promise.resolve(kept).then(({ contact, waSame: keptWa, ...fields }) => {
        if (!alive) return;
        setDraft((d) => ({ ...d, ...fields, plan: fields.plan || d.plan }));
        if (contact) setContactEdits(contact);
        if (keptWa !== undefined) setWaSame(keptWa);
        forgetGuest();
        dirty.current = true;
        setReference(null);
        if (params.get("send")) setStep(s.steps.length - 1);
        setLoaded(true);
      });
      return () => {
        alive = false;
      };
    }
    api.get<{ results: ProjectRequest[] }>("/requests/?status=draft").then((r) => {
      if (!alive) return;
      const wanted = params.get("draft");
      const latest = params.get("new") ? undefined : (wanted && r.results.find((x) => x.reference === wanted)) || r.results[0];
      // "?service=game": games are taken on request, under "Something else".
      const game = params.get("service") === "game";
      const preset = game ? "" : params.get("service");
      if (latest) {
        const d = fromRequest(latest);
        // A service taken off the site since (games) reopens as "Something else".
        const listed = services.some((x) => x.slug === d.service);
        const service = listed ? d.service : !d.service && preset && services.some((x) => x.slug === preset) ? preset : "";
        const brief = d.service === "game-dev" ? { ...d.brief, kind: "game" } : d.brief;
        setDraft({ ...d, ...fitTo(briefFor(service), d.features, brief), service, plan: d.plan || defaultPlan });
        setReference(latest.reference);
        setFiles(latest.attachments);
        setResumed(true);
        setStep(d.title && d.objectives ? 2 : d.service ? 1 : 0);
      } else {
        const service = preset && services.some((x) => x.slug === preset) ? preset : "";
        // A new draft starts in the currency the visitor reads prices in.
        setDraft((d) => ({ ...d, budget_currency: displayCurrency, service, brief: game ? { kind: "game" } : ({} as Answers) }));
      }
      setLoaded(true);
    }, () => alive && setLoaded(true));
    return () => {
      alive = false;
    };
    // Runs once per signed-in user; params/services are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const ensureDraft = useCallback(async (d: Draft): Promise<string> => {
    if (reference) return reference;
    creating.current ??= api.post<ProjectRequest>("/requests/", { ...toBody(d, lang, false), draft: true })
      .then((r) => {
        setReference(r.reference);
        return r.reference;
      })
      .finally(() => {
        creating.current = null;
      });
    return creating.current;
  }, [reference, lang]);

  // ── Autosave: debounced, quiet, never blocks typing ──
  useEffect(() => {
    if (!user || !loaded || !dirty.current || !meaningful(draft) || done) return;
    const timer = setTimeout(async () => {
      setSave("saving");
      try {
        const ref = await ensureDraft(draft);
        await api.patch(`/requests/${ref}/`, toBody(draft, lang, false));
        setSave("saved");
      } catch {
        setSave("error");
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [user, draft, loaded, ensureDraft, lang, done]);

  // ── Live estimate (the server owns the maths) ──
  useEffect(() => {
    if (!draft.service) return;
    let alive = true;
    const timer = setTimeout(() => {
      setEstimating(true);
      api.post<Estimate>("/content/estimate/", {
        service: draft.service, currency: draft.budget_currency, plan: draft.plan, choices: draft.options,
      }).then((e) => alive && setEstimate(e), () => undefined).finally(() => alive && setEstimating(false));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [draft.service, draft.budget_currency, draft.plan, draft.options]);

  const contact = {
    phone: contactEdits.phone ?? user?.phone ?? "",
    whatsapp: contactEdits.whatsapp ?? user?.whatsapp ?? "",
    instagram: contactEdits.instagram ?? user?.instagram ?? "",
    messenger: contactEdits.messenger ?? user?.messenger ?? "",
    company: contactEdits.company ?? user?.company ?? "",
  };
  // One number for calls and WhatsApp unless the client says otherwise.
  const waSame = waSameEdit ?? (!user?.whatsapp || user.whatsapp === user.phone);
  const saved = { ...contact, whatsapp: waSame ? contact.phone : contact.whatsapp };
  const setContact = (key: keyof typeof contactEdits, value: string) => setContactEdits((c) => ({ ...c, [key]: value }));
  const shownEstimate = draft.service ? estimate : null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };
  const pickService = (slug: string) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, service: slug, ...fitTo(briefFor(slug), d.features, d.brief) }));
    setErrors((e) => ({ ...e, service: undefined, form: undefined }));
  };

  const validate = (index: number): Errors => {
    const e: Errors = {};
    if (index === 1) {
      if (!draft.title.trim()) e.title = s.required;
      if (!draft.objectives.trim()) e.objectives = s.required;
    }
    if (index === 2) {
      if (draft.budget_min && draft.budget_max && Number(draft.budget_min) > Number(draft.budget_max)) e.budget_max = "≥ " + draft.budget_min;
      if (draft.deadline && draft.deadline < today()) e.deadline = s.required;
    }
    if (index === 3) {
      if (!isUrlList(draft.reference_links)) e.reference_links = "https://…";
      // The phone is required (that's how a project gets moving); WhatsApp is optional but must be a number.
      if (!contact.phone) e.phone = s.phoneRequired;
      else if (!isValidPhoneNumber(contact.phone, "DZ")) e.phone = s.phoneInvalid;
      if (!waSame && contact.whatsapp && !isValidPhoneNumber(contact.whatsapp, "DZ")) e.whatsapp = s.phoneInvalid;
    }
    return e;
  };

  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((n) => Math.min(n + 1, s.steps.length - 1));
  };

  // Files go straight into the draft, so they resume with it too. Signed out,
  // they wait on this page and go up the moment the account exists.
  const addFiles = async (added: File[]) => {
    const room = Math.max(0, MAX_FILES - files.length - pending.length);
    const batch: Pending[] = added.slice(0, room).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, file,
      error: file.size > MAX_FILE ? "> 25 MB" : undefined, held: guest,
    }));
    setPending((p) => [...p, ...batch]);
    if (!guest) await uploadAll(batch);
  };

  const uploadAll = async (batch: Pending[]) => {
    let ref: string;
    try {
      dirty.current = true;
      ref = await ensureDraft(draft);
    } catch {
      setPending((p) => p.map((x) => (batch.some((b) => b.key === x.key) ? { ...x, error: t.common.error } : x)));
      return;
    }
    for (const f of batch.filter((x) => !x.error)) {
      try {
        const saved = await upload<Attachment>(`/requests/${ref}/attachments/`, f.file, (pct) =>
          setPending((list) => list.map((x) => (x.key === f.key ? { ...x, progress: pct } : x))),
        );
        setFiles((list) => [...list, saved]);
        setPending((list) => list.filter((x) => x.key !== f.key));
      } catch (err) {
        const msg = err instanceof ApiError ? err.field("file") ?? err.message : t.common.error;
        setPending((list) => list.map((x) => (x.key === f.key ? { ...x, error: msg } : x)));
      }
    }
  };

  // Signed in now: the files chosen before go up into the new draft.
  const uploadingHeld = useRef(false);
  useEffect(() => {
    if (!user || !loaded || uploadingHeld.current || !pending.some((p) => p.held)) return;
    uploadingHeld.current = true;
    const held = pending.filter((p) => p.held && !p.error).map((p) => ({ ...p, held: false }));
    setPending((list) => list.map((p) => (p.held ? { ...p, held: false } : p)));
    uploadAll(held).finally(() => {
      uploadingHeld.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loaded]);

  const removeFile = async (id: string) => {
    if (!reference) return;
    await api.delete(`/requests/${reference}/attachments/${id}/`).catch(() => undefined);
    setFiles((list) => list.filter((x) => x.id !== id));
  };

  const submit = async () => {
    // Signed out: the brief is complete; the account is the last step before sending.
    if (guest) {
      setGate(true);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const ref = await ensureDraft(draft);
      await api.patch(`/requests/${ref}/`, toBody(draft, lang, true));
      if ((Object.keys(saved) as (keyof typeof saved)[]).some((k) => saved[k] !== (user?.[k] ?? ""))) {
        await api.patch("/auth/me/", saved).catch(() => undefined);
      }
      const sent = await api.post<ProjectRequest>(`/requests/${ref}/submit/`);
      setDone({ reference: ref, email: user?.email ?? "", queue: sent.queue });
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors: Errors = {};
        let jump = s.steps.length - 1;
        for (const key of Object.keys(err.data)) {
          const msg = err.field(key);
          if (key in FIELD_STEP && msg) {
            fieldErrors[key as keyof Errors] = msg;
            jump = Math.min(jump, FIELD_STEP[key]);
          }
        }
        if (err.field("code") === "email_unverified") {
          setAskCode(true);
          setStep(s.steps.length - 1);
          return;
        }
        if (!Object.keys(fieldErrors).length) fieldErrors.form = err.message;
        setErrors(fieldErrors);
        setStep(jump);
      } else {
        setErrors({ form: t.common.error });
      }
    } finally {
      setBusy(false);
    }
  };

  if (user === undefined) return <div className="min-h-[32rem]" />;
  if (user === null && gate) {
    return (
      <AuthGate lang={lang} t={t} title={s.guest.gateTitle} lead={s.guest.gateLead} next={`/${lang}/start?send=1`}
        prefill={{ phone: saved.phone, whatsapp: saved.whatsapp }} onBack={() => setGate(false)}
        onSignedIn={(u) => {
          setSignedIn(u);
          setGate(false);
          setStep(s.steps.length - 1);
        }} />
    );
  }

  if (done) {
    return (
      <div className="px-6 py-[var(--chapter)] text-center md:px-10">
        <span className="mx-auto flex size-14 items-center justify-center border border-ember-400 text-ember-400">
          <Check aria-hidden className="size-6" />
        </span>
        <h2 className="mt-8 text-h2 tracking-[-0.035em] text-ink-strong">
          <Accented parts={s.doneTitle} />
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
          {fill(s.doneText, { ref: done.reference, email: done.email })}
        </p>
        {done.queue && (
          <div className="mx-auto mt-10 max-w-md text-left">
            <QueueCard lang={lang} s={s} queue={done.queue} />
          </div>
        )}
        <Link
          href={`/${lang}/portal/requests/${done.reference}`}
          className="mt-10 inline-flex h-12 items-center bg-ember-500 px-6 font-mono text-hud font-bold uppercase tracking-[0.12em] text-on-ember hover:bg-ember-600"
        >
          {s.openPortal}
        </Link>
      </div>
    );
  }

  const last = step === s.steps.length - 1;
  const selected = services.find((x) => x.slug === draft.service);
  // The live session first: it turns verified the moment the code is accepted.
  const verified = guest || !!(session ?? user)?.email_verified || !!user?.is_developer;
  const brief = briefFor(draft.service);
  const factors = pricing[draft.service] ?? pricing[""] ?? [];
  const plan = plans.find((p) => p.code === draft.plan);
  const saveLabel = guest
    ? (meaningful(draft) ? s.guest.saved : "")
    : { idle: resumed ? s.resumed : "", saving: s.saving, saved: s.saved, error: s.saveError }[save];

  // Throw the draft away (files included) and start again from a blank form.
  const discard = async () => {
    if (!reference) {
      // Signed out: only this device's copy to forget.
      forgetGuest();
      dirty.current = false;
      setPending([]);
      setResumed(false);
      setSave("idle");
      setDraft({ ...EMPTY, plan: defaultPlan, budget_currency: displayCurrency });
      setContactEdits({});
      setStep(0);
      setConfirmDiscard(false);
      return;
    }
    setBusy(true);
    try {
      await api.delete(`/requests/${reference}/`);
      dirty.current = false;
      forgetGuest();
      setReference(null);
      setFiles([]);
      setResumed(false);
      setSave("idle");
      setDraft({ ...EMPTY, plan: defaultPlan, budget_currency: displayCurrency });
      setStep(0);
      setConfirmDiscard(false);
    } catch {
      setErrors({ form: t.common.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wizard} className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <nav aria-label={s.title.join("")} className="border-line px-6 py-6 md:px-10 lg:border-r lg:py-10">
        <div className="flex gap-2 overflow-x-auto lg:sticky lg:top-[calc(var(--nav-h)+5rem)] lg:flex-col lg:gap-0 lg:overflow-visible">
          <ol className="contents">
            {s.steps.map((label, i) => (
              <li key={label} className="shrink-0">
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "hud flex w-full items-center gap-3 border-b border-transparent py-2 text-left transition-colors lg:border-line lg:py-4",
                    i === step ? "text-ink" : i < step ? "text-muted hover:text-ink" : "text-faint",
                  )}
                >
                  <span className={cn("flex size-6 items-center justify-center border", i === step ? "border-ember-400 text-ember-400" : i < step ? "border-line-strong" : "border-line")}>
                    {i < step ? <Check aria-hidden className="size-3" /> : String(i + 1).padStart(2, "0")}
                  </span>
                  {/* Phones show only the current name; the others stay readable by screen readers. */}
                  <span className={cn(i !== step && "sr-only lg:not-sr-only")}>{label}</span>
                </button>
              </li>
            ))}
          </ol>
          {step > 2 && shownEstimate?.low ? (
            <EstimateReadout lang={lang} s={s} estimate={shownEstimate} className="mt-8 hidden lg:block" />
          ) : null}
        </div>
      </nav>

      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (last) submit();
          else next();
        }}
        className="flex flex-col px-6 py-8 md:px-10 lg:py-10"
      >
        <div key={step} className="flex flex-col gap-8 [animation:step-in_var(--dur-standard)_var(--ease-out)]">
          <h2 ref={stepHeading} tabIndex={-1} className="text-h3 tracking-[-0.02em] text-ink-strong focus:outline-none">
            {[s.service, s.projectTitle, s.estimate, s.links, s.review][step]}
          </h2>

          {step === 0 && (
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">{s.service}</legend>
              {services.map((x) => (
                <ChoiceChip key={x.slug} type="radio" name="service" label={x.title} description={x.summary}
                  checked={draft.service === x.slug} onChange={() => pickService(x.slug)} />
              ))}
              <ChoiceChip type="radio" name="service" label={s.serviceOther} description={s.serviceOtherHelp}
                checked={draft.service === ""} onChange={() => pickService("")} />
              <QueueNotice lang={lang} s={s} service={draft.service} title={selected?.title} className="sm:col-span-2" />
            </fieldset>
          )}

          {step === 1 && (
            <>
              <Field label={say(lang, brief.title)} help={say(lang, brief.titleHelp)} error={errors.title}>
                {(a) => <Input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} value={draft.title} maxLength={160} onChange={(e) => set("title", e.target.value)} />}
              </Field>
              <Field label={say(lang, brief.goal)} help={say(lang, brief.goalHelp)} error={errors.objectives}>
                {(a) => <Textarea id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} value={draft.objectives} onChange={(e) => set("objectives", e.target.value)} />}
              </Field>
              <BriefQuestions lang={lang} questions={brief.questions} answers={draft.brief} error={errors.brief}
                onChange={(key, value) => set("brief", { ...draft.brief, [key]: value })} />
              {brief.features.length > 0 && (
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="hud mb-3 text-muted">{s.features}</legend>
                  {brief.features.map((f) => (
                    <ChoiceChip key={f} label={featureLabel(lang, f)} checked={draft.features.includes(f)}
                      onChange={(e) => set("features", e.target.checked ? [...draft.features, f] : draft.features.filter((x) => x !== f))} />
                  ))}
                </fieldset>
              )}
              <Field label={say(lang, brief.details)} help={say(lang, brief.detailsHelp)} error={errors.requirements}>
                {(a) => <Textarea id={a.id} aria-describedby={a.describedBy} value={draft.requirements} onChange={(e) => set("requirements", e.target.value)} />}
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Estimator
                lang={lang} s={s} plans={plans} factors={factors} plan={draft.plan} options={draft.options}
                currency={draft.budget_currency} estimate={shownEstimate} loading={estimating}
                onPlan={(code) => set("plan", code)}
                onOption={(factor, choice) => set("options", { ...draft.options, [factor]: choice })}
                onCurrency={(c) => {
                  // The budget follows the currency: the same range (own amounts are cleared, the markets differ).
                  const moved = convertBudget(draft.budget_min, draft.budget_max, draft.budget_currency, c);
                  set("budget_currency", c);
                  set("budget_min", moved.min);
                  set("budget_max", moved.max);
                }}
              />
              <div className="border-t border-line pt-8">
                <BudgetPicker lang={lang} s={s} currency={draft.budget_currency} estimate={shownEstimate}
                  min={draft.budget_min} max={draft.budget_max} error={errors.budget_max}
                  // A saved range that is none of the presets opens as one's own range.
                  custom={budgetCustom || (!!(draft.budget_min || draft.budget_max)
                    && !budgetRanges(draft.budget_currency).some((r) => String(r.min ?? "") === draft.budget_min && String(r.max ?? "") === draft.budget_max))}
                  onChange={({ min, max, custom }) => {
                    setBudgetCustom(custom);
                    set("budget_min", min);
                    set("budget_max", max);
                  }} />
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-start">
                <Field label={s.deadline} error={errors.deadline}>
                  {(a) => <DatePicker id={a.id} lang={lang} min={today()} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={draft.deadline} onChange={(v) => set("deadline", v)} />}
                </Field>
                <Beside>
                  <ChoiceChip inline label={s.deadlineFlexible} checked={draft.deadline_flexible} onChange={(e) => set("deadline_flexible", e.target.checked)} />
                </Beside>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Field label={s.links} help={s.linksHelp} error={errors.reference_links}>
                {(a) => <Textarea id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} value={draft.reference_links} placeholder="https://" onChange={(e) => set("reference_links", e.target.value)} />}
              </Field>
              <div className="flex flex-col gap-2">
                <span className="hud text-muted">{s.files}</span>
                {files.length > 0 && (
                  <ul className="flex flex-col gap-px border border-line bg-line">
                    {files.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 bg-cell px-4 py-3 text-sm">
                        <Download aria-hidden className="size-4 shrink-0 text-faint" />
                        <a href={f.url} className="min-w-0 flex-1 truncate text-ink hover:text-ember-400">{f.original_name}</a>
                        <span className="hud text-faint">{formatBytes(f.size)}</span>
                        <button type="button" onClick={() => removeFile(f.id)} aria-label={`${s.remove} ${f.original_name}`} className="text-faint hover:text-err">
                          <X aria-hidden className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <FileDrop id={`${formId}-files`} label={s.filesLabel} hint={guest ? `${s.filesHint} ${s.guest.filesLater}` : s.filesHint} accept={ACCEPT} files={pending}
                  onAdd={addFiles} onRemove={(key) => setPending((l) => l.filter((x) => x.key !== key))}
                  disabled={files.length + pending.length >= MAX_FILES} />
              </div>
              <ShowcaseChoice s={s.showcase} confidential={draft.wants_nda} onChange={(v) => set("wants_nda", v)} />
              <fieldset className="flex flex-col gap-6 border-t border-line pt-8">
                <legend className="hud mb-6 text-muted">{s.contactTitle}</legend>
                {user ? <Hud tone="ink" dot>{fill(s.signedInAs, { email: user.email })}</Hud> : <p className="text-sm text-faint">{s.guest.contactNote}</p>}
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label={s.phone} error={errors.phone}>
                    {(a) => <PhoneInput id={a.id} lang={lang} labels={t.phoneInput} value={contact.phone} invalid={a.invalid} describedBy={a.describedBy}
                      onChange={(v) => {
                        setContact("phone", v);
                        setErrors((e) => ({ ...e, phone: undefined }));
                      }} />}
                  </Field>
                  <Beside>
                    <ChoiceChip inline label={s.whatsappSame} checked={waSame} onChange={(e) => {
                      setWaSame(e.target.checked);
                      setErrors((er) => ({ ...er, whatsapp: undefined }));
                    }} />
                  </Beside>
                  {!waSame && (
                    <Field label={s.whatsapp} error={errors.whatsapp} className="[animation:step-in_var(--dur-standard)_var(--ease-out)] sm:col-span-2 sm:max-w-[calc(50%-0.75rem)]">
                      {(a) => <PhoneInput id={a.id} lang={lang} labels={t.phoneInput} value={contact.whatsapp} invalid={a.invalid} describedBy={a.describedBy}
                        autoComplete="off" onChange={(v) => {
                          setContact("whatsapp", v);
                          setErrors((e) => ({ ...e, whatsapp: undefined }));
                        }} />}
                    </Field>
                  )}
                  <p className="hud -mb-2 text-muted sm:col-span-2">{s.alsoReach}</p>
                  <Field label={s.instagram}>
                    {(a) => (
                      <div className="relative">
                        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-faint">@</span>
                        <Input id={a.id} value={contact.instagram} placeholder={s.instagramHint} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                          onChange={(e) => setContact("instagram", e.target.value.replace(/^@+/, ""))} className="pl-8" />
                      </div>
                    )}
                  </Field>
                  <Field label={s.messenger}>
                    {(a) => <Input id={a.id} value={contact.messenger} placeholder={s.messengerHint} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                      onChange={(e) => setContact("messenger", e.target.value)} />}
                  </Field>
                  <Field label={s.company} className="sm:col-span-2">{(a) => <Input id={a.id} autoComplete="organization" value={contact.company} onChange={(e) => setContact("company", e.target.value)} />}</Field>
                </div>
              </fieldset>
            </>
          )}

          {step === 4 && (
            <>
              <QueueNotice lang={lang} s={s} service={draft.service} title={selected?.title} />
              <EstimateReadout lang={lang} s={s} estimate={shownEstimate} loading={estimating} />
              <dl className="divide-y divide-line border-y border-line">
                {[
                  { k: s.steps[0], v: selected?.title ?? s.serviceOther, at: 0 },
                  { k: say(lang, brief.title), v: draft.title, at: 1 },
                  { k: say(lang, brief.goal), v: draft.objectives, at: 1 },
                  ...briefRows(lang, draft.service, draft.brief).map((r) => ({ k: r.label, v: r.value, at: 1 })),
                  { k: s.features, v: draft.features.map((f) => featureLabel(lang, f)).join(" · "), at: 1 },
                  { k: say(lang, brief.details), v: draft.requirements, at: 1 },
                  { k: s.plan, v: plan ? `${plan.name} · ${planFeatures(s, plan).slice(0, 3).join(" · ")}` : "", at: 2 },
                  {
                    k: s.options,
                    v: factors.map((f) => f.choices.find((c) => c.key === (draft.options[f.key] ?? f.choices.find((x) => x.is_default)?.key))?.label).filter(Boolean).join(" · "),
                    at: 2,
                  },
                  { k: s.budget, v: draft.budget_min || draft.budget_max ? `${draft.budget_min || "?"} – ${draft.budget_max || "?"} ${draft.budget_currency}` : "", at: 2 },
                  { k: s.deadline, v: draft.deadline, at: 2 },
                  { k: s.files, v: [...files.map((f) => f.original_name), ...pending.filter((p) => p.held).map((p) => p.name)].join(", "), at: 3 },
                  { k: s.showcase.title, v: draft.wants_nda ? s.showcase.keep : s.showcase.show, at: 3 },
                  { k: s.email, v: [user?.email, saved.phone, saved.whatsapp !== saved.phone && saved.whatsapp, saved.instagram && `@${saved.instagram}`, saved.messenger]
                    .filter(Boolean).join(" · "), at: 3 },
                ].filter((r) => r.v).map((r) => (
                  <div key={r.k} className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline">
                    <dt className="hud text-faint">{r.k}</dt>
                    <dd className="whitespace-pre-line break-words text-ink">{r.v}</dd>
                    <button type="button" onClick={() => setStep(r.at)} className="hud justify-self-start text-muted hover:text-ember-400">{s.edit}</button>
                  </div>
                ))}
              </dl>
              <SecurePayments labels={t.trust} compact />
              {guest && (
                <p className="flex items-start gap-3 border border-line bg-cell px-5 py-4 text-sm leading-relaxed text-muted">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-ember-400" />
                  {s.guest.reviewNote}
                </p>
              )}
              {!verified && user && (
                <div className="flex flex-col gap-4 border border-ember-400/50 bg-ember-500/[0.05] p-5 md:p-6">
                  <Hud tone="ember" dot>{t.auth.code.toSend}</Hud>
                  {askCode ? (
                    <EmailCode a={t.auth} email={user.email} onVerified={() => setAskCode(false)} />
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => {
                      api.post("/auth/verify-email/resend/").catch(() => undefined);
                      setAskCode(true);
                    }}>{t.auth.code.sendMe}</Button>
                  )}
                </div>
              )}
            </>
          )}

          {errors.form && (
            <p role="alert" className="flex items-center gap-2 text-sm text-err">
              <span aria-hidden className="size-1.5 bg-err" />
              {errors.form}
            </p>
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <Button variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0 || busy}>
            {t.common.back}
          </Button>
          <div className="flex items-center gap-4">
            {(reference || (guest && meaningful(draft))) && (
              confirmDiscard ? (
                <span className="flex items-center gap-3">
                  <button type="button" onClick={discard} disabled={busy} className="hud text-err hover:underline">{s.discardConfirm}</button>
                  <button type="button" onClick={() => setConfirmDiscard(false)} className="hud text-faint hover:text-ink">{s.discardKeep}</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDiscard(true)} className="hud text-faint hover:text-err">{s.discard}</button>
              )
            )}
            <span aria-live="polite" className="hidden sm:inline-flex">
              {saveLabel && (
                <Hud as="span" tone={save === "error" ? "ember" : "faint"} dot={save === "saving"} live={save === "saving"}>
                  {saveLabel}
                </Hud>
              )}
            </span>
            <Button type="submit" variant={last ? "ember" : "primary"} arrow={!last || guest} loading={busy} disabled={last && !verified}>
              {last ? (guest ? s.guest.continue : s.submit) : t.common.next}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
