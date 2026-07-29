import { NextResponse } from "next/server";

/** Standard 410 response for modules not shipped in RitmoKit studio tenants. */
export function retiredModuleResponse(module: string) {
  return NextResponse.json(
    {
      error: "module_retired",
      module,
      product: "ritmokit",
      message: `${module} is not available in RitmoKit.`,
    },
    { status: 410 },
  );
}
