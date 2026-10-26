import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/dictionaries";
import type {
  CarePlan, CaseStudy, CaseStudySummary, Credential, FAQ, GalaxyItem, PricingFactor, Service, SiteSettings, Tech,
  Testimonial,
  PublicReview,
  ReviewSummary,
} from "./types";
import type { Rates } from "./currency";

// Public content, fetched from Django on the server and cached. Each read is
// tagged; Django POSTs the tags to /api/revalidate when an editor saves, so
// pages stay static and still update within seconds of a change.
const API = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:8000";

async function get<T>(path: string, lang?: Locale): Promise<T> {
  const url = new URL(`/api/content/${path}`, API);
  if (lang) url.searchParams.set("lang", lang);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) throw new NotFound(path);
  if (!res.ok) throw new Error(`Content API ${res.status} for ${url.pathname}`);
  return res.json() as Promise<T>;
}

export class NotFound extends Error {}

export async function getSite(lang: Locale) {
  "use cache";
  cacheLife("days");
  cacheTag("site");
  return get<SiteSettings>("site/", lang);
}

export async function getServices(lang: Locale) {
  "use cache";
  cacheLife("days");
  cacheTag("services");
  return get<Service[]>("services/", lang);
}

export async function getWork(lang: Locale) {
  "use cache";
  cacheLife("days");
  cacheTag("work");
  return get<CaseStudySummary[]>("work/", lang);
}

export async function getCaseStudy(lang: Locale, slug: string) {
  "use cache";
  cacheLife("days");
  cacheTag("work", `work:${slug}`);
  try {
    return await get<CaseStudy>(`work/${encodeURIComponent(slug)}/`, lang);
  } catch (err) {
    if (err instanceof NotFound) return null;
    throw err;
  }
}

export async function getGalaxy() {
  "use cache";
  cacheLife("days");
  cacheTag("galaxy");
  return get<GalaxyItem[]>("galaxy/");
}

export async function getTech() {
  "use cache";
  cacheLife("days");
  cacheTag("tech");
  return get<Tech[]>("tech/");
}

export async function getCredentials() {
  "use cache";
  cacheLife("days");
  cacheTag("credentials");
  return get<Credential[]>("credentials/");
}

export async function getTestimonials(lang: Locale) {
  "use cache";
  cacheLife("days");
  cacheTag("testimonials");
  return get<Testimonial[]>("testimonials/", lang);
}

export async function getFaqs(lang: Locale) {
  "use cache";
  cacheLife("days");
  cacheTag("faqs");
  return get<FAQ[]>("faqs/", lang);
}

/** Published, verified reviews and their average (refreshed when one is approved). */
export async function getReviews(): Promise<{ summary: ReviewSummary; items: PublicReview[] }> {
  "use cache";
  cacheLife("days");
  cacheTag("reviews");
  const res = await fetch(new URL("/api/reviews/", API), { headers: { Accept: "application/json" } });
  if (!res.ok) return { summary: { count: 0, average: null, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } }, items: [] };
  return res.json();
}

/** Street DZD rates (backend/fx); refreshed every 30 min, Django pings the tag. */
export async function getRates(): Promise<Rates> {
  "use cache";
  cacheLife("hours");
  cacheTag("rates");
  const res = await fetch(new URL("/api/rates/", API), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Rates API ${res.status}`);
  return res.json() as Promise<Rates>;
}

export async function getPlans(lang: Locale) {
  "use cache";
  cacheLife("days");
  cacheTag("plans");
  return get<CarePlan[]>("plans/", lang);
}

/** Calculator factors for one service ("" = the shared ones). */
export async function getPricing(lang: Locale, service: string) {
  "use cache";
  cacheLife("days");
  cacheTag("pricing");
  return get<PricingFactor[]>(`pricing/?service=${encodeURIComponent(service)}`, lang);
}
