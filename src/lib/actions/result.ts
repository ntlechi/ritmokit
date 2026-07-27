import "server-only";

/** Shared Server Action error surfacing — always log before returning to the client. */

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

export function logActionError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ritmokit:action:${scope}]`, message, error);
}

/** Generic DB/unknown failure after logging. */
export function actionDatabaseError(
  scope: string,
  error: unknown,
): { ok: false; error: "database_error" } {
  logActionError(scope, error);
  return { ok: false, error: "database_error" };
}

/** Prefer CNESST:… messages when present; otherwise database_error. */
export function actionErrorFromUnknown(
  scope: string,
  error: unknown,
): { ok: false; error: string } {
  logActionError(scope, error);
  const message = error instanceof Error ? error.message : String(error);
  const cnesstMatch = message.match(/CNESST:[^\n"]*/);
  return { ok: false, error: cnesstMatch ? cnesstMatch[0] : "database_error" };
}
