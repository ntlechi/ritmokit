import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const locs = await prisma.location.findMany({
    take: 8,
    select: { id: true, name: true, slug: true, city: true, isActive: true },
  });
  console.log(JSON.stringify(locs, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
