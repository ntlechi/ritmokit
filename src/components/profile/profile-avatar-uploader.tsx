"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import {
  removeProfilePictureAction,
  updateProfilePictureAction,
} from "@/lib/actions/profile";
import { compressAvatarFile } from "@/lib/profile/avatar";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.profile.errors.unauthorized,
    invalid_image: dict.profile.errors.invalidImage,
    invalid_type: dict.profile.errors.invalidType,
    file_too_large: dict.profile.errors.fileTooLarge,
    image_too_large: dict.profile.errors.imageTooLarge,
    canvas_unavailable: dict.profile.errors.databaseError,
    database_error: dict.profile.errors.databaseError,
  };
  return map[code] ?? dict.profile.errors.databaseError;
}

export function ProfileAvatarUploader({
  fullName,
  pictureUrl,
  stationColorHex,
  dict,
  variant = "card",
}: {
  fullName: string;
  pictureUrl: string | null;
  stationColorHex?: string | null;
  dict: Dictionary;
  /** `hero` renders the bare oversized avatar for the profile cover; `card` keeps the labelled form. */
  variant?: "card" | "hero";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(pictureUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openPicker() {
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    startTransition(async () => {
      try {
        const dataUrl = await compressAvatarFile(file);
        setPreview(dataUrl);
        const result = await updateProfilePictureAction(dataUrl);
        if (!result.ok) {
          setPreview(pictureUrl);
          setError(resolveError(dict, result.error));
        }
      } catch (err) {
        setPreview(pictureUrl);
        const code = err instanceof Error ? err.message : "database_error";
        setError(resolveError(dict, code));
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeProfilePictureAction();
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setPreview(null);
    });
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/*"
      capture="user"
      className="hidden"
      onChange={onFileChange}
    />
  );

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={openPicker}
          disabled={isPending}
          className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          aria-label={dict.profile.changePhoto}
        >
          <UserAvatar
            fullName={fullName}
            pictureUrl={preview}
            stationColorHex={stationColorHex}
            size="2xl"
          />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {isPending ? (
              <Loader2 className="h-7 w-7 animate-spin text-white" aria-hidden />
            ) : (
              <Camera className="h-7 w-7 text-white" aria-hidden />
            )}
          </span>
        </button>

        <div className="flex items-center gap-2 pl-1">
          <button
            type="button"
            onClick={openPicker}
            disabled={isPending}
            className="text-[11px] font-semibold text-foreground-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            {preview ? dict.profile.changePhoto : dict.profile.uploadPhoto}
          </button>
          {preview && (
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="text-[11px] font-medium text-foreground-muted transition-colors hover:text-danger disabled:opacity-40"
            >
              {dict.profile.removePhoto}
            </button>
          )}
        </div>
        {error && <p className="pl-1 text-xs text-danger">{error}</p>}
        {fileInput}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <button
        type="button"
        onClick={openPicker}
        disabled={isPending}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={dict.profile.changePhoto}
      >
        <UserAvatar fullName={fullName} pictureUrl={preview} stationColorHex={stationColorHex} size="xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {isPending ? (
            <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden />
          ) : (
            <Camera className="h-6 w-6 text-white" aria-hidden />
          )}
        </span>
      </button>

      <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
        <div>
          <p className="text-sm font-semibold">{dict.profile.photoTitle}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">{dict.profile.photoHint}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button type="button" size="sm" disabled={isPending} onClick={openPicker}>
            {isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Camera className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {preview ? dict.profile.changePhoto : dict.profile.uploadPhoto}
          </Button>
          {preview && (
            <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={remove}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {dict.profile.removePhoto}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {fileInput}
    </div>
  );
}
