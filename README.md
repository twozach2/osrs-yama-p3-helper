# Yama P3 Practice Tool

This repo is a starter for a Colosim-style Yama phase 3 practice simulator. It is intentionally built as a small browser app with no bundled game assets: the important part is the tick engine, tile movement, scripted events, and method waypoints.

The current data pass is based on jeremiah855's video, "ROBOFLY - Computer Optimized Yama", plus the linked Pastebin tile markers and shared notebook from the video description.

## Run It

From this folder:

```powershell
npm.cmd install
node server.mjs
```

Then open `http://localhost:5173`.

You can sanity-check the simulation core with:

```powershell
node tests/engine.test.mjs
```

If you prefer npm from PowerShell on Windows, use `npm.cmd test` if your execution policy blocks `npm.ps1`.

## What Is In Place

- A deterministic 600 ms tick engine in `src/engine.js`, driven by a seeded `mulberry32` PRNG so runs are reproducible.
- Two-sided combat: player HP / prayer / run energy, Yama HP, accuracy + max-hit rolls via `src/combat.js`, attack-speed cooldowns, death and phase-complete end states.
- Reactive Yama P3 AI in `src/yamaAi.js`: autos alternate magic ↔ ranged on a 7-tick cadence; in-melee branch swaps to an axe swipe plus an extra void flare; periodic meteors, shadow waves, and void-flare spawns.
- Prayer protection (`Protect Magic` / `Protect Missiles` / `Protect Melee`) reduces matching-style damage to a small pierce value; prayer drains while active.
- Run energy drains per tile while running and regens otherwise; a falling meteor forces walk until impact.
- Void flares charge each tick, detonate for damage + heal Yama, and can be popped by a player spec action.
- OSRS-style click-to-move with a formal input queue (latest click wins, resolves the same tick).
- Three.js / WebGL viewport with tilted camera, raised floor tiles, 3D Yama and player, true-tile highlight, click markers, attack swings, and kind/target-coloured hit splats (player hits, misses, Yama hits, poison, burn).
- HUD overlay: HP / Prayer / Run-energy orbs and a Yama HP bar above the arena, plus an in-world HP bar over Yama.
- Render hooks for meteor telegraphs + falling orbs, void flares with charge bars, shadow-wave telegraphs, and fireball-line telegraphs.
- Optional training overlay: RoboFly source paths, marker presets, route ghost, and the original `ROBOFLY_SCHEDULE` are retained as reference data and waypoint scoring; they no longer drive mechanics.
- Pause, step, reset, speed control, prayer hotkeys, spec hotkey, and optional strict waypoint scoring.

## Practice Model

The sim is now reactive: Yama responds to your position and state, and damage is rolled through real combat math. The RoboFly route ghost and tile markers stay available as an optional overlay you can toggle on to practice the original tile sequence, but mechanics no longer fire off the schedule — Yama's autos, meteors, shadow waves, and void flares are driven by `YamaController` against your live position. Run energy, prayer drain, and HP all matter; if you eat too many autos with the wrong prayer, you die.

## Real OSRS Models

The app supports local user-provided `.glb` / `.gltf` models through `public/assets/osrs/manifest.json`. See `docs/osrs-asset-pipeline.md` for the conversion and drop-in workflow. Jagex-owned cache assets are intentionally ignored by Git and should not be redistributed from this repo.

Current controls:

- Click a floor tile to move.
- Click Yama to attack. If you are out of range, the engine paths to a nearby attack tile first.
- `Space` starts or pauses.
- `N` advances one tick.
- `R` resets.
- `1` = Protect Magic, `2` = Protect Missiles, `3` = Protect Melee, `4` = Off.
- `S` (or the **Spec (pop flare)** button) fires a spec at the nearest void flare.

## Extracted RoboFly Data

The numbers below are now **reference / validation data only** — `ROBOFLY_SCHEDULE` no longer drives mechanics. They remain available via `scenario.schedule` for the optional training overlay and for cross-checking the reactive AI's cadence.

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

## Tuning the Sim

The combat numbers are Wiki-derived placeholders and are deliberately centralized so they can be tuned without spelunking through the engine. Treat them as draft values and replace with measured data as it lands.

- `src/combat.js` — `DEFAULT_PLAYER_PROFILE` (style, `attackSpeed`, `attackRoll`, `maxHit`, `demonbane`), `RUN_DRAIN_PER_TILE`, `RUN_REGEN_PER_TICK`, `PRAYER_DRAIN_PER_TICK`, and the core roll math.
- `src/yamaP3Scenario.js` → `yama` block — `maxHp`, `attackSpeed`, `maxHits`, `defenceLevel`, `defenceBonus`, `prayerPierce`, and the `flare` / `meteor` / `shadow` configs.
- `src/yamaAi.js` — auto cadence, in-melee branch, shadow-wave shape, fireball line builder, and flare spawn position.

All randomness flows through the engine's seeded RNG (`mulberry32`). Do not use `Math.random` anywhere in the sim — it breaks the deterministic test suite. Construct the engine with `new SimulatorEngine(scenario, { seed })` and `reset(method, { seed })` re-seeds.

## Files To Edit First

- `src/combat.js`: PRNG and roll math; default player profile; run / prayer tuning constants.
- `src/yamaAi.js`: reactive Yama decision logic and timers.
- `src/yamaP3Scenario.js`: arena dimensions, Yama footprint, and Yama combat stats block.
- `src/engine.js`: tick order, input queue, movement, prayer pierce, hazard resolution, end states.
- `src/roboflyData.js`: source video metadata, marker presets, and the (now reference-only) schedule constants.
- `src/main.js`: rendering hooks, HUD wiring, and controls.

## Notes

Colosim uses a client-side canvas app with a fixed world canvas, sidebar controls, phase toggles, and tile markers. This prototype follows that shape without redistributing Jagex-owned assets. If you later want OSRS-looking sprites, use original placeholder art or a local user-supplied asset folder that is not committed.
