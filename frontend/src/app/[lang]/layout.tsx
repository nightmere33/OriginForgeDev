import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale, locales } from "@/i18n/dictionaries";
import MotionProvider from "@/motion/motion-provider";
import IntroConductor from "@/motion/intro-conductor";
import ScrollRuler from "@/motion/scroll-ruler";
import { Suspense } from "react";
import SiteNav from "@/components/chrome/site-nav";
import NavFallback from "@/components/chrome/nav-fallback";
import SiteFooter from "@/components/chrome/site-footer";
import DevTools from "@/components/chrome/dev-tools";
import { getRates } from "@/lib/content";
import { CurrencyProvider } from "@/lib/currency";
import { THEME_FLAG } from "@/lib/theme-flag";
import { LiveConnection } from "@/lib/live";
import { CookieNotice } from "@/components/chrome/cookie-notice";
import { Toaster } from "sonner";
import { QuietBoundary } from "@/components/ui/quiet-boundary";
import "../globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const instrument = Instrument_Serif({
  subsets: ["latin"], weight: "400", style: ["italic"], variable: "--font-instrument", display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function generateStaticParams() {
  return locales.map((l) => ({ lang: l }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await lang();
  if (!hasLocale(locale)) return {};
  const t = await getDictionary(locale);
  // The link preview (Discord, WhatsApp, LinkedIn, forums, X): a 1200x630 banner
  // per language, made from the site itself (public/og, see DESIGN.md §5).
  const banner = { url: `/og/originforge-${locale}.jpg`, width: 1200, height: 630, alt: t.meta.ogAlt, type: "image/jpeg" };
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.meta.title, template: "%s · OriginForge" },
    description: t.meta.description,
    applicationName: "OriginForge",
    authors: [{ name: "Younes Ouali", url: SITE_URL }],
    creator: "Younes Ouali",
    keywords: t.meta.keywords,
    alternates: { canonical: `/${locale}`, languages: { en: "/en", fr: "/fr", "x-default": "/en" } },
    openGraph: {
      type: "website", siteName: "OriginForge", locale: locale === "fr" ? "fr_FR" : "en_US",
      alternateLocale: locale === "fr" ? ["en_US"] : ["fr_FR"],
      url: `/${locale}`, title: t.meta.title, description: t.meta.description, images: [banner],
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description, images: [banner] },
  };
}

export const viewport: Viewport = {
  themeColor: "#0c0c0d",
  colorScheme: "dark",
};

// Runs before first paint: motion-capable visitors start with the hero
// letters hidden so the intro can form them. CSS clears the flag after 4s on
// its own, so a failed script can never leave the wordmark invisible.
const INTRO_FLAG = `try{if(/^\\/(en|fr)\\/?$/.test(location.pathname)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.dataset.intro='1'}}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await lang();
  if (!hasLocale(locale)) notFound();
  const t = await getDictionary(locale);
  // Live street rates for price conversion; the site still renders without them.
  const rates = await getRates().catch(() => null);

  return (
    <html
      lang={locale}
      className={`${archivo.variable} ${geist.variable} ${geistMono.variable} ${instrument.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_FLAG + INTRO_FLAG }} />
      </head>
      <body className="grain min-h-dvh">
        <a
          href="#main"
          className="hud sr-only z-[70] bg-ember-500 px-4 py-3 text-on-ember focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {t.nav.skip}
        </a>
        {/* Enhancements fail on their own (an old browser, a weak GPU); the page stays. */}
        <QuietBoundary><LiveConnection /></QuietBoundary>
        <QuietBoundary><CookieNotice lang={locale} labels={t.cookies} /></QuietBoundary>
        <Toaster
          position="bottom-right"
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 border border-line bg-raised p-4 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.8)]",
              title: "text-sm text-ink-strong",
              description: "mt-1 text-sm text-muted",
              actionButton: "hud ml-auto shrink-0 border border-line-strong px-3 py-1.5 text-ink hover:border-ember-400",
            },
          }}
        />
        <CurrencyProvider rates={rates}>
        <MotionProvider>
          <QuietBoundary><IntroConductor /></QuietBoundary>
          <Suspense fallback={<NavFallback lang={locale} t={t.nav} />}>
            <SiteNav lang={locale} t={t.nav} />
          </Suspense>
          <main id="main" className="relative">
            {children}
          </main>
          <SiteFooter lang={locale} t={t} />
          <QuietBoundary><Suspense fallback={null}><ScrollRuler /></Suspense></QuietBoundary>
        </MotionProvider>
        </CurrencyProvider>
        <DevTools />
      </body>
    </html>
  );
}
