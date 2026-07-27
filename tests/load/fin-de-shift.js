/**
 * Mirok — charge fin de shift (Vague 2)
 *
 * Simule le pic ~22h : punch-outs concurrents + Pulse (idempotence).
 * Cible : staging miroir UNIQUEMENT (ALLOW_LOAD_TEST=1).
 *
 * Prérequis:
 *   1. Staging déployé avec ALLOW_LOAD_TEST=1 et LOAD_TEST_SECRET
 *   2. k6 installé (https://k6.io/docs/get-started/installation/)
 *   3. Seed fixtures: POST /api/load/seed → écrire tests/load/fixtures.json
 *
 * Usage:
 *   BASE_URL=https://staging.mirok.ca LOAD_TEST_SECRET=... npm run test:load:seed
 *   BASE_URL=https://staging.mirok.ca LOAD_TEST_SECRET=... npm run test:load
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://staging.mirok.ca";
const LOAD_TEST_SECRET = __ENV.LOAD_TEST_SECRET || "";

const punchDuration = new Trend("punch_out_duration", true);
const pulseDuration = new Trend("pulse_submit_duration", true);
const punchOk = new Rate("punch_out_ok");
const pulseIdempotent = new Rate("pulse_idempotency_honored");

export const options = {
  scenarios: {
    punch_out_rush: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 60,
      stages: [
        { duration: "1m", target: 5 },
        // Pic réaliste restaurant: ~10–15 punch-outs/s pendant 3 min
        { duration: "3m", target: 12 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    // 95 % des punch-outs < 2 s (SLA plancher)
    "http_req_duration{name:punch_out}": ["p(95)<2000"],
    // Pulse doit rester snappy même sous burst
    "http_req_duration{name:pulse_submit}": ["p(95)<500"],
    punch_out_ok: ["rate>0.95"],
    // 200 (créé) ou 409 (déjà soumis) = idempotence OK
    pulse_idempotency_honored: ["rate>0.99"],
    http_req_failed: ["rate<0.05"],
  },
};

const fixtures = new SharedArray("fixtures", function () {
  // Généré par scripts/load-seed.mjs → tests/load/fixtures.json
  const data = JSON.parse(open("./fixtures.json"));
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("fixtures.json vide — lancez npm run test:load:seed d'abord");
  }
  return data;
});

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${LOAD_TEST_SECRET}`,
  };
}

export default function () {
  if (!LOAD_TEST_SECRET) {
    throw new Error("LOAD_TEST_SECRET manquant");
  }

  const fixture = fixtures[__ITER % fixtures.length];
  const params = { headers: authHeaders() };

  // 1. Punch-out + chemin CNESST (pause)
  const punchRes = http.post(
    `${BASE_URL}/api/load/punch-out`,
    JSON.stringify({
      userId: fixture.userId,
      shiftId: fixture.shiftId,
    }),
    { ...params, tags: { name: "punch_out" } },
  );

  const punchBody = safeJson(punchRes);
  if (punchBody && typeof punchBody.durationMs === "number") {
    punchDuration.add(punchBody.durationMs);
  }

  const punchSuccess = check(punchRes, {
    "punch_out 200 or 409": (r) => r.status === 200 || r.status === 409,
  });
  punchOk.add(punchSuccess);

  // 2. Pulse — première VU crée, les suivantes doivent recevoir 409 (receipt)
  const pulseRes = http.post(
    `${BASE_URL}/api/load/pulse`,
    JSON.stringify({
      userId: fixture.userId,
      questionId: fixture.questionId,
      locationId: fixture.locationId,
      station: fixture.station,
      score: 3 + (__ITER % 3),
    }),
    { ...params, tags: { name: "pulse_submit" } },
  );

  const pulseBody = safeJson(pulseRes);
  if (pulseBody && typeof pulseBody.durationMs === "number") {
    pulseDuration.add(pulseBody.durationMs);
  }

  const pulseOk = check(pulseRes, {
    "pulse 200 or 409": (r) => r.status === 200 || r.status === 409,
  });
  pulseIdempotent.add(pulseOk);

  sleep(0.5 + Math.random() * 1.5);
}

function safeJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}
