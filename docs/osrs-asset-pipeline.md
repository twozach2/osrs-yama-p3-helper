# OSRS Asset Pipeline

This project can load local, converted OSRS models, sprites, and fonts, but it should not commit or redistribute Jagex-owned assets.

## Legal / Distribution Rule

Use real OSRS cache assets only as local user-provided files. Keep them out of Git and out of hosted builds unless you have permission to distribute them. The repo ignores common model, texture, sprite, font, and cache files under `public/assets/osrs/` for this reason.

## Recommended Runtime Format

Use `.glb` as the browser runtime format for 3D models, ordinary PNG/WebP files for sprites, and WOFF2 for local fonts.

Why:

- Three.js has a maintained `GLTFLoader`.
- `.glb` keeps mesh, materials, textures, and animation clips in one file.
- PNG/WebP sprites and WOFF2 fonts load directly in the browser.
- A manifest lets the app keep using fallback art when one local file is missing.

## Folder Layout

Local files:

```text
public/
  assets/
    osrs/
      manifest.json
      player.glb
      yama.glb
      meteor.glb
      void-flare.glb
      fonts/
        RuneScape-UF.woff2
        RuneScape-Plain-12.woff2
      sprites/
        orb-hp.png
        orb-prayer.png
        orb-run.png
        hitsplat-damage.png
        hitsplat-miss.png
        hitsplat-poison.png
        hitsplat-burn.png
```

`manifest.json` example:

```json
{
  "version": 2,
  "name": "Local OSRS Asset Pack",
  "scale": 0.01,
  "fonts": {
    "ui": {
      "path": "/assets/osrs/fonts/RuneScape-UF.woff2",
      "family": "Local OSRS UI",
      "role": "ui"
    },
    "hitsplat": {
      "path": "/assets/osrs/fonts/RuneScape-Plain-12.woff2",
      "family": "Local OSRS Hitsplat",
      "role": "hitsplat"
    }
  },
  "sprites": {
    "orbHp": { "path": "/assets/osrs/sprites/orb-hp.png" },
    "orbPrayer": { "path": "/assets/osrs/sprites/orb-prayer.png" },
    "orbRun": { "path": "/assets/osrs/sprites/orb-run.png" },
    "hitsplatDamage": { "path": "/assets/osrs/sprites/hitsplat-damage.png" },
    "hitsplatMiss": { "path": "/assets/osrs/sprites/hitsplat-miss.png" },
    "hitsplatPoison": { "path": "/assets/osrs/sprites/hitsplat-poison.png" },
    "hitsplatBurn": { "path": "/assets/osrs/sprites/hitsplat-burn.png" }
  },
  "models": {
    "player": {
      "path": "/assets/osrs/player.glb",
      "scale": 0.01,
      "yOffset": 0
    },
    "yama": {
      "path": "/assets/osrs/yama.glb",
      "scale": 0.01,
      "yOffset": 0
    },
    "meteor": {
      "path": "/assets/osrs/meteor.glb",
      "scale": 0.01,
      "yOffset": 0
    },
    "voidFlare": {
      "path": "/assets/osrs/void-flare.glb",
      "scale": 0.01,
      "yOffset": 0
    }
  }
}
```

The app falls back to built-in primitive art when this manifest is missing.

## Where The Data Comes From

Two practical sources:

- Your local OSRS/RuneLite cache.
- OpenRS2 Archive cache downloads for historical/cache-version research.

RuneLite is useful because its repo includes cache-reading code. OpenRS2 is useful because it archives OSRS cache builds and XTEA keys.

## Conversion Steps

1. Identify the cache IDs:
   - NPC definition for Yama.
   - Model IDs used by that NPC definition.
   - Animation/sequence IDs for idle, attack, death, and any P3-specific poses.
   - Player kit/item model IDs for the gear you want to practice with.
   - Sprite IDs for orbs, hitsplats, prayers, projectiles, and other UI overlays.
   - Font assets for UI text and small stat/hitsplat text.

   The current exporter can inspect a local RuneLite JS5 cache and decode reference-table metadata. Set `RUNELITE_CACHE` to your local cache root first (see the README for typical Windows and macOS/Linux paths):

   ```bash
   npm install --no-save seek-bzip
   npm run assets:refs       -- --cache "$RUNELITE_CACHE" --index 2 --limit 25
   npm run assets:refs       -- --cache "$RUNELITE_CACHE" --index 7 --limit 25
   npm run assets:refs       -- --cache "$RUNELITE_CACHE" --index 8 --limit 25
   npm run assets:npc-search -- --cache "$RUNELITE_CACHE" --name yama --json
   ```

   The search output reports NPC ID, size, combat level, model archive IDs, and idle/walk animation IDs for every Yama match. Use those IDs in the export commands below; they're intentionally not committed here because they shift between cache revisions.

   Raw model export:

   ```bash
   npm run assets:npc-export-raw -- --cache "$RUNELITE_CACHE" --id <npc-id>
   ```

   GLB export and activate:

   ```bash
   npm run assets:npc-export-glb -- --cache "$RUNELITE_CACHE" --id <npc-id> --activate
   ```

2. Export raw model geometry:
   - Vertices.
   - Faces.
   - Face colors/textures.
   - Vertex groups or skinning metadata if available.

3. Export animation data:
   - Sequence definitions.
   - Frame transforms.
   - Frame durations.

4. Convert to glTF/GLB:
   - Build one mesh or skinned mesh per model.
   - Map OSRS face colors to flat materials.
   - Use nearest/pixelated texture filtering.
   - Preserve low-poly, flat-shaded style.
   - Convert OSRS coordinates into Three.js coordinates.

5. Export UI assets:
   - Save sprites as transparent PNG or WebP.
   - Save fonts as WOFF2.
   - Preserve nearest-neighbor / pixelated scaling.

6. Optimize:
   - Merge duplicate materials.
   - Keep textures small.
   - Avoid smoothing normals unless you intentionally want HDOS-style visuals.

7. Drop the local files into `public/assets/osrs/`.

8. Create `public/assets/osrs/manifest.json`.

9. Reload the app. The canvas debug attributes will report `assetMode="local-osrs"` if the manifest loaded. The side panel also shows counts for loaded models, sprites, and fonts.

## Browser Loader

The app imports:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
```

When `/assets/osrs/manifest.json` exists, it loads each configured section independently:

- `models`: loaded through `GLTFLoader` and swapped into known scene roles such as `player` and `yama`.
- `sprites`: loaded through `THREE.TextureLoader`; known IDs such as `orbHp`, `orbPrayer`, `orbRun`, and `hitsplatDamage` are wired into the HUD / hitsplat renderer.
- `fonts`: loaded through the browser `FontFace` API; `ui`, `osrs`, and `hitsplat` roles are used by HTML and canvas text.

If one file fails, the rest of the pack still loads. The app records counts and errors on the canvas dataset:

```text
data-asset-mode
data-asset-models
data-asset-sprites
data-asset-fonts
data-asset-warnings
data-asset-errors
data-asset-error
```

## Making It Feel Like OSRS

Real assets alone are not enough. The game feel also needs:

- Camera angle and input behavior similar to the live client.
- Tile-height terrain and correct wall/object occlusion.
- Animation clips tied to OSRS tick timing.
- Correct model scale and footprint sizes.
- Hit splats, prayer icons, projectile spot animations, shadows, and local UI sprites.
- Mouse-hit regions that match the in-game clickable model footprint.

## Next Build Step

Extend the Node cache exporter into config/model/sprite converters:

```text
tools/
  osrs-cache-exporter/
    lib/
      configs.*
      models.*
      sprites.*
    ids.json
```

Input:

```json
{
  "npcs": {
    "yama": 0
  },
  "player": {
    "equipment": []
  },
  "sprites": {
    "orbHp": 0,
    "hitsplatDamage": 0
  }
}
```

Output:

```text
public/assets/osrs/yama.glb
public/assets/osrs/player.glb
public/assets/osrs/fonts/*.woff2
public/assets/osrs/sprites/*.png
public/assets/osrs/manifest.json
```

The first Yama NPC/model/animation IDs are now identified from the local cache, and current type-3 model archives can be converted into a flat-shaded GLB. The next unknowns are sequence/frame decoding for animation playback, exact sprite IDs for UI/projectile parity, and visual tuning against in-game reference footage.
