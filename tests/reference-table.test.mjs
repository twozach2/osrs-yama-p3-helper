import assert from "node:assert/strict";
import { parseReferenceTable, referenceArchiveRows, summarizeReferenceTable } from "../tools/osrs-cache-exporter/lib/reference-table.js";

const namedTable = Buffer.concat([
  u8(7),
  u32(42),
  u8(1),
  largeSmart(2),
  largeSmart(5),
  largeSmart(3),
  u32(0x11111111),
  u32(0x22222222),
  u32(0x33333333),
  u32(0x44444444),
  u32(1),
  u32(2),
  largeSmart(2),
  largeSmart(1),
  largeSmart(0),
  largeSmart(4),
  largeSmart(2),
  u32(0xaaaaaaaa),
  u32(0xbbbbbbbb),
  u32(0xcccccccc)
]);

const parsed = parseReferenceTable(namedTable, { indexId: 7 });
assert.equal(parsed.indexId, 7);
assert.equal(parsed.indexName, "models");
assert.equal(parsed.protocol, 7);
assert.equal(parsed.revision, 42);
assert.deepEqual(parsed.flagNames, ["names"]);
assert.equal(parsed.archiveCount, 2);
assert.equal(parsed.maxArchiveId, 8);
assert.equal(parsed.totalFiles, 3);
assert.equal(parsed.namedArchives, 2);
assert.equal(parsed.namedFiles, 3);
assert.equal(parsed.trailingBytes, 0);
assert.deepEqual(parsed.archives.map((archive) => archive.id), [5, 8]);
assert.deepEqual(parsed.archives[0].files.map((file) => file.id), [0, 4]);
assert.deepEqual(parsed.archives[1].files.map((file) => file.id), [2]);

const summary = summarizeReferenceTable(parsed);
assert.equal(summary.name, "models");
assert.equal(summary.archives, 2);
assert.equal(summary.files, 3);

const rows = referenceArchiveRows(parsed, { limit: 2 });
assert.equal(rows[0].archive, 5);
assert.equal(rows[0].nameHash, "0x11111111");
assert.equal(rows[0].crc, "0x33333333");
assert.equal(rows[1].archive, 8);

const largeSmartTable = Buffer.concat([
  u8(7),
  u32(0),
  u8(0),
  largeSmart(1),
  largeSmart(40000),
  u32(0x12345678),
  u32(9),
  largeSmart(1),
  largeSmart(0)
]);

const largeParsed = parseReferenceTable(largeSmartTable, { indexId: 8 });
assert.equal(largeParsed.archiveCount, 1);
assert.equal(largeParsed.maxArchiveId, 40000);
assert.equal(largeParsed.archives[0].files[0].id, 0);

console.log("reference table tests passed");

function u8(value) {
  return Buffer.from([value]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function largeSmart(value) {
  if (value < 32768) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16BE(value);
    return buffer;
  }

  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(0x80000000 + value);
  return buffer;
}
