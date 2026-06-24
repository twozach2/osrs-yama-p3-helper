import { INDEX_NAMES } from "./cache.js";

const FLAG_NAMES = new Map([
  [1, "names"],
  [2, "whirlpool"],
  [4, "sizes"]
]);

export async function readReferenceTable(cache, indexId) {
  const decoded = await cache.readArchive(255, indexId);
  const table = parseReferenceTable(decoded.data, { indexId });
  return {
    ...table,
    compressionType: decoded.compressionType,
    compressionName: decoded.compressionName,
    compressedLength: decoded.compressedLength,
    decompressedLength: decoded.decompressedLength
  };
}

export function parseReferenceTable(data, options = {}) {
  const reader = new BufferReader(data);
  const protocol = reader.u8("protocol");

  if (protocol < 5 || protocol > 7) {
    throw new Error(`Unsupported reference table protocol ${protocol}`);
  }

  const revision = protocol >= 6 ? reader.u32("revision") : null;
  const flags = reader.u8("flags");
  const unsupportedFlags = flags & ~0x7;
  if (unsupportedFlags !== 0) {
    throw new Error(`Unsupported reference table flags 0x${unsupportedFlags.toString(16)}`);
  }

  const hasNames = (flags & 1) !== 0;
  const hasWhirlpool = (flags & 2) !== 0;
  const hasSizes = (flags & 4) !== 0;
  const archiveCount = readVersionedNumber(reader, protocol, "archiveCount");
  const archives = [];
  let archiveId = 0;

  for (let index = 0; index < archiveCount; index += 1) {
    archiveId += readVersionedNumber(reader, protocol, `archiveIdDelta[${index}]`);
    archives.push({
      id: archiveId,
      nameHash: null,
      crc: null,
      version: null,
      compressedSize: null,
      uncompressedSize: null,
      fileCount: 0,
      files: []
    });
  }

  if (hasNames) {
    for (const archive of archives) {
      archive.nameHash = reader.u32(`archiveNameHash[${archive.id}]`);
    }
  }

  for (const archive of archives) {
    archive.crc = reader.u32(`archiveCrc[${archive.id}]`);
  }

  if (hasWhirlpool) {
    for (const archive of archives) {
      archive.whirlpool = reader.bytes(64, `archiveWhirlpool[${archive.id}]`).toString("hex");
    }
  }

  if (hasSizes) {
    for (const archive of archives) {
      archive.compressedSize = reader.u32(`archiveCompressedSize[${archive.id}]`);
      archive.uncompressedSize = reader.u32(`archiveUncompressedSize[${archive.id}]`);
    }
  }

  for (const archive of archives) {
    archive.version = reader.u32(`archiveVersion[${archive.id}]`);
  }

  for (const archive of archives) {
    archive.fileCount = readVersionedNumber(reader, protocol, `fileCount[${archive.id}]`);
  }

  for (const archive of archives) {
    let fileId = 0;
    for (let index = 0; index < archive.fileCount; index += 1) {
      fileId += readVersionedNumber(reader, protocol, `fileIdDelta[${archive.id}:${index}]`);
      archive.files.push({
        id: fileId,
        nameHash: null
      });
    }
  }

  if (hasNames) {
    for (const archive of archives) {
      for (const file of archive.files) {
        file.nameHash = reader.u32(`fileNameHash[${archive.id}:${file.id}]`);
      }
    }
  }

  const trailingBytes = reader.remaining();
  return {
    indexId: options.indexId ?? null,
    indexName: INDEX_NAMES.get(options.indexId) ?? "unknown",
    protocol,
    revision,
    flags,
    flagNames: [...FLAG_NAMES.entries()]
      .filter(([bit]) => (flags & bit) !== 0)
      .map(([, name]) => name),
    archiveCount,
    maxArchiveId: archives.at(-1)?.id ?? -1,
    totalFiles: archives.reduce((sum, archive) => sum + archive.fileCount, 0),
    namedArchives: hasNames ? archives.filter((archive) => archive.nameHash !== 0).length : 0,
    namedFiles: hasNames ? archives.reduce((sum, archive) => sum + archive.files.filter((file) => file.nameHash !== 0).length, 0) : 0,
    trailingBytes,
    archives
  };
}

export function summarizeReferenceTable(table) {
  return {
    index: table.indexId,
    name: table.indexName,
    protocol: table.protocol,
    revision: table.revision,
    flags: table.flagNames.join(",") || "none",
    compression: table.compressionName ?? "unknown",
    archives: table.archiveCount,
    maxArchive: table.maxArchiveId,
    files: table.totalFiles,
    namedArchives: table.namedArchives,
    namedFiles: table.namedFiles,
    trailingBytes: table.trailingBytes
  };
}

export function referenceArchiveRows(table, options = {}) {
  const offset = Math.max(0, Number(options.offset ?? 0));
  const limit = Math.max(1, Number(options.limit ?? 25));
  return table.archives.slice(offset, offset + limit).map((archive) => ({
    archive: archive.id,
    files: archive.fileCount,
    firstFile: archive.files[0]?.id ?? "",
    lastFile: archive.files.at(-1)?.id ?? "",
    nameHash: archive.nameHash == null ? "" : toHex32(archive.nameHash),
    crc: archive.crc == null ? "" : toHex32(archive.crc),
    version: archive.version,
    compressedSize: archive.compressedSize ?? "",
    uncompressedSize: archive.uncompressedSize ?? ""
  }));
}

function readVersionedNumber(reader, protocol, label) {
  return protocol >= 7 ? reader.largeSmart(label) : reader.u16(label);
}

function toHex32(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

class BufferReader {
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

  u16(label) {
    this.ensure(2, label);
    const value = this.data.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  u32(label) {
    this.ensure(4, label);
    const value = this.data.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  largeSmart(label) {
    this.ensure(2, label);
    if (this.data[this.offset] < 128) {
      return this.u16(label);
    }

    this.ensure(4, label);
    const value = this.data.readUInt32BE(this.offset) & 0x7fffffff;
    this.offset += 4;
    return value;
  }

  bytes(length, label) {
    this.ensure(length, label);
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  ensure(length, label = "field") {
    if (this.offset + length > this.data.length) {
      throw new Error(`Reference table ended while reading ${label} at byte ${this.offset}`);
    }
  }
}
