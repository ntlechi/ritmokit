import { notFound } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

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
      <div className="premium-shell flex min-h-screen items-center justify-center bg-background px-4 pb-safe pt-safe">
        <div className={cn(dna.panelLg, "w-full max-w-md p-6 sm:p-8")}>
          <LoginForm lang={lang} dict={dict} next={next} initialError={error} />
        </div>
      </div>
    </ThemeProvider>
  );
}
