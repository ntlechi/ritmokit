"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HandHeart, Loader2 } from "lucide-react";
import { sendStationShoutOutAction } from "@/lib/actions/shoutouts";
import type { ShoutOutComposerContext } from "@/lib/data/shoutouts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.shoutouts.errors.unauthorized,
    auto_shout_out_forbidden: dict.shoutouts.errors.autoForbidden,
    invalid_station: dict.shoutouts.errors.invalidStation,
    invalid_value: dict.shoutouts.errors.invalidValue,
    message_too_short: dict.shoutouts.errors.messageTooShort,
    receiver_not_found: dict.shoutouts.errors.receiverNotFound,
    database_error: dict.shoutouts.errors.databaseError,
  };
  return map[code] ?? dict.shoutouts.errors.databaseError;
}

export function ShoutOutComposer({
  context,
  dict,
  lang,
}: {
  context: ShoutOutComposerContext;
  dict: Dictionary;
  lang: Locale;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [receiverId, setReceiverId] = useState("");
  const [stationId, setStationId] = useState(context.stationId);
  const [valueKey, setValueKey] = useState(context.values[0]?.valueKey ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedTeammate = useMemo(
    () => context.teammates.find((t) => t.userId === receiverId) ?? null,
    [context.teammates, receiverId],
  );

  function onReceiverChange(id: string) {
    setReceiverId(id);
    const mate = context.teammates.find((t) => t.userId === id);
    if (mate) setStationId(mate.stationId);
  }

  function submit() {
    if (!receiverId || !valueKey) return;
    setError(null);
    startTransition(async () => {
      const result = await sendStationShoutOutAction({
        locationId: context.locationId,
        receiverId,
        stationId,
        valueKey,
        message,
        lang,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setDone(true);
      setMessage("");
      setReceiverId("");
      router.refresh();
    });
  }

  if (context.teammates.length === 0 || context.values.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.shoutouts.badge}
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight">{dict.shoutouts.title}</h2>
          <p className="mt-1 text-xs text-foreground-muted">{dict.shoutouts.subtitle}</p>
        </div>
        <HandHeart className="h-5 w-5 shrink-0 text-accent" aria-hidden />
      </div>

      {context.recentReceived.length > 0 && (
        <ul className="mt-4 space-y-2">
          {context.recentReceived.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-xs"
            >
              <p className="font-medium text-foreground">
                {dict.shoutouts.receivedFrom.replace("{name}", row.senderName)}
                {row.valueTitle ? ` · ${row.valueTitle}` : ""}
              </p>
              <p className="mt-0.5 text-foreground-muted">« {row.message} »</p>
            </li>
          ))}
        </ul>
      )}

      {!open && !done && (
        <Button type="button" size="sm" className="mt-4 w-full" onClick={() => setOpen(true)}>
          <HandHeart className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {dict.shoutouts.cta}
        </Button>
      )}

      {done && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success/5 px-3 py-2 text-sm text-success">
          <Check className="h-4 w-4" aria-hidden />
          {dict.shoutouts.thanks}
        </div>
      )}

      {open && !done && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground-muted" htmlFor="so-receiver">
              {dict.shoutouts.teammateLabel}
            </label>
            <select
              id="so-receiver"
              value={receiverId}
              onChange={(e) => onReceiverChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
            >
              <option value="">{dict.shoutouts.teammatePlaceholder}</option>
              {context.teammates.map((t) => {
                const station = context.stations.find((s) => s.id === t.stationId);
                return (
                  <option key={t.userId} value={t.userId}>
                    {t.fullName}
                    {station ? ` · ${stationLabel(station, lang)}` : ""}
                  </option>
                );
              })}
            </select>
            {selectedTeammate && (
              <div className="mt-2 flex items-center gap-2">
                <UserAvatar
                  fullName={selectedTeammate.fullName}
                  pictureUrl={selectedTeammate.profilePictureUrl}
                  stationColorHex={selectedTeammate.stationColorHex}
                  size="sm"
                />
                <span className="text-xs text-foreground-muted">{selectedTeammate.fullName}</span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-foreground-muted">{dict.shoutouts.stationLabel}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {context.stations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStationId(s.id)}
                  aria-pressed={stationId === s.id}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    stationId === s.id
                      ? "border-accent bg-accent-muted text-accent"
                      : "border-border text-foreground-muted hover:border-accent/40",
                  )}
                >
                  #{stationLabel(s, lang).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-foreground-muted">{dict.shoutouts.valueLabel}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {context.values.map((v) => (
                <button
                  key={v.valueKey}
                  type="button"
                  onClick={() => setValueKey(v.valueKey)}
                  aria-pressed={valueKey === v.valueKey}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    valueKey === v.valueKey
                      ? "border-accent bg-accent text-white"
                      : "border-border text-foreground-muted hover:border-accent/40",
                  )}
                >
                  {v.title}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground-muted" htmlFor="so-message">
              {dict.shoutouts.messageLabel}
            </label>
            <textarea
              id="so-message"
              value={message}
              maxLength={140}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={dict.shoutouts.messagePlaceholder}
              className="mt-1 w-full resize-none rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-right text-[10px] text-foreground-muted">{message.length}/140</p>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={isPending || !receiverId || !valueKey || message.trim().length < 3}
              onClick={submit}
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <HandHeart className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              {dict.shoutouts.send}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              {dict.common.cancel}
            </Button>
          </div>
        </div>
      )}

      {done && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
        >
          {dict.shoutouts.sendAnother}
        </Button>
      )}
    </section>
  );
}
