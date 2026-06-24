#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Js5DiskCache, decodeContainer, inspectCompression } from "./lib/cache.js";
import { readNpcDefinition, npcSummaryRow, searchNpcDefinitions } from "./lib/configs.js";
import { exportNpcGlb } from "./lib/models.js";
import { readReferenceTable, referenceArchiveRows, summarizeReferenceTable } from "./lib/reference-table.js";

const DEFAULT_OUT = "public/assets/osrs";
const MODEL_INDEX = 7;
const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_IDS = join(TOOL_DIR, "ids.example.json");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? "inspect";

  if (args.help || args.h) {
    printHelp();
    return;
  }

  const cachePath = resolveRequiredPath(args.cache, "--cache");
  const cache = new Js5DiskCache(cachePath);
  const indices = await cache.validate();

  if (command === "inspect") {
    await inspect(cache, indices, args);
    return;
  }

  if (command === "refs") {
    await refs(cache, indices, args);
    return;
  }

  if (command === "npc-search") {
    await npcSearch(cache, args);
    return;
  }

  if (command === "npc") {
    await npc(cache, args);
    return;
  }

  if (command === "npc-export-raw") {
    await npcExportRaw(cache, args);
    return;
  }

  if (command === "npc-export-glb") {
    await npcExportGlb(cache, args);
    return;
  }

  if (command === "extract-raw") {
    await extractRaw(cache, args);
    return;
  }

  if (command === "export") {
    await exportDraft(cache, args);
    return;
  }

  throw new Error(`Unknown command "${command}". Run with --help for usage.`);
}

async function inspect(cache, indices, args) {
  const rows = indices.map((index) => ({
    index: index.id,
    name: index.name,
    archives: index.archives,
    bytes: index.bytes
  }));
  console.table(rows);

  const sampleCount = Number(args.sample ?? 0);
  if (sampleCount > 0) {
    const samples = await inspectCompression(cache, indices, sampleCount);
    console.log("\nCompression samples:");
    console.table(samples.map((sample) => ({
      index: sample.index,
      name: sample.name,
      sampled: sample.sampled,
      failed: sample.failed,
      compressionTypes: JSON.stringify(sample.compressionTypes)
    })));
  }
}

async function refs(cache, indices, args) {
  if (args.index == null) {
    const rows = [];
    let sawMissingBzip = false;

    for (const index of indices.filter((entry) => entry.id !== 255)) {
      try {
        const table = await readReferenceTable(cache, index.id);
        rows.push(summarizeReferenceTable(table));
      } catch (error) {
        sawMissingBzip ||= error.code === "MISSING_BZIP2_DECODER";
        rows.push({
          index: index.id,
          name: index.name,
          protocol: "",
          revision: "",
          flags: "",
          compression: "",
          archives: "",
          maxArchive: "",
          files: "",
          namedArchives: "",
          namedFiles: "",
          trailingBytes: "",
          error: compactError(error)
        });
      }
    }

    console.table(rows);
    if (sawMissingBzip) {
      console.log("\nSome reference tables are bzip2-compressed. Install the optional decoder with: npm.cmd install --no-save seek-bzip");
    }
    return;
  }

  const index = requiredNumber(args.index, "--index");
  const limit = Number(args.limit ?? 25);
  const offset = Number(args.offset ?? 0);
  const table = await readReferenceTable(cache, index);

  console.table([summarizeReferenceTable(table)]);
  console.log(`\nArchive rows for index ${index} (${table.indexName}), offset ${Math.max(0, offset)}, limit ${Math.max(1, limit)}:`);
  console.table(referenceArchiveRows(table, { offset, limit }));

  if (table.trailingBytes > 0) {
    console.log(`\nNote: ${table.trailingBytes} trailing bytes remain after parsing. The table may contain newer fields this parser does not yet expose.`);
  }
}

async function npcSearch(cache, args) {
  const name = args.name ?? args.query ?? args.q;
  const limit = Number(args.limit ?? 25);
  const result = await searchNpcDefinitions(cache, name, { limit });
  const payload = {
    query: result.query,
    searched: result.searched,
    failures: result.failures,
    matches: result.matches.map((match) => ({
      ...npcSummaryRow(match),
      modelIds: match.models,
      chatheadModelIds: match.chatheadModels,
      animations: match.animations
    }))
  };

  if (args.json || args.format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Searched ${payload.searched} NPC definitions; parser failures: ${payload.failures}`);
  console.table(payload.matches.map(({ modelIds, chatheadModelIds, animations, ...row }) => row));
}

async function npc(cache, args) {
  const id = requiredNumber(args.id, "--id");
  const definition = await readNpcDefinition(cache, id);

  if (args.json !== false) {
    console.log(JSON.stringify(definition, null, 2));
    return;
  }

  console.table([npcSummaryRow(definition)]);
}

async function npcExportRaw(cache, args) {
  const id = requiredNumber(args.id, "--id");
  const outDir = resolve(args.out ?? join(DEFAULT_OUT, "raw", `npc-${id}`));
  const definition = await readNpcDefinition(cache, id);
  const modelIds = [...new Set(definition.models)].filter((modelId) => Number.isInteger(modelId) && modelId >= 0);

  if (modelIds.length === 0) {
    throw new Error(`NPC ${id} has no decoded model IDs`);
  }

  await mkdir(outDir, { recursive: true });
  const extracted = [];

  for (const modelId of modelIds) {
    const name = `model-${modelId}`;
    const containerPath = join(outDir, `${name}.container.bin`);
    const decodedPath = join(outDir, `${name}.bin`);
    const result = {
      index: MODEL_INDEX,
      archive: modelId,
      name,
      containerPath,
      decodedPath
    };

    try {
      const container = await cache.readArchiveContainer(MODEL_INDEX, modelId);
      await writeFile(containerPath, container);
      const decoded = decodeContainer(container);
      await writeFile(decodedPath, decoded.data);
      Object.assign(result, {
        compressionType: decoded.compressionType,
        compressionName: decoded.compressionName,
        compressedLength: decoded.compressedLength,
        decompressedLength: decoded.decompressedLength
      });
    } catch (error) {
      Object.assign(result, {
        error: error.message,
        details: error.details ?? null
      });
    }

    extracted.push(result);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    cache: cache.cachePath,
    npc: definition,
    extracted
  };
  const reportPath = join(outDir, `npc-${id}-raw-models.json`);
  await writeJson(reportPath, report);

  if (args.json || args.format === "json") {
    console.log(JSON.stringify({ reportPath, ...report }, null, 2));
    return;
  }

  console.log(`NPC ${id} ${definition.name}: extracted ${extracted.filter((entry) => !entry.error).length}/${extracted.length} raw model archives`);
  console.log(`Wrote ${reportPath}`);
}

async function npcExportGlb(cache, args) {
  const id = requiredNumber(args.id, "--id");
  const modelName = String(args.model ?? args.name ?? "yama");
  const outDir = resolve(args.assetDir ?? DEFAULT_OUT);
  const outPath = resolve(args.out ?? join(outDir, `${safeFileName(modelName)}.glb`));
  const definition = await readNpcDefinition(cache, id);

  await mkdir(dirname(outPath), { recursive: true });
  const result = await exportNpcGlb(cache, definition, {
    outPath,
    name: modelName,
    center: args.center !== "false",
    floor: args.floor !== "false"
  });

  let manifestPath = null;
  if (args.activate || args.manifest) {
    manifestPath = await updateAssetManifest({
      outDir,
      modelName,
      outPath,
      scale: Number(args.scale ?? 0.01),
      yOffset: Number(args.yOffset ?? 0),
      rotationY: Number(args.rotationY ?? 0)
    });
  }

  const reportDir = join(outDir, "raw", `npc-${id}`);
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `npc-${id}-glb-export.json`);
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    cache: cache.cachePath,
    manifestPath,
    ...result
  });

  const payload = {
    reportPath,
    manifestPath,
    ...result
  };

  if (args.json || args.format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Wrote ${result.outPath}`);
  if (manifestPath) {
    console.log(`Updated ${manifestPath}`);
  } else {
    console.log("Manifest was not updated. Pass --activate to load this model in the app.");
  }
  console.log(`Wrote ${reportPath}`);
}

async function extractRaw(cache, args) {
  const index = requiredNumber(args.index, "--index");
  const archive = requiredNumber(args.archive, "--archive");
  const outDir = resolve(args.out ?? join(DEFAULT_OUT, "raw"));
  const name = args.name ?? `${index}-${archive}`;

  await mkdir(outDir, { recursive: true });

  const container = await cache.readArchiveContainer(index, archive);
  const containerPath = join(outDir, `${safeFileName(name)}.container.bin`);
  await writeFile(containerPath, container);

  try {
    const decoded = decodeContainer(container);
    const decodedPath = join(outDir, `${safeFileName(name)}.bin`);
    await writeFile(decodedPath, decoded.data);
    await writeJson(join(outDir, `${safeFileName(name)}.json`), {
      index,
      archive,
      name,
      containerPath,
      decodedPath,
      compressionType: decoded.compressionType,
      compressionName: decoded.compressionName,
      compressedLength: decoded.compressedLength,
      decompressedLength: decoded.decompressedLength
    });
    console.log(`Extracted ${index}:${archive} to ${decodedPath}`);
  } catch (error) {
    await writeJson(join(outDir, `${safeFileName(name)}.json`), {
      index,
      archive,
      name,
      containerPath,
      error: error.message,
      details: error.details ?? null
    });
    console.log(`Wrote compressed container to ${containerPath}`);
    console.log(`Decode note: ${error.message}`);
  }
}

async function exportDraft(cache, args) {
  const outDir = resolve(args.out ?? DEFAULT_OUT);
  const idsPath = resolve(args.ids ?? DEFAULT_IDS);
  const ids = await readJson(idsPath);

  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, "raw"), { recursive: true });
  await mkdir(join(outDir, "models"), { recursive: true });
  await mkdir(join(outDir, "sprites"), { recursive: true });
  await mkdir(join(outDir, "fonts"), { recursive: true });

  const extracted = [];
  for (const entry of ids.rawGroups ?? []) {
    const index = Number(entry.index);
    const archive = Number(entry.archive);
    if (!Number.isInteger(index) || !Number.isInteger(archive)) {
      console.warn(`Skipping raw group with invalid index/archive: ${JSON.stringify(entry)}`);
      continue;
    }

    const name = entry.name ?? `${index}-${archive}`;
    const rawDir = join(outDir, "raw");
    const container = await cache.readArchiveContainer(index, archive);
    const containerPath = join(rawDir, `${safeFileName(name)}.container.bin`);
    await writeFile(containerPath, container);

    const result = { index, archive, name, containerPath };
    try {
      const decoded = decodeContainer(container);
      const decodedPath = join(rawDir, `${safeFileName(name)}.bin`);
      await writeFile(decodedPath, decoded.data);
      Object.assign(result, {
        decodedPath,
        compressionType: decoded.compressionType,
        compressionName: decoded.compressionName,
        compressedLength: decoded.compressedLength,
        decompressedLength: decoded.decompressedLength
      });
    } catch (error) {
      Object.assign(result, {
        error: error.message,
        details: error.details ?? null
      });
    }
    extracted.push(result);
  }

  const manifest = buildDraftManifest(ids, outDir);
  const manifestName = args.activate ? "manifest.json" : "manifest.draft.json";
  const manifestPath = join(outDir, manifestName);
  await writeJson(manifestPath, manifest);
  await writeJson(join(outDir, "raw", "export-report.json"), {
    generatedAt: new Date().toISOString(),
    cache: cache.cachePath,
    ids: idsPath,
    manifestPath,
    extracted
  });

  console.log(`Wrote ${manifestPath}`);
  console.log(`Wrote raw export report to ${join(outDir, "raw", "export-report.json")}`);
  if (!args.activate) {
    console.log("Draft manifest is not active. Rename/copy it to manifest.json after decoded assets exist.");
  }
}

function buildDraftManifest(ids, outDir) {
  const models = {};
  for (const [id, config] of Object.entries(ids.models ?? {})) {
    const path = config.path ?? `/assets/osrs/${id}.glb`;
    const absolute = resolvePublicPath(outDir, path);
    if (!existsSync(absolute)) continue;
    models[id] = {
      path,
      scale: config.scale ?? ids.scale ?? 0.01,
      yOffset: config.yOffset ?? 0,
      rotationY: config.rotationY ?? 0
    };
  }

  const sprites = {};
  for (const [id, config] of Object.entries(ids.sprites ?? {})) {
    const path = config.path ?? `/assets/osrs/sprites/${id}.png`;
    const absolute = resolvePublicPath(outDir, path);
    if (!existsSync(absolute)) continue;
    sprites[id] = { path };
  }

  const fonts = {};
  for (const [id, config] of Object.entries(ids.fonts ?? {})) {
    const path = config.path ?? `/assets/osrs/fonts/${id}.woff2`;
    const absolute = resolvePublicPath(outDir, path);
    if (!existsSync(absolute)) continue;
    fonts[id] = {
      path,
      family: config.family ?? `Local OSRS ${id}`,
      role: config.role ?? id
    };
  }

  return {
    version: 2,
    name: ids.name ?? "Local OSRS Asset Pack",
    generatedBy: "tools/osrs-cache-exporter",
    scale: ids.scale ?? 0.01,
    fonts,
    sprites,
    models
  };
}

function resolvePublicPath(outDir, publicPath) {
  const normalized = String(publicPath).replace(/^\/assets\/osrs\/?/, "");
  return join(outDir, normalized);
}

async function updateAssetManifest({ outDir, modelName, outPath, scale, yOffset, rotationY }) {
  const manifestPath = join(outDir, "manifest.json");
  let manifest = {};
  if (existsSync(manifestPath)) {
    manifest = await readJson(manifestPath);
  }

  manifest.version = manifest.version ?? 2;
  manifest.name = manifest.name ?? "Local OSRS Asset Pack";
  manifest.scale = manifest.scale ?? scale;
  manifest.models = manifest.models ?? {};
  manifest.models[modelName] = {
    path: toAssetPublicPath(outDir, outPath),
    scale,
    yOffset,
    rotationY
  };

  await writeJson(manifestPath, manifest);
  return manifestPath;
}

function toAssetPublicPath(outDir, outPath) {
  const relativePath = relative(outDir, outPath).replaceAll("\\", "/");
  if (relativePath.startsWith("..")) {
    throw new Error(`GLB output must be inside ${outDir} to write an asset manifest path`);
  }
  return `/assets/osrs/${relativePath}`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");
    if (eq !== -1) {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function resolveRequiredPath(value, flag) {
  if (!value || value === true) {
    throw new Error(`Missing required ${flag} path`);
  }
  return resolve(String(value));
}

function requiredNumber(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Missing or invalid ${flag}`);
  }
  return number;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function safeFileName(value) {
  return basename(String(value)).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function compactError(error) {
  if (error.code === "MISSING_BZIP2_DECODER") {
    return "needs seek-bzip";
  }
  return error.message;
}

function printHelp() {
  console.log(`
OSRS cache exporter scaffold

Usage:
  node tools/osrs-cache-exporter/export.mjs inspect --cache <cachePath> [--sample 3]
  node tools/osrs-cache-exporter/export.mjs refs --cache <cachePath> [--index 7] [--limit 25] [--offset 0]
  node tools/osrs-cache-exporter/export.mjs npc-search --cache <cachePath> --name yama [--json]
  node tools/osrs-cache-exporter/export.mjs npc --cache <cachePath> --id 12345
  node tools/osrs-cache-exporter/export.mjs npc-export-raw --cache <cachePath> --id 15700
  node tools/osrs-cache-exporter/export.mjs npc-export-glb --cache <cachePath> --id 15700 [--activate]
  node tools/osrs-cache-exporter/export.mjs extract-raw --cache <cachePath> --index 7 --archive 123 --name model-123
  node tools/osrs-cache-exporter/export.mjs export --cache <cachePath> [--ids tools/osrs-cache-exporter/ids.example.json] [--out public/assets/osrs] [--activate]

Notes:
  - inspect validates the local JS5 disk cache and lists index/archive counts.
  - refs decodes JS5 reference tables from idx255 and lists archive/file metadata.
  - npc-search scans config archive 9 for NPC names and model/animation IDs.
  - npc-export-raw writes one NPC's raw model archives into public/assets/osrs/raw/.
  - npc-export-glb converts one NPC's decoded type-3 models into a local GLB.
  - extract-raw reads one index/archive group and writes decoded bytes when compression is supported.
  - export writes folders, raw configured groups, an export report, and a manifest.draft.json.
  - Do not commit generated Jagex assets.
`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
