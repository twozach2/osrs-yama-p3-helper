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
    size: { width: 3, height: 3 }
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
  return [
    message(
      0,
      "RoboFly source schedule loaded. Click floor tiles to move; click Yama to attack."
    ),
    ...ROBOFLY_SCHEDULE.yamaAttackTicks.map((tick) =>
      hazard(tick, 1, rectangle(coordToTile("E11"), 7, 7), `Yama melee check ${tick}`)
    ),
    ...ROBOFLY_SCHEDULE.playerAttackLandingTicks.map((tick) =>
      message(tick, `Player attack lands on tick ${tick}.`)
    ),
    ...ROBOFLY_SCHEDULE.meteorFallTicks.map((tick, index) =>
      meteorFall(tick, tick + 3, tick + 4, `Meteor ${index + 1}`)
    ),
    message(
      ROBOFLY_SCHEDULE.loopClickTick,
      `Loop click check: tick ${ROBOFLY_SCHEDULE.loopClickTick} should path toward tick ${ROBOFLY_SCHEDULE.loopTargetTick}.`
    )
  ];
}

function message(tick, text) {
  return { type: "message", tick, text };
}

function hazard(tick, duration, tiles, label) {
  return { type: "hazard", tick, duration, tiles, label };
}

function meteorFall(tick, damageTick, dodgeTick, label) {
  return { type: "meteorFall", tick, damageTick, dodgeTick, label };
}

function rectangle(origin, width, height) {
  const tiles = [];

  for (let y = origin.y; y < origin.y + height; y += 1) {
    for (let x = origin.x; x < origin.x + width; x += 1) {
      tiles.push({ x, y });
    }
  }

  return tiles;
}
