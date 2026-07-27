/**
 * CLI — provisionne une franchise Bati sur la DB pointée par DATABASE_URL.
 *
 * Usage:
 *   npx tsx scripts/provision-franchise.ts \
 *     --org "Bati Québec" --org-slug bati \
 *     --location "Bati — Québec Centre" --location-slug quebec-centre \
 *     --owner-id <uuid-auth-user> \
 *     [--city Québec] [--lat 46.8139] [--lng -71.208]
 *
 * Guardrails:
 * - Requires DIRECT_DATABASE_URL for migrations separately (not this script).
 * - Owner user must already exist (Supabase Auth → public.users sync).
 * - Never run against production without staging rehearsal.
 */
import "dotenv/config";
import { provisionNewBatiFranchise } from "../src/lib/production/provision-franchise";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function requireArg(name: string): string {
  const value = arg(name);
  if (!value) {
    console.error(`Missing required --${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const orgName = requireArg("org");
  const orgSlug = arg("org-slug") ?? orgName;
  const locationName = requireArg("location");
  const locationSlug = arg("location-slug") ?? locationName;
  const ownerUserId = requireArg("owner-id");
  const city = arg("city");
  const lat = arg("lat");
  const lng = arg("lng");

  const result = await provisionNewBatiFranchise({
    orgName,
    orgSlug,
    locationName,
    locationSlug,
    ownerUserId,
    city,
    latitude: lat ? Number(lat) : undefined,
    longitude: lng ? Number(lng) : undefined,
    timezone: "America/Toronto",
    geofenceRadiusMeters: 150,
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error("[provision:franchise]", error instanceof Error ? error.message : error);
  process.exit(1);
});
