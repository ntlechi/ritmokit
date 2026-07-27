import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { MessagesSidebar } from "@/components/messages/messages-sidebar";
import { getSessionUser } from "@/lib/auth/session";
import { getMessagingHomeForUser } from "@/lib/data/chat";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function MessagesLayout({
  children,
  params,
}: {
  children: ReactNode;
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
    <div className="flex min-h-0 flex-1">
      <MessagesSidebar
        lang={lang}
        dict={dict}
        channels={messaging.channels}
        conversations={messaging.conversations}
        peers={messaging.peers}
        className="hidden w-80 lg:flex"
      />
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
