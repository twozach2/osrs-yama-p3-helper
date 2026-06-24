import { existsSync } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const SECTOR_SIZE = 520;
const INDEX_ENTRY_SIZE = 6;
const require = createRequire(import.meta.url);
let seekBzip = null;
let seekBzipLoadAttempted = false;

export const INDEX_NAMES = new Map([
  [0, "frames"],
  [1, "frameMaps"],
  [2, "configs"],
  [3, "interfaces"],
  [4, "soundEffects"],
  [5, "maps"],
  [6, "musicTracks"],
  [7, "models"],
  [8, "sprites"],
  [9, "textures"],
  [10, "binary"],
  [11, "musicJingles"],
  [12, "clientScripts"],
  [13, "fontMetrics"],
  [14, "vorbis"],
  [15, "instruments"],
  [16, "worldMap"],
  [17, "dbTableIndex"],
  [18, "dbTables"],
  [19, "dbRows"],
  [20, "scripts2"],
  [21, "defaults"],
  [22, "billboards"],
  [255, "referenceTables"]
]);

export class Js5DiskCache {
  constructor(cachePath) {
    this.cachePath = cachePath;
    this.dat2Path = join(cachePath, "main_file_cache.dat2");
  }

  async validate() {
    if (!existsSync(this.cachePath)) {
      throw new Error(`Cache path does not exist: ${this.cachePath}`);
    }

    const cacheStat = await stat(this.cachePath);
    if (!cacheStat.isDirectory()) {
      throw new Error(`Cache path is not a directory: ${this.cachePath}`);
    }

    if (!existsSync(this.dat2Path)) {
      throw new Error(`Missing main_file_cache.dat2 in ${this.cachePath}`);
    }

    const indices = await this.listIndices();
    if (indices.length === 0) {
      throw new Error(`No main_file_cache.idx* files found in ${this.cachePath}`);
    }

    return indices;
  }

  async listIndices() {
    const files = await readdir(this.cachePath);
    const entries = [];

    for (const file of files) {
      const match = /^main_file_cache\.idx(\d+)$/.exec(file);
      if (!match) continue;

      const id = Number(match[1]);
      const path = join(this.cachePath, file);
      const fileStat = await stat(path);
      entries.push({
        id,
        name: INDEX_NAMES.get(id) ?? "unknown",
        path,
        bytes: fileStat.size,
        archives: Math.floor(fileStat.size / INDEX_ENTRY_SIZE)
      });
    }

    return entries.sort((a, b) => a.id - b.id);
  }

  async readIndexEntry(indexId, archiveId) {
    const indexPath = join(this.cachePath, `main_file_cache.idx${indexId}`);
    if (!existsSync(indexPath)) {
      throw new Error(`Index ${indexId} does not exist at ${indexPath}`);
    }

    const handle = await open(indexPath, "r");
    try {
      const position = archiveId * INDEX_ENTRY_SIZE;
      const stats = await handle.stat();
      if (position + INDEX_ENTRY_SIZE > stats.size) {
        throw new Error(`Archive ${archiveId} is outside index ${indexId}; index has ${Math.floor(stats.size / INDEX_ENTRY_SIZE)} archives`);
      }

      const buffer = Buffer.alloc(INDEX_ENTRY_SIZE);
      await handle.read(buffer, 0, buffer.length, position);
      const length = readMedium(buffer, 0);
      const sector = readMedium(buffer, 3);
      return { length, sector };
    } finally {
      await handle.close();
    }
  }

  async readArchiveContainer(indexId, archiveId) {
    const entry = await this.readIndexEntry(indexId, archiveId);
    if (entry.length <= 0 || entry.sector <= 0) {
      throw new Error(`Archive ${indexId}:${archiveId} is empty`);
    }

    const dat2 = await open(this.dat2Path, "r");
    try {
      const output = Buffer.alloc(entry.length);
      let outputOffset = 0;
      let sector = entry.sector;
      let chunk = 0;

      while (outputOffset < entry.length) {
        const headerSize = archiveId > 0xffff ? 10 : 8;
        const payloadSize = SECTOR_SIZE - headerSize;
        const sectorOffset = sector * SECTOR_SIZE;
        const sectorBuffer = Buffer.alloc(SECTOR_SIZE);
        const { bytesRead } = await dat2.read(sectorBuffer, 0, SECTOR_SIZE, sectorOffset);

        if (bytesRead < headerSize) {
          throw new Error(`Archive ${indexId}:${archiveId} ended early at sector ${sector}`);
        }

        const header = readSectorHeader(sectorBuffer, archiveId > 0xffff);
        if (header.archiveId !== archiveId) {
          throw new Error(`Archive ${indexId}:${archiveId} expected archive id ${archiveId} but sector ${sector} has ${header.archiveId}`);
        }
        if (header.chunk !== chunk) {
          throw new Error(`Archive ${indexId}:${archiveId} expected chunk ${chunk} but sector ${sector} has ${header.chunk}`);
        }
        if (header.indexId !== indexId) {
          throw new Error(`Archive ${indexId}:${archiveId} expected index ${indexId} but sector ${sector} has ${header.indexId}`);
        }

        const bytesToCopy = Math.min(payloadSize, entry.length - outputOffset);
        sectorBuffer.copy(output, outputOffset, headerSize, headerSize + bytesToCopy);
        outputOffset += bytesToCopy;
        sector = header.nextSector;
        chunk += 1;

        if (outputOffset < entry.length && sector <= 0) {
          throw new Error(`Archive ${indexId}:${archiveId} sector chain ended before all bytes were read`);
        }
      }

      return output;
    } finally {
      await dat2.close();
    }
  }

  async readArchive(indexId, archiveId) {
    const container = await this.readArchiveContainer(indexId, archiveId);
    return decodeContainer(container);
  }
}

export function decodeContainer(container) {
  if (container.length < 5) {
    throw new Error("Archive container is too small");
  }

  const compressionType = container.readUInt8(0);
  const compressedLength = container.readUInt32BE(1);

  if (compressionType === 0) {
    const start = 5;
    const end = start + compressedLength;
    if (end > container.length) {
      throw new Error(`Uncompressed container length ${compressedLength} exceeds archive bytes`);
    }
    return {
      compressionType,
      compressionName: "none",
      data: container.subarray(start, end),
      compressedLength,
      decompressedLength: compressedLength
    };
  }

  if (container.length < 9) {
    throw new Error("Compressed archive container is too small");
  }

  const decompressedLength = container.readUInt32BE(5);
  const start = 9;
  const end = start + compressedLength;
  if (end > container.length) {
    throw new Error(`Compressed container length ${compressedLength} exceeds archive bytes`);
  }

  const compressed = container.subarray(start, end);
  if (compressionType === 1) {
    const data = decodeBzip2(compressed, decompressedLength);
    return {
      compressionType,
      compressionName: "bzip2",
      data,
      compressedLength,
      decompressedLength
    };
  }

  if (compressionType === 2) {
    const data = gunzipSync(compressed);
    if (data.length !== decompressedLength) {
      throw new Error(`Gzip archive expected ${decompressedLength} bytes but decoded ${data.length}`);
    }
    return {
      compressionType,
      compressionName: "gzip",
      data,
      compressedLength,
      decompressedLength
    };
  }

  const compressionName = compressionType === 3 ? "lzma" : `unknown-${compressionType}`;
  const error = new Error(`${compressionName} archive decoding is not implemented yet`);
  error.code = "UNSUPPORTED_COMPRESSION";
  error.details = { compressionType, compressionName, compressedLength, decompressedLength };
  throw error;
}

function decodeBzip2(compressed, decompressedLength) {
  const decoder = loadSeekBzip();
  const candidates = [compressed];
  for (let blockSize = 1; blockSize <= 9; blockSize += 1) {
    candidates.push(Buffer.concat([Buffer.from(`BZh${blockSize}`, "ascii"), compressed]));
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const data = Buffer.from(decoder.decode(candidate));
      if (data.length === decompressedLength) {
        return data;
      }
      lastError = new Error(`Decoded ${data.length} bytes; expected ${decompressedLength}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Bzip2 archive could not be decoded: ${lastError?.message ?? "unknown error"}`);
}

function loadSeekBzip() {
  if (!seekBzipLoadAttempted) {
    seekBzipLoadAttempted = true;
    try {
      seekBzip = require("seek-bzip");
    } catch {
      seekBzip = null;
    }
  }

  if (!seekBzip?.decode) {
    const error = new Error("Bzip2 cache archives require the optional dependency seek-bzip. Install it with: npm.cmd install --no-save seek-bzip");
    error.code = "MISSING_BZIP2_DECODER";
    throw error;
  }

  return seekBzip;
}

export async function inspectCompression(cache, indices, sampleCount) {
  const rows = [];

  for (const index of indices) {
    const counts = new Map();
    let sampled = 0;
    let failed = 0;

    for (let archiveId = 0; archiveId < index.archives && sampled < sampleCount; archiveId += 1) {
      try {
        const entry = await cache.readIndexEntry(index.id, archiveId);
        if (entry.length <= 0 || entry.sector <= 0) continue;
        const container = await cache.readArchiveContainer(index.id, archiveId);
        const type = container.readUInt8(0);
        counts.set(type, (counts.get(type) ?? 0) + 1);
        sampled += 1;
      } catch {
        failed += 1;
      }
    }

    rows.push({
      index: index.id,
      name: index.name,
      sampled,
      failed,
      compressionTypes: Object.fromEntries([...counts.entries()].map(([type, count]) => [compressionTypeName(type), count]))
    });
  }

  return rows;
}

export function compressionTypeName(type) {
  if (type === 0) return "none";
  if (type === 1) return "bzip2";
  if (type === 2) return "gzip";
  if (type === 3) return "lzma";
  return `unknown-${type}`;
}

function readSectorHeader(buffer, largeArchiveId) {
  if (largeArchiveId) {
    return {
      archiveId: buffer.readUInt32BE(0),
      chunk: buffer.readUInt16BE(4),
      nextSector: readMedium(buffer, 6),
      indexId: buffer.readUInt8(9)
    };
  }

  return {
    archiveId: buffer.readUInt16BE(0),
    chunk: buffer.readUInt16BE(2),
    nextSector: readMedium(buffer, 4),
    indexId: buffer.readUInt8(7)
  };
}

function readMedium(buffer, offset) {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}
