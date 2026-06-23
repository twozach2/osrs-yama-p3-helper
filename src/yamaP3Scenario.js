import { makeTileSet } from "./pathfinding.js";
import { coordToTile, ROBOFLY_PATHS, ROBOFLY_SCHEDULE, ROBOFLY_VIDEO } from "./roboflyData.js";

export const TICK_MS = 600;

const WIDTH = 15;
const HEIGHT = 15;

export const YAMA_P3_SCENARIO = {
  id: "yama-p3-robofly",
  name: "Yama Phase 3 RoboFly",
  tickMs: TICK_MS,
  calibrationStatus: "source-data-draft",
  source: ROBOFLY_VIDEO,
  firstActionTick: 0,
  arena: createArena(),
  playerStart: coordToTile(ROBOFLY_PATHS.roboflySource.coords[0]),
  unsafeZone: {
    name: "Yama attack danger",
    origin: coordToTile("E11"),
    size: { width: 7, height: 7 }
  },
  yama: {
    name: "Yama",
    origin: coordToTile("G9"),
    size: { width: 3, height: 3 },
    maxHp: 833,
    attackSpeed: 7,
    maxHits: { auto: 46, meteor: 162, shadowStomp: 80, flare: 25, poison: 20 },
    defenceLevel: 225,
    defenceBonus: { stab: 135, slash: 108, crush: 449, magic: 81, ranged: 297 },
    prayerPierce: { magic: 3, ranged: 3, melee: 22 },
    flare: { hp: 71, chargeTicks: 8, spawnEvery: 14, specDamage: 80 },
    meteor: { telegraphTicks: 3, safeDist: 2, edgeDamage: 80, oneTileDamage: 40 },
    shadow: { everyTicks: 21, telegraphTicks: 2 }
  },
  schedule: ROBOFLY_SCHEDULE,
  methods: createMethods(),
  events: createEvents()
};

function createArena() {
  return {
    width: WIDTH,
    height: HEIGHT,
    center: { x: 7, y: 7 },
    blocked: [],
    blockedSet: makeTileSet([])
  };
}

function createMethods() {
  return Object.fromEntries(
    Object.entries(ROBOFLY_PATHS).map(([id, path]) => [
      id,
      {
        name: path.name,
        source: path.source,
        description: path.description,
        waypoints: path.coords.map((coord, tick) => ({
          tick,
          coord,
          tile: coordToTile(coord),
          label: coord
        }))
      }
    ])
  );
}

function createEvents() {
  // RoboFly schedule no longer drives mechanics — the reactive Yama AI is the source
  // of truth. The only baseline event is the boot message; the schedule remains
  // available via scenario.schedule for the optional training overlay.
  return [
    message(
      0,
      "Reactive Yama P3 sim loaded. Click floor tiles to move; click Yama to attack."
    )
  ];
}

function message(tick, text) {
  return { type: "message", tick, text };
}
