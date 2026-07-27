"use client";

import { useState, useTransition } from "react";
import { Award, Loader2, Shield } from "lucide-react";
import { upsertStationSkillAction } from "@/lib/actions/skills";
import type { SkillsMatrixDashboard } from "@/lib/data/skills";
import type { SkillLevel } from "@/generated/prisma/enums";
import { SKILL_LEVELS } from "@/lib/skills/levels";
import { stationLabel } from "@/lib/stations/display";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.manager.skills.errors.unauthorized,
    invalid_level: dict.manager.skills.errors.invalidLevel,
    member_not_found: dict.manager.skills.errors.memberNotFound,
    database_error: dict.manager.skills.errors.databaseError,
  };
  return map[code] ?? dict.manager.skills.errors.databaseError;
}

function levelTone(level: SkillLevel): "neutral" | "accent" | "warning" {
  if (level === "LEAD") return "warning";
  if (level === "AUTONOME") return "accent";
  return "neutral";
}

export function SkillsMatrixDashboardView({
  data,
  dict,
  locale,
}: {
  data: SkillsMatrixDashboard;
  dict: Dictionary;
  locale: Locale;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState(data);

  const stationById = new Map(data.stations.map((s) => [s.id, s]));

  function setLevel(userId: string, stationId: string, level: SkillLevel) {
    const key = `${userId}:${stationId}`;
    setError(null);
    setPendingKey(key);
    const previous = local;
    setLocal((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.userId === userId ? { ...m, skills: { ...m.skills, [stationId]: level } } : m,
      ),
      leadCounts: (() => {
        const next = { ...prev.leadCounts };
        for (const station of prev.stations) {
          next[station.id] = prev.members.filter((m) => {
            const lvl = m.userId === userId && station.id === stationId ? level : m.skills[station.id];
            return lvl === "LEAD";
          }).length;
        }
        return next;
      })(),
    }));

    startTransition(async () => {
      const result = await upsertStationSkillAction({
        locationId: data.locationId,
        userId,
        stationId,
        level,
      });
      setPendingKey(null);
      if (!result.ok) {
        setLocal(previous);
        setError(resolveError(dict, result.error));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {local.stations.map((station) => (
          <div
            key={station.id}
            className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              {stationLabel(station, locale)}
            </p>
            <p className="metric mt-1 flex items-center gap-1.5 text-2xl font-semibold">
              <Shield className="h-5 w-5 text-warning" aria-hidden />
              {local.leadCounts[station.id] ?? 0}
            </p>
            <p className="text-xs text-foreground-muted">{dict.manager.skills.leadsCount}</p>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs uppercase text-foreground-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">{dict.manager.skills.colEmployee}</th>
              <th className="px-4 py-3 font-semibold">{dict.manager.skills.colPrimary}</th>
              {local.stations.map((station) => (
                <th key={station.id} className="px-4 py-3 font-semibold">
                  {stationLabel(station, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {local.members.map((member) => (
              <tr key={member.userId} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{member.fullName}</p>
                  <p className="text-xs text-foreground-muted">{member.email}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone="neutral">
                    {stationById.get(member.primaryStationId)
                      ? stationLabel(stationById.get(member.primaryStationId)!, locale)
                      : member.primaryStationId}
                  </Badge>
                </td>
                {local.stations.map((station) => {
                  const level = member.skills[station.id] ?? "JUNIOR";
                  const key = `${member.userId}:${station.id}`;
                  const loading = isPending && pendingKey === key;
                  return (
                    <td key={station.id} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={level}
                          disabled={loading}
                          onChange={(e) =>
                            setLevel(member.userId, station.id, e.target.value as SkillLevel)
                          }
                          className={cn(
                            "rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-medium",
                            level === "LEAD" && "border-warning/40 text-warning",
                            level === "AUTONOME" && "border-accent/40 text-accent",
                          )}
                        >
                          {SKILL_LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {dict.manager.skills.levels[l]}
                            </option>
                          ))}
                        </select>
                        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {level === "LEAD" && !loading && (
                          <Award className="h-3.5 w-3.5 text-warning" aria-hidden />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {local.members.length === 0 && (
        <p className="text-center text-sm text-foreground-muted">{dict.manager.skills.empty}</p>
      )}
    </div>
  );
}
