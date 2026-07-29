import { retiredModuleResponse } from "@/lib/api/retired-module";

export const runtime = "nodejs";

export async function GET() {
  return retiredModuleResponse("careers_applications");
}

export async function POST() {
  return retiredModuleResponse("careers_applications");
}
