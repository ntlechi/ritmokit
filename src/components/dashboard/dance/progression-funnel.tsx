"use client";

import { Funnel as FunnelIcon, Mail, MessageSquare } from "lucide-react";
import { Funnel, ProgressRing, toneForHigher } from "@/components/charts/primitives";
import type { ChurnRiskStudent, ProgressionFunnel as ProgressionFunnelData } from "@/lib/dance/analytics";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { KPI_L1_L2_GOOD_MIN, KPI_L1_L2_WARN_MIN } from "@/lib/kpi/thresholds";

export function ProgressionFunnel({
  progression,
  churnRiskStudents,
  dict,
}: {
  progression: ProgressionFunnelData;
  churnRiskStudents: ChurnRiskStudent[];
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;

  const stages = [
    {
      key: "l1",
      label: c.funnel.level1,
      count: progression.beginnerCompleters,
      rate: null as number | null,
    },
    {
      key: "l2",
      label: c.funnel.level2,
      count: progression.intermediateEnrolled,
      rate: progression.l1ToL2Rate,
    },
    {
      key: "l3",
      label: c.funnel.level3,
      count: progression.advancedEnrolled,
      rate: progression.l2ToL3Rate,
    },
  ];

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <FunnelIcon className="h-4 w-4 text-accent" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold">{c.funnel.title}</h2>
          <p className="text-xs text-foreground-muted">{c.funnel.subtitle}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <Funnel
            height={120}
            stages={stages.map((stage) => ({ label: stage.label, value: stage.count, tone: "accent" }))}
            caption={c.funnel.title}
          />
          <ul className="mt-2 space-y-1">
            {stages.map((stage) => (
              <li key={stage.key} className="flex items-center justify-between text-xs">
                <span className="font-medium">{stage.label}</span>
                <span className="metric tabular-nums text-foreground-muted">{stage.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3">
          {stages
            .filter((stage) => stage.rate != null)
            .map((stage, idx) => (
              <div key={stage.key} className="flex flex-col items-center gap-1">
                <ProgressRing
                  value={stage.rate ?? 0}
                  size={54}
                  strokeWidth={5}
                  caption={idx === 0 ? "L1→L2" : "L2→L3"}
                  tone={toneForHigher(stage.rate ?? 0, KPI_L1_L2_GOOD_MIN, KPI_L1_L2_WARN_MIN)}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                  {idx === 0 ? "L1→L2" : "L2→L3"}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            {c.funnel.churnTitle}
          </h3>
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
            {churnRiskStudents.length}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-foreground-muted">{c.funnel.churnHint}</p>

        {churnRiskStudents.length === 0 ? (
          <p className="mt-3 text-sm text-success">{c.funnel.churnEmpty}</p>
        ) : (
          <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
            {churnRiskStudents.slice(0, 12).map((student) => {
              const subject = encodeURIComponent(c.funnel.emailSubject);
              const body = encodeURIComponent(
                c.funnel.emailBody.replace("{name}", student.fullName),
              );
              const smsBody = encodeURIComponent(
                c.funnel.smsBody.replace("{name}", student.fullName),
              );
              return (
                <li
                  key={student.studentId}
                  className="rounded-xl border border-border-subtle bg-background/60 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{student.fullName}</p>
                      <p className="truncate text-[11px] text-foreground-muted">
                        {student.courseTitles.slice(0, 2).join(" · ")}
                        {student.unpaidAttendanceMisses > 1 &&
                          ` · ${student.unpaidAttendanceMisses} ${c.funnel.misses}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <a
                        href={`mailto:${student.email}?subject=${subject}&body=${body}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-surface-muted"
                        title={c.funnel.emailCta}
                        aria-label={c.funnel.emailCta}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`sms:?&body=${smsBody}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-surface-muted"
                        title={c.funnel.smsCta}
                        aria-label={c.funnel.smsCta}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
