import { notFound } from "next/navigation";
import { HelpCenter } from "@/components/help/help-center";
import { getSessionUser } from "@/lib/auth/session";
import { getHelpContext, type HelpContext } from "@/lib/data/help-support";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function HelpPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  const role = user?.role ?? "EMPLOYEE";

  // L'aide reste consultable même si la base est indisponible — c'est justement
  // le moment où le personnel en a besoin.
  const empty: HelpContext = { locationName: null, supportContact: null };
  const context = user ? (await safeQuery(() => getHelpContext(user.id), empty)).data : empty;

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <HelpCenter
        dict={dict}
        lang={lang}
        role={role}
        locationName={context.locationName}
        supportContact={context.supportContact}
      />
    </div>
  );
}
