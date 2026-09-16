/**
 * Pure-module asserts for the backend hardening pass (no DB / no server).
 * Run: npm run test:hardening   (tsx scripts/test-backend-hardening.mjs)
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  evaluateParityEnrollment,
  getClassAvailability,
  poolFree,
} from "../src/lib/dance/parity.ts";
import { centsToCad, isWholeCents, sumCents, toCents } from "../src/lib/money/cents.ts";
import { anonymizedIdentity, isAnonymizedEmail } from "../src/lib/privacy/identity.ts";
import { isAllowedReturnUrl, originOf } from "../src/lib/public-api/return-url.ts";
import { deriveRosterToken, verifyRosterToken } from "../src/lib/studio-api/roster-token.ts";

// ---------------------------------------------------------------- parity: solos consume the pool
{
  const cap = { maxLeads: 6, maxFollows: 6, filledLeads: 5, filledFollows: 5, filledSolos: 2 };
  assert.equal(poolFree(cap), 0, "12 seats, 5L+5F+2S → pool is full");
  const avail = getClassAvailability(cap);
  assert.equal(avail.full, true);
  assert.equal(avail.leadsFree, 0, "a role seat exists only if the shared pool has room");
  assert.equal(avail.followsFree, 0);
  const solo = evaluateParityEnrollment(cap, "SOLO", { allowWaitlist: false });
  assert.equal(solo.ok, false);
  assert.equal(solo.reason, "role_full");
}
{
  // Backwards compatible: filledSolos absent behaves like 0.
  const cap = { maxLeads: 6, maxFollows: 6, filledLeads: 5, filledFollows: 5 };
  assert.equal(poolFree(cap), 2);
}
{
  // 20 Follows racing for the last 2 seats: the parity gate never lets Δ pass 2.
  const cap = { maxLeads: 10, maxFollows: 10, filledLeads: 6, filledFollows: 8 };
  let seated = 0;
  let waitlisted = 0;
  for (let i = 0; i < 20; i += 1) {
    const d = evaluateParityEnrollment(cap, "FOLLOW", { allowWaitlist: true });
    assert.equal(d.ok, true);
    if (d.waitlisted) waitlisted += 1;
    else {
      seated += 1;
      cap.filledFollows += 1;
    }
    assert.ok(cap.filledFollows - cap.filledLeads <= 2, `imbalance breached at i=${i}`);
  }
  assert.equal(seated, 0, "6L/8F is already at Δ2 — no Follow may sit");
  assert.equal(waitlisted, 20);
}

// ---------------------------------------------------------------- money: integer cents only
{
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents("19.99"), 1999);
  assert.equal(toCents(1.005), 101, "half-cent inputs round half-up, never truncate");
  assert.equal(toCents(null), 0);
  assert.equal(toCents(Number.NaN), 0);
  assert.equal(toCents({ toString: () => "45.10" }), 4510, "Prisma Decimal-like objects");
  assert.equal(sumCents([0.1, 0.2, 0.3, "0.4"]), 100);
  assert.equal(centsToCad(100), 1);
  assert.equal(centsToCad(1999), 19.99);
  assert.equal(isWholeCents(12.34), true);
  assert.equal(isWholeCents(12.345), false);
  assert.equal(toCents(-12.5), -1250);
  assert.equal(isWholeCents(Number.POSITIVE_INFINITY), false);

  // Drawer close: float 100 + cash 45.10 + 19.99 + 0.01 → expected 165.10, counted 165.09 → −1 cent.
  const expected = 10000 + sumCents([45.1, 19.99, 0.01]);
  assert.equal(expected, 16510);
  assert.equal(toCents(165.09) - expected, -1);
}

// ---------------------------------------------------------------- privacy: deterministic pseudonyms
{
  const a = anonymizedIdentity("11111111-1111-4111-8111-111111111111");
  const b = anonymizedIdentity("11111111-1111-4111-8111-111111111111");
  const c = anonymizedIdentity("22222222-2222-4222-8222-222222222222");
  assert.deepEqual(a, b, "idempotent");
  assert.notEqual(a.email, c.email);
  assert.ok(isAnonymizedEmail(a.email));
  assert.equal(isAnonymizedEmail("maria@example.com"), false);
  assert.equal(a.fullName, "Élève retiré·e");
}

// ---------------------------------------------------------------- return-URL whitelist (open redirect)
{
  const allowed = new Set(["https://salsaattitude.qc.ca", "http://localhost:3000"]);
  assert.equal(isAllowedReturnUrl("https://salsaattitude.qc.ca/merci?x=1", allowed), true);
  assert.equal(isAllowedReturnUrl("https://salsaattitude.qc.ca.evil.tld/merci", allowed), false);
  assert.equal(isAllowedReturnUrl("https://evil.tld/?next=https://salsaattitude.qc.ca", allowed), false);
  assert.equal(isAllowedReturnUrl("https://user:pw@salsaattitude.qc.ca/", allowed), false, "userinfo tricks");
  assert.equal(isAllowedReturnUrl("javascript:alert(1)", allowed), false);
  assert.equal(isAllowedReturnUrl("//salsaattitude.qc.ca/merci", allowed), false, "protocol-relative");
  assert.equal(isAllowedReturnUrl("HTTPS://SalsaAttitude.qc.ca/", allowed), true, "origin is case-normalised");
  assert.equal(isAllowedReturnUrl(null, allowed), false);
  assert.equal(isAllowedReturnUrl("https://anything.tld/", new Set(["*"])), true);
  assert.equal(originOf("not a url"), null);
}

// ---------------------------------------------------------------- roster token: tenant-bound HMAC
{
  const secret = "0123456789abcdef0123456789abcdef";
  const salsa = deriveRosterToken("salsa-attitude", secret);
  const studioB = deriveRosterToken("studio-b", secret);
  assert.ok(salsa && salsa.startsWith("rk1.salsa-attitude."));
  assert.notEqual(salsa, studioB);
  assert.deepEqual(verifyRosterToken(salsa, secret), { ok: true, organizationSlug: "salsa-attitude" });
  assert.deepEqual(verifyRosterToken(salsa.toUpperCase(), secret), { ok: false }, "tokens are exact-match");

  // Re-labelling Salsa's MAC with Studio B's slug must fail: the slug is inside the MAC.
  const forged = `rk1.studio-b.${salsa.split(".")[2]}`;
  assert.deepEqual(verifyRosterToken(forged, secret), { ok: false });
  assert.deepEqual(verifyRosterToken(salsa, "another-secret-another-secret"), { ok: false });
  assert.deepEqual(verifyRosterToken("rk1.salsa-attitude", secret), { ok: false });
  assert.deepEqual(verifyRosterToken(secret, secret), { ok: false }, "bare secret is not an rk1 token");
  assert.equal(deriveRosterToken("Bad Slug!", secret), null);
  assert.equal(deriveRosterToken("salsa-attitude", "short"), null);

  // CLI printer and server derivation agree.
  const printed = execFileSync(process.execPath, ["scripts/roster-token.mjs", "salsa-attitude"], {
    env: { ...process.env, RITMOKIT_STUDIO_ROSTER_SECRET: secret },
    encoding: "utf8",
  }).trim();
  assert.equal(printed, salsa);
}

console.log("test-backend-hardening: OK");
