import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n/dictionaries";
import AuthShell from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return { title: t.auth.loginTitle.join(""), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getDictionary(lang);
  return (
    <AuthShell lang={lang} shell={t.auth.shell} mode="login" title={t.auth.loginTitle} lead={t.auth.loginLead}>
      <LoginForm lang={lang} t={{ auth: t.auth, common: t.common }} />
    </AuthShell>
  );
}
