export type Currency = "DZD" | "EUR" | "USD";

export type SiteSettings = {
  is_available: boolean; // effective: the switch and the active-project cap
  at_capacity: boolean;
  available_from: string | null;
  availability: string;
  location: string;
  about: string[];
  email: string;
  phone: string;
  whatsapp: string;
  github_url: string;
  linkedin_url: string;
  x_url: string;
  instagram_url: string;
  upwork_url: string;
  discord_username: string;
  portrait: string | null;
  cv_file: string | null;
  showreel: string | null;
  showreel_av1: string | null;
  showreel_poster: string | null;
  showreel_width: number;
  showreel_height: number;
  years_experience: number;
  projects_shipped: number;
  reply_hours: number;
};

export type Service = {
  slug: string;
  icon: string;
  title: string;
  summary: string;
  description: string;
  timeline: string;
  deliverables: string[];
  prices: { currency: Currency; amount: number; kind: PriceKind }[];
};

export type PriceKind = "from" | "fixed" | "monthly" | "hourly" | "per_minute";

export type Category = "platform" | "web" | "mobile" | "automation" | "motion" | "game" | "desktop" | "iot";

export type CaseStudySummary = {
  slug: string;
  title: string;
  client_name: string;
  year: number | null;
  category: Category;
  accent: string;
  featured: boolean;
  tagline: string;
  summary: string;
  stack: string[];
  cover_image: string | null;
  cover_video: string | null;
  cover_video_webm: string | null;
  cover_video_av1: string | null;
  cover_width: number;
  cover_height: number;
  /** Wordmark for dark backgrounds, and the square mark. */
  logo: string | null;
  logo_mark: string | null;
};

export type Media = {
  id: number;
  kind: "image" | "video";
  file: string;
  file_webm: string | null;
  file_av1: string | null;
  poster: string | null;
  width: number;
  height: number;
  caption: string;
};

export type CaseStudy = CaseStudySummary & {
  role: string;
  challenge: string;
  approach: string;
  outcome: string;
  metrics: { value: string; label: string }[];
  live_url: string;
  repo_url: string;
  store_url: string;
  updated_at: string;
  /** The full film with sound, behind "Watch the film". */
  film: string | null;
  film_av1: string | null;
  film_poster: string | null;
  film_width: number;
  film_height: number;
  film_duration: number;
  media: Media[];
};

export type GalaxyItem = {
  id: number;
  slug: string;
  title: string;
  accent: string;
  /** Clips loop; photos (Alquilar, MediGate features) stay as stills. */
  kind: "video" | "image";
  file: string;
  file_webm: string | null;
  file_av1: string | null;
  poster: string;
  width: number;
  height: number;
};

export type Tech = { name: string; category: string };
export type Credential = { title: string; issuer: string; issued_on: string | null; credential_id: string; url: string };
export type Testimonial = { id: number; author: string; role: string; quote: string; case_study: string | null };
export type FAQ = { id: number; question: string; answer: string };

export type CarePlan = {
  code: string;
  name: string;
  tagline: string;
  highlighted: boolean;
  surcharge_percent: number;
  maintenance_days: number;
  reply_hours: number;
  revision_rounds: number;
  small_updates: number | null; // null = unlimited
  advice: boolean;
  monthly_call: boolean;
  monitoring: boolean;
};

export type PricingChoice = {
  key: string;
  label: string;
  is_default: boolean;
  multiplier: string;
  addon_dzd: number;
  addon_eur: number;
  addon_usd: number;
};

export type PricingFactor = { key: string; label: string; help: string; choices: PricingChoice[] };

export type Estimate = {
  currency: Currency;
  low: number;
  high: number;
  choices: Record<string, string>;
  plan: string | null;
  /** No price set in this currency: converted from DZD at the live street rate. */
  converted?: boolean;
};

export type PublicReview = {
  id: number;
  rating: number;
  body: string;
  display_name: string;
  display_role: string;
  project_label: string;
  reply: string;
  language: string;
  published_at: string | null;
  featured: boolean;
  /** The portfolio project it is about (logo, page), when there is one. */
  project: { slug: string; title: string; accent: string; logo: string | null; mark: string | null } | null;
};

export type ReviewSummary = { count: number; average: number | null; distribution: Record<"5" | "4" | "3" | "2" | "1", number> };
