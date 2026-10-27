"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Locale } from "@/i18n/dictionaries";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceChip, Field, FileDrop, Input, Select, Textarea, type DropFile } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { Hud } from "@/components/ui/hud";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status";
import { Toggle } from "@/components/ui/toggle";
import { WheelPicker } from "@/components/ui/wheel-picker";
import { BriefQuestions } from "@/components/start/brief-questions";
import { DecodeText, GlitchLabel } from "@/motion/glitch";
import { useGuard } from "@/components/portal/requests";

/** One piece of the pack: its name, where it lives, what it is for, and the thing itself. */
function Piece({ name, path, note, children }: { name: string; path: string; note: string; children: ReactNode }) {
  return (
    <section className="grid gap-px border-t border-line bg-line lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="flex flex-col gap-3 bg-bg px-6 py-8 md:px-10">
        <h2 className="text-h3 tracking-[-0.02em] text-ink-strong">{name}</h2>
        <code className="w-fit border border-line bg-cell px-2 py-1 font-mono text-xs text-ember-400">{path}</code>
        <p className="max-w-sm text-sm leading-relaxed text-faint">{note}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-6 bg-bg px-6 py-8 md:px-10">{children}</div>
    </section>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: String(h).padStart(2, "0") }));
const MINUTES = Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: String(i * 5).padStart(2, "0") }));
const ROWS = Array.from({ length: 30 }, (_, i) => `Row ${String(i + 1).padStart(2, "0")} · scrolls inside its own panel`);

/**
 * The asset pack: every reusable building block of the site, live, with the
 * file it comes from. New screens are assembled from these (DESIGN.md §5),
 * so the whole site keeps one hand.
 */
export function StudioKit({ lang }: { lang: Locale }) {
  const user = useGuard(lang, true);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(30);
  const [on, setOn] = useState(true);
  const [plan, setPlan] = useState("pro");
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({ kind: "launch" });
  const [files, setFiles] = useState<DropFile[]>([]);
  const [word, setWord] = useState("Forge");

  if (!user) return <SkeletonRows label="Loading" />;
  return (
    <div>
      <Piece name="Buttons" path="ui/button.tsx" note="Primary, ember (the one call to action per screen), secondary and ghost; a loading state that keeps the width.">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="ember" arrow>Start a project</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" loading>Saving</Button>
          <Button variant="secondary" size="sm">Small</Button>
          <ButtonLink href={`/${lang}/work`} variant="secondary" arrow>Link</ButtonLink>
        </div>
      </Piece>

      <Piece name="Text fields" path="ui/field.tsx · ui/typed-text.tsx" note="Field owns the label, help and error. What is typed decodes in, glyph by glyph, in every Input and Textarea.">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Name" help="Type to see the decode.">{(a) => <Input id={a.id} aria-describedby={a.describedBy} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <Field label="With an error" error="This field is required.">{(a) => <Input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} />}</Field>
          <Field label="Message" className="sm:col-span-2">{(a) => <Textarea id={a.id} aria-describedby={a.describedBy} />}</Field>
        </div>
      </Piece>

      <Piece name="Select" path="ui/field.tsx (Select)" note="A select-only combobox: the list tears in and its options decode. Arrows, type-ahead, Escape.">
        <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="max-w-xs">
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="ultimate">Ultimate</option>
        </Select>
      </Piece>

      <Piece name="Calendar" path="ui/date-picker.tsx" note="The site's date field. Arrows by day and week, Page Up/Down by month; the title opens scroll wheels for month and year. Posts YYYY-MM-DD.">
        <div className="max-w-xs"><DatePicker lang={lang} value={date} onChange={setDate} min={new Date().toISOString().slice(0, 10)} /></div>
        <Hud tone="faint">value: {date || "(empty)"}</Hud>
      </Piece>

      <Piece name="Scroll wheels" path="ui/wheel-picker.tsx" note="A dial that snaps to the middle band, for any short list: times, months, quantities. Wheel, drag, touch or arrow keys.">
        <div className="grid max-w-56 grid-cols-2 gap-2 border border-line bg-raised p-3">
          <WheelPicker label="Hours" items={HOURS} value={hour} onChange={setHour} />
          <WheelPicker label="Minutes" items={MINUTES} value={minute} onChange={setMinute} />
        </div>
        <p className="font-mono text-2xl tabular-nums text-ink-strong"><DecodeText digits text={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`} /></p>
      </Piece>

      <Piece name="Scroll area" path="ui/scroll-area.tsx" note="Any panel that scrolls: the native bar is replaced by a hairline rail and a steel thumb that turns ember when dragged.">
        <ScrollArea className="max-w-md border border-line" viewportClassName="max-h-56">
          <ul className="divide-y divide-line">
            {ROWS.map((r) => <li key={r} className="px-4 py-3 text-sm text-muted">{r}</li>)}
          </ul>
        </ScrollArea>
      </Piece>

      <Piece name="Switch and choices" path="ui/toggle.tsx · ui/field.tsx (ChoiceChip) · start/brief-questions.tsx" note="On/off settings, tile choices with a description, and compact chips for quick answers.">
        <Toggle label="Accepting new projects" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceChip label="Keep this project confidential" description="Not shown in the portfolio." />
          <ChoiceChip type="radio" name="kit-radio" label="Something else" description="Quoted on request." />
        </div>
        <BriefQuestions lang={lang} answers={answers} onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
          questions={[
            { key: "kind", kind: "one", label: { en: "One choice", fr: "Un choix" }, options: [
              { value: "launch", label: { en: "Launch", fr: "Lancement" } }, { value: "ad", label: { en: "Ad", fr: "Pub" } }, { value: "demo", label: { en: "Demo", fr: "Démo" } },
            ] },
            { key: "where", kind: "many", label: { en: "Several choices", fr: "Plusieurs choix" }, options: [
              { value: "tiktok", label: { en: "TikTok", fr: "TikTok" } }, { value: "youtube", label: { en: "YouTube", fr: "YouTube" } }, { value: "site", label: { en: "Website", fr: "Site" } },
            ] },
          ]} />
      </Piece>

      <Piece name="Files" path="ui/field.tsx (FileDrop)" note="A drop well with one row per file; the caller owns uploads and progress.">
        <FileDrop id="kit-files" label="Drop files or browse" hint="Up to 25 MB each" files={files}
          onAdd={(added) => setFiles((f) => [...f, ...added.map((x) => ({ key: `${x.name}-${x.size}`, name: x.name, size: x.size, progress: 60 }))])}
          onRemove={(key) => setFiles((f) => f.filter((x) => x.key !== key))} />
      </Piece>

      <Piece name="Loading" path="ui/skeleton.tsx" note="Skeletons in the shape of what is coming, so nothing jumps when it arrives. The sheen stops for reduced motion.">
        <div className="flex flex-col gap-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
        <SkeletonRows label="Loading rows" rows={2} className="-mx-6 md:-mx-10" />
      </Piece>

      <Piece name="Labels and status" path="ui/hud.tsx · ui/status.tsx · motion/glitch.tsx" note="Mono HUD labels, lifecycle pills, and the glitch vocabulary: text that decodes, labels that glitch on change.">
        <div className="flex flex-wrap items-center gap-4">
          <Hud tone="ember" dot>Live</Hud>
          <Hud tone="muted">Muted label</Hud>
          <Hud tone="faint">Faint label</Hud>
          <StatusPill status="submitted" label="Submitted" />
          <StatusPill status="in_development" label="In development" />
          <StatusPill status="live" label="Live" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-h3 text-ink-strong"><GlitchLabel text={word} /></span>
          <Button variant="secondary" size="sm" onClick={() => setWord((w) => (w === "Forge" ? "Origin" : "Forge"))}>Change word</Button>
          <Button variant="ghost" size="sm" onClick={() => toast("Saved", { description: "Toasts come from sonner, styled in the layout." })}>Show a toast</Button>
        </div>
      </Piece>
    </div>
  );
}
