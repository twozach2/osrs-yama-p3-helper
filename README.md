# Yama P3 Practice Tool

This repo is a starter for a Colosim-style Yama phase 3 practice simulator. It is intentionally built as a small browser app with no bundled game assets: the important part is the tick engine, tile movement, scripted events, and method waypoints.

The current data pass is based on jeremiah855's video, "ROBOFLY - Computer Optimized Yama", plus the linked Pastebin tile markers and shared notebook from the video description.

## Run It

From this folder:

```powershell
node server.mjs
```

Then open `http://localhost:5173`.

You can sanity-check the simulation core with:

```powershell
node tests/engine.test.mjs
```

If you prefer npm from PowerShell on Windows, use `npm.cmd test` if your execution policy blocks `npm.ps1`.

## What Is In Place

- A deterministic 600 ms tick engine in `src/engine.js`.
- OSRS-style run movement at two path steps per tick after the drop-in lockout.
- Canvas arena rendering with click-to-move, tile grid, queued path, hazards, projectiles, and waypoints.
- RoboFly source paths, marker presets, chapter notes, fail-condition notes, and schedule constants in `src/roboflyData.js`.
- Data-driven P3 events for Yama attacks, player attack landing ticks, and dynamic meteor fall/damage/dodge checks.
- Pause, step, reset, speed control, prayer hotkeys, and optional strict waypoint scoring.

## Extracted RoboFly Data

From the YouTube description:

- Video title: `ROBOFLY - Computer Optimized Yama`
- Author: `jeremiah855`
- The method is described as a unique 3-tick Yama cycle found by computer search.
- Tile marker exports:
  - Duo host: `https://pastebin.com/psiFVQA8`
  - Duo non-host: `https://pastebin.com/UTwWThab`
  - Solo variant: `https://pastebin.com/wYkkGMYd`
- Shared notebook/code:
  - `https://drive.google.com/file/d/1IAUXFTp5CrnEU6Qqw8PbJMLB-EAT0s_7/view?usp=sharing`

From the notebook:

- Yama attack ticks: `2, 9, 16, 23, 30, 37, 44`
- Player attack landing ticks: `1, 6, 10, 13, 17, 22, 27, 31, 34, 38, 42, 46`
- Meteor fall ticks: `4, 7, 10, 25, 28, 31`
- Meteor damage ticks: `7, 10, 13, 28, 31, 34`
- Meteor dodge ticks: `8, 11, 14, 29, 32, 35`
- Loop check: tick `49` paths back toward tick `1`

## Remaining Accuracy Work

The hard part is still exact in-game behavior. Treat `src/roboflyData.js` and `src/yamaP3Scenario.js` as the source of truth and keep replacing approximations with measured data.

Use this workflow:

1. Record several P3 attempts with a visible RuneLite tick counter or metronome.
2. Define tick 0 precisely. For this scaffold, tick 0 is the first visible drop-in tick and `firstActionTick` is the first tick the player can move.
3. Annotate the arena coordinate system. Pick one known tile as `(0,0)`, then record the player spawn, Yama footprint, walkable tiles, blocked tiles, and method tiles.
4. For each mechanic, write down spawn tick, warning tile tick, impact tick, affected tiles, duration, and whether movement resolves before or after impact.
5. Enter those facts in `events` as `message`, `hazard`, or `meteorFall` records.
6. Enter RoboFly waypoints as tick/tile pairs.
7. Validate by replaying the recording next to the simulator and stepping one tick at a time.

## Files To Edit First

- `src/roboflyData.js`: source video metadata, schedule constants, marker presets, and source paths.
- `src/yamaP3Scenario.js`: arena dimensions, Yama unsafe zone, and P3 event script.
- `src/engine.js`: damage rules, prayer checks, attack ordering, and any Yama-specific AI once the timing is known.
- `src/main.js`: rendering and controls.

## Notes

Colosim uses a client-side canvas app with a fixed world canvas, sidebar controls, phase toggles, and tile markers. This prototype follows that shape without redistributing Jagex-owned assets. If you later want OSRS-looking sprites, use original placeholder art or a local user-supplied asset folder that is not committed.
