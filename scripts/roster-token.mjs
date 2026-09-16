/**
 * Print the tenant-bound roster token for a studio proxy.
 *   RITMOKIT_STUDIO_ROSTER_SECRET=… node scripts/roster-token.mjs salsa-attitude
 * Hand the printed `rk1.…` value to that tenant's Vercel proxy — never the secret.
 */
import { createHmac } from "node:crypto";

const slug = (process.argv[2] ?? "").trim().toLowerCase();
const secret = (process.env.RITMOKIT_STUDIO_ROSTER_SECRET ?? "").trim();

if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
  console.error("usage: node scripts/roster-token.mjs <organizationSlug>");
  process.exit(1);
}
if (secret.length < 16) {
  console.error("RITMOKIT_STUDIO_ROSTER_SECRET must be set (≥16 chars).");
  process.exit(1);
}

const mac = createHmac("sha256", secret).update(slug).digest("hex").slice(0, 32);
console.log(`rk1.${slug}.${mac}`);
