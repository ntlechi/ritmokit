import { notFound } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { DirectThread } from "@/components/messages/direct-thread";
import { getSessionUser } from "@/lib/auth/session";
import { getDirectConversationThreadForUser } from "@/lib/data/chat";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function DirectMessagePage({
  params,
}: {
  params: Promise<{ lang: string; conversationId: string }>;
}) {
  const { lang, conversationId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) notFound();

  const { data: thread, dbError } = await safeQuery(
    () => getDirectConversationThreadForUser(user.id, conversationId),
    null,
  );

  if (dbError) {
    return (
      <div className="p-4 sm:p-6">
        <DbErrorBanner label={dict.common.dbDisconnected} />
      </div>
    );
  }

  if (!thread) notFound();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <DirectThread
        lang={lang}
        dict={dict}
        conversationId={thread.conversationId}
        peerName={thread.peerName}
        canPost={thread.canPost}
        currentUserId={user.id}
        currentUserName={user.fullName}
        initialMessages={thread.messages}
      />
    </div>
  );
}
