// RoboFly method pack — wraps the existing roboflyData exports as a method
// pack so it slots into the registry alongside any other packs added later.

import {
  ROBOFLY_FAIL_CONDITIONS,
  ROBOFLY_MARKER_PRESETS,
  ROBOFLY_PATHS,
  ROBOFLY_SCHEDULE,
  ROBOFLY_VIDEO
} from "../roboflyData.js";

export const ROBOFLY_PACK = {
  id: "robofly",
  name: "RoboFly",
  description:
    "Computer-optimized 3-tick Yama cycle by jeremiah855. Source video, " +
    "Pastebin tile markers, and shared notebook are the canonical references.",
  source: ROBOFLY_VIDEO,
  schedule: ROBOFLY_SCHEDULE,
  failConditions: ROBOFLY_FAIL_CONDITIONS,
  variants: ROBOFLY_PATHS,
  markerPresets: ROBOFLY_MARKER_PRESETS
};
