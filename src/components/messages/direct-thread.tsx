"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Send } from "lucide-react";
import { markDirectReadAction, sendDirectMessageAction } from "@/lib/actions/chat";
import { createClient } from "@/lib/supabase/client";
import type { DirectThreadMessage } from "@/lib/data/chat";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type RealtimeMessageRow = {
  id: string;
  conversation_id: string | null;
  author_id: string;
  body: string;
  content_type: DirectThreadMessage["contentType"];
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function DirectThread({
  lang,
  dict,
  conversationId,
  peerName,
  canPost,
  currentUserId,
  currentUserName,
  initialMessages,
}: {
  lang: Locale;
  dict: Dictionary;
  conversationId: string;
  peerName: string;
  canPost: boolean;
  currentUserId: string;
  currentUserName: string;
  initialMessages: DirectThreadMessage[];
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
    void markDirectReadAction(conversationId);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as RealtimeMessageRow;
          if (!row?.id || !row.conversation_id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            // Drop optimistic local twin for own messages
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
                channelId: "",
                conversationId: row.conversation_id!,
                body: row.body,
                contentType: row.content_type,
                metadata: row.metadata ?? {},
                createdAt: row.created_at,
                author: {
                  id: row.author_id,
                  fullName:
                    row.author_id === currentUserId ? currentUserName : peerName,
                  role: "EMPLOYEE",
                },
              },
            ];
          });
          if (row.author_id !== currentUserId) {
            void markDirectReadAction(conversationId);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, currentUserName, peerName]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = input.trim();
    if (!body || !canPost) return;

    setError(null);
    setInput("");

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: DirectThreadMessage = {
      id: optimisticId,
      channelId: "",
      conversationId,
      body,
      contentType: "TEXT",
      metadata: { optimistic: true },
      createdAt: new Date().toISOString(),
      author: { id: currentUserId, fullName: currentUserName, role: "EMPLOYEE" },
    };
    setMessages((prev) => [...prev, optimistic]);

    startTransition(async () => {
      const result = await sendDirectMessageAction({ lang, conversationId, body });
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
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{peerName}</h2>
          <p className="flex items-center gap-1 text-[11px] text-foreground-muted">
            <Lock className="h-3 w-3 text-accent" aria-hidden />
            {dict.messages.secureHint}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-accent">
              <Lock className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-sm font-medium text-foreground">{peerName}</p>
            <p className="max-w-xs text-xs text-foreground-muted">{dict.messages.secureHint}</p>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.author.id === currentUserId;
            const isSystem = message.contentType === "SYSTEM";
            if (isSystem) {
              return (
                <p
                  key={message.id}
                  className="px-4 py-1 text-center text-[11px] text-foreground-muted"
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
                  mine
                    ? "ml-auto bg-accent text-accent-foreground"
                    : "bg-surface-muted text-foreground",
                )}
              >
                {!mine && (
                  <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                    {message.author.fullName}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px]",
                    mine ? "text-accent-foreground/80" : "text-foreground-muted",
                  )}
                >
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </article>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="px-4 pb-2 text-xs text-danger">{error}</div>}

      {canPost && (
        <form onSubmit={handleSubmit} className="border-t border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={dict.messages.typePlaceholder}
              disabled={isPending}
              className="h-10 flex-1 rounded-full border border-border bg-surface px-4 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isPending}
              data-interactive
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
              aria-label={dict.messages.send}
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
