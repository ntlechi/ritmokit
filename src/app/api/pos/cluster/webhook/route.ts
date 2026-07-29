import { retiredModuleResponse } from "@/lib/api/retired-module";

export const runtime = "nodejs";

/** Retired POS webhook — not used in RitmoKit. */
export async function POST() {
  return retiredModuleResponse("pos_cluster_webhook");
}
