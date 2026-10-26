import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import AuthShell from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/auth-forms";

export async function generateMetadata({ params }: PageProps<"/[lang]/reset">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.auth.resetTitle.join(""), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[lang]/reset">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AuthShell lang={lang} shell={t.auth.shell} mode="reset" title={t.auth.resetTitle} lead={t.auth.resetLead}>
      <ResetForm lang={lang} t={{ auth: t.auth, common: t.common }} />
    </AuthShell>
  );
}
