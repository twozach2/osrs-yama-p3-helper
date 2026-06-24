import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Js5DiskCache } from "../tools/osrs-cache-exporter/lib/cache.js";
import { readReferenceTable } from "../tools/osrs-cache-exporter/lib/reference-table.js";

const TMP = join(process.cwd(), "tests", ".tmp-cache");
const SECTOR_SIZE = 520;

await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const noneContainer = Buffer.concat([
  Buffer.from([0]),
  uint32(4),
  Buffer.from("none")
]);
const gzipData = Buffer.from("gzip-data");
const gzipContainer = Buffer.concat([
  Buffer.from([2]),
  uint32(gzipSync(gzipData).length),
  uint32(gzipData.length),
  gzipSync(gzipData)
]);
const referenceData = Buffer.concat([
  Buffer.from([7]),
  uint32(0),
  Buffer.from([0]),
  uint16(1),
  uint16(0),
  uint32(0x12345678),
  uint32(1),
  uint16(1),
  uint16(0)
]);
const referenceContainer = Buffer.concat([
  Buffer.from([0]),
  uint32(referenceData.length),
  referenceData
]);

const dat2 = Buffer.alloc(SECTOR_SIZE * 5);
writeSector(dat2, 1, 7, 0, 0, 0, noneContainer);
writeSector(dat2, 2, 7, 1, 0, 0, gzipContainer);
writeSector(dat2, 3, 255, 7, 0, 0, referenceContainer);
await writeFile(join(TMP, "main_file_cache.dat2"), dat2);

const idx7 = Buffer.alloc(12);
writeIndexEntry(idx7, 0, noneContainer.length, 1);
writeIndexEntry(idx7, 1, gzipContainer.length, 2);
await writeFile(join(TMP, "main_file_cache.idx7"), idx7);

const idx255 = Buffer.alloc(48);
writeIndexEntry(idx255, 7, referenceContainer.length, 3);
await writeFile(join(TMP, "main_file_cache.idx255"), idx255);

const cache = new Js5DiskCache(TMP);
const indices = await cache.validate();
assert.equal(indices.length, 2);
assert.equal(indices.find((index) => index.id === 7).archives, 2);
assert.equal(indices.find((index) => index.id === 255).archives, 8);

const none = await cache.readArchive(7, 0);
assert.equal(none.compressionName, "none");
assert.equal(none.data.toString("utf8"), "none");

const gzip = await cache.readArchive(7, 1);
assert.equal(gzip.compressionName, "gzip");
assert.equal(gzip.data.toString("utf8"), "gzip-data");

const referenceTable = await readReferenceTable(cache, 7);
assert.equal(referenceTable.indexName, "models");
assert.equal(referenceTable.archiveCount, 1);
assert.equal(referenceTable.archives[0].crc, 0x12345678);
assert.equal(referenceTable.archives[0].files[0].id, 0);

await rm(TMP, { recursive: true, force: true });
console.log("cache reader tests passed");

function writeSector(dat2, sector, indexId, archiveId, chunk, nextSector, payload) {
  const offset = sector * SECTOR_SIZE;
  dat2.writeUInt16BE(archiveId, offset);
  dat2.writeUInt16BE(chunk, offset + 2);
  writeMedium(dat2, offset + 4, nextSector);
  dat2.writeUInt8(indexId, offset + 7);
  payload.copy(dat2, offset + 8);
}

function writeIndexEntry(index, archiveId, length, sector) {
  const offset = archiveId * 6;
  writeMedium(index, offset, length);
  writeMedium(index, offset + 3, sector);
}

function writeMedium(buffer, offset, value) {
  buffer[offset] = (value >> 16) & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = value & 0xff;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}
