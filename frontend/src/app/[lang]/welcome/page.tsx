import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import AuthShell from "@/components/auth/auth-shell";
import { Onboarding } from "@/components/auth/onboarding";

export async function generateMetadata({ params }: PageProps<"/[lang]/welcome">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.onboarding.title.join(""), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[lang]/welcome">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AuthShell lang={lang} shell={t.auth.shell} mode="welcome" title={t.onboarding.title} lead={t.onboarding.lead}>
      <Onboarding lang={lang} t={{ onboarding: t.onboarding, common: t.common, phoneInput: t.phoneInput }} />
    </AuthShell>
  );
}
