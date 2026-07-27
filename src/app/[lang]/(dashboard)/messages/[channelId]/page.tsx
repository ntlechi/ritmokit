import { notFound } from "next/navigation";
import { ChannelThread } from "@/components/messages/channel-thread";
import { DbErrorBanner } from "@/components/db-error-banner";
import { SopPinHeader } from "@/components/messages/sop-pin-header";
import { getSessionUser } from "@/lib/auth/session";
import { getChannelThreadForUser } from "@/lib/data/chat";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ lang: string; channelId: string }>;
}) {
  const { lang, channelId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) notFound();

  const { data: thread, dbError } = await safeQuery(
    () => getChannelThreadForUser(user.id, channelId),
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <SopPinHeader dict={dict} sopPin={thread.sopPin} />
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
        <ChannelThread
          lang={lang}
          dict={dict}
          channelId={thread.channel.id}
          channelName={thread.channel.name}
          canPost={thread.canPost}
          currentUserId={user.id}
          currentUserName={user.fullName}
          initialMessages={thread.messages}
        />
      </div>
    </div>
  );
}
