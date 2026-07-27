/**
 * E2E without Next server: create JobApplication + push to Arsimatrix.
 * Requires Arsimatrix on :3100 and migrated DB.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  pushApplicationsToArsimatrix,
  toMirokWire,
} from "../src/lib/arsimatrix/bridge";

async function main() {
  const location = await prisma.location.findFirst({
    where: { isActive: true },
  });
  if (!location) throw new Error("No active location");

  const app = await prisma.jobApplication.create({
    data: {
      locationId: location.id,
      fullName: "Hugo Martel (smoke)",
      neighborhood: "Orsainville",
      availableShifts: ["SOIR", "FERMETURE"],
      commuteMinutes: 15,
      yearsExperience: 5,
      hasFoodPermit: true,
      speaksFrench: true,
      notes: "smoke-arsimatrix-apply",
      status: "TRIAGING",
    },
  });

  const wire = toMirokWire(app, location);
  const push = await pushApplicationsToArsimatrix([wire], {
    site: wire.site,
    requiredShifts: ["soir"],
  });

  console.log(JSON.stringify({ applicationId: app.id, push }, null, 2));

  if (push.ok) {
    const report = (
      push.data as {
        report?: {
          payload?: {
            shortlisted?: Array<{ candidateId: string; score: number; reasons: string[] }>;
            rejected?: Array<{ candidateId: string; reasons: string[] }>;
            summary?: string;
          };
          context?: { traceId?: string };
        };
      }
    )?.report;
    const short = report?.payload?.shortlisted?.find((s) => s.candidateId === app.id);
    const rej = report?.payload?.rejected?.find((r) => r.candidateId === app.id);
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: {
        status: short ? "SHORTLISTED" : "REJECTED",
        triageScore: short?.score ?? null,
        triageReasons: short?.reasons ?? rej?.reasons ?? [],
        triageSummary: report?.payload?.summary ?? null,
        triagedAt: new Date(),
        arsimatrixTraceId: report?.context?.traceId,
      },
    });
  }

  process.exit(push.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
