import { notFound } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { MessagesSidebar } from "@/components/messages/messages-sidebar";
import { getSessionUser } from "@/lib/auth/session";
import { getMessagingHomeForUser } from "@/lib/data/chat";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.common.loading}</div>;
  }

  const { data: messaging, dbError } = await safeQuery(
    () => getMessagingHomeForUser(user.id),
    null,
  );

  if (dbError) {
    return (
      <div className="p-4 sm:p-6">
        <DbErrorBanner label={dict.common.dbDisconnected} />
      </div>
    );
  }

  if (!messaging) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.messages.emptyChannels}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <MessagesSidebar
        lang={lang}
        dict={dict}
        channels={messaging.channels}
        conversations={messaging.conversations}
        peers={messaging.peers}
        className="w-full lg:hidden"
      />

      <div className="hidden h-full flex-1 items-center justify-center lg:flex">
        <p className="rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center text-sm text-foreground-muted">
          {dict.messages.emptyThread}
        </p>
      </div>
    </div>
  );
}
