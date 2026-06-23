// Method-pack registry. A pack groups one or more route variants together with
// their optional tile-marker presets and source/reference metadata. The engine
// only sees a flat `methods` map keyed by `<packId>:<variantId>`, so packs can
// be added by dropping a new file under src/methods/ and registering it below.
//
// Pack schema:
//   {
//     id: string,                             // stable id, used as a key prefix
//     name: string,                           // display name in the UI
//     description?: string,
//     source?: object,                        // free-form provenance metadata
//     schedule?: object,                      // optional reference schedule
//     variants: {                             // route variants within the pack
//       [variantId]: {
//         name: string,
//         description?: string,
//         source?: string,
//         coords: string[]                    // OSRS-style "F3" tile coords
//       }
//     },
//     markerPresets?: {                       // optional tile-marker presets
//       [presetId]: {
//         name: string,
//         markers: [coord, label, argbHex][]
//       }
//     }
//   }

import { coordToTile } from "../roboflyData.js";
import { ROBOFLY_PACK } from "./robofly.js";

export const METHOD_PACKS = {
  [ROBOFLY_PACK.id]: ROBOFLY_PACK
  // Add new packs here, e.g.:
  //   [OTHER_PACK.id]: OTHER_PACK
};

export function listMethodPacks() {
  return Object.values(METHOD_PACKS);
}

export function getPack(packId) {
  return METHOD_PACKS[packId] ?? null;
}

// Flatten every pack's variants into one map keyed by `<packId>:<variantId>`.
// Each entry carries a `packId` so the UI can filter by active pack without
// having to look up the registry again.
export function getAllMethods() {
  const out = {};
  for (const pack of listMethodPacks()) {
    for (const [variantId, variant] of Object.entries(pack.variants ?? {})) {
      out[`${pack.id}:${variantId}`] = {
        packId: pack.id,
        variantId,
        name: variant.name,
        source: variant.source,
        description: variant.description,
        waypoints: (variant.coords ?? []).map((coord, tick) => ({
          tick,
          coord,
          tile: coordToTile(coord),
          label: coord
        }))
      };
    }
  }
  return out;
}

// Same flattening for marker presets so the UI can pick across packs.
export function getAllMarkerPresets() {
  const out = {};
  for (const pack of listMethodPacks()) {
    for (const [presetId, preset] of Object.entries(pack.markerPresets ?? {})) {
      out[`${pack.id}:${presetId}`] = {
        packId: pack.id,
        presetId,
        name: preset.name,
        pastebin: preset.pastebin,
        markers: preset.markers
      };
    }
  }
  return out;
}

export function getDefaultPackId() {
  return listMethodPacks()[0]?.id ?? null;
}

export function getDefaultMethodId(packId = getDefaultPackId()) {
  const pack = getPack(packId);
  const firstVariant = Object.keys(pack?.variants ?? {})[0];
  return firstVariant ? `${packId}:${firstVariant}` : null;
}

export function getDefaultMarkerPresetId(packId = getDefaultPackId()) {
  const pack = getPack(packId);
  const firstPreset = Object.keys(pack?.markerPresets ?? {})[0];
  return firstPreset ? `${packId}:${firstPreset}` : null;
}
