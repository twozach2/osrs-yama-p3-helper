# OSRS Cache Exporter

This tool reads a local Old School RuneScape JS5 disk cache and prepares local-only asset-pack files for the practice tool.

Do not commit generated assets. They are Jagex-owned cache data. The repo ignores the generated asset folders under `public/assets/osrs/`.

## Cache Path

Point `--cache` at the folder that contains `main_file_cache.dat2` and `main_file_cache.idx*`. Typical locations:

- macOS / Linux: `~/.runelite/jagexcache/oldschool/LIVE`
- Windows: `%USERPROFILE%\.runelite\jagexcache\oldschool\LIVE`

To avoid repeating the path, export it once per shell:

```bash
export RUNELITE_CACHE="$HOME/.runelite/jagexcache/oldschool/LIVE"   # bash / zsh
```

```powershell
$env:RUNELITE_CACHE = "$env:USERPROFILE\.runelite\jagexcache\oldschool\LIVE"  # PowerShell
```

## Commands

Inspect the cache:

```bash
node tools/osrs-cache-exporter/export.mjs inspect --cache "$RUNELITE_CACHE" --sample 3
```

Read reference-table metadata for one index:

```bash
npm install --no-save seek-bzip
node tools/osrs-cache-exporter/export.mjs refs --cache "$RUNELITE_CACHE" --index 7 --limit 25
```

Useful indices while chasing visual assets:

- `2` = configs, where NPC/object/sequence definitions live.
- `7` = models.
- `8` = sprites.

Find NPC definitions by name:

```bash
node tools/osrs-cache-exporter/export.mjs npc-search --cache "$RUNELITE_CACHE" --name yama --json
```

Dump one decoded NPC definition:

```bash
node tools/osrs-cache-exporter/export.mjs npc --cache "$RUNELITE_CACHE" --id <npc-id>
```

Export one NPC's raw model archives:

```bash
node tools/osrs-cache-exporter/export.mjs npc-export-raw --cache "$RUNELITE_CACHE" --id <npc-id>
```

Convert one NPC's type-3 model archives into a browser GLB and activate the local manifest:

```bash
node tools/osrs-cache-exporter/export.mjs npc-export-glb --cache "$RUNELITE_CACHE" --id <npc-id> --activate
```

Extract one raw archive group:

```bash
node tools/osrs-cache-exporter/export.mjs extract-raw --cache "$RUNELITE_CACHE" --index 7 --archive 0 --name example-model
```

Run the draft export:

```bash
node tools/osrs-cache-exporter/export.mjs export --cache "$RUNELITE_CACHE"
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
- Decode bzip2-compressed archive containers after `seek-bzip` is installed locally with `npm install --no-save seek-bzip`.
- Decode JS5 reference tables from `idx255` and list archive/file metadata.
- Unpack multi-file JS5 groups.
- Decode enough NPC config data to search names, model IDs, animation IDs, combat levels, stats, actions, and params.
- Export one NPC's decoded raw model archives for local conversion work.
- Decode current type-3 OSRS model archives into flat-shaded vertex-color GLB files.
- Update a local ignored `public/assets/osrs/manifest.json` with the generated model when `npc-export-glb --activate` is used.
- Preserve unsupported compressed containers for later decoding.
- Generate a draft manifest and raw export report.

Run `npm run assets:npc-search -- --cache "$RUNELITE_CACHE" --name yama --json` against your own cache to discover the current NPC, model, and animation IDs. They are intentionally not pinned in this repo since they drift between cache revisions. Generated local GLBs land at `public/assets/osrs/<name>.glb`, which is `.gitignore`d.

Next layers:

1. Tune model orientation, scale, material color conversion, and camera fit against in-game screenshots/video.
2. Decode sequence/frame archives for animation playback.
3. Decode sprite archives to PNG.
4. Wire animations into tick playback.
5. Export player equipment models and combine them into a local player GLB.

The type-3 model decoder follows the cache layout used by RuneLite's `ModelLoader`.
