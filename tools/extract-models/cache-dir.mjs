/**
 * Shared OSRS cache-directory resolution for the extract-models tools.
 * Honors the OSRS_CACHE env var, then a repo-local cache dir, then the
 * default RuneLite install path. Throws with a helpful message if none
 * of them contain a cache.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function resolveCacheDir() {
  const candidates = [
    process.env.OSRS_CACHE,
    "tools/extract-models/cache",
    path.join(os.homedir(), ".runelite", "jagexcache", "oldschool", "LIVE")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(path.join(resolved, "main_file_cache.dat2"))) {
      return resolved;
    }
  }

  throw new Error([
    "Could not find an OSRS cache for model extraction.",
    "Set OSRS_CACHE or create tools/extract-models/cache pointing at your RuneLite cache.",
    `Checked: ${candidates.map((candidate) => path.resolve(candidate)).join(", ")}`
  ].join(" "));
}
