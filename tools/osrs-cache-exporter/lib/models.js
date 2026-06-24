import { readFile, writeFile } from "node:fs/promises";
import { decodeContainer } from "./cache.js";

const GLTF_COMPONENT_FLOAT = 5126;
const GLTF_ARRAY_BUFFER = 34962;
const GLTF_TRIANGLES = 4;

export function decodeModel(data, id = null) {
  const source = Buffer.from(data);
  if (source.length < 2) {
    throw new Error("Model data is too small");
  }

  const markerA = source[source.length - 2];
  const markerB = source[source.length - 1];
  if (markerA === 0xff && markerB === 0xfd) {
    return decodeType3Model(source, id);
  }

  if (markerA === 0xff && markerB === 0xfe) {
    throw new Error("Type-2 model decoding is not implemented yet");
  }

  if (markerA === 0xff && markerB === 0xff) {
    throw new Error("Type-1 model decoding is not implemented yet");
  }

  throw new Error("Old-format model decoding is not implemented yet");
}

export async function decodeModelFile(path, id = null) {
  return decodeModel(await readFile(path), id);
}

export async function exportNpcGlb(cache, npc, options = {}) {
  const modelIds = [...new Set(npc.models)].filter((modelId) => Number.isInteger(modelId) && modelId >= 0);
  if (modelIds.length === 0) {
    throw new Error(`NPC ${npc.id} has no decoded model IDs`);
  }

  const models = [];
  const extracted = [];
  for (const modelId of modelIds) {
    const container = await cache.readArchiveContainer(7, modelId);
    const decoded = decodeContainer(container);
    const model = decodeModel(decoded.data, modelId);
    models.push(model);
    extracted.push({
      index: 7,
      archive: modelId,
      compressionName: decoded.compressionName,
      compressedLength: decoded.compressedLength,
      decompressedLength: decoded.decompressedLength,
      vertices: model.vertexCount,
      faces: model.faceCount,
      texturedFaces: model.texturedFaceCount
    });
  }

  const geometry = buildMergedGeometry(models, {
    center: options.center !== false,
    floor: options.floor !== false
  });
  const glb = buildGlb(geometry, {
    name: options.name ?? npc.name ?? `npc-${npc.id}`
  });

  await writeFile(options.outPath, glb);
  return {
    outPath: options.outPath,
    npc: {
      id: npc.id,
      name: npc.name,
      size: npc.size,
      combatLevel: npc.combatLevel,
      models: modelIds,
      animations: npc.animations
    },
    extracted,
    geometry: {
      vertices: geometry.vertexCount,
      faces: geometry.faceCount,
      bounds: geometry.bounds
    }
  };
}

export function decodeType3Model(data, id = null) {
  const stream = new ModelReader(data);
  const textureTypeStream = new ModelReader(data);
  const vertexXStream = new ModelReader(data);
  const vertexYStream = new ModelReader(data);
  const vertexZStream = new ModelReader(data);
  const miscStream = new ModelReader(data);
  const textureCoordStream = new ModelReader(data);

  stream.offset = data.length - 26;
  const vertexCount = stream.u16("vertexCount");
  const faceCount = stream.u16("faceCount");
  const texturedFaceCount = stream.u8("texturedFaceCount");
  const hasFaceRenderTypes = stream.u8("hasFaceRenderTypes");
  const facePriorityFlag = stream.u8("facePriorityFlag");
  const hasFaceAlphas = stream.u8("hasFaceAlphas");
  const hasFaceSkins = stream.u8("hasFaceSkins");
  const hasFaceTextures = stream.u8("hasFaceTextures");
  const hasVertexSkins = stream.u8("hasVertexSkins");
  const hasAnimaya = stream.u8("hasAnimaya");
  const vertexXDataLength = stream.u16("vertexXDataLength");
  const vertexYDataLength = stream.u16("vertexYDataLength");
  const vertexZDataLength = stream.u16("vertexZDataLength");
  const faceIndexDataLength = stream.u16("faceIndexDataLength");
  const textureCoordDataLength = stream.u16("textureCoordDataLength");
  const vertexSkinDataLength = stream.u16("vertexSkinDataLength");

  const textureRenderTypes = new Int8Array(texturedFaceCount);
  let simpleTextureCount = 0;
  let complexTextureCount = 0;
  let cubeTextureCount = 0;
  if (texturedFaceCount > 0) {
    stream.offset = 0;
    for (let index = 0; index < texturedFaceCount; index += 1) {
      const renderType = stream.i8(`textureRenderType[${index}]`);
      textureRenderTypes[index] = renderType;
      if (renderType === 0) simpleTextureCount += 1;
      if (renderType >= 1 && renderType <= 3) complexTextureCount += 1;
      if (renderType === 2) cubeTextureCount += 1;
    }
  }

  let offset = texturedFaceCount + vertexCount;
  const faceRenderTypeOffset = offset;
  if (hasFaceRenderTypes === 1) offset += faceCount;

  const faceIndexTypeOffset = offset;
  offset += faceCount;

  const facePriorityOffset = offset;
  if (facePriorityFlag === 255) offset += faceCount;

  const faceSkinOffset = offset;
  if (hasFaceSkins === 1) offset += faceCount;

  const vertexSkinOffset = offset;
  offset += vertexSkinDataLength;

  const faceAlphaOffset = offset;
  if (hasFaceAlphas === 1) offset += faceCount;

  const faceIndexDataOffset = offset;
  offset += faceIndexDataLength;

  const faceTextureOffset = offset;
  if (hasFaceTextures === 1) offset += faceCount * 2;

  const textureCoordOffset = offset;
  offset += textureCoordDataLength;

  const faceColorOffset = offset;
  offset += faceCount * 2;

  const vertexXOffset = offset;
  offset += vertexXDataLength;

  const vertexYOffset = offset;
  offset += vertexYDataLength;

  const vertexZOffset = offset;
  offset += vertexZDataLength;

  const textureSimpleOffset = offset;
  offset += simpleTextureCount * 6;

  const textureComplex1Offset = offset;
  offset += complexTextureCount * 6;

  const textureComplex2Offset = offset;
  offset += complexTextureCount * 6;

  const textureComplex3Offset = offset;
  offset += complexTextureCount * 2;

  const textureComplex4Offset = offset;
  offset += complexTextureCount;

  const textureComplex5Offset = offset;
  offset += complexTextureCount * 2 + cubeTextureCount * 2;

  const model = createEmptyModel(id, vertexCount, faceCount, texturedFaceCount);
  model.textureRenderTypes = textureRenderTypes;
  if (hasVertexSkins === 1) model.vertexSkins = new Uint16Array(vertexCount);
  if (hasFaceRenderTypes === 1) model.faceRenderTypes = new Int8Array(faceCount);
  if (facePriorityFlag === 255) {
    model.facePriorities = new Int8Array(faceCount);
  } else {
    model.priority = facePriorityFlag;
  }
  if (hasFaceAlphas === 1) model.faceAlphas = new Int8Array(faceCount);
  if (hasFaceSkins === 1) model.faceSkins = new Uint16Array(faceCount);
  if (hasFaceTextures === 1) model.faceTextures = new Int16Array(faceCount);
  if (hasFaceTextures === 1 && texturedFaceCount > 0) model.textureCoords = new Int8Array(faceCount);

  stream.offset = texturedFaceCount;
  vertexXStream.offset = vertexXOffset;
  vertexYStream.offset = vertexYOffset;
  vertexZStream.offset = vertexZOffset;
  miscStream.offset = vertexSkinOffset;

  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const flags = stream.u8(`vertexFlags[${index}]`);
    const dx = (flags & 1) !== 0 ? vertexXStream.shortSmart(`vertexXDelta[${index}]`) : 0;
    const dy = (flags & 2) !== 0 ? vertexYStream.shortSmart(`vertexYDelta[${index}]`) : 0;
    const dz = (flags & 4) !== 0 ? vertexZStream.shortSmart(`vertexZDelta[${index}]`) : 0;

    x += dx;
    y += dy;
    z += dz;
    model.vertexX[index] = x;
    model.vertexY[index] = y;
    model.vertexZ[index] = z;

    if (model.vertexSkins) {
      model.vertexSkins[index] = miscStream.u8(`vertexSkin[${index}]`);
    }
  }

  if (hasAnimaya === 1) {
    for (let index = 0; index < vertexCount; index += 1) {
      const groupCount = miscStream.u8(`animayaGroupCount[${index}]`);
      for (let group = 0; group < groupCount; group += 1) {
        miscStream.u8(`animayaGroup[${index}:${group}]`);
        miscStream.u8(`animayaScale[${index}:${group}]`);
      }
    }
  }

  stream.offset = faceColorOffset;
  textureTypeStream.offset = faceRenderTypeOffset;
  vertexXStream.offset = facePriorityOffset;
  vertexYStream.offset = faceAlphaOffset;
  vertexZStream.offset = faceSkinOffset;
  miscStream.offset = faceTextureOffset;
  textureCoordStream.offset = textureCoordOffset;

  for (let index = 0; index < faceCount; index += 1) {
    model.faceColors[index] = stream.u16(`faceColor[${index}]`);
    if (model.faceRenderTypes) model.faceRenderTypes[index] = textureTypeStream.i8(`faceRenderType[${index}]`);
    if (model.facePriorities) model.facePriorities[index] = vertexXStream.i8(`facePriority[${index}]`);
    if (model.faceAlphas) model.faceAlphas[index] = vertexYStream.i8(`faceAlpha[${index}]`);
    if (model.faceSkins) model.faceSkins[index] = vertexZStream.u8(`faceSkin[${index}]`);
    if (model.faceTextures) model.faceTextures[index] = miscStream.u16(`faceTexture[${index}]`) - 1;
    if (model.textureCoords && model.faceTextures[index] !== -1) {
      model.textureCoords[index] = textureCoordStream.u8(`textureCoord[${index}]`) - 1;
    }
  }

  stream.offset = faceIndexDataOffset;
  textureTypeStream.offset = faceIndexTypeOffset;
  let indexA = 0;
  let indexB = 0;
  let indexC = 0;
  let previous = 0;

  for (let face = 0; face < faceCount; face += 1) {
    const type = textureTypeStream.u8(`faceIndexType[${face}]`);
    if (type === 1) {
      indexA = stream.shortSmart(`faceIndexA[${face}]`) + previous;
      indexB = stream.shortSmart(`faceIndexB[${face}]`) + indexA;
      indexC = stream.shortSmart(`faceIndexC[${face}]`) + indexB;
      previous = indexC;
    } else if (type === 2) {
      indexB = indexC;
      indexC = stream.shortSmart(`faceIndexC[${face}]`) + previous;
      previous = indexC;
    } else if (type === 3) {
      indexA = indexC;
      indexC = stream.shortSmart(`faceIndexC[${face}]`) + previous;
      previous = indexC;
    } else if (type === 4) {
      const oldA = indexA;
      indexA = indexB;
      indexB = oldA;
      indexC = stream.shortSmart(`faceIndexC[${face}]`) + previous;
      previous = indexC;
    } else {
      throw new Error(`Unsupported face index opcode ${type} at face ${face}`);
    }

    model.faceIndices1[face] = indexA;
    model.faceIndices2[face] = indexB;
    model.faceIndices3[face] = indexC;
  }

  stream.offset = textureSimpleOffset;
  textureTypeStream.offset = textureComplex1Offset;
  vertexXStream.offset = textureComplex2Offset;
  vertexYStream.offset = textureComplex3Offset;
  vertexZStream.offset = textureComplex4Offset;
  miscStream.offset = textureComplex5Offset;

  for (let index = 0; index < texturedFaceCount; index += 1) {
    const renderType = textureRenderTypes[index] & 0xff;
    if (renderType === 0) {
      model.texIndices1[index] = stream.u16(`texIndex1[${index}]`);
      model.texIndices2[index] = stream.u16(`texIndex2[${index}]`);
      model.texIndices3[index] = stream.u16(`texIndex3[${index}]`);
    }
  }

  return model;
}

export function buildMergedGeometry(models, options = {}) {
  const positions = [];
  const normals = [];
  const colors = [];
  const colorCache = new Map();

  for (const model of models) {
    for (let face = 0; face < model.faceCount; face += 1) {
      const a = model.faceIndices1[face];
      const b = model.faceIndices2[face];
      const c = model.faceIndices3[face];
      const facePositions = [
        convertedPosition(model, a),
        convertedPosition(model, b),
        convertedPosition(model, c)
      ];
      const normal = computeFaceNormal(facePositions[0], facePositions[1], facePositions[2]);
      const color = colorCache.get(model.faceColors[face])
        ?? osrsHslToRgb(model.faceColors[face]);
      colorCache.set(model.faceColors[face], color);

      for (const position of facePositions) {
        positions.push(...position);
        normals.push(...normal);
        colors.push(...color);
      }
    }
  }

  const bounds = computeBounds(positions);
  if (options.center !== false || options.floor !== false) {
    const centerX = options.center === false ? 0 : (bounds.min[0] + bounds.max[0]) / 2;
    const centerZ = options.center === false ? 0 : (bounds.min[2] + bounds.max[2]) / 2;
    const floorY = options.floor === false ? 0 : bounds.min[1];
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] -= centerX;
      positions[index + 1] -= floorY;
      positions[index + 2] -= centerZ;
    }
  }

  const normalizedBounds = computeBounds(positions);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    vertexCount: positions.length / 3,
    faceCount: positions.length / 9,
    bounds: normalizedBounds
  };
}

export function buildGlb(geometry, options = {}) {
  const buffers = [
    floatBuffer(geometry.positions),
    floatBuffer(geometry.normals),
    floatBuffer(geometry.colors)
  ];
  const bufferViews = [];
  let binLength = 0;
  for (const buffer of buffers) {
    binLength = align4(binLength);
    bufferViews.push({
      buffer: 0,
      byteOffset: binLength,
      byteLength: buffer.length,
      target: GLTF_ARRAY_BUFFER
    });
    binLength += buffer.length;
  }

  const binary = Buffer.alloc(align4(binLength));
  for (let index = 0; index < buffers.length; index += 1) {
    buffers[index].copy(binary, bufferViews[index].byteOffset);
  }

  const gltf = {
    asset: {
      version: "2.0",
      generator: "osrs-yama-p3-helper"
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: options.name ?? "OSRS model", mesh: 0 }],
    meshes: [{
      name: options.name ?? "OSRS model",
      primitives: [{
        attributes: {
          POSITION: 0,
          NORMAL: 1,
          COLOR_0: 2
        },
        material: 0,
        mode: GLTF_TRIANGLES
      }]
    }],
    materials: [{
      name: "OSRS vertex colors",
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1
      }
    }],
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: GLTF_COMPONENT_FLOAT,
        count: geometry.vertexCount,
        type: "VEC3",
        min: geometry.bounds.min,
        max: geometry.bounds.max
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: GLTF_COMPONENT_FLOAT,
        count: geometry.vertexCount,
        type: "VEC3"
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: GLTF_COMPONENT_FLOAT,
        count: geometry.vertexCount,
        type: "VEC3"
      }
    ]
  };

  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const paddedJson = Buffer.concat([json, Buffer.alloc(align4(json.length) - json.length, 0x20)]);
  const totalLength = 12 + 8 + paddedJson.length + 8 + binary.length;
  const output = Buffer.alloc(totalLength);
  let offset = 0;

  output.writeUInt32LE(0x46546c67, offset);
  offset += 4;
  output.writeUInt32LE(2, offset);
  offset += 4;
  output.writeUInt32LE(totalLength, offset);
  offset += 4;
  output.writeUInt32LE(paddedJson.length, offset);
  offset += 4;
  output.writeUInt32LE(0x4e4f534a, offset);
  offset += 4;
  paddedJson.copy(output, offset);
  offset += paddedJson.length;
  output.writeUInt32LE(binary.length, offset);
  offset += 4;
  output.writeUInt32LE(0x004e4942, offset);
  offset += 4;
  binary.copy(output, offset);

  return output;
}

function createEmptyModel(id, vertexCount, faceCount, texturedFaceCount) {
  return {
    id,
    vertexCount,
    faceCount,
    texturedFaceCount,
    vertexX: new Int32Array(vertexCount),
    vertexY: new Int32Array(vertexCount),
    vertexZ: new Int32Array(vertexCount),
    faceIndices1: new Uint32Array(faceCount),
    faceIndices2: new Uint32Array(faceCount),
    faceIndices3: new Uint32Array(faceCount),
    faceColors: new Uint16Array(faceCount),
    textureRenderTypes: new Int8Array(texturedFaceCount),
    texIndices1: new Uint16Array(texturedFaceCount),
    texIndices2: new Uint16Array(texturedFaceCount),
    texIndices3: new Uint16Array(texturedFaceCount),
    priority: 0
  };
}

function convertedPosition(model, index) {
  return [
    model.vertexX[index],
    -model.vertexY[index],
    -model.vertexZ[index]
  ];
}

function computeFaceNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function computeBounds(positions) {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { min, max };
}

function osrsHslToRgb(color) {
  const hue = ((color >> 10) & 0x3f) / 64;
  const saturation = ((color >> 7) & 0x07) / 8;
  const lightness = (color & 0x7f) / 128;
  return hslToRgb(hue, saturation, lightness);
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    return [l, l, l];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, h + 1 / 3),
    hueToRgb(p, q, h),
    hueToRgb(p, q, h - 1 / 3)
  ];
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function floatBuffer(values) {
  const buffer = Buffer.alloc(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    buffer.writeFloatLE(values[index], index * 4);
  }
  return buffer;
}

function align4(value) {
  return (value + 3) & ~3;
}

class ModelReader {
  constructor(data) {
    this.data = Buffer.from(data);
    this.offset = 0;
  }

  u8(label) {
    this.ensure(1, label);
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  i8(label) {
    this.ensure(1, label);
    const value = this.data.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(label) {
    this.ensure(2, label);
    const value = this.data.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  shortSmart(label) {
    this.ensure(1, label);
    if (this.data[this.offset] < 128) {
      return this.u8(label) - 64;
    }

    this.ensure(2, label);
    const value = this.data.readUInt16BE(this.offset) - 0xc000;
    this.offset += 2;
    return value;
  }

  ensure(length, label = "field") {
    if (this.offset + length > this.data.length) {
      throw new Error(`Model ended while reading ${label} at byte ${this.offset}`);
    }
  }
}
