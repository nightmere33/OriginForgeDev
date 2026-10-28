"use client";

import { Children, isValidElement, useEffect, useId, useImperativeHandle, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, FileText, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { DecodeText, SPLIT, tearIn, useDecode, useDismiss } from "@/motion/glitch";
import { FLOAT, useFloat } from "./float";
import { QuietBoundary } from "./quiet-boundary";
import { TEXT_TYPES, TYPED_FIELD, TypedMirror, useTypingFx } from "./typed-text";

/** DESIGN.md §5 Field set: one wrapper owns label, help, error and their ids. */
export function Field({
  label, help, error, children, className,
}: {
  label: string;
  help?: string;
  error?: string;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="hud text-muted">
        {label}
      </label>
      {children({ id, describedBy: [errorId, helpId].filter(Boolean).join(" ") || undefined, invalid: !!error })}
      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-2 text-sm text-err">
          <span aria-hidden className="size-1.5 shrink-0 bg-err" />
          {error}
        </p>
      ) : (
        help && (
          <p id={helpId} className="text-sm text-faint">
            {help}
          </p>
        )
      )}
    </div>
  );
}

const control =
  "w-full rounded-none border border-line bg-cell px-4 text-ink placeholder:text-faint " +
  "transition-[border-color,box-shadow] duration-[var(--dur-micro)] hover:border-line-strong " +
  "focus:border-ember-400 focus:shadow-[inset_0_0_0_1px_var(--ember-400)] focus:outline-none " +
  "aria-[invalid=true]:border-err disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Text fields. What is typed decodes in (ui/typed-text.tsx): the wrapper is
 * always there, so the field never remounts when the effect switches on.
 */
export function Input({ className, ref, type, ...props }: ComponentProps<"input">) {
  const fx = useTypingFx() && TEXT_TYPES.has(type ?? "text");
  const own = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => own.current as HTMLInputElement, []);
  return (
    <span className="relative block">
      <input ref={own} type={type} className={cn(control, "h-12", fx && TYPED_FIELD, className)} {...props} />
      {fx && <QuietBoundary><TypedMirror field={own} masked={type === "password"} value={props.value} /></QuietBoundary>}
    </span>
  );
}

/** `bare`: no frame of its own (a composer that lives inside another frame). */
export function Textarea({ className, ref, bare, ...props }: ComponentProps<"textarea"> & { bare?: boolean }) {
  const fx = useTypingFx();
  const own = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => own.current as HTMLTextAreaElement, []);
  return (
    <span className="relative block">
      <textarea ref={own} className={cn(!bare && control, !bare && "min-h-32 resize-y py-3 leading-relaxed", fx && TYPED_FIELD, className)} {...props} />
      {fx && <QuietBoundary><TypedMirror field={own} masked={false} multiline value={props.value} /></QuietBoundary>}
    </span>
  );
}

type Opt = { value: string; label: string; disabled: boolean };
const textOf = (node: ReactNode) =>
  Children.toArray(node).map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : "")).join("");

/** The `<option>` children, read as data (call sites keep writing options). */
function optionsOf(children: ReactNode): Opt[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<ComponentProps<"option">>(child) || child.type !== "option") return [];
    const label = textOf(child.props.children);
    return [{ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled }];
  });
}

function SelectOption({ id, opt, selected, active, onPick, onHover }: {
  id: string; opt: Opt; selected: boolean; active: boolean; onPick: () => void; onHover: () => void;
}) {
  const { shown, glitching, run } = useDecode(opt.label);
  // Decode in as the list opens, and again where the keyboard or pointer lands.
  useEffect(() => run(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active) run();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <li id={id} role="option" aria-selected={selected} aria-disabled={opt.disabled || undefined}
      onPointerDown={(e) => e.preventDefault()} onPointerMove={onHover} onClick={opt.disabled ? undefined : onPick}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-sm",
        active && "bg-cell",
        selected ? "text-ink-strong" : active ? "text-ink" : "text-muted",
        opt.disabled && "cursor-not-allowed opacity-50",
      )}>
      <span className="truncate" style={glitching ? SPLIT : undefined}>{shown}</span>
      {selected && <Check aria-hidden className="size-3.5 shrink-0 text-ember-400" />}
    </li>
  );
}

type SelectProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Select-only combobox (WAI-ARIA APG) in place of the native select, so the
 * list can glitch in like the nav menus: it tears in and its options decode.
 * Same props as a select; `name` posts the value through a hidden input.
 * Keys: arrows, Home/End, Enter/Space, Escape, Tab, and type-ahead.
 */
export function Select({ id, name, value, defaultValue, onChange, disabled, className, children, ...aria }: SelectProps) {
  const options = optionsOf(children);
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const selected = Math.max(0, options.findIndex((o) => o.value === current));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  useDismiss(open, root, setOpen);
  const panel = useFloat<HTMLUListElement>(open, button, { match: true, max: 288 });
  useEffect(() => {
    if (open) tearIn(panel.current);
  }, [open, panel]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const show = (i: number) => {
    setActive(i);
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    setOpen(false);
    button.current?.focus();
    if (o.value === current) return;
    if (value === undefined) setInner(o.value);
    onChange?.({ target: { value: o.value, name } });
  };
  // Next enabled option from `from` in direction `dir`, or `from` at the ends.
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        if (!open) return show(selected);
        if (e.altKey) return e.key === "ArrowUp" ? pick(active) : undefined;
        return setActive(step(active, e.key === "ArrowDown" ? 1 : -1));
      case "Home":
      case "End":
        e.preventDefault();
        return show(e.key === "Home" ? step(-1, 1) : step(options.length, -1));
      case "Enter":
      case " ":
        e.preventDefault();
        return open ? pick(active) : show(selected);
      case "Escape":
        if (open) e.preventDefault();
        return setOpen(false);
      case "Tab":
        return setOpen(false);
    }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    // Type-ahead: letters typed within 600ms build one query.
    const t = typed.current;
    t.text = e.timeStamp - t.at > 600 ? e.key : t.text + e.key;
    t.at = e.timeStamp;
    const q = t.text.toLowerCase();
    const from = open ? active : selected;
    const order = [...options.keys()].map((k) => (from + (q.length === 1 ? 1 : 0) + k) % options.length);
    const hit = order.find((k) => !options[k].disabled && options[k].label.toLowerCase().startsWith(q));
    if (hit !== undefined) show(hit);
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show(selected))}
        onKeyDown={onKeyDown}
        className={cn(control, "flex h-12 items-center justify-between gap-3 text-left", open && "border-ember-400 shadow-[inset_0_0_0_1px_var(--ember-400)]")}
      >
        <DecodeText text={options[selected]?.label ?? ""} className="truncate" />
        <ChevronDown aria-hidden className={cn("size-3.5 shrink-0 text-muted transition-transform duration-[var(--dur-micro)]", open && "rotate-180")} />
      </button>
      {open && (
        <ul ref={panel} id={listId} role="listbox" aria-labelledby={id} tabIndex={-1} popover="manual" data-lenis-prevent
          className={cn(FLOAT, "overflow-y-auto overscroll-contain border border-line bg-raised py-1 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)]")}>
          {options.map((o, i) => (
            <SelectOption key={o.value} id={`${listId}-${i}`} opt={o} selected={i === selected} active={i === active}
              onPick={() => pick(i)} onHover={() => !o.disabled && setActive(i)} />
          ))}
        </ul>
      )}
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );
}

/** Checkbox or radio drawn as a hairline tile. */
export function ChoiceChip({
  label, description, type = "checkbox", className, ...props
}: { label: string; description?: string } & ComponentProps<"input">) {
  return (
    <label
      className={cn(
        "group/chip relative flex cursor-pointer items-start gap-3 border border-line bg-cell p-4 transition-colors duration-[var(--dur-micro)]",
        "hover:border-line-strong has-[:checked]:border-ember-400 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ember-400",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        className,
      )}
    >
      <input type={type} className="peer sr-only" {...props} />
      <span
        aria-hidden
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center border border-line-strong text-on-ember transition-colors peer-checked:border-ember-400 peer-checked:bg-ember-400 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-ink group-has-[:checked]/chip:text-ink-strong">{label}</span>
        {description && <span className="text-sm text-faint">{description}</span>}
      </span>
    </label>
  );
}

export type DropFile = { key: string; name: string; size: number; progress?: number; error?: string };

/** File picker well with one row per file (upload state is owned by the caller). */
export function FileDrop({
  id, label, hint, files, onAdd, onRemove, accept, disabled,
}: {
  id: string;
  label: string;
  hint: string;
  files: DropFile[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  accept?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) onAdd(Array.from(e.dataTransfer.files));
        }}
        className="flex cursor-pointer flex-col items-center gap-2 border border-dashed border-line-strong bg-cell px-6 py-8 text-center transition-colors hover:border-ember-400 has-[:focus-visible]:border-ember-400"
      >
        <UploadCloud aria-hidden className="size-5 text-ember-400" />
        <span className="text-ink">{label}</span>
        <span className="text-sm text-faint">{hint}</span>
        <input
          id={id}
          type="file"
          multiple
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="divide-y divide-line border border-line">
          {files.map((f) => (
            <li key={f.key} className="relative flex items-center gap-3 px-4 py-3">
              <FileText aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
              <span className="hud text-faint">{formatBytes(f.size)}</span>
              {f.error && <span className="text-sm text-err">{f.error}</span>}
              <button type="button" onClick={() => onRemove(f.key)} aria-label={`Remove ${f.name}`} className="p-1 text-faint hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
              {f.progress !== undefined && f.progress < 100 && (
                <span aria-hidden className="absolute bottom-0 left-0 h-px bg-ember-400 transition-[width]" style={{ width: `${f.progress}%` }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
