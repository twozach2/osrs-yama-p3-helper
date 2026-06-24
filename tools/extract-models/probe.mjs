/**
 * One-off ID resolver. Walks every NPC and ITEM def in the local cache and
 * prints the IDs whose lowercased name matches one of the targets below.
 *
 *   node tools/extract-models/probe.mjs
 *
 * Pure read; no files written. Re-run any time the gear list changes.
 */
import { RSCache, IndexType, ConfigType } from "osrscachereader";

const NPC_TARGETS = ["yama"];
const ITEM_TARGETS = [
  "torva full helm",
  "oathplate chest",
  "oathplate legs",
  "ferocious gloves",
  "avernic treads",
  "amulet of rancor",
  "infernal cape",
  "emberlight",
  "avernic defender"
];

// RSCache wants a directory containing the raw main_file_cache.* files,
// NOT a parent containing a `cache/` subfolder (despite the README example).
const cache = new RSCache("tools/extract-models/cache");

cache.onload.then(async () => {
  const npcs = await cache.getAllDefs(IndexType.CONFIGS, ConfigType.NPC);
  const items = await cache.getAllDefs(IndexType.CONFIGS, ConfigType.ITEM);

  const matchesByTarget = (defs, targets) => {
    const out = {};
    for (const t of targets) out[t] = [];
    for (const def of defs) {
      const name = String(def?.name ?? "").toLowerCase();
      if (!name || name === "null") continue;
      for (const target of targets) {
        if (name === target || name.includes(target)) {
          out[target].push({ id: def.id, name: def.name });
        }
      }
    }
    return out;
  };

  const printGroup = (title, group) => {
    console.log(`\n=== ${title} ===`);
    for (const [target, hits] of Object.entries(group)) {
      const summary = hits.length === 0
        ? "(no match)"
        : hits.map((h) => `${h.id}: "${h.name}"`).join(" | ");
      console.log(`${target.padEnd(22)} -> ${summary}`);
    }
  };

  printGroup("NPCs", matchesByTarget(npcs, NPC_TARGETS));
  printGroup("Items", matchesByTarget(items, ITEM_TARGETS));

  cache.close();
});
