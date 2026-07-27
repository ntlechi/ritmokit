import "server-only";

/**
 * Writer ZIP minimal (méthode STORED — sans compression) implémentant
 * strictement le format PKZIP (local file headers + central directory +
 * end-of-central-directory), sans dépendance externe. Suffisant pour
 * quelques fichiers texte (manifeste JSON + sommaire) où la compression
 * n'apporte rien à la valeur probante du dossier — seule l'intégrité
 * (CRC-32 + hash SHA-256 du manifeste, calculé en amont) compte.
 *
 * Références : PKWARE .ZIP File Format Specification, section 4.3.
 */

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20;
const STORED_METHOD = 0;

export type ZipEntry = { name: string; content: string | Buffer };

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time & 0xffff, date: dosDate & 0xffff };
}

/** Construit un fichier ZIP (méthode stored) à partir d'entrées texte/binaires. */
export function buildZip(entries: ZipEntry[], generatedAt: Date = new Date()): Buffer {
  const { time: dosTime, date: dosDate } = toDosDateTime(generatedAt);
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const contentBuf = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8");
    const crc = crc32(contentBuf);
    const size = contentBuf.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(STORED_METHOD, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed size == uncompressed (stored)
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuf, contentBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    centralHeader.writeUInt16LE(VERSION_NEEDED, 4); // version made by
    centralHeader.writeUInt16LE(VERSION_NEEDED, 6); // version needed to extract
    centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(STORED_METHOD, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external file attributes (-rw-r--r--)
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + contentBuf.length;
  }

  const centralDirectorySize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const centralDirectoryOffset = offset;

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // disk where central directory starts
  endRecord.writeUInt16LE(entries.length, 8); // entries on this disk
  endRecord.writeUInt16LE(entries.length, 10); // total entries
  endRecord.writeUInt32LE(centralDirectorySize, 12);
  endRecord.writeUInt32LE(centralDirectoryOffset, 16);
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, ...centralChunks, endRecord]);
}
