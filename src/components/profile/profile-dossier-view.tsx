import Link from "next/link";
import {
  Award,
  BadgeCheck,
  Banknote,
  CalendarClock,
  CalendarHeart,
  ChevronRight,
  Clock,
  GraduationCap,
  Heart,
  Lock,
  Mail,
  MapPin,
  Phone,
  Quote,
  Route,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { EmployeeCareerPath } from "@/lib/data/benefits";
import type { ProfileDossierCore } from "@/lib/data/profile-dossier";
import type { EmployeeSkillProgress } from "@/lib/data/skills";
import type { TimeOffRequestEntry } from "@/lib/data/timeoff";
import type { FormationCatalog } from "@/lib/data/training";
import type { ShoutOutComposerContext } from "@/lib/data/shoutouts";
import type { WeeklyAvailability } from "@/lib/data/availability";
import type { SkillLevel } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationDotStyle, stationLabel } from "@/lib/stations/display";
import { ProfileAvatarUploader } from "@/components/profile/profile-avatar-uploader";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

/** Neutral fallback when the employee has no station colour to personalise the cover. */
const DEFAULT_COVER_ACCENT = "#52525b";

const AVAILABILITY_WINDOW_START_MIN = 6 * 60;
const AVAILABILITY_WINDOW_END_MIN = 24 * 60;

/** Regionalised tags so money reads "17,25 $" the way it does on a Québec pay stub. */
const CURRENCY_LOCALE: Record<Locale, string> = {
  fr: "fr-CA",
  en: "en-CA",
  es: "es-MX",
};

export type ProfileDossierData = {
  core: ProfileDossierCore;
  training: FormationCatalog | null;
  skills: EmployeeSkillProgress | null;
  career: EmployeeCareerPath | null;
  recognition: ShoutOutComposerContext | null;
  availability: WeeklyAvailability | null;
  timeOff: TimeOffRequestEntry[];
};

function formatDate(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function formatShortDate(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function formatCurrency(amount: number, lang: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[lang], {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function formatRelativeDays(iso: string, lang: Locale, dict: Dictionary): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return dict.profile.dossier.today;
  if (days < 7) return dict.profile.dossier.daysAgo.replace("{count}", String(days));
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return dict.profile.dossier.weeksAgo.replace("{count}", String(weeks));
  return formatShortDate(iso, lang);
}

/** Months once past the first month, plain J-days before that — matches how the floor talks. */
function seniorityValue(days: number | null, dict: Dictionary): string {
  if (days == null) return "—";
  if (days < 31) return dict.profile.dossier.seniorityDays.replace("{count}", String(days));
  const months = Math.floor(days / 30.44);
  return dict.profile.dossier.seniorityMonths.replace("{count}", String(months));
}

function levelStars(level: SkillLevel): string {
  if (level === "LEAD") return "★★★";
  if (level === "AUTONOME") return "★★☆";
  return "★☆☆";
}

function levelTone(level: SkillLevel): "neutral" | "accent" | "warning" {
  if (level === "LEAD") return "warning";
  if (level === "AUTONOME") return "accent";
  return "neutral";
}

function minutesOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function CompletionRing({ pct, label }: { pct: number; label: string }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex h-16 w-16 items-center justify-center">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden>
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="5"
            className="stroke-border"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            className={pct >= 100 ? "stroke-success" : "stroke-accent"}
          />
        </svg>
        <span className="metric absolute text-sm font-bold">{pct}%</span>
      </span>
      <span className="max-w-[9rem] text-xs leading-snug text-foreground-muted">{label}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string | null;
  icon: React.ReactNode;
}) {
  return (
    <article className="premium-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="premium-eyebrow">{label}</p>
        <span className="text-foreground-muted">{icon}</span>
      </div>
      <p className="metric mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-foreground-muted">{note}</p>}
    </article>
  );
}

function CardShell({
  title,
  icon,
  aside,
  className,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("premium-card p-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent">
          {icon}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-muted">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function ProfileDossierView({
  lang,
  dict,
  data,
}: {
  lang: Locale;
  dict: Dictionary;
  data: ProfileDossierData;
}) {
  const copy = dict.profile.dossier;
  const { core, training, skills, career, recognition, availability, timeOff } = data;
  const station = core.placement.station;
  const accent = station?.colorHex ?? DEFAULT_COVER_ACCENT;

  const trainingPct =
    training && training.totalLessons > 0
      ? Math.round((training.completedLessons / training.totalLessons) * 100)
      : 0;
  const shoutOuts = recognition?.recentReceived ?? [];
  const pendingRequirements = core.requirements.filter((item) => !item.done);
  const pendingTimeOff = timeOff.filter((row) => row.status === "PENDING");
  const nextTimeOff = pendingTimeOff[0] ?? timeOff[0] ?? null;

  return (
    <div className="flex flex-1 flex-col">
      {/* ————— Hero: personalised cover + identity ————— */}
      <section className="border-b border-border">
        <div
          className="h-24 sm:h-32"
          style={{
            background: `linear-gradient(110deg, #18181b 0%, #3f3f46 52%, ${accent} 150%)`,
          }}
          aria-hidden
        />
        <div className="px-4 pb-5 sm:px-6">
          <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:gap-6">
            <ProfileAvatarUploader
              fullName={core.identity.fullName}
              pictureUrl={core.identity.profilePictureUrl}
              stationColorHex={station?.colorHex ?? null}
              dict={dict}
              variant="hero"
            />

            <div className="min-w-0 flex-1 sm:pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="display-title text-2xl font-bold tracking-tight sm:text-3xl">
                  {core.identity.fullName}
                </h1>
                <Badge tone="accent">{dict.roles[core.identity.role]}</Badge>
                {skills && (
                  <Badge tone={levelTone(skills.currentLevel)}>
                    {dict.manager.skills.levels[skills.currentLevel]}
                  </Badge>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-foreground-muted">
                {station && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={stationDotStyle(station.colorHex)}
                      aria-hidden
                    />
                    {stationLabel(station, lang)}
                  </span>
                )}
                {core.placement.locationName && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {core.placement.locationName}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  {core.identity.email}
                </span>
                {core.seniority.anchorIso ? (
                  <span className="metric inline-flex items-center gap-1.5">
                    <CalendarHeart className="h-3.5 w-3.5" aria-hidden />
                    {copy.sinceDate.replace("{date}", formatDate(core.seniority.anchorIso, lang))}
                    {" · "}
                    {seniorityValue(core.seniority.days, dict)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-warning">
                    <CalendarHeart className="h-3.5 w-3.5" aria-hidden />
                    {copy.seniorityUnset}
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 sm:pb-8">
              <CompletionRing
                pct={core.completionPct}
                label={
                  pendingRequirements.length === 0
                    ? copy.checklistComplete
                    : copy.completionHint.replace("{count}", String(pendingRequirements.length))
                }
              />
            </div>
          </div>

          {/* Deep links into the sections of the dossier that live on their own pages */}
          <nav className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
              {copy.navOverview}
            </span>
            <Link
              href={`/${lang}/sops`}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              {copy.navTraining}
            </Link>
            <Link
              href={`/${lang}/settings/availability`}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              {dict.availability.title}
            </Link>
            <Link
              href={`/${lang}/convention`}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              {dict.convention.pageTitle}
            </Link>
            <Link
              href={`/${lang}/onboarding`}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              {copy.navOnboarding}
            </Link>
          </nav>
        </div>
      </section>

      <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
        {/* ————— Achievement strip ————— */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label={copy.statSeniority}
            value={seniorityValue(core.seniority.days, dict)}
            note={
              core.seniority.anchorIso
                ? formatDate(core.seniority.anchorIso, lang)
                : copy.seniorityUnset
            }
            icon={<CalendarHeart className="h-4 w-4" aria-hidden />}
          />
          <StatCard
            label={copy.statTraining}
            value={training ? `${training.completedLessons}/${training.totalLessons}` : "—"}
            note={training ? `${trainingPct}%` : null}
            icon={<GraduationCap className="h-4 w-4" aria-hidden />}
          />
          <StatCard
            label={copy.statLevel}
            value={skills ? dict.manager.skills.levels[skills.currentLevel] : "—"}
            note={
              skills?.nextLevel
                ? dict.benefits.careerNext.replace(
                    "{level}",
                    dict.manager.skills.levels[skills.nextLevel],
                  )
                : skills
                  ? dict.benefits.careerMax
                  : null
            }
            icon={<Award className="h-4 w-4" aria-hidden />}
          />
          <StatCard
            label={copy.statRecognition}
            value={String(shoutOuts.length)}
            note={copy.statRecognitionNote}
            icon={<Sparkles className="h-4 w-4" aria-hidden />}
          />
          <StatCard
            label={copy.statHours}
            value={`${core.pay.scheduledHoursThisWeek} h`}
            note={
              core.pay.maxHoursPerWeek
                ? copy.hoursOfMax.replace("{max}", String(core.pay.maxHoursPerWeek))
                : null
            }
            icon={<Clock className="h-4 w-4" aria-hidden />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          {/* ————— Column 1 — the HR record ————— */}
          <div className="flex flex-col gap-4">
            <CardShell
              title={copy.personalTitle}
              icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
              aside={
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-foreground-muted">
                  <Lock className="h-3 w-3" aria-hidden />
                  {copy.privateBadge}
                </span>
              }
            >
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
                <Field label={dict.profile.nameLabel} value={core.identity.fullName} />
                <Field label={dict.profile.roleLabel} value={dict.roles[core.identity.role]} />
                <div className="col-span-2">
                  <Field label={dict.auth.email} value={core.identity.email} />
                </div>
                <Field
                  label={copy.phoneLabel}
                  value={core.identity.phone ?? copy.notProvided}
                />
                <Field
                  label={copy.languageLabel}
                  value={core.identity.preferredLanguage ?? copy.notProvided}
                />
                <Field
                  label={copy.stationLabel}
                  value={station ? stationLabel(station, lang) : copy.notProvided}
                />
                <Field
                  label={copy.locationLabel}
                  value={core.placement.locationName ?? copy.notProvided}
                />
                <Field
                  label={copy.sinLabel}
                  value={
                    core.identity.sinLastFour
                      ? `••• ••• ${core.identity.sinLastFour}`
                      : copy.notProvided
                  }
                />
              </div>
            </CardShell>

            <CardShell
              title={copy.emergencyTitle}
              icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
              className={cn(!core.emergency.name && "border-warning/40")}
              aside={
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-foreground-muted">
                  {copy.emergencyBadge}
                </span>
              }
            >
              {core.emergency.name ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-muted p-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                    <Heart className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{core.emergency.name}</p>
                    {core.emergency.phone && (
                      <p className="metric mt-0.5 text-xs text-foreground-muted">
                        {core.emergency.phone}
                      </p>
                    )}
                  </div>
                  {core.emergency.phone && (
                    <a
                      href={`tel:${core.emergency.phone}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" aria-hidden />
                      {copy.emergencyCall}
                    </a>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-foreground-muted">{copy.emergencyEmpty}</p>
                  <Link
                    href={`/${lang}/onboarding`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                  >
                    {copy.emergencyAdd}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              )}
            </CardShell>

            <CardShell
              title={copy.checklistTitle}
              icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
              aside={
                <span className="metric text-xs font-semibold text-foreground-muted">
                  {core.requirements.length - pendingRequirements.length}/
                  {core.requirements.length}
                </span>
              }
            >
              <p className="mt-2 text-xs text-foreground-muted">{copy.checklistSubtitle}</p>
              <ul className="mt-3 flex flex-col gap-0.5">
                {core.requirements.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center gap-3 border-b border-border-subtle py-2 last:border-0"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        item.done
                          ? "bg-success text-white"
                          : "border-2 border-border text-transparent",
                      )}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        item.done ? "text-foreground-muted" : "font-medium",
                      )}
                    >
                      {copy.requirements[item.key]}
                    </span>
                    {!item.done && item.href && (
                      <Link
                        href={`/${lang}${item.href}`}
                        className="shrink-0 text-xs font-semibold text-accent hover:underline"
                      >
                        {copy.checklistCta}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </CardShell>
          </div>

          {/* ————— Column 2 — growth and rhythm ————— */}
          <div className="flex flex-col gap-4">
            <CardShell
              title={copy.trainingTitle}
              icon={<GraduationCap className="h-4 w-4" aria-hidden />}
              aside={
                training && (
                  <span className="metric text-xs font-semibold text-success">
                    {training.completedLessons}/{training.totalLessons}
                  </span>
                )
              }
            >
              {training ? (
                <>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-success transition-all"
                      style={{ width: `${trainingPct}%` }}
                    />
                  </div>
                  {training.resumeModule ? (
                    <Link
                      href={`/${lang}/sops/${training.resumeModule.id}`}
                      className="mt-3 flex items-center gap-2 rounded-xl bg-surface-muted p-3 transition-colors hover:bg-accent-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-muted">
                          {copy.trainingResume}
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-medium">
                          {training.resumeModule.title}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                    </Link>
                  ) : (
                    <p className="mt-3 text-sm text-success">{copy.trainingAllDone}</p>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-foreground-muted">{copy.trainingEmpty}</p>
              )}

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-muted">
                {copy.skillsTitle}
              </p>
              {skills && Object.keys(skills.skills).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(training?.stations ?? [])
                    .filter((row) => skills.skills[row.id])
                    .map((row) => {
                      const level = skills.skills[row.id] as SkillLevel;
                      return (
                        <span
                          key={row.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={stationDotStyle(row.colorHex)}
                            aria-hidden
                          />
                          {stationLabel(row, lang)}
                          <span className="text-[10px] tracking-tight text-warning">
                            {levelStars(level)}
                          </span>
                        </span>
                      );
                    })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-foreground-muted">{copy.skillsEmpty}</p>
              )}
            </CardShell>

            <CardShell
              title={dict.availability.title}
              icon={<CalendarClock className="h-4 w-4" aria-hidden />}
              aside={
                core.pay.maxHoursPerWeek ? (
                  <span className="text-xs text-foreground-muted">
                    {copy.maxHours.replace("{hours}", String(core.pay.maxHoursPerWeek))}
                  </span>
                ) : undefined
              }
            >
              {availability && availability.slots.length > 0 ? (
                <>
                  <div className="mt-4 grid grid-cols-7 gap-1.5">
                    {dict.availability.days.map((dayLabel, dayIndex) => {
                      const slots = availability.slots.filter((s) => s.dayOfWeek === dayIndex);
                      return (
                        <div key={dayLabel} className="text-center">
                          <p className="text-[10px] font-semibold text-foreground-muted">
                            {dayLabel}
                          </p>
                          <div className="relative mt-1.5 h-20 overflow-hidden rounded-lg bg-surface-muted">
                            {slots.map((slot) => {
                              const from = Math.max(
                                minutesOf(slot.startTime),
                                AVAILABILITY_WINDOW_START_MIN,
                              );
                              const to = Math.min(
                                minutesOf(slot.endTime),
                                AVAILABILITY_WINDOW_END_MIN,
                              );
                              const span = AVAILABILITY_WINDOW_END_MIN - AVAILABILITY_WINDOW_START_MIN;
                              const top = ((from - AVAILABILITY_WINDOW_START_MIN) / span) * 100;
                              const height = Math.max(6, ((to - from) / span) * 100);
                              return (
                                <span
                                  key={`${slot.startTime}-${slot.endTime}`}
                                  className="absolute inset-x-0.5 rounded"
                                  style={{
                                    top: `${top}%`,
                                    height: `${height}%`,
                                    backgroundColor: accent,
                                  }}
                                  aria-hidden
                                />
                              );
                            })}
                          </div>
                          <p className="metric mt-1 text-[9px] text-foreground-muted">
                            {slots[0] ? slots[0].startTime : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-foreground-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded"
                        style={{ backgroundColor: accent }}
                        aria-hidden
                      />
                      {dict.availability.available}
                    </span>
                    <Link
                      href={`/${lang}/settings/availability`}
                      className="ml-auto font-semibold text-accent hover:underline"
                    >
                      {copy.edit}
                    </Link>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-foreground-muted">{copy.availabilityEmpty}</p>
                  <Link
                    href={`/${lang}/settings/availability`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                  >
                    {dict.availability.title}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-muted px-3.5 py-3">
                <span className="text-xs text-foreground-muted">{copy.timeOffLabel}</span>
                {nextTimeOff ? (
                  <>
                    <span className="metric text-sm font-semibold">
                      {formatShortDate(nextTimeOff.startDate, lang)} –{" "}
                      {formatShortDate(nextTimeOff.endDate, lang)}
                    </span>
                    <span className="ml-auto">
                      <Badge
                        tone={
                          nextTimeOff.status === "APPROVED"
                            ? "success"
                            : nextTimeOff.status === "REJECTED"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {dict.timeOff.status[nextTimeOff.status]}
                      </Badge>
                    </span>
                  </>
                ) : (
                  <span className="ml-auto text-xs text-foreground-muted">{copy.timeOffNone}</span>
                )}
              </div>
            </CardShell>
          </div>

          {/* ————— Column 3 — pride: recognition, the road ahead, the payoff ————— */}
          <div className="flex flex-col gap-4">
            <section className="overflow-hidden rounded-2xl bg-zinc-950 p-5 text-white shadow-xs dark:border dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                  <Sparkles className="h-4 w-4" aria-hidden />
                </span>
                <h2 className="text-sm font-semibold">{copy.recognitionTitle}</h2>
                <span className="ml-auto rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold">
                  {shoutOuts.length}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/60">{copy.recognitionSubtitle}</p>

              {shoutOuts.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-3">
                  {shoutOuts.map((row) => (
                    <li key={row.id} className="rounded-xl bg-white/[0.06] p-3.5">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar fullName={row.senderName} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {row.senderName}
                        </span>
                        <span className="shrink-0 text-[11px] text-white/50">
                          {formatRelativeDays(row.createdAt, lang, dict)}
                        </span>
                      </div>
                      <p className="mt-2 flex gap-1.5 text-sm leading-relaxed text-white/85">
                        <Quote className="mt-0.5 h-3 w-3 shrink-0 text-white/40" aria-hidden />
                        {row.message}
                      </p>
                      {row.valueTitle && (
                        <span className="mt-2.5 inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-white/80">
                          {row.valueTitle}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-white/[0.06] p-4 text-sm leading-relaxed text-white/70">
                  {copy.recognitionEmpty}
                </p>
              )}

              <Link
                href={`/${lang}/team`}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {copy.recognitionCta}
              </Link>
            </section>

            <CardShell
              title={dict.benefits.careerTitle}
              icon={<Route className="h-4 w-4" aria-hidden />}
              aside={
                career?.nextLevel ? (
                  <span className="rounded-full bg-accent-muted px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                    {dict.manager.skills.levels[career.nextLevel]}
                  </span>
                ) : undefined
              }
            >
              {career ? (
                <>
                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <Badge tone={levelTone(career.currentLevel)}>
                      {dict.manager.skills.levels[career.currentLevel]}
                    </Badge>
                    {career.nextLevel ? (
                      <>
                        <span className="text-foreground-muted" aria-hidden>
                          →
                        </span>
                        <span className="font-medium">
                          {dict.manager.skills.levels[career.nextLevel]}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-success">
                        {dict.benefits.careerMax}
                      </span>
                    )}
                  </div>

                  {career.totalMandatoryCount > 0 && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-foreground-muted">
                        <span>{dict.benefits.careerProgress}</span>
                        <span className="metric font-semibold">
                          {career.completedMandatoryCount}/{career.totalMandatoryCount}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{
                            width: `${Math.round(
                              (career.completedMandatoryCount / career.totalMandatoryCount) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {career.nextLevel && career.missingModules.length > 0 ? (
                    <div className="mt-4 rounded-xl bg-surface-muted p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-muted">
                        {copy.careerToReach.replace(
                          "{level}",
                          dict.manager.skills.levels[career.nextLevel],
                        )}
                      </p>
                      <ul className="mt-2.5 flex flex-col gap-2">
                        {career.missingModules.slice(0, 5).map((mod) => (
                          <li key={mod.id} className="flex items-center gap-2.5">
                            <span
                              className="h-4 w-4 shrink-0 rounded-full border-2 border-border"
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate text-sm">{mod.title}</span>
                            <Link
                              href={`/${lang}/sops/${mod.id}`}
                              className="shrink-0 text-xs font-semibold text-accent hover:underline"
                            >
                              {copy.careerStart}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl bg-surface-muted p-3.5 text-sm text-foreground-muted">
                      {copy.careerAllDone}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-foreground-muted">{copy.careerEmpty}</p>
              )}
            </CardShell>

            <CardShell
              title={copy.payTitle}
              icon={<Wallet className="h-4 w-4" aria-hidden />}
              aside={
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-foreground-muted">
                  <Lock className="h-3 w-3" aria-hidden />
                  {copy.privateBadge}
                </span>
              }
            >
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-muted">
                    {copy.hourlyRate}
                  </p>
                  <p className="metric mt-0.5 text-xl font-bold">
                    {core.pay.hourlyRate != null
                      ? formatCurrency(core.pay.hourlyRate, lang, 2)
                      : copy.notProvided}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground-muted">
                    {copy.scheduledHours}
                  </p>
                  <p className="metric mt-0.5 text-xl font-bold">
                    {core.pay.scheduledHoursThisWeek} h
                  </p>
                </div>
              </div>
            </CardShell>
          </div>
        </div>
      </div>
    </div>
  );
}
