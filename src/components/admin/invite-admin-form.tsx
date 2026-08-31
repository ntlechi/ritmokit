"use client";

import { useState, useTransition } from "react";
import { inviteBrandAdminAction } from "@/lib/actions/invite-admin";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { dna } from "@/lib/design/dna";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.settings.inviteAdminErrors.unauthorized,
    missing_fields: dict.settings.inviteAdminErrors.missingFields,
    cannot_modify_self: dict.settings.inviteAdminErrors.cannotModifySelf,
    invite_failed: dict.settings.inviteAdminErrors.inviteFailed,
    auth_email_conflict: dict.settings.inviteAdminErrors.authConflict,
    database_error: dict.team.errors.databaseError,
  };
  return map[code] ?? dict.team.errors.databaseError;
}

export function InviteAdminForm({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await inviteBrandAdminAction({
        lang,
        email,
        fullName,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setEmail("");
      setFullName("");
      setSuccess(
        result.invited
          ? dict.settings.inviteAdminSuccess
          : dict.settings.inviteAdminAlreadyMember,
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
      <h2 className="text-sm font-semibold tracking-tight">{dict.settings.inviteAdminTitle}</h2>
      <p className="mt-1 text-sm text-foreground-muted">{dict.settings.inviteAdminSubtitle}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder={dict.settings.inviteAdminName}
          disabled={pending}
          required
          className={dna.field}
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={dict.settings.inviteAdminEmail}
          disabled={pending}
          required
          className={dna.field}
        />
        <Button type="submit" variant="primary" disabled={pending} className="rounded-xl">
          {pending ? dict.settings.inviteAdminSending : dict.settings.inviteAdminSend}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {success && <p className="mt-2 text-sm text-success">{success}</p>}
    </form>
  );
}
