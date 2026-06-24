/**
 * Targeted item-id resolver. Sweeps a contiguous ID range and prints the IDs
 * whose name matches any of the gear terms in the search list. Less elegant
 * than getAllDefs, but immune to osrscachereader's parser-desync bug on
 * unhandled opcodes (newer post-2024 items hit opcode 44 / 15 and the
 * walker drops them; this one isolates each id).
 *
 *   node tools/extract-models/probe-items.mjs [maxId]
 */
import { RSCache } from "osrscachereader";

const SEARCH = [
  "torva full helm",
  "oathplate",
  "ferocious gloves",
  "avernic treads",
  "amulet of rancor",
  "infernal cape",
  "emberlight",
  "avernic defender"
];

const MAX_ID = Number(process.argv[2] ?? 32000);

const cache = new RSCache("tools/extract-models/cache");

// Suppress the noisy per-opcode warnings while we sweep.
const origErr = console.error;
console.error = () => {};

cache.onload.then(async () => {
  const hits = [];
  for (let id = 0; id < MAX_ID; id += 1) {
    let def;
    try {
      def = await cache.getItem(id);
    } catch {
      continue;
    }
    const name = String(def?.name ?? "").toLowerCase();
    if (!name || name === "null") continue;
    for (const term of SEARCH) {
      if (name === term || name.includes(term)) {
        hits.push({ id, name: def.name, term });
        break;
      }
    }
  }
  console.error = origErr;

  console.log(`\nScanned ids 0..${MAX_ID - 1}; ${hits.length} matches:`);
  for (const h of hits) {
    console.log(`  ${String(h.id).padStart(6)}  ${h.name.padEnd(30)}  (term: ${h.term})`);
  }

  cache.close();
});
