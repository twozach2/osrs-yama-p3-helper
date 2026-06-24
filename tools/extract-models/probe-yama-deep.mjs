/**
 * Dumps every field of NPC 14176/15555 + any IDs they transform into, so we
 * can find where Yama's actual model IDs live (transforms? chatheadModels?
 * something custom).
 */
import { RSCache, IndexType, ConfigType } from "osrscachereader";

const cache = new RSCache("tools/extract-models/cache");
console.error = () => {};

const dump = (label, def) => {
  console.log(`\n=== ${label} ===`);
  for (const [k, v] of Object.entries(def ?? {})) {
    const value = typeof v === "function"
      ? "<fn>"
      : Array.isArray(v) || typeof v === "object"
        ? JSON.stringify(v)
        : v;
    console.log(`  ${k}: ${value}`);
  }
};

cache.onload.then(async () => {
  for (const id of [14176, 15555]) {
    const def = await cache.getDef(IndexType.CONFIGS, ConfigType.NPC, id);
    dump(`NPC ${id}`, def);
    if (def?.transforms) {
      for (const t of def.transforms) {
        if (t < 0) continue;
        const sub = await cache.getDef(IndexType.CONFIGS, ConfigType.NPC, t);
        dump(`  -> transform NPC ${t}`, sub);
      }
    }
  }
  cache.close();
});
