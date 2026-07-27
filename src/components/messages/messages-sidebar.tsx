"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChefHat,
  Layers,
  Lock,
  MessageCircle,
  MessageSquarePlus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { MessagingPeer, SidebarChannel, SidebarConversation } from "@/lib/data/chat";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  NewConversationSheet,
  type ComposerMode,
} from "@/components/messages/new-conversation-sheet";
import { cn } from "@/lib/utils";

function sectionLabel(type: SidebarChannel["type"], dict: Dictionary) {
  if (type === "ANNOUNCEMENTS") return dict.messages.announcements;
  if (type === "MANAGEMENT") return dict.messages.management;
  if (type === "STATION") return dict.messages.stations;
  if (type === "SHIFT_GROUP") return dict.messages.shiftGroups;
  if (type === "CUSTOM_GROUP") return dict.messages.customGroups;
  return dict.messages.direct;
}

function iconForType(type: SidebarChannel["type"]) {
  if (type === "ANNOUNCEMENTS") return Bell;
  if (type === "MANAGEMENT") return ShieldCheck;
  if (type === "STATION") return ChefHat;
  if (type === "SHIFT_GROUP") return Layers;
  if (type === "CUSTOM_GROUP") return UsersRound;
  return MessageCircle;
}

function formatRelativeTime(iso: string | null, lang: Locale): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs) || diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "·";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}j`;
  return new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short" });
}

export function MessagesSidebar({
  lang,
  dict,
  channels,
  conversations,
  peers,
  className,
}: {
  lang: Locale;
  dict: Dictionary;
  channels: SidebarChannel[];
  conversations: SidebarConversation[];
  peers: MessagingPeer[];
  className?: string;
}) {
  const pathname = usePathname();
  const [composer, setComposer] = useState<ComposerMode | null>(null);

  const grouped = {
    announcements: channels.filter((c) => c.type === "ANNOUNCEMENTS"),
    management: channels.filter((c) => c.type === "MANAGEMENT"),
    stations: channels.filter((c) => c.type === "STATION"),
    shifts: channels.filter((c) => c.type === "SHIFT_GROUP"),
    groups: channels.filter((c) => c.type === "CUSTOM_GROUP"),
  };

  return (
    <aside className={cn("flex h-full min-h-0 flex-col border-r border-border bg-surface", className)}>
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold tracking-tight">{dict.messages.title}</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setComposer("group")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted hover:text-accent"
              title={dict.messages.newGroup}
              aria-label={dict.messages.newGroup}
            >
              <UsersRound className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setComposer("direct")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xs hover:bg-accent-hover"
              title={dict.messages.newMessage}
              aria-label={dict.messages.newMessage}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-foreground-muted">
          <Lock className="h-3 w-3 text-accent" aria-hidden />
          {dict.messages.secureHint}
        </p>
      </header>

      <div className="flex-1 overflow-auto px-2 py-2">
        {channels.length === 0 && conversations.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-muted px-3 py-6 text-center text-sm text-foreground-muted">
            {dict.messages.emptyChannels}
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([key, bucket]) => {
              if (bucket.length === 0 && key !== "groups") return null;
              if (bucket.length === 0 && key === "groups") {
                return (
                  <section key="groups">
                    <div className="flex items-center justify-between px-2 py-1">
                      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                        {dict.messages.customGroups}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setComposer("group")}
                        className="text-[11px] font-semibold text-accent hover:underline"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setComposer("group")}
                      className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-xs text-foreground-muted hover:border-accent/40 hover:bg-accent-muted/40 hover:text-accent"
                    >
                      <UsersRound className="h-3.5 w-3.5" aria-hidden />
                      {dict.messages.newGroup}
                    </button>
                  </section>
                );
              }
              return (
                <section key={bucket[0].type}>
                  <div className="flex items-center justify-between px-2 py-1">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                      {sectionLabel(bucket[0].type, dict)}
                    </h2>
                    {bucket[0].type === "CUSTOM_GROUP" && (
                      <button
                        type="button"
                        onClick={() => setComposer("group")}
                        className="text-[11px] font-semibold text-accent hover:underline"
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {bucket.map((channel) => {
                      const href = `/${lang}/messages/${channel.id}`;
                      const active = pathname?.startsWith(href);
                      const Icon = iconForType(channel.type);

                      return (
                        <Link
                          key={channel.id}
                          href={href}
                          className={cn(
                            "flex items-center justify-between rounded-xl px-3 py-2 text-sm",
                            active
                              ? "bg-accent-muted text-accent"
                              : "text-foreground hover:bg-surface-muted",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="truncate">{channel.name}</span>
                          </span>
                          {channel.isReadOnly && (
                            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                              {dict.messages.readOnly}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <section>
              <div className="flex items-center justify-between px-2 py-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                  {dict.messages.direct}
                </h2>
                <button
                  type="button"
                  onClick={() => setComposer("direct")}
                  className="text-[11px] font-semibold text-accent hover:underline"
                >
                  +
                </button>
              </div>
              <div className="space-y-1">
                {conversations.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setComposer("direct")}
                    className="mx-1 flex w-[calc(100%-0.5rem)] flex-col items-start gap-1 rounded-xl border border-dashed border-border px-3 py-3 text-left hover:border-accent/40 hover:bg-accent-muted/40"
                  >
                    <span className="text-xs font-medium text-foreground">{dict.messages.newMessage}</span>
                    <span className="text-[11px] text-foreground-muted">{dict.messages.emptyDirect}</span>
                  </button>
                ) : (
                  conversations.map((conversation) => {
                    const href = `/${lang}/messages/dm/${conversation.id}`;
                    const active = pathname?.includes(conversation.id);
                    const relative = formatRelativeTime(conversation.lastMessageAt, lang);
                    return (
                      <Link
                        key={conversation.id}
                        href={href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2",
                          active
                            ? "bg-accent-muted text-accent"
                            : "text-foreground hover:bg-surface-muted",
                        )}
                      >
                        <UserAvatar
                          fullName={conversation.peerName}
                          pictureUrl={conversation.peerPictureUrl}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{conversation.peerName}</span>
                            {relative && (
                              <span className="shrink-0 text-[10px] text-foreground-muted">{relative}</span>
                            )}
                          </span>
                          {conversation.lastMessagePreview && (
                            <span className="block truncate text-[11px] text-foreground-muted">
                              {conversation.lastMessagePreview}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <NewConversationSheet
        open={composer !== null}
        onOpenChange={(open) => {
          if (!open) setComposer(null);
        }}
        mode={composer ?? "direct"}
        lang={lang}
        dict={dict}
        peers={peers}
      />
    </aside>
  );
}
