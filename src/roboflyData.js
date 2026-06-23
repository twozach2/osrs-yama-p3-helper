export const ROBOFLY_VIDEO = {
  title: "ROBOFLY - Computer Optimized Yama",
  author: "jeremiah855",
  url: "https://www.youtube.com/watch?v=aYUuY-M2pN8",
  lengthSeconds: 1240,
  descriptionSummary:
    "RoboFly is described as a unique 3-tick Yama cycle found by computer search."
};

export const ROBOFLY_CHAPTERS = [
  ["Intro", "0:00"],
  ["Old 4 tick methods", "1:15"],
  ["3 ticking intro", "1:50"],
  ["3t cycle vs. 3t reaction", "2:02"],
  ["Coding overview", "3:02"],
  ["Fail conditions", "4:00"],
  ["Ranking conditions", "5:45"],
  ["ROBOFLY tiles", "6:45"],
  ["Duo kill", "7:32"],
  ["Tutorial - Duo", "8:10"],
  ["Solo method overview", "9:11"],
  ["Solo method tiles", "10:25"],
  ["Solo kill", "10:58"],
  ["Tutorial - Solo", "12:22"],
  ["Attack schedule discussion", "15:10"],
  ["DPS comparison", "18:22"]
];

// Reference/validation data only — no longer drives mechanics. The reactive
// Yama AI (see src/yamaAi.js) is now the source of truth; this schedule is
// retained for the optional training overlay and for test cross-checks.
export const ROBOFLY_SCHEDULE = {
  yamaAttackTicks: [2, 9, 16, 23, 30, 37, 44],
  playerAttackLandingTicks: [1, 6, 10, 13, 17, 22, 27, 31, 34, 38, 42, 46],
  meteorFallTicks: [4, 7, 10, 25, 28, 31],
  meteorDamageTicks: [7, 10, 13, 28, 31, 34],
  meteorDodgeTicks: [8, 11, 14, 29, 32, 35],
  loopClickTick: 49,
  loopTargetTick: 1
};

export const ROBOFLY_FAIL_CONDITIONS = [
  "Avoid the Yama unsafe zone on Yama attack ticks.",
  "Be in attack range on player attack ticks.",
  "Respect boss-click autopathing on scheduled attack ticks.",
  "Be on a valid boulder dodge tile when the boulder resolves.",
  "Do not stand under the boulder on its damage tick.",
  "Preserve the tick 11 free weapon switch path.",
  "Loop tick 49 back into the tick 1 start tile.",
  "Avoid dangerous wave tiles per tick.",
  "Avoid unnecessary path bending except for Yama, meteor, or attack exceptions."
];

const SOURCE_PATH = [
  "F3",
  "F5",
  "D7",
  "D9",
  "D11",
  "C12",
  "E10",
  "C10",
  "E11",
  "F12",
  "F11",
  "D11",
  "C11",
  "E10",
  "F12",
  "G13",
  "H13",
  "H11",
  "H9",
  "J7",
  "L5",
  "M4",
  "K6",
  "K4",
  "K2",
  "L1",
  "L3",
  "J5",
  "K3",
  "L2",
  "K4",
  "J5",
  "L4",
  "M6",
  "K6",
  "K5"
];

const FLIPPED_CYCLE_PATH = [
  "J3",
  "J5",
  "L7",
  "L9",
  "L11",
  "M12",
  "K10",
  "M10",
  "K11",
  "J12",
  "J11",
  "L11",
  "M11",
  "K10",
  "J12",
  "I13",
  "G13",
  "G11",
  "E12",
  "C14",
  "B15",
  "D13",
  "F11",
  "D9",
  "D7",
  "D5",
  "C4",
  "E6",
  "C6",
  "E5",
  "F4",
  "F5",
  "D5",
  "C5",
  "E6",
  "F4",
  "G3",
  "I3",
  "I5",
  "J3",
  "L1",
  "L3",
  "J5",
  "K3",
  "M1",
  "L3",
  "J5",
  "K3",
  "N1",
  "L3",
  "J5"
];

export const ROBOFLY_PATHS = {
  roboflySource: {
    name: "RoboFly source path",
    source: "Notebook cell 21",
    description: "36-tick source path shown in the shared notebook.",
    coords: SOURCE_PATH
  },
  roboflyFlippedCycle: {
    name: "RoboFly flipped cycle",
    source: "Notebook cell 22",
    description: "51-tile flipped cycle path; tick 49 should path back toward tick 1.",
    coords: FLIPPED_CYCLE_PATH
  }
};

export const ROBOFLY_MARKER_PRESETS = {
  solo: {
    name: "Solo variant markers",
    pastebin: "https://pastebin.com/wYkkGMYd",
    markers: [
      ["M6", "2a", "#FFDAD7D7"],
      ["D7", "1a", "#FFDAD7D7"],
      ["G13", "4a", "#FF313BB5"],
      ["H12", "4a", "#FF41B532"],
      ["L9", "1a", "#FFDAD7D7"],
      ["H4", "4aE", "#FF41B532"],
      ["I3", "4aE", "#FF313BB5"],
      ["F3", "0*", "#FFB58132"],
      ["C10", "2a", "#FFDAD7D7"],
      ["E13", "2b*E", "#FF41B532"],
      ["F12", "2b*E", "#FF313BB5"],
      ["C11", "3*S", "#FFDAD7D7"],
      ["I13", "4b*", "#FFDAD7D7"],
      ["N15", "0*", "#FFB58132"],
      ["J4", "2b*E", "#FF313BB5"],
      ["K3", "2b*E", "#FF41B532"],
      ["M5", "3*S", "#FFDAD7D7"],
      ["G3", "4b*", "#FFDAD7D7"],
      ["D1", "5*", "#FFDAD7D7"],
      ["M4", "1b*", "#FFDAD7D7"],
      ["C12", "1b*", "#FFDAD7D7"],
      ["M11", "W1", "#FFFF0000"],
      ["M10", "W2", "#FFFF0000"],
      ["E1", "6*", "#FFDAD7D7"],
      ["F1", "0*S", "#FFB58132"],
      ["J12", "Orbs", "#FFFF0000"]
    ]
  },
  duoHost: {
    name: "Duo host markers",
    pastebin: "https://pastebin.com/psiFVQA8",
    markers: [
      ["M6", "2a", "#FFDAD7D7"],
      ["D7", "1a", "#FFDAD7D7"],
      ["G13", "4a", "#FF313BB5"],
      ["H12", "4a", "#FF41B532"],
      ["L9", "1a", "#FFDAD7D7"],
      ["H4", "4aE", "#FF41B532"],
      ["I3", "4aE", "#FF313BB5"],
      ["F3", "0*", "#FFB58132"],
      ["C10", "2a", "#FFDAD7D7"],
      ["E13", "2b*E", "#FF41B532"],
      ["F12", "2b*E", "#FF313BB5"],
      ["C11", "3*S", "#FFDAD7D7"],
      ["I13", "4b*", "#FFDAD7D7"],
      ["N15", "0*", "#FFB58132"],
      ["J4", "2b*E", "#FF313BB5"],
      ["K3", "2b*E", "#FF41B532"],
      ["M5", "3*S", "#FFDAD7D7"],
      ["G3", "4b*", "#FFDAD7D7"],
      ["D1", "5*", "#FFDAD7D7"],
      ["M4", "1b*", "#FFDAD7D7"],
      ["C12", "1b*", "#FFDAD7D7"],
      ["C1", "6*", "#FFDAD7D7"],
      ["B1", "0*S", "#FFB58132"]
    ]
  },
  duoNonHost: {
    name: "Duo non-host markers",
    pastebin: "https://pastebin.com/UTwWThab",
    markers: [
      ["M10", "2a", "#FFDAD7D7"],
      ["C6", "2a", "#FFDAD7D7"],
      ["L7", "1a", "#FFDAD7D7"],
      ["I13", "4a", "#FF313BB5"],
      ["H12", "4a", "#FF41B532"],
      ["D9", "1a", "#FFDAD7D7"],
      ["H4", "4aE", "#FF41B532"],
      ["G3", "4aE", "#FF313BB5"],
      ["C5", "3*S", "#FFDAD7D7"],
      ["J3", "0*", "#FFB58132"],
      ["M12", "1b*", "#FFDAD7D7"],
      ["K13", "2b*E", "#FF41B532"],
      ["J12", "2b*E", "#FF313BB5"],
      ["G13", "4b*", "#FFDAD7D7"],
      ["M11", "3*S", "#FFDAD7D7"],
      ["B15", "0*", "#FFB58132"],
      ["C4", "1b*", "#FFDAD7D7"],
      ["F4", "2b*E", "#FF313BB5"],
      ["E3", "2b*E", "#FF41B532"],
      ["G4", "4b*", "#FFDAD7D7"],
      ["G1", "5*", "#FFDAD7D7"],
      ["K1", "6*", "#FFDAD7D7"],
      ["N1", "0*S", "#FFB58132"]
    ]
  }
};

export function coordToTile(coord) {
  const match = /^([A-O])(1[0-5]|[1-9])$/.exec(coord.toUpperCase());
  if (!match) {
    throw new Error(`Invalid RoboFly coordinate: ${coord}`);
  }

  const col = match[1].charCodeAt(0) - 64;
  const row = Number(match[2]);
  return {
    x: col - 1,
    y: 15 - row
  };
}

export function tileToCoord(tile) {
  const letter = String.fromCharCode(65 + tile.x);
  const row = 15 - tile.y;
  return `${letter}${row}`;
}

export function colorFromTileMarker(argb) {
  if (!/^#[0-9A-F]{8}$/i.test(argb)) {
    return argb;
  }

  return `#${argb.slice(3)}`;
}
