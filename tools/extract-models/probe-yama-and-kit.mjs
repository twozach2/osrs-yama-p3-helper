/**
 * Probes the data we need to build Yama and base-male-player GLBs:
 *   - Yama (NPC 14176, 15555) defs: model list + standing/walking/attack anim IDs.
 *   - IDENTKIT loader: enumerate kit IDs whose .models[] is non-empty so we
 *     can identify the head/torso/arms/legs/feet base pieces for an
 *     un-equipped male.
 */
import { RSCache, IndexType, ConfigType } from "osrscachereader";

const cache = new RSCache("tools/extract-models/cache");
console.error = () => {}; // suppress unhandled-opcode noise

cache.onload.then(async () => {
  for (const id of [14176, 15555]) {
    const def = await cache.getDef(IndexType.CONFIGS, ConfigType.NPC, id);
    if (!def) {
      console.log(`NPC ${id}: not found`);
      continue;
    }
    console.log(`\nNPC ${id} "${def.name}":`);
    console.log(`  models:                ${JSON.stringify(def.models)}`);
    console.log(`  standingAnimation:     ${def.standingAnimation}`);
    console.log(`  walkingAnimation:      ${def.walkingAnimation}`);
    console.log(`  rotation180Animation:  ${def.rotation180Animation}`);
    console.log(`  rotation90RightAnimation: ${def.rotation90RightAnimation}`);
    console.log(`  rotation90LeftAnimation: ${def.rotation90LeftAnimation}`);
    if ("category" in def) console.log(`  category: ${def.category}`);
    if (def.size) console.log(`  size: ${def.size}`);
    console.log(`  combatLevel: ${def.combatLevel}`);
  }

  // IDENTKIT scan. Iterate id by id and collect any with non-empty model
  // lists, so we know which kits represent a usable base body part.
  console.log("\nScanning IDENTKIT defs...");
  let found = 0;
  for (let id = 0; id < 500 && found < 60; id += 1) {
    let def;
    try {
      def = await cache.getDef(IndexType.CONFIGS, ConfigType.IDENTKIT, id);
    } catch {
      continue;
    }
    if (!def) continue;
    const models = Array.isArray(def.models) ? def.models : [];
    if (models.length === 0) continue;
    console.log(`  kit ${String(id).padStart(3)}  bodyPartId=${def.bodyPartId}  models=${JSON.stringify(models)}`);
    found += 1;
  }

  cache.close();
});
