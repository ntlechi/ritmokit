import { retiredModuleResponse } from "@/lib/api/retired-module";

export const runtime = "nodejs";

export async function POST() {
  return retiredModuleResponse("careers_sync");
}
