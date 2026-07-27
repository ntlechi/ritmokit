import { NextResponse, type NextRequest } from "next/server";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Re-téléchargement d'un export de paie déjà généré — sert le CSV figé tel
 * que produit au moment de l'export (`PayrollExport.csvContent`), jamais
 * recalculé, pour garantir qu'un même lien renvoie toujours le fichier
 * réellement transmis au fournisseur de paie.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ exportId: string }> }) {
  const { exportId } = await context.params;

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

  const exportRow = await prisma.payrollExport.findFirst({
    where: { id: exportId, payPeriod: { locationId: membership.locationId } },
  });
  if (!exportRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(exportRow.csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportRow.fileName}"`,
    },
  });
}
