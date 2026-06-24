import assert from "node:assert/strict";
import { decodeNpcDefinition, npcSummaryRow } from "../tools/osrs-cache-exporter/lib/configs.js";
import { unpackGroupFiles } from "../tools/osrs-cache-exporter/lib/group.js";

const packed = packGroupFiles([
  [Buffer.from("aa"), Buffer.from("bbb"), Buffer.from("ccccc")],
  [Buffer.from("d"), Buffer.from("eeee"), Buffer.from("ffff")]
]);

const files = unpackGroupFiles(packed, [0, 2, 5]);
assert.equal(files.length, 3);
assert.equal(files[0].id, 0);
assert.equal(files[0].data.toString("utf8"), "aad");
assert.equal(files[1].id, 2);
assert.equal(files[1].data.toString("utf8"), "bbbeeee");
assert.equal(files[2].id, 5);
assert.equal(files[2].data.toString("utf8"), "cccccffff");

const npcData = Buffer.concat([
  u8(1),
  u8(2),
  u16(100),
  u16(101),
  u8(2),
  str("Yama"),
  u8(12),
  u8(5),
  u8(13),
  u16(200),
  u8(14),
  u16(201),
  u8(30),
  str("Attack"),
  u8(95),
  u16(800),
  u8(97),
  u16(160),
  u8(98),
  u16(170),
  u8(249),
  u8(2),
  u8(1),
  medium(0x123456),
  str("value"),
  u8(0),
  medium(7),
  i32(42),
  u8(0)
]);

const npc = decodeNpcDefinition(npcData, 1234);
assert.equal(npc.id, 1234);
assert.equal(npc.name, "Yama");
assert.deepEqual(npc.models, [100, 101]);
assert.equal(npc.size, 5);
assert.equal(npc.animations.idle, 200);
assert.equal(npc.animations.walk, 201);
assert.equal(npc.actions[0], "Attack");
assert.equal(npc.combatLevel, 800);
assert.equal(npc.widthScale, 160);
assert.equal(npc.heightScale, 170);
assert.equal(npc.params[0x123456], "value");
assert.equal(npc.params[7], 42);
assert.equal(npc.decodeError, null);

const row = npcSummaryRow(npc);
assert.equal(row.models, "100,101");
assert.equal(row.actions, "Attack");

const partial = decodeNpcDefinition(Buffer.concat([u8(2), str("Partial"), u8(222)]), 4321, { tolerant: true });
assert.equal(partial.name, "Partial");
assert.match(partial.decodeError, /Unsupported NPC opcode 222/);

const model32 = decodeNpcDefinition(Buffer.concat([
  u8(61),
  u8(3),
  u32(10468),
  u32(10338),
  u32(10340),
  u8(2),
  str("Model32"),
  u8(0)
]), 5678);
assert.deepEqual(model32.models, [10468, 10338, 10340]);
assert.equal(model32.name, "Model32");

console.log("group/config tests passed");

function packGroupFiles(chunks) {
  const fileCount = chunks[0].length;
  const data = [];
  const table = [];

  for (const chunk of chunks) {
    let previousSize = 0;
    for (let file = 0; file < fileCount; file += 1) {
      const part = chunk[file];
      data.push(part);
      table.push(i32(part.length - previousSize));
      previousSize = part.length;
    }
  }

  return Buffer.concat([...data, ...table, u8(chunks.length)]);
}

function str(value) {
  return Buffer.concat([Buffer.from(value, "latin1"), u8(0)]);
}

function u8(value) {
  return Buffer.from([value]);
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function i32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function medium(value) {
  return Buffer.from([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}
