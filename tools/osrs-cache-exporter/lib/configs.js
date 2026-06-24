import { readGroupFiles } from "./group.js";

export const CONFIG_INDEX = 2;
export const NPC_CONFIG_ARCHIVE = 9;

export async function readNpcDefinitions(cache) {
  const group = await readGroupFiles(cache, CONFIG_INDEX, NPC_CONFIG_ARCHIVE);
  const definitions = [];
  const failures = [];

  for (const file of group.files) {
    try {
      definitions.push(decodeNpcDefinition(file.data, file.id, { tolerant: true }));
    } catch (error) {
      failures.push({
        id: file.id,
        error: error.message
      });
    }
  }

  return {
    group,
    definitions,
    failures
  };
}

export async function readNpcDefinition(cache, id) {
  const { group } = await readNpcDefinitions(cache);
  const file = group.files.find((entry) => entry.id === id);
  if (!file) {
    throw new Error(`NPC definition ${id} was not found in config archive ${NPC_CONFIG_ARCHIVE}`);
  }
  return decodeNpcDefinition(file.data, file.id, { tolerant: true });
}

export async function searchNpcDefinitions(cache, query, options = {}) {
  const needle = normalizeSearchText(query);
  if (!needle) {
    throw new Error("Missing --name search text");
  }

  const limit = Math.max(1, Number(options.limit ?? 25));
  const { definitions, failures } = await readNpcDefinitions(cache);
  const matches = definitions
    .filter((definition) => normalizeSearchText(definition.name).includes(needle))
    .slice(0, limit);

  return {
    query,
    searched: definitions.length,
    failures: failures.length,
    matches
  };
}

export function decodeNpcDefinition(data, id, options = {}) {
  const reader = new BinaryReader(data);
  const npc = {
    id,
    name: "null",
    size: 1,
    models: [],
    chatheadModels: [],
    actions: [],
    recolors: [],
    retextures: [],
    animations: {},
    combatLevel: -1,
    category: -1,
    drawMapDot: true,
    interactable: true,
    rotationFlag: true,
    follower: false,
    renderPriority: false,
    widthScale: 128,
    heightScale: 128,
    ambient: 0,
    contrast: 0,
    rotationSpeed: 32,
    transforms: null,
    stats: {},
    params: {},
    decodeError: null,
    decodeOffset: null
  };

  while (reader.remaining() > 0) {
    const opcodeOffset = reader.offset;
    const opcode = reader.u8("opcode");
    if (opcode === 0) {
      return npc;
    }

    try {
      decodeNpcOpcode(reader, npc, opcode);
    } catch (error) {
      if (!options.tolerant) {
        throw error;
      }
      npc.decodeError = error.message;
      npc.decodeOffset = opcodeOffset;
      return npc;
    }
  }

  return npc;
}

export function npcSummaryRow(npc) {
  return {
    id: npc.id,
    name: npc.name,
    size: npc.size,
    combatLevel: npc.combatLevel,
    models: npc.models.join(","),
    idle: npc.animations.idle ?? "",
    walk: npc.animations.walk ?? "",
    actions: npc.actions.filter(Boolean).join(","),
    transforms: npc.transforms?.ids?.length ?? 0,
    decodeError: npc.decodeError ?? ""
  };
}

function decodeNpcOpcode(reader, npc, opcode) {
  if (opcode === 1) {
    npc.models = readU16List(reader);
    return;
  }

  if (opcode === 2) {
    npc.name = reader.string("name");
    return;
  }

  if (opcode === 12) {
    npc.size = reader.u8("size");
    return;
  }

  if (opcode === 13) {
    npc.animations.idle = readNullableU16(reader, "idleSequence");
    return;
  }

  if (opcode === 14) {
    npc.animations.walk = readNullableU16(reader, "walkSequence");
    return;
  }

  if (opcode === 15) {
    npc.animations.turnLeft = readNullableU16(reader, "turnLeftSequence");
    return;
  }

  if (opcode === 16) {
    npc.animations.turnRight = readNullableU16(reader, "turnRightSequence");
    return;
  }

  if (opcode === 17) {
    npc.animations.walk = readNullableU16(reader, "walkSequence");
    npc.animations.walkBack = readNullableU16(reader, "walkBackSequence");
    npc.animations.walkLeft = readNullableU16(reader, "walkLeftSequence");
    npc.animations.walkRight = readNullableU16(reader, "walkRightSequence");
    return;
  }

  if (opcode === 18) {
    npc.category = readNullableU16(reader, "category");
    return;
  }

  if (opcode >= 30 && opcode < 35) {
    const action = reader.string(`action${opcode - 30}`);
    npc.actions[opcode - 30] = action === "Hidden" ? null : action;
    return;
  }

  if (opcode === 40) {
    npc.recolors = readPairs(reader, "recolor");
    return;
  }

  if (opcode === 41) {
    npc.retextures = readPairs(reader, "retexture");
    return;
  }

  if (opcode === 60) {
    npc.chatheadModels = readU16List(reader);
    return;
  }

  if (opcode === 61) {
    npc.models = readU32List(reader);
    return;
  }

  if (opcode >= 74 && opcode <= 79) {
    const names = ["attack", "defence", "strength", "hitpoints", "ranged", "magic"];
    npc.stats[names[opcode - 74]] = reader.u16(`stat${opcode}`);
    return;
  }

  if (opcode === 93) {
    npc.drawMapDot = false;
    return;
  }

  if (opcode === 95) {
    npc.combatLevel = reader.u16("combatLevel");
    return;
  }

  if (opcode === 97) {
    npc.widthScale = reader.u16("widthScale");
    return;
  }

  if (opcode === 98) {
    npc.heightScale = reader.u16("heightScale");
    return;
  }

  if (opcode === 99) {
    npc.renderPriority = true;
    return;
  }

  if (opcode === 100) {
    npc.ambient = reader.i8("ambient");
    return;
  }

  if (opcode === 101) {
    npc.contrast = reader.i8("contrast");
    return;
  }

  if (opcode === 102) {
    throw new Error("NPC opcode 102 head-icon decoding is not implemented yet");
  }

  if (opcode === 103) {
    npc.rotationSpeed = reader.u16("rotationSpeed");
    return;
  }

  if (opcode === 106 || opcode === 118) {
    npc.transforms = readTransforms(reader, opcode === 118);
    return;
  }

  if (opcode === 107) {
    npc.interactable = false;
    return;
  }

  if (opcode === 109) {
    npc.rotationFlag = false;
    return;
  }

  if (opcode === 111 || opcode === 122) {
    npc.follower = true;
    return;
  }

  if (opcode === 114) {
    npc.animations.run = readNullableU16(reader, "runSequence");
    return;
  }

  if (opcode === 115) {
    npc.animations.run = readNullableU16(reader, "runSequence");
    npc.animations.runBack = readNullableU16(reader, "runBackSequence");
    npc.animations.runLeft = readNullableU16(reader, "runLeftSequence");
    npc.animations.runRight = readNullableU16(reader, "runRightSequence");
    return;
  }

  if (opcode === 116) {
    npc.animations.crawl = readNullableU16(reader, "crawlSequence");
    return;
  }

  if (opcode === 117) {
    npc.animations.crawl = readNullableU16(reader, "crawlSequence");
    npc.animations.crawlBack = readNullableU16(reader, "crawlBackSequence");
    npc.animations.crawlLeft = readNullableU16(reader, "crawlLeftSequence");
    npc.animations.crawlRight = readNullableU16(reader, "crawlRightSequence");
    return;
  }

  if (opcode === 123) {
    npc.lowPriorityActions = true;
    return;
  }

  if (opcode === 124) {
    npc.height = reader.u16("height");
    return;
  }

  if (opcode === 249) {
    npc.params = {
      ...npc.params,
      ...readParams(reader)
    };
    return;
  }

  throw new Error(`Unsupported NPC opcode ${opcode}`);
}

function readU16List(reader) {
  const count = reader.u8("modelCount");
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(readNullableU16(reader, `model[${index}]`));
  }
  return values;
}

function readU32List(reader) {
  const count = reader.u8("modelCount");
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(reader.u32(`model32[${index}]`));
  }
  return values;
}

function readPairs(reader, label) {
  const count = reader.u8(`${label}Count`);
  const pairs = [];
  for (let index = 0; index < count; index += 1) {
    pairs.push({
      from: reader.u16(`${label}From[${index}]`),
      to: reader.u16(`${label}To[${index}]`)
    });
  }
  return pairs;
}

function readTransforms(reader, hasFallback) {
  const varbit = readNullableU16(reader, "transformVarbit");
  const varp = readNullableU16(reader, "transformVarp");
  const fallback = hasFallback ? readNullableU16(reader, "transformFallback") : -1;
  const count = reader.u8("transformCount");
  const ids = [];

  for (let index = 0; index <= count; index += 1) {
    ids.push(readNullableU16(reader, `transform[${index}]`));
  }
  ids.push(fallback);

  return { varbit, varp, ids };
}

function readParams(reader) {
  const count = reader.u8("paramCount");
  const params = {};
  for (let index = 0; index < count; index += 1) {
    const isString = reader.u8(`paramIsString[${index}]`) === 1;
    const key = reader.medium(`paramKey[${index}]`);
    params[key] = isString ? reader.string(`paramString[${index}]`) : reader.i32(`paramInt[${index}]`);
  }
  return params;
}

function readNullableU16(reader, label) {
  const value = reader.u16(label);
  return value === 65535 ? -1 : value;
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

class BinaryReader {
  constructor(data) {
    this.data = Buffer.from(data);
    this.offset = 0;
  }

  remaining() {
    return this.data.length - this.offset;
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

  i32(label) {
    this.ensure(4, label);
    const value = this.data.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  u32(label) {
    this.ensure(4, label);
    const value = this.data.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  medium(label) {
    this.ensure(3, label);
    const value = (this.data[this.offset] << 16) | (this.data[this.offset + 1] << 8) | this.data[this.offset + 2];
    this.offset += 3;
    return value;
  }

  string(label) {
    const start = this.offset;
    while (this.offset < this.data.length && this.data[this.offset] !== 0) {
      this.offset += 1;
    }

    this.ensure(1, label);
    const bytes = this.data.subarray(start, this.offset);
    this.offset += 1;
    return decodeCp1252(bytes);
  }

  ensure(length, label = "field") {
    if (this.offset + length > this.data.length) {
      throw new Error(`NPC definition ended while reading ${label} at byte ${this.offset}`);
    }
  }
}

function decodeCp1252(bytes) {
  let text = "";
  for (const byte of bytes) {
    text += CP1252[byte] ?? String.fromCharCode(byte);
  }
  return text;
}

const CP1252 = {
  128: "\u20ac",
  130: "\u201a",
  131: "\u0192",
  132: "\u201e",
  133: "\u2026",
  134: "\u2020",
  135: "\u2021",
  136: "\u02c6",
  137: "\u2030",
  138: "\u0160",
  139: "\u2039",
  140: "\u0152",
  142: "\u017d",
  145: "\u2018",
  146: "\u2019",
  147: "\u201c",
  148: "\u201d",
  149: "\u2022",
  150: "\u2013",
  151: "\u2014",
  152: "\u02dc",
  153: "\u2122",
  154: "\u0161",
  155: "\u203a",
  156: "\u0153",
  158: "\u017e",
  159: "\u0178"
};
