# OSRS Cache Exporter

This tool reads a local Old School RuneScape JS5 disk cache and prepares local-only asset-pack files for the practice tool.

Do not commit generated assets. They are Jagex-owned cache data. The repo ignores the generated asset folders under `public/assets/osrs/`.

## Your Cache Path

On this machine RuneLite cache files were found at:

```powershell
C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE
```

That folder contains `main_file_cache.dat2` and `main_file_cache.idx*` files.

## Commands

Inspect the cache:

```powershell
node tools/osrs-cache-exporter/export.mjs inspect --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE" --sample 3
```

Read reference-table metadata for one index:

```powershell
npm.cmd install --no-save seek-bzip
node tools/osrs-cache-exporter/export.mjs refs --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE" --index 7 --limit 25
```

Useful indices while chasing visual assets:

- `2` = configs, where NPC/object/sequence definitions live.
- `7` = models.
- `8` = sprites.

Find Yama NPC definitions:

```powershell
node tools/osrs-cache-exporter/export.mjs npc-search --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE" --name yama --json
```

Dump one decoded NPC definition:

```powershell
node tools/osrs-cache-exporter/export.mjs npc --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE" --id 15700
```

Export one NPC's raw model archives:

```powershell
node tools/osrs-cache-exporter/export.mjs npc-export-raw --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE" --id 15700
```

Convert one NPC's type-3 model archives into a browser GLB and activate the local manifest:

```powershell
node tools/osrs-cache-exporter/export.mjs npc-export-glb --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE" --id 15700 --activate
```

Extract one raw archive group:

```powershell
node tools/osrs-cache-exporter/export.mjs extract-raw --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE" --index 7 --archive 0 --name example-model
```

Run the draft export:

```powershell
node tools/osrs-cache-exporter/export.mjs export --cache "C:\Users\zacht\.runelite\jagexcache\oldschool\LIVE"
```

The draft export writes:

```text
public/assets/osrs/
  fonts/
  models/
  raw/
    export-report.json
    *.bin
    *.container.bin
  sprites/
  manifest.draft.json
```

`manifest.draft.json` is intentionally not active. Rename or copy it to `manifest.json` only after real decoded `.glb`, `.png`, and `.woff2` files exist.

## Current Stage

This first pass can:

- Validate the cache folder.
- List cache indices and archive counts.
- Read `.idx` entries and `.dat2` sector chains.
- Decode uncompressed and gzip-compressed archive containers.
- Decode bzip2-compressed archive containers after `seek-bzip` is installed locally with `npm.cmd install --no-save seek-bzip`.
- Decode JS5 reference tables from `idx255` and list archive/file metadata.
- Unpack multi-file JS5 groups.
- Decode enough NPC config data to search names, model IDs, animation IDs, combat levels, stats, actions, and params.
- Export one NPC's decoded raw model archives for local conversion work.
- Decode current type-3 OSRS model archives into flat-shaded vertex-color GLB files.
- Update a local ignored `public/assets/osrs/manifest.json` with the generated model when `npc-export-glb --activate` is used.
- Preserve unsupported compressed containers for later decoding.
- Generate a draft manifest and raw export report.

Useful Yama IDs from the current local cache:

- Combat Yama candidates: `14176`, `15555`, `15700`.
- Best first model target: NPC `15700` (`Yama`, size `5`, combat `1524`, HP param/stat `5000`).
- Yama model archives: `10468`, `10338`, `10340` in index `7`.
- Yama idle/walk animations: `12140`, `12141`.
- Generated local GLB path: `public/assets/osrs/yama.glb`.

Next layers:

1. Tune model orientation, scale, material color conversion, and camera fit against in-game screenshots/video.
2. Decode sequence/frame archives for animation playback.
3. Decode sprite archives to PNG.
4. Wire animations into tick playback.
5. Export player equipment models and combine them into a local player GLB.

The type-3 model decoder follows the cache layout used by RuneLite's `ModelLoader`.
