"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden className="size-3.5" />
      {label}
    </Button>
  );
}
