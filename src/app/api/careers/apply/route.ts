import { retiredModuleResponse } from "@/lib/api/retired-module";

export const runtime = "nodejs";

/** Retired careers intake — redirect clients to studio hiring flow. */
export async function POST() {
  return retiredModuleResponse("careers_apply");
}

export async function GET() {
  return retiredModuleResponse("careers_apply");
}
