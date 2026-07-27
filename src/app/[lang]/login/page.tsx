import { notFound } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [{ next, error }, dict] = await Promise.all([searchParams, getDictionary(lang)]);

  return (
    <ThemeProvider>
      <div className="premium-shell flex min-h-screen items-center justify-center bg-zinc-50 px-4 pb-safe pt-safe dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-xs dark:border-white/10 dark:bg-zinc-900 sm:p-8">
          <LoginForm lang={lang} dict={dict} next={next} initialError={error} />
        </div>
      </div>
    </ThemeProvider>
  );
}
