"use client";

import { Funnel, Mail, MessageSquare } from "lucide-react";
import type { ChurnRiskStudent, ProgressionFunnel as ProgressionFunnelData } from "@/lib/dance/analytics";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function stageWidth(value: number, max: number): string {
  if (max <= 0) return "12%";
  return `${Math.max(12, Math.round((value / max) * 100))}%`;
}

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
  const max = Math.max(
    progression.beginnerCompleters,
    progression.intermediateEnrolled,
    progression.advancedEnrolled,
    1,
  );

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
        <Funnel className="h-4 w-4 text-accent" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold">{c.funnel.title}</h2>
          <p className="text-xs text-foreground-muted">{c.funnel.subtitle}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {stages.map((stage, idx) => (
          <div key={stage.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{stage.label}</span>
              <span className="tabular-nums text-foreground-muted">
                {stage.count}
                {stage.rate != null && (
                  <span className="ml-2 text-accent">
                    {idx === 1 ? "L1→L2" : "L2→L3"} {stage.rate.toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-center">
              <div
                className="h-8 rounded-lg bg-gradient-to-r from-accent/80 to-accent text-center text-xs font-semibold leading-8 text-accent-foreground transition-all"
                style={{ width: stageWidth(stage.count, max) }}
              >
                {stage.count > 0 ? stage.count : ""}
              </div>
            </div>
          </div>
        ))}
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
