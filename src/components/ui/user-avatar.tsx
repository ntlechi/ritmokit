"use client";

import { stationDotStyle } from "@/lib/stations/display";
import { getInitials } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
  "2xl": "h-28 w-28 text-3xl sm:h-32 sm:w-32 sm:text-4xl",
} as const;

const ringMap = {
  sm: "ring-1",
  md: "ring-1",
  lg: "ring-[1.5px]",
  xl: "ring-2",
  "2xl": "ring-4 ring-surface",
} as const;

const dotMap = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
  xl: "h-3.5 w-3.5",
  "2xl": "h-4 w-4",
} as const;

export function UserAvatar({
  fullName,
  pictureUrl,
  stationColorHex,
  size = "md",
  className,
}: {
  fullName: string;
  pictureUrl?: string | null;
  stationColorHex?: string | null;
  size?: keyof typeof sizeMap;
  className?: string;
}) {
  const initials = getInitials(fullName);

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full",
          "bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-800",
          "dark:from-zinc-600 dark:to-zinc-800 dark:text-zinc-100",
          "ring-border",
          ringMap[size],
          sizeMap[size],
        )}
        aria-hidden={!pictureUrl}
        title={fullName}
      >
        {pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pictureUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="font-mono font-semibold tracking-tight">{initials}</span>
        )}
      </span>
      {stationColorHex && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-surface",
            dotMap[size],
          )}
          style={stationDotStyle(stationColorHex)}
          aria-hidden
        />
      )}
    </span>
  );
}
