import { ViewTransition, type ReactNode } from "react";

/**
 * Page changes as one gesture (View Transitions, React's <ViewTransition>):
 * the page you leave lifts and dims away, the next one rises in from a soft
 * blur (globals.css, page-out / page-in).
 *
 * Used as the `template.tsx` of every level that holds several pages, since
 * a template remounts when its child segment changes: only a real navigation
 * animates, never a Suspense reveal or an in-page update, and the static
 * shell still prerenders (no pathname hook). The nav is outside and never
 * moves. Browsers without view transitions simply switch pages.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
