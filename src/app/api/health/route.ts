import { NextResponse } from "next/server";
import { describeDatabaseUrl } from "@/lib/prisma/db-url";

/**
 * Lightweight deploy diagnostic — booleans only, never secret values.
 * Visit /api/health after setting Vercel env vars to confirm they loaded.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const databaseUrl = process.env.DATABASE_URL;
  const dbShape = describeDatabaseUrl(databaseUrl);

  let dbOk = false;
  let dbError: string | null = null;
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "db_ping_failed";
  }

  return NextResponse.json({
    ok: Boolean(supabaseUrl && anonKey && dbShape.startsWithPostgres && dbOk),
    env: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anonKey),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      DATABASE_URL: Boolean(databaseUrl?.trim()),
      DIRECT_DATABASE_URL: Boolean(process.env.DIRECT_DATABASE_URL?.trim()),
      AGENT_WEBHOOK_SECRET: Boolean(process.env.AGENT_WEBHOOK_SECRET?.trim()),
    },
    database: {
      ok: dbOk,
      ...dbShape,
      error: dbError,
      hint: !dbShape.startsWithPostgres
        ? "Paste the FULL connection string starting with postgresql:// (copy from local .env DATABASE_URL, without quotes)."
        : dbShape.has5432 && !dbShape.has6543
          ? "DATABASE_URL is on port 5432 — prefer Transaction pooler port 6543 for runtime."
          : null,
    },
    supabaseProjectRef: supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  });
}
