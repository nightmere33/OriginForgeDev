"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DecodeText } from "@/motion/glitch";
import { Button } from "./button";

/**
 * A handle with no public link (a Discord username): tapping copies it and
 * the label decodes to "Copied", then back. `look="link"` matches the
 * footer's plain links; otherwise a small secondary button.
 */
export function CopyHandle({ value, label, copiedLabel, icon, look = "button" }: {
  value: string;
  label: string;
  copiedLabel: string;
  icon?: ReactNode;
  look?: "button" | "link";
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => setCopied(true), () => undefined);
  };
  const text = copied ? copiedLabel : label;
  // The live region announces the copy; the visible label carries the effect.
  const status = <span role="status" className="sr-only">{copied ? copiedLabel : ""}</span>;

  if (look === "link") {
    return (
      <button type="button" onClick={copy} title={value} className="inline-flex items-center gap-2.5 text-left text-muted transition-colors hover:text-ink">
        {icon}
        <DecodeText text={text} />
        {status}
      </button>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy} title={value}>
      {icon}
      <DecodeText text={text} />
      {status}
    </Button>
  );
}
