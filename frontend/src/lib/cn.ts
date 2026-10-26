import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the DESIGN.md type scale; otherwise `text-hud` reads as
// a colour and is dropped when merged with `text-steel-950`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["hud", "h1", "h2", "h3", "mega", "wordmark"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
