"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps an enhancement's failure local. If what is inside throws (an old GPU,
 * a browser without some feature), it renders `fallback`, nothing by default,
 * and the server-rendered page around it stands. Without one, the error climbs
 * to the root and Next swaps the whole page for its error screen.
 */
export class QuietBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[originforge] enhancement switched off:", error);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
