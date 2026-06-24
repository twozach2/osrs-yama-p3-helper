import { readReferenceTable } from "./reference-table.js";

export async function readGroupFiles(cache, indexId, archiveId) {
  const table = await readReferenceTable(cache, indexId);
  const archive = table.archives.find((entry) => entry.id === archiveId);
  if (!archive) {
    throw new Error(`Archive ${indexId}:${archiveId} is not listed in the reference table`);
  }

  const decoded = await cache.readArchive(indexId, archiveId);
  const files = unpackGroupFiles(decoded.data, archive.files.map((file) => file.id));
  return {
    indexId,
    archiveId,
    indexName: table.indexName,
    compressionType: decoded.compressionType,
    compressionName: decoded.compressionName,
    files
  };
}

export function unpackGroupFiles(data, fileIds) {
  const source = Buffer.from(data);
  if (fileIds.length === 0) {
    return [];
  }

  if (fileIds.length === 1) {
    return [{ id: fileIds[0], data: source }];
  }

  if (source.length < 1) {
    throw new Error("Multi-file group is empty");
  }

  const fileCount = fileIds.length;
  const chunkCount = source[source.length - 1];
  const tableLength = chunkCount * fileCount * 4;
  const tableOffset = source.length - 1 - tableLength;

  if (chunkCount <= 0) {
    throw new Error("Multi-file group has zero chunks");
  }

  if (tableOffset < 0) {
    throw new Error(`Multi-file group footer exceeds data length: ${tableLength} bytes`);
  }

  const sizes = new Array(fileCount).fill(0);
  let tableCursor = tableOffset;
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    let chunkSize = 0;
    for (let file = 0; file < fileCount; file += 1) {
      chunkSize += source.readInt32BE(tableCursor);
      tableCursor += 4;
      if (chunkSize < 0) {
        throw new Error(`Negative chunk size while unpacking file ${fileIds[file]}`);
      }
      sizes[file] += chunkSize;
    }
  }

  const outputs = sizes.map((size) => Buffer.alloc(size));
  const offsets = new Array(fileCount).fill(0);
  let dataCursor = 0;
  tableCursor = tableOffset;

  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    let chunkSize = 0;
    for (let file = 0; file < fileCount; file += 1) {
      chunkSize += source.readInt32BE(tableCursor);
      tableCursor += 4;

      const nextDataCursor = dataCursor + chunkSize;
      if (nextDataCursor > tableOffset) {
        throw new Error(`Multi-file group data overran footer while unpacking file ${fileIds[file]}`);
      }

      source.copy(outputs[file], offsets[file], dataCursor, nextDataCursor);
      offsets[file] += chunkSize;
      dataCursor = nextDataCursor;
    }
  }

  if (dataCursor !== tableOffset) {
    throw new Error(`Multi-file group consumed ${dataCursor} bytes but payload is ${tableOffset} bytes`);
  }

  return fileIds.map((id, index) => ({
    id,
    data: outputs[index]
  }));
}
