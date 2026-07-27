import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PayrollPeriodDetail } from "@/components/manager/payroll-period-detail";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getPayPeriodDetailForManager } from "@/lib/data/payroll";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function PayPeriodDetailPage({
  params,
}: {
  params: Promise<{ lang: string; payPeriodId: string }>;
}) {
  const { lang, payPeriodId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.common.loading}</div>;
  }
  if (!canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/settings`);
  }

  const { data: result, dbError } = await safeQuery(
    () => getPayPeriodDetailForManager({ userId: user.id, userRole: user.role, payPeriodId }),
    null,
  );

  if (dbError || !result || !result.ok) {
    const errorLabel =
      result && !result.ok
        ? (dict.manager.payroll.errors as Record<string, string>)[result.error] ??
          dict.manager.payroll.errors.databaseError
        : dict.manager.payroll.errors.databaseError;

    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{errorLabel}</p>
        <Link href={`/${lang}/settings/manager/payroll`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.manager.payroll.backToList}
        </Link>
      </div>
    );
  }

  return <PayrollPeriodDetail lang={lang} dict={dict} detail={result.detail} />;
}
