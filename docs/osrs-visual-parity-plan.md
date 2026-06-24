# OSRS Visual Parity Plan — V1 + V2 + V3 + V4

> Goal: make the practice tool *feel* like Old School RuneScape **without** importing any Jagex-owned assets. Four sequential phases — HUD & overlays, camera & input parity, visual style pass, then liveness (motion & sound) — each landable as its own commit.

## Scope

| Phase | Theme | Touches |
| --- | --- | --- |
| **V1** | OSRS-style HUD & overlays | `src/main.js` (overlay draw methods), `index.html` (`#hud`), `styles.css` |
| **V2** | Camera & input parity | `src/main.js` (`ThreeGameScene` camera + input), new `src/cameraController.js` |
| **V3** | Visual style pass | `styles.css`, `createMaterials()` in `src/main.js`, optional `src/postFx.js` |
| **V4** | Liveness (motion & sound) | `tools/osrs-cache-exporter/`, `src/assetPack.js`, `src/main.js` (per-frame procedural motion), new `src/audio.js`, new `src/animation.js` |

## Explicitly Out Of Scope

- Importing or shipping Jagex models / textures / animations / sound effects. The exporter and runtime additions in V4 must continue to read **only** from a user-supplied local cache, the same posture V1–V3 took for models and sprites (`docs/osrs-asset-pipeline.md`).
- Networked multiplayer, login/account state, server-side simulation.
- Method-pack content changes.
- A full effects/particle system — V4 stays at the level of clip playback + procedural sway + screen-shake. Particle-based VFX (fire embers, void wisps, hit-flash) are a possible V5.

## Ground Rules

1. **No Jagex IP** in commits. Anything that *evokes* OSRS must be re-drawn from scratch (procedural geometry, SVG, or canvas-drawn).
2. **Primitive-safe**. Every change must look right both with the fallback primitive Yama/player and with user-supplied GLBs (`assetMode === "local-osrs"`).
3. **No layout breakage** at the existing `820px` mobile breakpoint.
4. **Tick-accurate**. Anything that animates must derive from `snapshot.tick + partialTick` so it stays synchronized to the engine, never to wall-clock alone.
5. **Single commit per sub-step** (V1.1, V1.2, …). Each ends in a passing `npm test` run.

---

## V1 — OSRS-Style HUD & Overlays

Largest perceived "feels like OSRS" jump per line of code. All sub-steps are pure additions inside existing draw methods.

### V1.1 — Hitsplat overhaul

**Where**: `ThreeGameScene.drawHitSplats()` (`src/main.js`), `splatStyle()` helper, `makeTextSprite()` helper.

**Current**: text sprite with a flat coloured rectangle background, fades by age over 5 ticks.

**Target**:
- Square-on-point diamond (rotated 45°) background instead of axis-aligned rect — draw this inside `makeTextSprite()` via a new `shape: "diamond"` option that paths a rotated square in the canvas before stroking text.
- Three palette variants keyed off `hit.kind`: `red` (regular damage), `blue` (miss = `0`), `green` (poison/venom), `orange` (burn). Variants already exist as strings in `splatStyle()` — extend to also drive the background diamond colour.
- White inner border, 1px, drawn before text.
- Lift curve: instead of linear `age * 0.08`, ease out with `1 - (1 - t)^2` over `5` ticks so the splat pops up and then settles.
- Stack offset: when ≥2 splats hit the same target on the same tick, offset successive splats by `+0.35` world units on X (mimics OSRS's max-4-splat row).

**Done when**: regular hits render as red diamonds with white border, misses as blue diamonds with `0`, poison as green; multiple same-tick hits stack horizontally; existing tests still pass.

### V1.2 — NPC HP bar (Yama) restyle

**Where**: `ThreeGameScene.drawYamaHpBar()`, `materials.hpBarBg` / `materials.hpBarFill`.

**Current**: dark plane + flat red fill, fixed width `2.6`, camera-billboard via `lookAt`.

**Target**:
- Two-segment fill: green (`#22c55e`) when `ratio >= 0.5`, yellow (`#facc15`) when `0.25 <= ratio < 0.5`, red (`#dc2626`) when `< 0.25` — matches OSRS NPC HP bar colour stages.
- 1-pixel black outline (achieve via a slightly-larger black plane behind the bg plane).
- Width follows the Yama footprint (`this.scenario.yama.size.width` rather than hardcoded `2.6`).
- Move height to `4.2` so it sits clear of the head spike when the fallback primitive is in use, and clear of typical GLB heights too.

**Done when**: bar colour transitions at 50% and 25% thresholds, has a visible black border, scales with Yama footprint.

### V1.3 — Orb icons in HUD

**Where**: `index.html` (`#hud .orb-hp / .orb-pray / .orb-run`), `styles.css` orb rules.

**Current**: bordered circles with just a number.

**Target**:
- Inline SVG icons inside each orb, drawn in CSS-`mask` so they pick up the orb's accent colour:
  - `orb-hp`: heart silhouette (re-drawn — not Jagex's exact path).
  - `orb-pray`: open eye / radial-rays silhouette.
  - `orb-run`: boot silhouette.
- Soft inner glow via `box-shadow: inset 0 0 12px <accent>`.
- Number stays centered, becomes a smaller superscript bottom-right.
- Add `orb-spec` (special attack %, hooked to `engine.state.player.specialEnergy` — confirm field name in `engine.js` before wiring; if it doesn't exist yet, skip this orb and document the gap in the commit message).

**Done when**: HUD shows four orbs in the bottom-left with icons + numbers; visual is recognisably OSRS-style without copying any sprite.

### V1.4 — Click markers

**Where**: `ThreeGameScene.drawClickMarkers()`, `materials.attackClick` / `materials.moveClick`.

**Current**: square line loops that grow with age.

**Target**:
- Yellow X (`#ffeb3b`) for normal walk clicks, red X (`#ff1744`) for attack clicks — draw with two crossing `THREE.Line` segments inside a small group, not a square ring.
- Total lifetime `0.5s` real-time → scale up `1.0 → 1.4` and fade `1.0 → 0` over that span (use real elapsed, not ticks, because OSRS click markers are wall-clock).
- Add a faint same-colour outer ring at half opacity behind the X (OSRS look).

**Done when**: clicking a tile leaves a yellow X that pops outward and fades within ~0.5s; attacking shows a red X.

### V1.5 — AOE telegraph polish

**Where**: `ThreeGameScene.drawActiveHazards()`, `drawProjectiles()`, `drawShadowWaves()`, `drawFireballLine()`.

**Current**: flat red squares with linear opacity decay.

**Target**:
- Two-stage colour ramp tied to telegraph progress: cool→hot. `meteor`/`fireballLine` start at deep orange `#7a2200` and ramp to bright yellow `#fde047` at impact. `shadowWaves` start deep purple `#2e1065` ramp to magenta `#d946ef`.
- Animated edge pulse: emit a tile-sized line loop expanding 0 → 1 every `2` ticks, opacity sin-pulsed off `snapshot.tick + partialTick`.
- "Impact frame" — on the exact tick of detonation, swap to a brief (`1` tick) bright-white tile fill so the player can see the moment of damage.

**Done when**: hazards visibly intensify as their impact tick approaches; the impact tick has a 1-tick white flash.

### V1.6 — RuneLite-style tile markers

**Where**: `ThreeGameScene.buildMarkers()`, `makeTextSprite()`.

**Current**: filled translucent pads with a centered text label floating above.

**Target**:
- Replace the filled pad with a 4-edge **hollow square** drawn as a `LineLoop` with width-emulation (since `THREE.LineBasicMaterial.linewidth` is GPU-clamped to 1, use a thin extruded `RingGeometry`-equivalent: 4 short box meshes per edge, `0.04` thick).
- Label rendered as a small RuneLite-style tag *above* the corner of the tile, not floating in the center.
- Honor the alpha channel of the source `argb` colour (already parsed in `colorFromTileMarker`) so faded markers stay faded.

**Done when**: markers look like RuneLite outlines instead of coloured pads; labels sit at the tile corner.

---

## V2 — Camera & Input Parity

Goal: feel like the live OSRS client. Right now the camera is a fixed orthographic angle that auto-tracks midway between player and Yama. OSRS uses a free-yaw perspective camera with player-driven angle, plus optional fixed-vs-resizable modes.

### V2.0 — Extract `CameraController`

**Where**: new file `src/cameraController.js`. Move `this.camera` setup, `resize()`, and `updateCameraTarget()` logic out of `ThreeGameScene` and into a `CameraController` class. `ThreeGameScene` owns one instance and forwards `resize()` / `update(snapshot, partialTick)`.

**Why first**: V2.1–V2.5 all touch the same code surface — easier reviewed and tested in isolation.

**Done when**: rendering is byte-identical (same camera frustum, same lookAt), but camera code lives in its own module with its own unit tests under `tests/cameraController.test.mjs`.

### V2.1 — OSRS-default camera angle

**Where**: `CameraController` constructor.

**Current**: `OrthographicCamera`, `position (11, 13, 14)`, frustum `18` or `22`.

**Target**:
- Switch to `PerspectiveCamera`, FOV `40°` (close to OSRS default).
- Default yaw `0°` (south-facing), pitch `~55°` from horizontal — measure once against an OSRS screenshot's reference angle and bake the constants in.
- Camera orbits a target point: `target = playerVisualPosition`. Distance default `14`, clamped `[6, 28]`.
- Replace the `0.45 / 0.55` mid-blend with a snap-to-player target so the camera follows the player like in-game, not the engagement midpoint.

**Done when**: viewing angle visually matches a reference OSRS screenshot of the Yama arena; existing pickTile raycast still returns correct tiles within ±1 px of the cursor.

### V2.2 — Middle-mouse drag rotate

**Where**: `CameraController.attach(canvas)` — new method that wires `pointerdown / pointermove / pointerup`. Must NOT swallow `pointerdown` events from left-click (currently used by `pickTile` in `init()`).

**Target**:
- Middle-button (`event.button === 1`) drag: horizontal motion adjusts yaw, vertical motion adjusts pitch.
- Sensitivity: `yawPerPx = 0.5°`, `pitchPerPx = 0.35°`.
- Pitch clamped `[15°, 80°]` so you can't look from below the floor or directly down.
- During drag, `event.preventDefault()` only inside the middle-button branch.

**Done when**: middle-drag rotates the camera smoothly; left-click still pathfinds.

### V2.3 — Scroll-zoom

**Where**: `CameraController.attach()`.

**Target**:
- `wheel` listener on canvas; `deltaY > 0` zooms out, `< 0` zooms in.
- Step `0.6` world units per scroll notch, clamped `[6, 28]`.
- `event.preventDefault()` only when the canvas is the wheel target — leave the side panel scrollable.

**Done when**: scroll zooms in/out of the arena; side panel still scrolls normally.

### V2.4 — Edge-pan (resizable mode only)

**Where**: `CameraController` per-frame update.

**Target**:
- When cursor is within `24px` of a viewport edge, pan the camera *target* in that direction at `4` world units/sec.
- Off by default. Bound to a toggle: `<label><input id="edgePan" type="checkbox"> Edge pan</label>` added next to existing toggles in `index.html`.
- Disabled in fixed-screen mode (V2.5).

**Done when**: with toggle on, holding the cursor at the edge slides the camera; with toggle off, no panning occurs.

### V2.5 — Fixed-screen vs resizable mode

**Where**: `index.html` (new toggle), `styles.css` (new `.fixed-mode` rules), `ThreeGameScene.resize()`.

**Target**:
- New toggle: `<label><input id="fixedMode" type="checkbox"> Fixed-screen mode</label>`.
- When on: canvas is letterboxed to OSRS's `765 × 503` aspect, centered, with a dark border. Camera frustum is locked to that aspect regardless of window size. Side panel docks below (mobile-style) on narrow windows, beside on wide.
- When off (default): current behaviour — full-viewport canvas, side panel docked right.

**Done when**: toggling the checkbox switches between letterboxed-fixed and stretch-resizable modes without reload.

---

## V3 — Visual Style Pass

Pure aesthetics — no new behaviour. Each sub-step independent; ordering is by visual impact.

### V3.1 — Arena floor & lighting

**Where**: `ThreeGameScene.buildStaticWorld()`, `createMaterials()` (`floorA`, `floorB`, `rim`), `addLights()`.

**Target**:
- Darker, redder floor palette: `floorA #2a1410`, `floorB #3a1a14` (volcanic basalt tone matching Yama's arena).
- Add a subtle **emissive lava crack** pattern: 3–5 narrow `THREE.Mesh` strips at `y = -0.03`, deep orange (`#ff5a14`) with `emissive` of `#a02000`, placed at fixed offsets read from a hardcoded array. Static (not animated) for V3 — animation is a stretch goal.
- Rim becomes `#0a0604` (almost black) with `roughness: 1`.
- `HemisphereLight` ground colour shifts from `#17120a` to `#1a0a06` so under-shadows pick up the red ground bounce.
- Add a second `PointLight` at the opposite arena edge, dim blue-purple `#5a2a8a` intensity `0.8`, to suggest void/shadow energy across the floor.

**Done when**: the arena reads as "volcanic + magical" rather than "tan checkerboard".

### V3.2 — Side-panel chrome

**Where**: `styles.css` (`#panel`, `.readouts`, `.field`, headings, `.fine-print`).

**Target**:
- Replace `background: var(--shadow)` with a layered look:
  - Outer: `background: linear-gradient(180deg, #2a1a0a, #1a0e06);`
  - Inner border: `box-shadow: inset 0 0 0 1px #5a3a1a, inset 0 0 0 2px #0a0604;` (double-line "frame" effect).
- Replace yellow accent `--line #e8d86a` with parchment-orange `#c79a55` for borders.
- Section dividers become `border-top: 1px solid #5a3a1a`.
- Buttons: gradient `#3a2a18 → #1a0e06`, border `#c79a55`, hover gradient `#5a3a1a → #2a1a0a`.
- Active/pressed prayer button gets a soft inner gold glow: `box-shadow: inset 0 0 8px #fbbf24`.

**Done when**: the side panel reads as a RuneScape-esque carved/parchment frame, not a generic dark sidebar.

### V3.3 — Typography

**Where**: `styles.css` `:root` font-family, `makeTextSprite()` font string in `src/main.js`.

**Target**:
- Add a `public/fonts/` folder with two **freely-licensed** pixel fonts that *evoke* (do not copy) the RuneScape look:
  - Body: a free pixel serif similar in feel to OSRS's "Quill" — e.g. **Press Start 2P** (SIL OFL), or **VT323** for a thinner pixel look. License file committed alongside the font file.
  - Numerics (HUD orbs, hitsplats): same family, larger weight.
- `@font-face` declarations in `styles.css`. Sprite text in `makeTextSprite()` switches from `"Trebuchet MS, Arial, sans-serif"` to the new pixel font; keep the fallback chain.
- Re-snap font sizes to even pixel multiples to avoid sub-pixel blur in the canvas-textured sprites.

**Done when**: HUD numbers, tile labels, hitsplats, and the side panel all use the new pixel font; no font is shipped without its OFL/MIT-style license file in `public/fonts/`.

### V3.4 — Pixelation / chunky-look pass

**Where**: optional new `src/postFx.js`, wired in `ThreeGameScene.render()`.

**Target**:
- Render the WebGL scene into a `THREE.WebGLRenderTarget` at **half** the canvas resolution.
- Blit it back to the default framebuffer with `NearestFilter` so pixels stay sharp — gives the chunky low-res look without requiring a `EffectComposer` dependency.
- Toggle: `<label><input id="pixelate" type="checkbox" checked> Chunky pixels</label>` in `index.html`.
- Bypass cleanly when off (render straight to default framebuffer).

**Done when**: with the toggle on, edges are visibly stair-stepped in a deliberate way; with it off, rendering is identical to today.

---

## V4 — Liveness (Motion & Sound)

Where V1–V3 made the *picture* look like OSRS, V4 makes the *world* behave like OSRS. Two halves: animated assets driven by the exporter and runtime mixer, and procedural motion/sound that works even with no local asset pack present.

Every sub-step must remain **primitive-safe** (look right with the fallback procedural Yama/player) and **tick-anchored** (motion that pauses with the engine, not wall-clock).

### V4.1 — Exporter sequence/frame decoder

**Where**: `tools/osrs-cache-exporter/` (new `decodeSequence.mjs`, `decodeFrame.mjs`; wired into the existing model emit path).

**Target**:
- Read the cache's `Sequence` archive (skeletal animation metadata: frame list, frame duration in client ticks, loop start, replay style) and the `Frame` / `Framemap` archives (per-bone transforms).
- For each model the exporter emits, walk its associated sequence IDs (from the NPC / object definition) and pack each clip into the GLB's `animations` array as a `THREE.AnimationClip`-compatible track set. Bone naming convention: skin index from Framemap → `bone_<index>`.
- Frame duration uses 600ms / tick to match the OSRS tick (already the project-wide unit).
- New unit test: a synthetic 2-frame sequence round-trips through encode → GLB → `THREE.GLTFLoader` and produces an `AnimationClip` with the expected duration and track count.

**Done when**: a user-exported Yama GLB contains at least one `AnimationClip` (idle), confirmed by inspecting the loaded asset in the browser console.

### V4.2 — Animation playback (Yama)

**Where**: `src/assetPack.js` (load `gltf.animations`, store on the asset record), new `src/animation.js` (small wrapper around `THREE.AnimationMixer`), `src/main.js` (per-frame mixer.update).

**Target**:
- When a GLB with `animations` loads via the asset pack, instantiate a `THREE.AnimationMixer` on the cloned scene and store the available clips by name.
- Default behaviour: play the clip named (in priority order) `idle`, `stand`, or clip index 0 on a loop.
- New manifest field `animations: { yama: { idle: "<clipName>", attack: "...", hit: "...", death: "..." } }` lets the manifest remap exporter clip names to engine-event roles.
- Engine events (`yama_attack_tick`, `yama_hit`, `yama_death`) trigger a one-shot crossfade to the matching role clip, then return to idle.
- Mixer is advanced from `partialTick` seconds so animation playback rate scales with the speed slider.

**Done when**: with a local pack containing an idle clip, the Yama visibly moves while paused (idle loop runs) and switches to attack clip on attack tick.

### V4.3 — Animation playback (player)

**Where**: same modules as V4.2, plus a movement-state probe reading `snapshot.player.movement` / queued path.

**Target**:
- Same mixer wiring for the player asset.
- Movement state machine derives current clip from existing engine state — no new engine state:
  - `idle` when the player hasn't moved in N ticks and has no queued path,
  - `walk` when queued path length ≤ 1 or run is off,
  - `run` when run is on and the player is moving > 1 tile / tick,
  - `attack` on the engine's attack tick,
  - `death` on player HP = 0.
- Clip role names mirror V4.2's manifest pattern under `animations.player`.

**Done when**: with a local pack, the player visibly walks while pathing, runs faster with run on, and stays in idle when stopped.

### V4.4 — Procedural Yama sway & head-tracking (fallback)

**Where**: `src/main.js` `buildYama()` (capture head sub-group reference), per-frame update in `render()`.

**Target**:
- Even with no animation pack, the procedural Yama gets two subtle motions:
  - **Head-track**: head sub-group's Y rotation lerps toward `atan2(playerZ - yamaZ, playerX - yamaX)` with a slowish constant (e.g. 4 rad/sec cap).
  - **Idle sway**: body Y position bobs by ±0.04 units on a 4-tick sine wave; whole-group Y rotation drifts ±2° on a 16-tick wave.
- Both driven by `snapshot.tick + partialTick`, so paused engine = paused motion.
- Sway/track is **skipped** when an animation pack is active (the clip drives motion instead) — flag stored on the Yama group.

**Done when**: with no pack, the primitive Yama no longer reads as a statue when the sim is running, and visibly faces the player as the player moves around the arena.

### V4.5 — Audio asset-pack slot

**Where**: new `src/audio.js` (tiny wrapper around `AudioContext`-based one-shot playback), `src/assetPack.js` (new `loadAssetSounds()` mirroring `loadAssetFonts()`), `src/main.js` (engine-event → sound-id dispatch), `index.html` (Mute toggle).

**Target**:
- No bundled audio. Manifest gains a `sounds: { <id>: { path: "/assets/osrs/sounds/<file>" } }` slot. Same IP-safe posture as V3.3 fonts: bundled defaults are silent; a local pack can supply OGG/WAV files the user is licensed to use.
- Engine events map to sound IDs by table: `attack_swing`, `yama_hit`, `player_hit`, `void_flare`, `meteor_impact`, `prayer_switch`, `tick_drum` (optional, off by default).
- Playback through a single shared `AudioContext`; sounds decoded once at load, replayed via `BufferSource` per event. Per-sound gain configurable in the manifest (`{ path, volume }`).
- UI: `<label><input id="muteAudio" type="checkbox"> Mute</label>` in the toggle-grid. Persisted to `localStorage`.

**Done when**: with a local sound pack present, swings/hits/flares produce audio; without a pack, the toggle is still present but the practice tool stays silent and logs no errors. No audio file is shipped in the repo.

### V4.6 — Camera tweens & impact shake

**Where**: `src/cameraController.js` (new `applyImpulse(magnitude, durationTicks)`), `src/main.js` (engine-event hook).

**Target**:
- The current snap-to-player target update is instantaneous; add an optional eased follow (`lookAt` target lerps toward the snapshot anchor with a configurable half-life, default 3 ticks). Configurable so existing tile-tight snap remains the default for muscle-memory.
- `applyImpulse(magnitude, durationTicks)` perturbs the camera target by a damped sine over the given tick window. Driven by `partialTick`, so pause = freeze, slow speed = slow shake. Magnitude scaled in world units (e.g. 0.05 for routine hit, 0.18 for void flare).
- Engine event hook fires `applyImpulse` on: player damage > 0, Yama special detonation, meteor impact tick.
- New unit test: feeding a fixed tick-stream into `applyImpulse` produces the expected target offset envelope (decaying sine, integral ≈ 0).

**Done when**: hits feel weighty, the camera doesn't teleport between distant ticks, and there's a test asserting impulse decay so it can't quietly become a permanent jitter.

---

## Sequencing & Verification

Recommended order (most visual impact per commit, lowest risk first):

1. V1.1 Hitsplats → V1.2 HP bar → V1.4 Click markers → V1.5 AOE polish → V1.3 Orb icons → V1.6 Tile markers
2. V2.0 Extract → V2.1 Angle → V2.2 Rotate → V2.3 Zoom → V2.5 Modes → V2.4 Edge-pan
3. V3.1 Floor → V3.2 Panel → V3.3 Type → V3.4 Pixelation
4. V4.4 Procedural sway → V4.6 Camera shake → V4.5 Audio slot → V4.1 Exporter clips → V4.2 Yama playback → V4.3 Player playback

V4 ordering inverts the usual "infrastructure first" rule because the procedural / shake / audio pieces (V4.4–V4.5) ship visible impact with zero dependency on the exporter, and the exporter (V4.1) is the largest single piece of work in the phase — risk-isolating it last means a partial V4 still produces a noticeably more alive arena.

After every sub-step:

```bash
npm test            # tests/engine.test.mjs + cameraController + postFx + new V4 tests
node server.mjs     # smoke load index.html in a browser
```

Optional capture verification (already wired): `http://localhost:5173/?capture=1` writes a base64 PNG into `canvas.dataset.framePng` — compare against a reference screenshot for V1.5, V2.1, V3.1. (V4 motion verification needs a multi-frame capture; out of scope for `?capture=1`.)

## Risks & Open Questions

- **Perspective vs orthographic raycast**: `pickTile()` uses ray-plane intersection — works for both, but the math is correct only if the ray origin is updated from the new perspective camera. Verify against the existing engine test that asserts `click+move` lands on the expected tile.
- **Font licensing**: do *not* use Jagex's "Runescape" / "Quill" / "Plain12" fonts even if URLs exist. Stick to OFL/MIT pixel fonts. Commit the license text.
- **`engine.state.player.specialEnergy`**: confirmed-or-skip before wiring V1.3's spec orb. If it doesn't exist, file a follow-up rather than guessing the field name.
- **`assetMode === "local-osrs"` interaction**: V1.2 (HP bar height) and V2.1 (camera distance) must still frame the scene correctly when a GLB Yama at a very different scale loads. Test both modes.
- **V4.1 Frame archive completeness**: the cache's Frame archive may reference a Framemap that the user's cache revision doesn't ship (older revs). Exporter must skip-and-warn rather than crash if a frame's framemap is missing.
- **V4.2/V4.3 clip naming**: exporters from different cache versions emit different sequence IDs; the `animations.<entity>` manifest remap is the escape hatch, not optional polish.
- **V4.5 AudioContext autoplay policy**: modern browsers block `AudioContext.resume()` until a user gesture. The Mute toggle must double as the "unlock audio" gesture; load-time decoding is fine without a gesture, but first `BufferSource.start()` requires one.
- **V4.6 impulse + edge-pan interaction**: edge-pan offsets and shake impulses both perturb the camera target. They must compose additively (offsets sum), not overwrite, or shake will appear to "jam" against an edge-panned camera.

## Acceptance Criteria (whole plan)

Side-by-side comparison against an OSRS Yama Phase 3 screenshot, a viewer should agree that:

1. The HUD reads as OSRS (orbs, hitsplats, NPC HP bar, click X's).
2. The camera moves and reacts like the OSRS client (drag-rotate, scroll-zoom, fixed-mode option).
3. The arena looks volcanic and the side panel looks like a RuneScape UI frame.
4. The arena *moves* — Yama visibly tracks the player, hits register with a camera bump, animated assets play if a local pack supplies them, and audio fires on impact events if a local pack supplies sounds.
5. No file under `src/`, `public/`, or `docs/` contains Jagex-owned art, audio, fonts, or model data.

