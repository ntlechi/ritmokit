import {
  getHourMarks,
  layoutTimeline,
  TIMELINE_START_HOUR,
  TIMELINE_TOTAL_MINUTES,
} from "@/lib/calendar/timeline";
import { stationRailStyle } from "@/lib/calendar/style";
import { stationDotStyle, stationLabel, type StationRecord } from "@/lib/stations/display";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatTimeRange } from "@/lib/calendar/format";
import { dna } from "@/lib/design/dna";
import { isSameDay } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";

const LANE_HEIGHT = 44;

function nowPositionPct(day: Date): number | null {
  const now = new Date();
  if (!isSameDay(now, day)) return null;
  const minutes = (now.getHours() - TIMELINE_START_HOUR) * 60 + now.getMinutes();
  if (minutes < 0 || minutes > TIMELINE_TOTAL_MINUTES) return null;
  return (minutes / TIMELINE_TOTAL_MINUTES) * 100;
}

export function DayView({
  day,
  shifts,
  stations,
  locale,
  dict,
}: {
  day: Date;
  shifts: ShiftWithEmployee[];
  stations: StationRecord[];
  locale: Locale;
  dict: Dictionary;
}) {
  const hours = getHourMarks();
  const nowPct = nowPositionPct(day);

  return (
    <div className={cn("overflow-x-auto shadow-xs", dna.panel)}>
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[160px_1fr] border-b border-border">
          <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
            {dict.calendar.team}
          </div>
          <div className="relative h-9">
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-foreground-muted"
                style={{ left: `${((hour - TIMELINE_START_HOUR) / (hours.length - 1)) * 100}%` }}
              >
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>

        {stations.map((station, stationIndex) => {
          const stationShifts = shifts.filter((s) => s.stationId === station.id);
          const { lanes, laneCount } = layoutTimeline(stationShifts, day);
          const trackHeight = laneCount * LANE_HEIGHT;
          const label = stationLabel(station, locale);

          return (
            <div
              key={station.id}
              className={cn(
                "grid grid-cols-[160px_1fr]",
                stationIndex < stations.length - 1 && "border-b border-border",
              )}
            >
              <div className="flex items-center gap-2 border-r border-border px-4 py-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={stationDotStyle(station.colorHex)}
                  aria-hidden
                />
                <span className="text-sm font-medium">{label}</span>
                <span className="ml-auto font-mono text-xs tabular-nums text-foreground-muted">
                  {stationShifts.length}
                </span>
              </div>

              <div className="relative" style={{ height: Math.max(trackHeight, LANE_HEIGHT) + 8 }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-y-0 border-r border-border"
                    style={{ left: `${((hour - TIMELINE_START_HOUR) / (hours.length - 1)) * 100}%` }}
                  />
                ))}

                {nowPct != null && (
                  <div
                    className="absolute inset-y-0 z-10 w-px bg-danger shadow-[0_0_8px_rgb(220_38_38/0.5)]"
                    style={{ left: `${nowPct}%` }}
                    aria-hidden
                  >
                    {stationIndex === 0 && (
                      <span className="animate-pulse-soft absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-danger" />
                    )}
                  </div>
                )}

                {lanes.map(({ shift, lane, leftPct, widthPct }) => (
                  <div
                    key={shift.id}
                    className={cn(
                      "absolute flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-surface pl-2.5 pr-2 text-xs shadow-xs transition-shadow hover:shadow-sm",
                      shift.status === "DRAFT" && "border-dashed opacity-75",
                    )}
                    style={{
                      left: `${leftPct}%`,
                      width: `calc(${widthPct}% - 4px)`,
                      top: lane * LANE_HEIGHT + 6,
                      height: LANE_HEIGHT - 8,
                    }}
                    title={`${shift.employee?.fullName ?? dict.calendar.unassigned} · ${formatTimeRange(shift.startsAt, shift.endsAt, locale)}`}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={stationRailStyle(shift.station.colorHex)}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "truncate font-medium",
                        !shift.employee && "italic text-foreground-muted",
                      )}
                    >
                      {shift.employee?.fullName ?? dict.calendar.unassigned}
                    </span>
                    {widthPct > 18 && (
                      <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-foreground-muted">
                        {formatTimeRange(shift.startsAt, shift.endsAt, locale)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
