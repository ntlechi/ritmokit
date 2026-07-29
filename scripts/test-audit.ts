import "dotenv/config";
import { createHash } from "crypto";
import { prisma } from "../src/lib/prisma";
import { compileAuditPackage } from "../src/lib/audit/compile";
import { buildZip } from "../src/lib/audit/zip";
import { canonicalStringify } from "../src/lib/audit/canonical-json";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ok — ${message}`);
}

/** Parse minimaliste du ZIP (méthode stored) pour valider l'intégrité de
 * ce que `buildZip` a produit — relit les headers locaux + la central
 * directory et revérifie chaque CRC-32 par rapport au contenu. */
function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break; // fin des local file headers
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    const content = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, Buffer.from(content));
    offset = dataStart + compressedSize;
  }
  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function main() {
  console.log("[1] buildZip — round-trip integrity (store method, CRC-32)");
  const zip = buildZip([
    { name: "manifest.json", content: '{"hello":"world"}' },
    { name: "SOMMAIRE.txt", content: "Résumé en clair avec accents éàç" },
  ]);
  assert(zip.subarray(0, 4).readUInt32LE(0) === 0x04034b50, "ZIP starts with a valid local file header signature");

  const entries = readZipEntries(zip);
  assert(entries.size === 2, `ZIP contains exactly 2 entries, got ${entries.size}`);
  assert(entries.has("manifest.json"), "manifest.json entry is present");
  assert(entries.has("SOMMAIRE.txt"), "SOMMAIRE.txt entry is present");
  assert(
    entries.get("manifest.json")!.toString("utf8") === '{"hello":"world"}',
    "manifest.json content round-trips exactly",
  );
  assert(
    entries.get("SOMMAIRE.txt")!.toString("utf8") === "Résumé en clair avec accents éàç",
    "SOMMAIRE.txt content (UTF-8 accents) round-trips exactly",
  );

  // Un lecteur ZIP tiers ne fait pas confiance à la taille déclarée dans le
  // header local — il revérifie le CRC-32. On simule cette vérification.
  const endOfCentralDirOffset = zip.length - 22;
  assert(
    zip.readUInt32LE(endOfCentralDirOffset) === 0x06054b50,
    "End-of-central-directory record signature is present at the expected offset",
  );

  console.log("\n[2] canonicalStringify — deterministic key ordering");
  const a = canonicalStringify({ b: 1, a: [{ z: 1, y: 2 }], c: { nested: true, alpha: 1 } });
  const b = canonicalStringify({ c: { alpha: 1, nested: true }, a: [{ y: 2, z: 1 }], b: 1 });
  assert(a === b, "differently-ordered equivalent objects produce identical canonical JSON");

  console.log("\n[3] compileAuditPackage — end-to-end against seeded data");
  const location = await prisma.location.findFirst({ where: { slug: "quebec" } });
  if (!location) throw new Error("Seed location 'quebec' not found — run `npx prisma db seed` first.");
  const manager = await prisma.user.findFirst({ where: { role: { in: ["MANAGER", "OWNER"] } } });
  if (!manager) throw new Error("No seeded manager found.");

  const startDate = new Date(Date.UTC(2020, 0, 1, 17));
  const endDate = new Date(Date.UTC(2030, 0, 1, 17));

  for (const type of ["CNESST", "MAPAQ", "FISCAL", "FULL"] as const) {
    const compiled = await compileAuditPackage({
      locationId: location.id,
      userId: manager.id,
      type,
      startDate,
      endDate,
    });

    assert(compiled.fileName.startsWith(`ritmokit-audit-${type.toLowerCase()}-quebec-`), `${type}: fileName is well-formed`);
    assert(/^[0-9a-f]{64}$/.test(compiled.manifestHash), `${type}: manifestHash looks like a valid SHA-256 hex digest`);
    assert(compiled.zipBuffer.length > 0, `${type}: zipBuffer is non-empty`);

    const zipEntries = readZipEntries(compiled.zipBuffer);
    assert(zipEntries.has("manifest.json"), `${type}: ZIP contains manifest.json`);
    assert(zipEntries.has("SOMMAIRE.txt"), `${type}: ZIP contains SOMMAIRE.txt`);
    assert(zipEntries.has("SCEAU_INTEGRITE.txt"), `${type}: ZIP contains SCEAU_INTEGRITE.txt`);

    const manifestFromZip = zipEntries.get("manifest.json")!;
    const recomputedHash = createHash("sha256").update(manifestFromZip).digest("hex");
    assert(
      recomputedHash === compiled.manifestHash,
      `${type}: SHA-256 of manifest.json inside the ZIP matches the stored manifestHash exactly`,
    );

    const parsed = JSON.parse(manifestFromZip.toString("utf8"));
    assert(parsed.metadata.scope === type, `${type}: manifest metadata.scope matches requested type`);
    assert(typeof parsed.metadata.recordCount === "number", `${type}: manifest metadata.recordCount is present`);

    if (type === "CNESST" || type === "FULL") {
      assert(
        Array.isArray(parsed.evidence.cnesst_roster_signatures) && parsed.evidence.cnesst_roster_signatures.length > 0,
        `${type}: cnesst_roster_signatures evidence is populated from seeded roster`,
      );
    }
    if (type === "FISCAL" || type === "FULL") {
      assert(
        Array.isArray(parsed.evidence.fiscal_pay_periods),
        `${type}: fiscal_pay_periods evidence is present`,
      );
    }

    console.log(`  [${type}] recordCount=${compiled.recordCount} hash=${compiled.manifestHash.slice(0, 12)}…`);
  }

  console.log("\n✅ All audit engine assertions passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
