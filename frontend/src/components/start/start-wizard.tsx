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
import { ChoiceChip, Field, FileDrop, Input, Textarea, formatBytes, type DropFile } from "@/components/ui/field";
import { Accented, Hud } from "@/components/ui/hud";
import { cn } from "@/lib/cn";
import { AuthGate } from "./auth-gate";
import { EstimateReadout, Estimator, planFeatures } from "./estimator";
import { BriefQuestions } from "./brief-questions";
import { briefFor, briefRows, featureLabel, say, type Brief } from "./briefs";
import { SecurePayments } from "@/components/ui/secure-payments";
import { DatePicker } from "@/components/ui/date-picker";

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

// Before sign-in nothing is typed any more, but a draft from the old one-device
// flow may still be in storage: it seeds the first server draft once.
const LEGACY_KEY = "of:start-draft";
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.zip,.mp4,.mov,.mp3,.m4a";
const MAX_FILE = 25 * 1024 * 1024;
const MAX_FILES = 10;
const AUTOSAVE_MS = 700;
// Which step owns a server-side field error, so the wizard can jump back to it.
const FIELD_STEP: Record<string, number> = {
  service: 0, title: 1, objectives: 1, requirements: 1, features: 1, brief: 1, plan: 2, budget_min: 2, budget_max: 2,
  deadline: 2, reference_links: 3,
};

type Errors = Partial<Record<keyof Draft | "form", string>>;
type Pending = DropFile & { file: File };
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
  t: Pick<Dictionary, "start" | "auth" | "common" | "trust">;
  services: Service[];
  plans: CarePlan[];
  /** Calculator factors per service slug ("" = no service chosen). */
  pricing: Record<string, PricingFactor[]>;
}) {
  const s = t.start;
  const params = useSearchParams();
  const session = useSession();
  const { currency: displayCurrency } = useCurrency();
  const [signedIn, setSignedIn] = useState<User | null>(null);
  const user = signedIn ?? session;

  const defaultPlan = plans.find((p) => p.highlighted)?.code ?? plans[0]?.code ?? "";
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, plan: defaultPlan });
  const [reference, setReference] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [save, setSave] = useState<Save>("idle");
  // Contact details live on the profile; edits here are saved there on submit.
  const [contactEdits, setContactEdits] = useState<Partial<Record<"phone" | "whatsapp" | "company", string>>>({});
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; email: string } | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formId = useId();
  const creating = useRef<Promise<string> | null>(null);
  const dirty = useRef(false);

  // ── Resume the newest server draft (any device), else start fresh ──
  useEffect(() => {
    if (!user) return;
    let alive = true;
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
        let legacy: Partial<Draft> = {};
        try {
          legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "{}");
          localStorage.removeItem(LEGACY_KEY);
        } catch {
          // Storage blocked: nothing to carry over.
        }
        const service = preset && services.some((x) => x.slug === preset) ? preset : legacy.service ?? "";
        // A new draft starts in the currency the visitor reads prices in.
        setDraft((d) => ({
          ...d, budget_currency: displayCurrency, ...legacy, service, plan: legacy.plan || d.plan,
          brief: game ? { kind: "game" } : legacy.brief ?? {},
        }));
        if (meaningful({ ...EMPTY, ...legacy })) dirty.current = true;
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
    if (!loaded || !dirty.current || !meaningful(draft) || done) return;
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
  }, [draft, loaded, ensureDraft, lang, done]);

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
    company: contactEdits.company ?? user?.company ?? "",
  };
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
    if (index === 3 && !isUrlList(draft.reference_links)) e.reference_links = "https://…";
    return e;
  };

  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((n) => Math.min(n + 1, s.steps.length - 1));
  };

  // Files go straight into the draft, so they resume with it too.
  const addFiles = async (added: File[]) => {
    const room = Math.max(0, MAX_FILES - files.length - pending.length);
    const batch = added.slice(0, room).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, file,
      error: file.size > MAX_FILE ? "> 25 MB" : undefined,
    }));
    setPending((p) => [...p, ...batch]);
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

  const removeFile = async (id: string) => {
    if (!reference) return;
    await api.delete(`/requests/${reference}/attachments/${id}/`).catch(() => undefined);
    setFiles((list) => list.filter((x) => x.id !== id));
  };

  const submit = async () => {
    setErrors({});
    setBusy(true);
    try {
      const ref = await ensureDraft(draft);
      await api.patch(`/requests/${ref}/`, toBody(draft, lang, true));
      if (contact.phone !== user?.phone || contact.whatsapp !== user?.whatsapp || contact.company !== user?.company) {
        await api.patch("/auth/me/", contact).catch(() => undefined);
      }
      await api.post(`/requests/${ref}/submit/`);
      setDone({ reference: ref, email: user?.email ?? "" });
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
  if (user === null) return <AuthGate lang={lang} t={t} onSignedIn={setSignedIn} />;

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
  const brief = briefFor(draft.service);
  const factors = pricing[draft.service] ?? pricing[""] ?? [];
  const plan = plans.find((p) => p.code === draft.plan);
  const saveLabel = { idle: resumed ? s.resumed : "", saving: s.saving, saved: s.saved, error: s.saveError }[save];

  // Throw the draft away (files included) and start again from a blank form.
  const discard = async () => {
    if (!reference) return;
    setBusy(true);
    try {
      await api.delete(`/requests/${reference}/`);
      dirty.current = false;
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
    <div className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
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
                  <span className={cn(i !== step && "hidden lg:inline")}>{label}</span>
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
          <h2 className="text-h3 tracking-[-0.02em] text-ink-strong">
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
                onCurrency={(c) => set("budget_currency", c)}
              />
              <div className="grid gap-6 border-t border-line pt-8 sm:grid-cols-2">
                <Field label={`${s.budgetOptional} · ${s.budgetMin}`} error={errors.budget_min}>
                  {(a) => <Input id={a.id} inputMode="numeric" value={draft.budget_min} onChange={(e) => set("budget_min", e.target.value.replace(/\D/g, ""))} />}
                </Field>
                <Field label={`${s.budgetMax} · ${draft.budget_currency}`} error={errors.budget_max}>
                  {(a) => <Input id={a.id} inputMode="numeric" aria-invalid={a.invalid} aria-describedby={a.describedBy} value={draft.budget_max} onChange={(e) => set("budget_max", e.target.value.replace(/\D/g, ""))} />}
                </Field>
              </div>
              <p className="-mt-4 text-sm text-faint">{s.budgetHelp}</p>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-end">
                <Field label={s.deadline} error={errors.deadline}>
                  {(a) => <DatePicker id={a.id} lang={lang} min={today()} aria-invalid={a.invalid} aria-describedby={a.describedBy} value={draft.deadline} onChange={(v) => set("deadline", v)} />}
                </Field>
                <ChoiceChip label={s.deadlineFlexible} checked={draft.deadline_flexible} onChange={(e) => set("deadline_flexible", e.target.checked)} />
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
                <FileDrop id={`${formId}-files`} label={s.filesLabel} hint={s.filesHint} accept={ACCEPT} files={pending}
                  onAdd={addFiles} onRemove={(key) => setPending((l) => l.filter((x) => x.key !== key))}
                  disabled={files.length + pending.length >= MAX_FILES} />
              </div>
              <ChoiceChip label={s.nda} description={s.ndaHelp} checked={draft.wants_nda} onChange={(e) => set("wants_nda", e.target.checked)} />
              <fieldset className="flex flex-col gap-6 border-t border-line pt-8">
                <legend className="hud mb-6 text-muted">{s.contactTitle}</legend>
                <Hud tone="ink" dot>{fill(s.signedInAs, { email: user.email })}</Hud>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label={s.phone}>{(a) => <Input id={a.id} type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact("phone", e.target.value)} />}</Field>
                  <Field label={s.whatsapp}>{(a) => <Input id={a.id} type="tel" value={contact.whatsapp} onChange={(e) => setContact("whatsapp", e.target.value)} />}</Field>
                  <Field label={s.company} className="sm:col-span-2">{(a) => <Input id={a.id} autoComplete="organization" value={contact.company} onChange={(e) => setContact("company", e.target.value)} />}</Field>
                </div>
              </fieldset>
            </>
          )}

          {step === 4 && (
            <>
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
                  { k: s.files, v: files.map((f) => f.original_name).join(", "), at: 3 },
                  { k: s.nda, v: draft.wants_nda ? "✓" : "", at: 3 },
                  { k: s.email, v: [user.email, contact.phone, contact.whatsapp].filter(Boolean).join(" · "), at: 3 },
                ].filter((r) => r.v).map((r) => (
                  <div key={r.k} className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline">
                    <dt className="hud text-faint">{r.k}</dt>
                    <dd className="whitespace-pre-line break-words text-ink">{r.v}</dd>
                    <button type="button" onClick={() => setStep(r.at)} className="hud justify-self-start text-muted hover:text-ember-400">{s.edit}</button>
                  </div>
                ))}
              </dl>
              <SecurePayments labels={t.trust} compact />
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
            {reference && (
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
            <Button type="submit" variant={last ? "ember" : "primary"} arrow={!last} loading={busy}>
              {last ? s.submit : t.common.next}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
