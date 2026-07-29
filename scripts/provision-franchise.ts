/**
 * CLI — provision a new dance studio tenant on DATABASE_URL.
 *
 * Usage:
 *   npx tsx scripts/provision-franchise.ts \
 *     --org "Salsa Attitude" --org-slug salsa-attitude \
 *     --location "Salsa Attitude — Québec" --location-slug quebec \
 *     --owner-id <uuid-auth-user> \
 *     [--city Québec] [--lat 46.8139] [--lng -71.208]
 *
 * After provisioning, seed dance rooms + demo data:
 *   npm run seed:dance-stations -- <locationId>
 *   npm run seed:dance-demo -- <locationId>
 */
import "dotenv/config";
import { provisionNewStudioFranchise } from "../src/lib/production/provision-franchise";

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

  const result = await provisionNewStudioFranchise({
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
  console.log("\nNext: npm run seed:dance-stations --", result.locationId);
  console.log("       npm run seed:dance-demo --", result.locationId);
}

main().catch((error) => {
  console.error("[provision:franchise]", error instanceof Error ? error.message : error);
  process.exit(1);
});
