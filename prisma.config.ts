import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations run DDL, which the transaction-mode pooler (port 6543)
    // can't handle reliably — use the direct connection (port 5432) here.
    // The app itself still talks to the pooler via DATABASE_URL at runtime
    // (see src/lib/prisma.ts).
    url: env("DIRECT_DATABASE_URL"),
  },
});
