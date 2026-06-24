/**
 * Pulls Yama + a generic male player out of the local OSRS cache as glTF/GLB
 * files under public/assets/osrs/models/. Mirrors what colosim does, but
 * uses pre-resolved model / animation IDs (looked up by our own exporter,
 * since osrscachereader's NpcLoader / ItemLoader / KitLoader are stale for
 * the user's modern cache).
 *
 *   node tools/extract-models/extract.mjs              # builds all
 *   node tools/extract-models/extract.mjs yama         # one target
 *   node tools/extract-models/extract.mjs player
 *
 * Output is gitignored; do not commit GLBs.
 */
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { RSCache, IndexType, GLTFExporter, ModelGroup } from "osrscachereader";

const CACHE_DIR = "tools/extract-models/cache";
const OUT_DIR = "tools/extract-models/out";
const FINAL_DIR = "public/assets/osrs/models";

// IDs resolved via tools/osrs-cache-exporter/export.mjs npc / npc-search.
// Yama animations are idle + walk for now; attack / hit / death TBD once the
// engine event hooks land in V4.2.
// Animation entries are `[osrsId, roleName]` so the runtime AnimationMixer
// can look clips up by role ("idle", "walk", ...) rather than by index.
const TARGETS = {
  yama: {
    modelIds: [10468, 10338, 10340],
    animations: [
      [12140, "idle"],
      [12141, "walk"]
    ]
  },
  player: {
    // NPC 385 "Man" -- generic male with the canonical player anim set.
    modelIds: [215, 281, 246, 28515, 26632, 176, 28285, 181, 323],
    animations: [
      [808, "idle"],
      [819, "walk"],
      [824, "run"],
      [820, "rotate-180"],
      [821, "strafe-right"],
      [822, "strafe-left"]
    ]
  }
};

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(TARGETS);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(FINAL_DIR, { recursive: true });

const cache = new RSCache(CACHE_DIR);
// Silence the chatty unhandled-opcode warnings from loaders we don't use.
const origErr = console.error;
console.error = () => {};

cache.onload.then(async () => {
  console.error = origErr;
  console.log(`Cache opened at ${CACHE_DIR}\n`);

  for (const name of names) {
    if (!(name in TARGETS)) {
      console.warn(`Unknown target "${name}". Known: ${Object.keys(TARGETS).join(", ")}`);
      continue;
    }
    const target = TARGETS[name];
    const animSummary = target.animations.map(([id, role]) => `${role}=${id}`).join(",");
    console.log(`-- ${name} -- models=[${target.modelIds.join(",")}], anims=[${animSummary}]`);

    const group = new ModelGroup();
    for (const id of target.modelIds) {
      const model = await cache.getDef(IndexType.MODELS, id);
      if (!model) {
        throw new Error(`Model ${id} not in cache (target ${name})`);
      }
      group.addModel(model);
    }

    const merged = group.getMergedModel();
    const exporter = new GLTFExporter(merged);

    for (const [animId, role] of target.animations) {
      try {
        const applied = await merged.loadAnimation(cache, animId, false, true);
        if (!applied || !Array.isArray(applied.vertexData) || applied.vertexData.length === 0) {
          console.warn(`  anim ${role} (${animId}): no frames; skipping`);
          continue;
        }
        const morphTargetIds = applied.vertexData.map((frame) => exporter.addMorphTarget(frame));
        exporter.addAnimation(morphTargetIds, applied.lengths, role, "STEP");
        console.log(`  anim ${role} (${animId}): ${applied.vertexData.length} frames`);
      } catch (error) {
        console.warn(`  anim ${role} (${animId}): ${error.message?.split("\n")[0] ?? error}; skipping`);
      }
    }

    exporter.addColors(merged);
    const gltfBytes = exporter.export();
    const gltfPath = `${OUT_DIR}/${name}.gltf`;
    fs.writeFileSync(gltfPath, gltfBytes);
    console.log(`  wrote ${gltfPath} (${gltfBytes.length} bytes)`);

    // gltf-transform to compress + convert to .glb. Falls back to a plain
    // file-rename if the CLI isn't available.
    const glbPath = `${FINAL_DIR}/${name}.glb`;
    try {
      execSync(`npx --no-install gltf-transform optimize --compress meshopt "${gltfPath}" "${glbPath}"`, {
        stdio: ["ignore", "ignore", "inherit"]
      });
      console.log(`  optimized -> ${glbPath}`);
    } catch (error) {
      console.warn(`  gltf-transform optimize failed (${error.message?.split("\n")[0] ?? error}); falling back to copy`);
      fs.copyFileSync(gltfPath, glbPath.replace(/\.glb$/, ".gltf"));
    }
  }

  cache.close();
  console.log("\nDone.");
});
