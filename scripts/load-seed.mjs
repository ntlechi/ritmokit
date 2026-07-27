/**
 * Seed fixtures for k6 — POST /api/load/seed → tests/load/fixtures.json
 *
 * Usage:
 *   BASE_URL=https://staging.mirok.ca LOAD_TEST_SECRET=xxx node scripts/load-seed.mjs
 *   BASE_URL=... LOAD_TEST_SECRET=... LOCATION_ID=... COUNT=40 node scripts/load-seed.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.LOAD_TEST_SECRET;
const LOCATION_ID = process.env.LOCATION_ID;
const COUNT = Number(process.env.COUNT || 40);

if (!SECRET) {
  console.error("LOAD_TEST_SECRET is required");
  process.exit(1);
}

const body = { count: COUNT };
if (LOCATION_ID) body.locationId = LOCATION_ID;

const res = await fetch(`${BASE_URL}/api/load/seed`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SECRET}`,
  },
  body: JSON.stringify(body),
});

const json = await res.json();
if (!res.ok || !json.ok) {
  console.error("Seed failed:", res.status, json);
  process.exit(1);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "load");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "fixtures.json");
writeFileSync(outFile, JSON.stringify(json.fixtures, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      count: json.count,
      weekNumber: json.weekNumber,
      year: json.year,
      fixturesFile: outFile,
    },
    null,
    2,
  ),
);
