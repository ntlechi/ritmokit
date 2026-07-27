import "dotenv/config";
import pg from "pg";

const ref = "mbxflmutthlqwsknzyyt";

async function test(label, url) {
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    console.log(`${label}: OK`);
    return true;
  } catch {
    console.log(`${label}: FAIL`);
    return false;
  } finally {
    try {
      await client.end();
    } catch {
      /* noop */
    }
  }
}

const txOk = await test("DATABASE_URL (tx-6543)", process.env.DATABASE_URL);
const directOk = await test("DIRECT_DATABASE_URL (session-5432)", process.env.DIRECT_DATABASE_URL);

if (txOk) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query(
    "select (select count(*) from users) as users, (select count(*) from shifts) as shifts",
  );
  console.log(`Data: ${rows[0].users} users, ${rows[0].shifts} shifts`);
  await client.end();
}

process.exit(txOk ? 0 : 1);
