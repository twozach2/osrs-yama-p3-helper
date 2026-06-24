/**
 * Sweeps an animation-ID range around Yama's known idle/walk (12140, 12141)
 * and reports which anims actually have loadable frame data in the local
 * cache. Yama's frame archives are streamed in by the OSRS client based on
 * what NPC the player has seen recently, so a given cache may be missing
 * some skeletons (we hit archive 543 / 545 missing on the first try).
 *
 *   node tools/extract-models/probe-yama-anims.mjs [from] [to]
 *
 * Defaults to 12100..12200. Loads each anim against Yama's merged model
 * (so the frame data is interpreted against the right skeleton); prints
 * frame counts and lengths for the ones that do load.
 */
import { RSCache, IndexType, ModelGroup } from "osrscachereader";

// Animaya skeletons (newer rigging format) throw synchronously from
// inside osrscachereader; the throw isn't reliably caught by our await
// boundary so it surfaces as an unhandled rejection that kills node.
// Swallow it here so the sweep keeps going.
process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

const cache = new RSCache("tools/extract-models/cache");
const origErr = console.error;
console.error = () => {};

const FROM = Number(process.argv[2] ?? 12100);
const TO = Number(process.argv[3] ?? 12200);
const YAMA_MODEL_IDS = [10468, 10338, 10340];

cache.onload.then(async () => {
  const group = new ModelGroup();
  for (const id of YAMA_MODEL_IDS) {
    const model = await cache.getDef(IndexType.MODELS, id);
    group.addModel(model);
  }
  const merged = group.getMergedModel();

  console.error = origErr;
  console.log(`Sweeping anim ids ${FROM}..${TO - 1} against Yama (${YAMA_MODEL_IDS.length} merged models)...\n`);

  let found = 0;
  for (let animId = FROM; animId < TO; animId += 1) {
    let applied;
    let errMsg = null;
    try {
      console.error = () => {};
      // Wrap in a Promise.resolve to make sure sync throws from inside
      // osrscachereader (e.g. Animaya skeletons we can't decode) become
      // rejections rather than crashing the sweep.
      // 2 s timeout per anim -- Animaya skeletons cause loadAnimation
      // to deadlock (the inner def loader queue never resolves after the
      // synchronous throw at AnimayaLoader.js:273).
      applied = await Promise.race([
        new Promise((resolve, reject) => {
          try {
            merged.loadAnimation(cache, animId, false, true).then(resolve, reject);
          } catch (e) {
            reject(e);
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout (likely Animaya skeleton)")), 2000)),
      ]);
    } catch (e) {
      applied = null;
      errMsg = (e && e.message) ? e.message.split("\n")[0] : String(e);
    } finally {
      console.error = origErr;
    }
    if (!applied || !Array.isArray(applied.vertexData) || applied.vertexData.length === 0) {
      if (errMsg && !errMsg.includes("undefined")) console.log(`  anim ${animId}: ERR ${errMsg.slice(0, 80)}`);
      continue;
    }
    const totalTicks = applied.lengths.reduce((a, b) => a + b, 0);
    console.log(`  anim ${animId}: ${applied.vertexData.length} frames, ~${totalTicks} ticks total`);
    found += 1;
  }
  console.log(`\n${found} loadable anim(s) found in [${FROM}, ${TO}).`);

  cache.close();
});
