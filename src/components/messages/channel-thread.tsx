"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Bot } from "lucide-react";
import Link from "next/link";
import { sendMessageAction } from "@/lib/actions/chat";
import { createClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { ThreadMessage } from "@/lib/data/chat";
import { cn } from "@/lib/utils";

type RealtimeMessageRow = {
  id: string;
  channel_id: string | null;
  author_id: string;
  body: string;
  content_type: ThreadMessage["contentType"];
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function ChannelThread({
  lang,
  dict,
  channelId,
  channelName,
  canPost,
  currentUserId,
  currentUserName,
  initialMessages,
}: {
  lang: Locale;
  dict: Dictionary;
  channelId: string;
  channelName: string;
  canPost: boolean;
  currentUserId: string;
  currentUserName: string;
  initialMessages: ThreadMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeMessageRow;
          if (!row?.id || !row.channel_id) return;
          const rowChannelId = row.channel_id;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const withoutOptimistic = prev.filter(
              (m) =>
                !(
                  m.id.startsWith("tmp-") &&
                  m.author.id === row.author_id &&
                  m.body === row.body
                ),
            );
            return [
              ...withoutOptimistic,
              {
                id: row.id,
                channelId: rowChannelId,
                body: row.body,
                contentType: row.content_type,
                metadata: row.metadata ?? {},
                createdAt: row.created_at,
                author: {
                  id: row.author_id,
                  fullName: row.author_id === currentUserId ? currentUserName : "Équipe",
                  role: "EMPLOYEE",
                },
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, currentUserId, currentUserName]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = input.trim();
    if (!body || !canPost) return;

    setError(null);
    setInput("");

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: ThreadMessage = {
      id: optimisticId,
      channelId,
      body,
      contentType: "TEXT",
      metadata: { optimistic: true },
      createdAt: new Date().toISOString(),
      author: { id: currentUserId, fullName: currentUserName, role: "EMPLOYEE" },
    };
    setMessages((prev) => [...prev, optimistic]);

    startTransition(async () => {
      const result = await sendMessageAction({ lang, channelId, body });
      if (!result.ok) {
        setError(result.error);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Link
          href={`/${lang}/messages`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted lg:hidden"
          aria-label={dict.messages.backToChannels}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="truncate text-base font-semibold">#{channelName}</h2>
      </header>

      <div className="flex-1 space-y-2 overflow-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-muted px-4 py-6 text-center text-sm text-foreground-muted">
            {dict.messages.emptyThread}
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.author.id === currentUserId && message.contentType === "TEXT";
            const isAgent = message.contentType === "AGENT";
            const isSystem = message.contentType === "SYSTEM";
            if (isSystem) {
              return (
                <p
                  key={message.id}
                  className="px-2 py-1 text-center text-[11px] text-foreground-muted"
                >
                  {message.body}
                </p>
              );
            }
            return (
              <article
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2",
                  isAgent
                    ? "border border-accent/30 bg-accent-muted text-foreground"
                    : mine
                      ? "ml-auto bg-accent text-accent-foreground"
                      : "bg-surface-muted text-foreground",
                )}
              >
                <p
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-semibold opacity-80",
                    isAgent && "text-accent",
                  )}
                >
                  {isAgent && <Bot className="h-3 w-3" aria-hidden />}
                  {isAgent ? dict.agents.agentAuthorLabel : message.author.fullName}
                </p>
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                <p className={cn("mt-1 text-[10px]", mine ? "text-accent-foreground/80" : "text-foreground-muted")}>
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </article>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-4 pb-2 text-xs text-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={dict.messages.typePlaceholder}
            disabled={!canPost || isPending}
            className="h-10 flex-1 rounded-full border border-border bg-surface px-4 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canPost || !input.trim() || isPending}
            data-interactive
            className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {dict.messages.send}
          </button>
        </div>
      </form>
    </div>
  );
}
