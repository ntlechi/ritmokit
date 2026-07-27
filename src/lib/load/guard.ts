import "server-only";

import { NextResponse, type NextRequest } from "next/server";

/**
 * Guardrails load-test :
 * - ALLOW_LOAD_TEST=1 obligatoire (staging uniquement)
 * - Bearer LOAD_TEST_SECRET
 * - Jamais activé par défaut en production
 */
export function assertLoadTestAccess(request: NextRequest): NextResponse | null {
  if (process.env.ALLOW_LOAD_TEST !== "1") {
    return NextResponse.json({ error: "load_test_disabled" }, { status: 403 });
  }

  const secret = process.env.LOAD_TEST_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "load_test_misconfigured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
