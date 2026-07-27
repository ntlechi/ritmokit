"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Search, Users, X } from "lucide-react";
import {
  createGroupChannelAction,
  startDirectConversationAction,
} from "@/lib/actions/chat";
import type { MessagingPeer } from "@/lib/data/chat";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { closeButtonClass, contentClass, overlayClass } from "@/components/ui/modal-chrome";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export type ComposerMode = "direct" | "group";

function resolveError(dict: Dictionary, code: string): string {
  const map = dict.messages.errors as Record<string, string>;
  return map[code] ?? dict.messages.errors.createFailed;
}

export function NewConversationSheet({
  open,
  onOpenChange,
  mode,
  lang,
  dict,
  peers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ComposerMode;
  lang: Locale;
  dict: Dictionary;
  peers: MessagingPeer[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return peers;
    return peers.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.stationName?.toLowerCase().includes(q) ?? false),
    );
  }, [peers, query]);

  function reset() {
    setQuery("");
    setSelectedIds([]);
    setGroupName("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function toggleMember(userId: string) {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function startDirect(peerUserId: string) {
    setError(null);
    startTransition(async () => {
      const result = await startDirectConversationAction({ lang, peerUserId });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      handleOpenChange(false);
      router.push(`/${lang}/messages/dm/${result.conversationId}`);
      router.refresh();
    });
  }

  function createGroup() {
    setError(null);
    startTransition(async () => {
      const result = await createGroupChannelAction({
        lang,
        name: groupName,
        memberUserIds: selectedIds,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      handleOpenChange(false);
      router.push(`/${lang}/messages/${result.channelId}`);
      router.refresh();
    });
  }

  const title = mode === "direct" ? dict.messages.newMessage : dict.messages.newGroup;
  const canCreateGroup =
    groupName.trim().length > 0 && selectedIds.length > 0 && !isPending;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] w-full max-w-lg flex-col",
            contentClass,
            "rounded-b-none rounded-t-3xl",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[80vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-white/10">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 flex items-center gap-1.5 text-xs text-foreground-muted">
                <Lock className="h-3 w-3 shrink-0 text-accent" aria-hidden />
                {dict.messages.secureHint}
              </Dialog.Description>
            </div>
            <Dialog.Close className={closeButtonClass} aria-label={dict.common.cancel}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </header>

          {mode === "group" && (
            <div className="border-b border-zinc-200/80 px-5 py-3 dark:border-white/10">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                {dict.messages.groupName}
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={dict.messages.groupNamePlaceholder}
                maxLength={60}
                autoFocus
                className="h-11 w-full rounded-2xl border border-zinc-200/80 bg-surface-muted/60 px-4 text-sm outline-none ring-accent/30 focus:ring-2 dark:border-white/10"
              />
            </div>
          )}

          <div className="border-b border-zinc-200/80 px-5 py-3 dark:border-white/10">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={dict.messages.searchPeers}
                autoFocus={mode === "direct"}
                className="h-11 w-full rounded-2xl border border-zinc-200/80 bg-surface-muted/60 pl-10 pr-3 text-sm outline-none ring-accent/30 focus:ring-2 dark:border-white/10"
              />
            </div>
            {mode === "group" && selectedIds.length > 0 && (
              <p className="mt-2 text-xs font-medium text-accent">
                {dict.messages.membersSelected.replace("{count}", String(selectedIds.length))}
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-foreground-muted">
                {dict.messages.noPeersFound}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((peer) => {
                  const selected = selectedIds.includes(peer.userId);
                  return (
                    <li key={peer.userId}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          mode === "direct" ? startDirect(peer.userId) : toggleMember(peer.userId)
                        }
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                          selected
                            ? "bg-accent-muted text-accent"
                            : "hover:bg-surface-muted",
                          isPending && "opacity-60",
                        )}
                      >
                        <UserAvatar
                          fullName={peer.fullName}
                          pictureUrl={peer.profilePictureUrl}
                          stationColorHex={peer.stationColorHex}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {peer.fullName}
                          </span>
                          <span className="block truncate text-xs text-foreground-muted">
                            {dict.roles[peer.role]}
                            {peer.stationName ? ` · ${peer.stationName}` : ""}
                          </span>
                        </span>
                        {mode === "group" ? (
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border",
                              selected
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-border text-transparent",
                            )}
                            aria-hidden
                          >
                            <Check className="h-3 w-3" />
                          </span>
                        ) : isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <p className="px-5 pb-2 text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <footer className="flex items-center justify-between gap-3 border-t border-zinc-200/80 px-5 py-4 dark:border-white/10">
            {mode === "group" ? (
              <>
                <p className="flex items-center gap-1.5 text-xs text-foreground-muted">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {dict.messages.addMembers}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canCreateGroup}
                  onClick={createGroup}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {dict.messages.creating}
                    </>
                  ) : (
                    dict.messages.createGroup
                  )}
                </Button>
              </>
            ) : (
              <p className="w-full text-center text-xs text-foreground-muted">
                {isPending ? dict.messages.opening : dict.messages.startConversation}
              </p>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
