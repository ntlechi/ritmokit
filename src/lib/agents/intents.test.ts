import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectChatIntent, extractMinutesLate, needsJevLateCheck } from "./intents";

describe("staff chat intent", () => {
  it("flags an explicit late message without Jev", () => {
    assert.deepEqual(detectChatIntent("je serai en retard de 20 minutes"), {
      type: "late_arrival",
      minutesLate: 20,
    });
    assert.equal(needsJevLateCheck("je serai en retard de 20 minutes"), false);
  });

  it("leaves ordinary class talk alone", () => {
    assert.deepEqual(detectChatIntent("Bachata 2 est complet ce soir"), { type: "none" });
    assert.equal(needsJevLateCheck("Bachata 2 est complet ce soir"), false);
  });

  it("sends a personal-delay paraphrase to Jev", () => {
    const body = "je serai là dans 20 minutes, pris dans le trafic";
    assert.deepEqual(detectChatIntent(body), { type: "none" });
    assert.equal(needsJevLateCheck(body), true);
    assert.equal(extractMinutesLate(body), 20);
  });
});
