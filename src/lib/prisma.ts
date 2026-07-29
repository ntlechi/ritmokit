import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getRuntimeDatabaseUrl } from "@/lib/prisma/db-url";

/**
 * Prisma ORM v7 requires an explicit driver adapter — the Rust query
 * engine is gone. We connect straight to Supabase Postgres via `pg`.
 *
 * Lazy init + global singleton: no DB connection at import time (safe for
 * `next build` page-data collection) and one pool per warm serverless instance.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: getRuntimeDatabaseUrl(),
  });

  return new PrismaClient({ adapter });
}

function isPrismaClientReady(client: PrismaClient) {
  const probe = client as PrismaClient & Record<string, unknown>;
  const requiredDelegates = [
    "locationMember",
    "station",
    "timeOffRequest",
    "employeeHrProfile",
    "formationModule",
    "employeeFormationProgress",
    "stationShoutOut",
    "organizationValue",
    "pulseResponse",
    "pulseReceipt",
  ] as const;
  return requiredDelegates.every((key) => typeof probe[key] !== "undefined");
}

function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  if (cached && isPrismaClientReady(cached)) return cached;

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (prop === "then") return undefined;
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
