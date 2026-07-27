import { NextResponse, type NextRequest } from "next/server";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Sert le ZIP scellé tel qu'enregistré au moment de la génération
 * (`AuditPackageLog.packageData`) — jamais recompilé, pour garantir que le
 * hash SHA-256 remis à l'inspecteur reste vérifiable indéfiniment, même si
 * les données sous-jacentes (quarts, signatures…) changent depuis.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ auditPackageLogId: string }> }) {
  const { auditPackageLogId } = await context.params;

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const packageLog = await prisma.auditPackageLog.findFirst({
    where: { id: auditPackageLogId, locationId: membership.locationId },
  });
  if (!packageLog) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(packageLog.packageData), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${packageLog.fileName}"`,
    },
  });
}
