"use client";

import { useId } from "react";
import type { Locale } from "@/i18n/dictionaries";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { say, type Question } from "./briefs";

type Answer = string | string[];

const chip = cn(
  "flex cursor-pointer items-center gap-2 border border-line px-3 py-2 text-sm text-muted transition-[border-color,color,background-color] duration-[var(--dur-micro)]",
  "hover:border-line-strong hover:text-ink has-[:checked]:border-ember-400 has-[:checked]:bg-ember-500/[0.06] has-[:checked]:text-ink-strong",
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ember-400",
);

/** One service's own questions (components/start/briefs.ts), as chips and short fields. */
export function BriefQuestions({
  lang, questions, answers, error, onChange,
}: {
  lang: Locale;
  questions: Question[];
  answers: Record<string, Answer>;
  error?: string;
  onChange: (key: string, value: Answer) => void;
}) {
  const id = useId();
  if (!questions.length) return null;
  return (
    <div className="flex flex-col gap-8 border-t border-line pt-8">
      {questions.map((q) => {
        const value = answers[q.key];
        if (!("options" in q)) {
          const text = typeof value === "string" ? value : "";
          const placeholder = q.placeholder ? say(lang, q.placeholder) : undefined;
          return (
            <Field key={q.key} label={say(lang, q.label)} help={q.help && say(lang, q.help)}>
              {(a) => q.kind === "long"
                ? <Textarea id={a.id} aria-describedby={a.describedBy} rows={3} className="min-h-24" value={text} maxLength={2000} placeholder={placeholder} onChange={(e) => onChange(q.key, e.target.value)} />
                : <Input id={a.id} aria-describedby={a.describedBy} value={text} maxLength={2000} placeholder={placeholder} onChange={(e) => onChange(q.key, e.target.value)} />}
            </Field>
          );
        }
        const many = q.kind === "many";
        const picked = new Set([value ?? []].flat());
        return (
          <fieldset key={q.key} className="flex flex-col gap-3">
            <legend className="hud mb-3 text-muted">{say(lang, q.label)}</legend>
            {q.help && <p className="-mt-1 text-sm text-faint">{say(lang, q.help)}</p>}
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => (
                <label key={opt.value} className={chip}>
                  <input
                    type={many ? "checkbox" : "radio"}
                    name={`${id}-${q.key}`}
                    value={opt.value}
                    checked={picked.has(opt.value)}
                    onChange={(e) => {
                      if (!many) return onChange(q.key, opt.value);
                      const next = e.target.checked ? [...picked, opt.value] : [...picked].filter((v) => v !== opt.value);
                      onChange(q.key, next);
                    }}
                    className="sr-only"
                  />
                  {many && (
                    <span aria-hidden className="size-2 shrink-0 border border-line-strong transition-colors [label:has(:checked)_&]:border-ember-400 [label:has(:checked)_&]:bg-ember-400" />
                  )}
                  {say(lang, opt.label)}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-err">
          <span aria-hidden className="size-1.5 bg-err" />
          {error}
        </p>
      )}
    </div>
  );
}
