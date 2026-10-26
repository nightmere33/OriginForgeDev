import { notFound } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Hud, Accented } from "@/components/ui/hud";
import { SectionShell, SectionEyebrow, SectionHeading } from "@/components/ui/section-shell";
import Marquee from "@/components/ui/marquee";
import { Accordion } from "@/components/ui/accordion";
import { StatusPill } from "@/components/ui/status";
import LoopVideo from "@/components/media/loop-video";
import ReelPlate from "@/components/media/reel-plate";
import { getGalaxy } from "@/lib/content";
import RevealManager from "@/motion/reveal-manager";
import FieldShowcase from "./field-showcase";

// Primitive Showcase Gate (DESIGN.md §5): every primitive and state on one
// page, QA'd at 375 / 768 / 1280 before any product screen is composed.
export default async function Showcase() {
  if (process.env.NODE_ENV !== "development") notFound();
  const clip = (await getGalaxy())[0];

  return (
    <>
      <SectionShell id="buttons" ruler="Buttons">
        <SectionEyebrow index="P1" label="Buttons" annotation="primary · ember · secondary · ghost" />
        <div className="flex flex-wrap items-center gap-4 p-6 md:p-10">
          <ButtonLink href="/en/start" variant="ember" arrow>Start a project</ButtonLink>
          <ButtonLink href="/en/work" variant="primary">See the work</ButtonLink>
          <ButtonLink href="/en/work" variant="secondary">Secondary</ButtonLink>
          <ButtonLink href="/en/work" variant="ghost">Ghost</ButtonLink>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="ember" loading>Submitting</Button>
          <Button variant="secondary" disabled>Disabled</Button>
        </div>
      </SectionShell>

      <SectionShell id="type" ruler="Type">
        <SectionEyebrow index="P2" label="Typography & HUD" />
        <SectionHeading title={<Accented parts={["Products people ", "actually", " use."]} />} lead="Body/lg lead in muted steel. One serif accent phrase per headline." />
        <div className="flex flex-wrap gap-6 px-6 pb-10 md:px-10">
          <Hud tone="ink">Ink label</Hud>
          <Hud tone="muted">Muted label</Hud>
          <Hud tone="faint">Faint label</Hud>
          <Hud tone="ember">Ember label</Hud>
          <Hud tone="muted" dot live>Booking new projects</Hud>
        </div>
        <p className="px-6 pb-10 font-display text-wordmark uppercase tracking-[-0.02em] [font-stretch:125%] [font-weight:760] md:px-10">
          <span className="steel-text">Originforge</span>
        </p>
      </SectionShell>

      <Marquee items={["Django", "Next.js", "Flutter", "Chargily Pay", "PostgreSQL", "three.js"]} />

      <SectionShell id="cells" ruler="Cells">
        <SectionEyebrow index="P3" label="Cells & media" annotation="hover the left cell" />
        <div className="grid grid-flow-dense gap-px bg-line md:grid-cols-2">
          <a href="#cells" className="group/cell flex flex-col bg-bg focus-visible:outline-offset-[-2px]">
            <div className="flex items-center justify-between border-b border-line px-6 py-2.5 md:px-8">
              <Hud tone="muted" className="transition-colors group-hover/cell:text-ink">Platform</Hud>
              <Hud tone="faint">01</Hud>
            </div>
            <div className="aspect-[16/10] overflow-hidden">
              <ReelPlate accent={clip.accent}>
                <LoopVideo src={clip.file} poster={clip.poster} width={clip.width} height={clip.height} />
              </ReelPlate>
            </div>
            <div className="p-6 md:p-8">
              <h3 className="text-h3 tracking-[-0.02em] text-ink-strong">{clip.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">A cell is a link only when it leads somewhere.</p>
            </div>
          </a>
          <div className="flex flex-col bg-bg">
            <div className="flex items-center justify-between border-b border-line px-6 py-2.5 md:px-8">
              <Hud tone="muted">Status pills</Hud>
              <Hud tone="faint">02</Hud>
            </div>
            <div className="flex flex-wrap gap-3 p-6 md:p-8">
              {["submitted", "in_review", "clarification", "proposal_sent", "accepted", "declined", "withdrawn"].map((s) => (
                <StatusPill key={s} status={s} label={s.replace("_", " ")} />
              ))}
            </div>
            <div className="relative h-24 border-t border-line">
              <span className="tick left-4 top-4" />
              <span className="tick right-4 top-4" />
              <span className="tick tick-half bottom-4 left-1/2" />
            </div>
          </div>
        </div>
      </SectionShell>

      <SectionShell id="fields" ruler="Fields">
        <SectionEyebrow index="P4" label="Fields" annotation="default · focus · error · disabled · chips · files" />
        <FieldShowcase />
      </SectionShell>

      <SectionShell id="accordion" ruler="Accordion">
        <SectionEyebrow index="P5" label="Accordion" />
        <Accordion
          items={[
            { id: 1, question: "How do payments work?", answer: "A deposit before development and the balance at delivery." },
            { id: 2, question: "A very long question that needs to wrap onto a second line on small screens to prove the layout holds?", answer: "It holds." },
          ]}
        />
      </SectionShell>
      <RevealManager />
    </>
  );
}
