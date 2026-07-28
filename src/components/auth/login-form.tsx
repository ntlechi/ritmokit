"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, KeyRound } from "lucide-react";
import { loginWithPasswordAction, requestMagicLinkAction } from "@/lib/actions/auth";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type Mode = "password" | "magicLink";

const inputClass =
  "w-full rounded-xl border border-zinc-200/80 bg-zinc-50 px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:focus:bg-zinc-900 dark:focus:ring-white/15";

export function LoginForm({
  lang,
  dict,
  next,
  initialError,
}: {
  lang: Locale;
  dict: Dictionary;
  next?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    initialError && initialError in dict.auth.errors
      ? dict.auth.errors[initialError as keyof Dictionary["auth"]["errors"]]
      : null,
  );
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function resolveError(code: string) {
    return dict.auth.errors[code as keyof Dictionary["auth"]["errors"]] ?? dict.auth.errors.genericError;
  }

  function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await loginWithPasswordAction({ email, password });
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      router.push(next || `/${lang}`);
      router.refresh();
    });
  }

  function handleMagicLinkSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestMagicLinkAction({ email, lang, next });
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      setMagicLinkSent(true);
    });
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="display-title text-2xl font-bold tracking-tight">{dict.auth.signInTitle}</h1>
        <p className="text-sm text-foreground-muted">{dict.auth.signInSubtitle}</p>
      </div>

      <div className="inline-flex w-full rounded-full border border-zinc-200/80 bg-zinc-100/80 p-1 shadow-xs dark:border-white/10 dark:bg-white/5">
        {(["password", "magicLink"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-interactive
            disabled={isPending}
            onClick={() => {
              setMode(value);
              setError(null);
              setMagicLinkSent(false);
            }}
            aria-pressed={mode === value}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-sm font-medium",
              mode === value
                ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            {value === "password" ? dict.auth.passwordTab : dict.auth.magicLinkTab}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-foreground-muted">
              {dict.auth.email}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              placeholder={dict.auth.emailPlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-foreground-muted">
              {dict.auth.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isPending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={isPending || !email || !password}
            data-interactive
            className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            {isPending ? dict.auth.signingIn : dict.auth.signIn}
          </button>
        </form>
      ) : (
        <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
          {magicLinkSent ? (
            <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center text-sm text-success">
              {dict.auth.magicLinkSent}
            </p>
          ) : (
            <>
              <p className="text-center text-xs text-foreground-muted">{dict.auth.magicLinkPrompt}</p>

              <div className="space-y-1.5">
                <label htmlFor="magic-email" className="text-xs font-medium text-foreground-muted">
                  {dict.auth.email}
                </label>
                <input
                  id="magic-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={isPending}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  placeholder={dict.auth.emailPlaceholder}
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                type="submit"
                disabled={isPending || !email}
                data-interactive
                className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                <Mail className="h-4 w-4" aria-hidden />
                {isPending ? dict.auth.sendingMagicLink : dict.auth.sendMagicLink}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
