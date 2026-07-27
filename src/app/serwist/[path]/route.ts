import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

/**
 * The revision busts the precache whenever the git commit changes, so
 * deployed clients never run against a stale offline shell.
 */
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
