"use client";

import { useState } from "react";
import { ChoiceChip, Field, FileDrop, Input, Select, Textarea, type DropFile } from "@/components/ui/field";

export default function FieldShowcase() {
  const [files, setFiles] = useState<DropFile[]>([
    { key: "a", name: "brand-guidelines-final-v3-really-final.pdf", size: 2_400_000, progress: 62 },
    { key: "b", name: "screens.zip", size: 18_200_000, error: "Too large" },
  ]);
  return (
    <div className="grid gap-8 p-6 md:grid-cols-2 md:p-10">
      <Field label="Project title" help="A few words is enough.">
        {(a) => <Input id={a.id} aria-describedby={a.describedBy} placeholder="Booking site for my guesthouse" />}
      </Field>
      <Field label="E-mail" error="Enter a valid e-mail address.">
        {(a) => <Input id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid} defaultValue="younes@" />}
      </Field>
      <Field label="Currency">
        {(a) => (
          <Select id={a.id} defaultValue="DZD">
            <option value="DZD">DZD</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </Select>
        )}
      </Field>
      <Field label="Disabled">
        {(a) => <Input id={a.id} disabled defaultValue="Read only" />}
      </Field>
      <Field label="Goals" className="md:col-span-2">
        {(a) => <Textarea id={a.id} placeholder="What must the project achieve?" />}
      </Field>
      <fieldset className="grid gap-3 sm:grid-cols-2 md:col-span-2">
        <legend className="hud mb-3 text-muted">Features</legend>
        <ChoiceChip label="Online payments" description="Chargily, CCP, PayPal" defaultChecked />
        <ChoiceChip label="Admin back-office" />
        <ChoiceChip label="Multilingual" description="EN · FR · AR" />
        <ChoiceChip label="Disabled option" disabled />
      </fieldset>
      <div className="md:col-span-2">
        <FileDrop
          id="files"
          label="Drop files or browse"
          hint="PDF, images, docs, zip. Up to 25 MB each"
          files={files}
          onAdd={(added) => setFiles((f) => [...f, ...added.map((x) => ({ key: x.name + x.size, name: x.name, size: x.size }))])}
          onRemove={(key) => setFiles((f) => f.filter((x) => x.key !== key))}
        />
      </div>
    </div>
  );
}
