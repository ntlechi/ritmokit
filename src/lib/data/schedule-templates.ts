import "server-only";

import { prisma } from "@/lib/prisma";

export type ScheduleTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  shiftCount: number;
  assignedCount: number;
  updatedAt: string;
};

export async function getScheduleTemplatesForLocation(
  locationId: string,
): Promise<ScheduleTemplateSummary[]> {
  const rows = await prisma.scheduleTemplate.findMany({
    where: { locationId },
    include: {
      _count: { select: { shifts: true } },
      shifts: {
        where: { employeeId: { not: null } },
        select: { id: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    shiftCount: row._count.shifts,
    assignedCount: row.shifts.length,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
