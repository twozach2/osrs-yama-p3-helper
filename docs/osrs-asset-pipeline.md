# OSRS Asset Pipeline

This project can load local, converted OSRS models, but it should not commit or redistribute Jagex-owned assets.

## Legal / Distribution Rule

Use real OSRS cache assets only as local user-provided files. Keep them out of Git and out of hosted builds unless you have permission to distribute them. The repo ignores common model and texture files under `public/assets/osrs/` for this reason.

## Recommended Runtime Format

Use `.glb` as the browser runtime format.

Why:

- Three.js has a maintained `GLTFLoader`.
- `.glb` keeps mesh, materials, textures, and animation clips in one file.
- It is much easier to cache and swap than raw OSRS cache definitions.

## Folder Layout

Local files:

```text
public/
  assets/
    osrs/
      manifest.json
      player.glb
      yama.glb
```

`manifest.json` example:

```json
{
  "scale": 0.01,
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
    }
  }
}
```

The app falls back to built-in primitive models when this manifest is missing.

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

5. Optimize:
   - Merge duplicate materials.
   - Keep textures small.
   - Avoid smoothing normals unless you intentionally want HDOS-style visuals.

6. Drop the `.glb` files into `public/assets/osrs/`.

7. Create `public/assets/osrs/manifest.json`.

8. Reload the app. The canvas debug attributes will report `assetMode="local-osrs"` if the manifest and models loaded.

## Browser Loader

The app already imports:

```js
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
```

When `/assets/osrs/manifest.json` exists, it loads the configured `player` and `yama` models and swaps them into the scene. If loading fails, it keeps the fallback models and records the error on the canvas dataset.

## Making It Feel Like OSRS

Models alone are not enough. The game feel also needs:

- Orthographic camera angle similar to the live client.
- Tile-height terrain and correct wall/object occlusion.
- Animation clips tied to OSRS tick timing.
- Correct model scale and footprint sizes.
- Hit splats, prayer icons, projectile spot animations, and shadows.
- Mouse-hit regions that match the in-game clickable model footprint.

## Next Build Step

Create a small Node or Java converter:

```text
tools/
  osrs-cache-exporter/
    export-models.*
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
  }
}
```

Output:

```text
public/assets/osrs/yama.glb
public/assets/osrs/player.glb
public/assets/osrs/manifest.json
```

The unknowns are the real Yama NPC/model/animation IDs. Once those are identified, the rest is a mechanical conversion pipeline.
