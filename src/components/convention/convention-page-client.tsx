"use client";

import { useRouter } from "next/navigation";
import { ConventionDocument } from "@/components/convention/convention-document";
import { ConventionSignPanel } from "@/components/convention/convention-sign-panel";
import { EmployeeDisciplineList } from "@/components/convention/employee-discipline-list";
import type { ConventionSignatureStatus, DisciplineRecordEntry } from "@/lib/data/workplace-convention";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

export function ConventionPageClient({
  lang,
  dict,
  status,
  records,
  defaultSignature,
  showDiscipline,
}: {
  lang: Locale;
  dict: Dictionary;
  status: ConventionSignatureStatus;
  records: DisciplineRecordEntry[];
  defaultSignature: string;
  showDiscipline: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex-1 px-4 py-6 sm:px-6">
      <header className="animate-fade-up max-w-3xl">
        <p className="premium-eyebrow">{dict.convention.versionLabel.replace("{version}", status.version)}</p>
        <h1 className="display-title mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {dict.convention.pageTitle}
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">{dict.convention.pageSubtitle}</p>
      </header>

      {showDiscipline && records.length > 0 && (
        <div className="mt-6 max-w-3xl">
          <EmployeeDisciplineList lang={lang} dict={dict} records={records} defaultSignature={defaultSignature} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="order-2 max-w-3xl lg:order-1">
          <ConventionDocument lang={lang} dict={dict} />
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-6">
          <ConventionSignPanel
            lang={lang}
            dict={dict}
            status={status}
            defaultSignature={defaultSignature}
            onSigned={() => router.refresh()}
          />
        </div>
      </div>
    </div>
  );
}
