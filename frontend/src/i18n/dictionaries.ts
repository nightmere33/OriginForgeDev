import "server-only";
import type en from "./en.json";

export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export type Dictionary = typeof en;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./en.json").then((m) => m.default),
  fr: () => import("./fr.json").then((m) => m.default),
};

export const hasLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value);

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}

export { fill } from "./fill";
