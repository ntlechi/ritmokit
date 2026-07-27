import { Shield } from "lucide-react";
import type { MobileCultureCardData } from "@/lib/data/culture-mobile";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { UserAvatar } from "@/components/ui/user-avatar";

export function CultureWeekCard({
  data,
  dict,
}: {
  data: MobileCultureCardData;
  dict: Dictionary;
}) {
  const names = data.faces.map((f) => f.firstName);
  let socialLine: string;
  if (data.totalShoutOutsCount === 0) {
    socialLine = dict.cultureMobile.socialEmpty;
  } else if (names.length === 0) {
    socialLine = dict.cultureMobile.socialCountOnly.replace(
      "{count}",
      String(data.totalShoutOutsCount),
    );
  } else {
    const namesLabel =
      data.extraCount > 0
        ? dict.cultureMobile.namesAndMore
            .replace("{names}", names.join(", "))
            .replace("{extra}", String(data.extraCount))
        : names.join(", ");
    socialLine = dict.cultureMobile.socialProof
      .replace("{count}", String(data.totalShoutOutsCount))
      .replace("{names}", namesLabel);
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.cultureMobile.badge
              .replace("{week}", String(data.weekNumber))
              .replace("{year}", String(data.year))}
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight">
            <span className="text-accent">#{data.valueKey}</span>
            <span className="text-foreground-muted"> · </span>
            {data.title}
          </h2>
        </div>
        <Shield className="h-5 w-5 shrink-0 text-accent" aria-hidden />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
        <span className="font-medium text-foreground">{dict.cultureMobile.behaviorLead}</span>{" "}
        {data.behavior}
      </p>

      <div className="mt-4 flex items-center gap-3 border-t border-border-subtle pt-4">
        {data.faces.length > 0 && (
          <div className="flex -space-x-2">
            {data.faces.map((face) => (
              <UserAvatar
                key={face.userId}
                fullName={face.fullName}
                pictureUrl={face.profilePictureUrl}
                size="sm"
                className="ring-2 ring-surface"
              />
            ))}
          </div>
        )}
        <p className="min-w-0 flex-1 text-xs leading-snug text-foreground-muted">{socialLine}</p>
      </div>
    </section>
  );
}
