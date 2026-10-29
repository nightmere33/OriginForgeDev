import { cn } from "@/lib/cn";

// Written out whole so Tailwind sees every class: [hide, span 1, span 2].
const SPANS = {
  "sm:2": ["sm:hidden", "sm:block sm:col-span-1"],
  "md:2": ["md:hidden", "md:block md:col-span-1"],
  "lg:3": ["lg:hidden", "lg:block lg:col-span-1", "lg:block lg:col-span-2"],
  "xl:3": ["xl:hidden", "xl:block xl:col-span-1", "xl:block xl:col-span-2"],
} as const;

/**
 * Hairline grids draw their rules as a 1px gap over a line-coloured
 * background, so a short last row shows that colour as a grey block. This
 * fills the rest of the row with the page background at each breakpoint.
 * Place it after the last item; `cols` lists the grid's columns per breakpoint.
 */
export function GridFill({ count, cols, as: Tag = "li" }: { count: number; cols: (keyof typeof SPANS)[]; as?: "li" | "div" }) {
  const classes = cols.map((c) => {
    const n = Number(c.split(":")[1]);
    return SPANS[c][(n - (count % n)) % n];
  });
  return <Tag aria-hidden className={cn("hidden bg-bg", classes)} />;
}
