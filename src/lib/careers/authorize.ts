import type { NextRequest } from "next/server";

/**
 * Shared bearer check for careers bridge endpoints.
 * Fail-closed in production when no secret is configured.
 * Local/dev open only with explicit ALLOW_OPEN_CAREERS=1.
 */
export function authorizeCareersRequest(request: NextRequest): boolean {
  const secret =
    process.env.MIROK_CAREERS_SECRET?.trim() ||
    process.env.ARSIMATRIX_BRIDGE_SECRET?.trim();

  if (!secret) {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_OPEN_CAREERS === "1"
    );
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}
