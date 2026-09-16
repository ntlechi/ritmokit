"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { staffScope } from "@/lib/dance/tenant-scope";
import { anonymizeStudent } from "@/lib/privacy/anonymize-student";

const schema = z.object({
  studentId: z.string().uuid(),
  lang: z.string().min(2).max(5),
});

/**
 * Manager-only: honour a student's erasure request (Loi 25 art. 28.1).
 * Identity is pseudonymized; the financial ledger is untouched.
 */
export async function anonymizeStudentAction(
  input: z.infer<typeof schema>,
): Promise<SimpleActionResult & { alreadyAnonymized?: boolean }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!canAccessManagerSettings(user.role)) return { ok: false, error: "forbidden" };

  try {
    const scope = await staffScope(user);
    const result = await anonymizeStudent({
      studentId: parsed.data.studentId,
      scopeLocationIds: scope.locationIds,
    });
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath(`/${parsed.data.lang}/students`, "page");
    revalidatePath(`/${parsed.data.lang}/accueil`, "page");
    return { ok: true, alreadyAnonymized: result.alreadyAnonymized };
  } catch (error) {
    return actionDatabaseError("privacy.anonymize", error);
  }
}
