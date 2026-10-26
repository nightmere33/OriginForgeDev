import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import AuthShell from "@/components/auth/auth-shell";
import { VerifyEmail } from "@/components/auth/auth-forms";

export async function generateMetadata({ params }: PageProps<"/[lang]/verify-email">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.auth.verifyTitle.join(""), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[lang]/verify-email">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AuthShell lang={lang} shell={t.auth.shell} mode="verify" title={t.auth.verifyTitle}>
      <VerifyEmail lang={lang} t={{ auth: t.auth, common: t.common }} />
    </AuthShell>
  );
}
