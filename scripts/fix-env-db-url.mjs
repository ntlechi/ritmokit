import fs from "node:fs";
import pg from "pg";

const envPath = ".env";
const raw = fs.readFileSync(envPath, "utf8");
const ref = "mbxflmutthlqwsknzyyt";

function extractPassword(line) {
  const m = line.match(/postgres\.[^:]+:(.+)@aws-/);
  return m?.[1] ?? null;
}

const directLine = raw.split("\n").find((l) => l.startsWith("DIRECT_DATABASE_URL="));
const pwd = directLine ? extractPassword(directLine) : null;
if (!pwd) {
  console.error("Could not extract password from DIRECT_DATABASE_URL");
  process.exit(1);
}

const enc = encodeURIComponent(pwd);
let workingHost = null;

for (const n of [0, 1, 2]) {
  const host = `aws-${n}-ca-central-1.pooler.supabase.com`;
  const url = `postgresql://postgres.${ref}:${enc}@${host}:5432/postgres`;
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    workingHost = host;
    await client.end();
    break;
  } catch (e) {
    const msg = String(e.message).split("\n")[0];
    if (!msg.includes("ENOTFOUND")) console.log(`${host}: ${msg}`);
  }
  try {
    await client.end();
  } catch {
    /* noop */
  }
}

if (!workingHost) {
  console.error("No working pooler found on aws-0/1/2 ca-central-1");
  process.exit(1);
}

const databaseUrl = `postgresql://postgres.${ref}:${enc}@${workingHost}:6543/postgres?pgbouncer=true`;
const directUrl = `postgresql://postgres.${ref}:${enc}@${workingHost}:5432/postgres`;

const out = raw
  .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${databaseUrl}"`)
  .replace(/^DIRECT_DATABASE_URL=.*$/m, `DIRECT_DATABASE_URL="${directUrl}"`);

fs.writeFileSync(envPath, out);
console.log(`Fixed .env: URL-encoded password + pooler host -> ${workingHost}`);
