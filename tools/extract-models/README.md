# Real OSRS model extraction (colosim-style)

Pulls actual Yama + player models out of the local OSRS cache as glTF/GLB,
landing them under `public/assets/osrs/models/` (gitignored). Mirrors the
pipeline `colosim.com` uses for Sol Heredit / Inferno NPCs.

## Cache layout

The script auto-detects the cache in this order:

1. `OSRS_CACHE` environment variable.
2. `tools/extract-models/cache` symlink / junction.
3. RuneLite's normal cache path at `~/.runelite/jagexcache/oldschool/LIVE`.

Optional one-time symlink setup:

```bash
ln -snf "$HOME/.runelite/jagexcache/oldschool/LIVE" tools/extract-models/cache
```

Override the source by setting `OSRS_CACHE` or re-pointing the symlink. The cache files
(`main_file_cache.dat2`, `main_file_cache.idx*`) must live **directly**
inside the linked directory — not inside a nested `cache/` subfolder,
despite what `osrscachereader`'s README says.

## Run

```bash
npm run extract:models    # builds yama.glb + player.glb
npm run extract:yama      # only yama
npm run extract:player    # only player
```

Output:

- `tools/extract-models/out/*.gltf` — intermediate, kept for debugging.
- `public/assets/osrs/models/*.glb` — final, picked up by `AssetPack`
  at runtime when `public/assets/osrs/manifest.json` references them.

## Why two cache tools

Our own `tools/osrs-cache-exporter/` decodes NPC config defs correctly on
modern caches; `osrscachereader@1.1.3`'s `NpcLoader` / `ItemLoader` /
`KitLoader` are stale and silently drop opcodes 15/44/70+, which means
they return empty `models` arrays for newer NPCs (Yama returns
`models: []`) and never produce usable names for newer items
(Oathplate, Emberlight, Avernic treads max). The extractor therefore:

1. Uses our exporter to resolve **which model IDs to load** (see
   `TARGETS` in `extract.mjs`).
2. Uses `osrscachereader`'s `MODEL` / `SEQUENCE` / `FRAMES` / `FRAMEMAP`
   loaders + `GLTFExporter` + `ModelGroup` to actually pull the meshes
   and animations into glTF.
3. Pipes the glTF through `gltf-transform optimize --compress meshopt`
   to land a `.glb`.

If you want a different NPC / set of models, look up its ID via
`npm run assets:npc -- --cache "$RUNELITE_CACHE" --id <id>`, copy the
`models[]` and `animations.idle/walk` values, and add an entry to
`TARGETS`.

## Known limitations

- **Yama animations**: idle (12140) and walk (12141) reference frame
  archives 543 and 545 which are not in many caches by default — OSRS
  streams them lazily based on the player's location. Visit Yama's
  chamber once with RuneLite to populate them, then re-run the
  extractor.
- **Player armor**: the current `player` target uses NPC 385 "Man" — a
  fully un-equipped male with the canonical player anim set
  (idle 808 / walk 819 / run 824 / rotate-180 820 / strafe-l/r 822/821).
  Real equipment overlays need `ItemLoader`'s `maleModel0` /
  `maleModel1` fields, which currently come back null on this cache;
  see the V4 plan in `docs/osrs-visual-parity-plan.md` for the
  follow-up.
- **No IP commit**: `public/assets/osrs/` is gitignored; the produced
  GLBs are Jagex-derived and stay on your machine.
