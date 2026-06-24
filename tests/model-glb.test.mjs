import assert from "node:assert/strict";
import { buildGlb, buildMergedGeometry, decodeModel } from "../tools/osrs-cache-exporter/lib/models.js";

const model = decodeModel(createType3Triangle(), 1);
assert.equal(model.id, 1);
assert.equal(model.vertexCount, 3);
assert.equal(model.faceCount, 1);
assert.deepEqual([...model.vertexX], [0, 128, 0]);
assert.deepEqual([...model.vertexY], [0, 0, 0]);
assert.deepEqual([...model.vertexZ], [0, 0, 128]);
assert.deepEqual([...model.faceIndices1], [0]);
assert.deepEqual([...model.faceIndices2], [1]);
assert.deepEqual([...model.faceIndices3], [2]);
assert.deepEqual([...model.faceColors], [0x55aa]);

const geometry = buildMergedGeometry([model]);
assert.equal(geometry.vertexCount, 3);
assert.equal(geometry.faceCount, 1);
assert.deepEqual(geometry.bounds.min, [-64, 0, -64]);
assert.deepEqual(geometry.bounds.max, [64, 0, 64]);

const glb = buildGlb(geometry, { name: "triangle" });
assert.equal(glb.readUInt32LE(0), 0x46546c67);
assert.equal(glb.readUInt32LE(4), 2);
assert.equal(glb.readUInt32LE(8), glb.length);
assert.equal(glb.readUInt32LE(16), 0x4e4f534a);

console.log("model/glb tests passed");

function createType3Triangle() {
  const vertexFlags = Buffer.from([0, 1, 5]);
  const faceIndexTypes = Buffer.from([1]);
  const faceIndexData = Buffer.from([
    ...shortSmart(0),
    ...shortSmart(1),
    ...shortSmart(1)
  ]);
  const faceColors = u16(0x55aa);
  const vertexXData = Buffer.from([
    ...shortSmart(128),
    ...shortSmart(-128)
  ]);
  const vertexYData = Buffer.alloc(0);
  const vertexZData = Buffer.from(shortSmart(128));
  const trailer = Buffer.from([0, 0]);

  const body = Buffer.concat([
    vertexFlags,
    faceIndexTypes,
    faceIndexData,
    faceColors,
    vertexXData,
    vertexYData,
    vertexZData,
    trailer
  ]);

  const header = Buffer.concat([
    u16(3),
    u16(1),
    u8(0),
    u8(0),
    u8(0),
    u8(0),
    u8(0),
    u8(0),
    u8(0),
    u8(0),
    u16(vertexXData.length),
    u16(vertexYData.length),
    u16(vertexZData.length),
    u16(faceIndexData.length),
    u16(0),
    u16(0),
    Buffer.from([0xff, 0xfd])
  ]);

  return Buffer.concat([body, header]);
}

function shortSmart(value) {
  if (value >= -64 && value < 64) {
    return [value + 64];
  }

  const encoded = value + 0xc000;
  return [(encoded >> 8) & 0xff, encoded & 0xff];
}

function u8(value) {
  return Buffer.from([value]);
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}
