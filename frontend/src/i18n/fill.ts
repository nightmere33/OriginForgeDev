/** "Replies within {hours} h" → "Replies within 24 h" (safe on server and client). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
