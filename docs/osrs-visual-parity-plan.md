# OSRS Visual Parity Plan — V1 + V2 + V3

> Goal: make the practice tool *feel* like Old School RuneScape **without** importing any Jagex-owned assets. Three sequential phases — HUD & overlays, camera & input parity, then a visual style pass — each landable as its own commit.

## Scope

| Phase | Theme | Touches |
| --- | --- | --- |
| **V1** | OSRS-style HUD & overlays | `src/main.js` (overlay draw methods), `index.html` (`#hud`), `styles.css` |
| **V2** | Camera & input parity | `src/main.js` (`ThreeGameScene` camera + input), new `src/cameraController.js` |
| **V3** | Visual style pass | `styles.css`, `createMaterials()` in `src/main.js`, optional `src/postFx.js` |

## Explicitly Out Of Scope

- Importing or shipping Jagex models / textures / animations (covered by `docs/osrs-asset-pipeline.md` — that's V4/V5, not this plan).
- Wiring animation clips to ticks.
- Any backend / server work.
- Method-pack content changes.

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

## Sequencing & Verification

Recommended order (most visual impact per commit, lowest risk first):

1. V1.1 Hitsplats → V1.2 HP bar → V1.4 Click markers → V1.5 AOE polish → V1.3 Orb icons → V1.6 Tile markers
2. V2.0 Extract → V2.1 Angle → V2.2 Rotate → V2.3 Zoom → V2.5 Modes → V2.4 Edge-pan
3. V3.1 Floor → V3.2 Panel → V3.3 Type → V3.4 Pixelation

After every sub-step:

```bash
npm test            # tests/engine.test.mjs + new tests/cameraController.test.mjs
node server.mjs     # smoke load index.html in a browser
```

Optional capture verification (already wired): `http://localhost:5173/?capture=1` writes a base64 PNG into `canvas.dataset.framePng` — compare against a reference screenshot for V1.5, V2.1, V3.1.

## Risks & Open Questions

- **Perspective vs orthographic raycast**: `pickTile()` uses ray-plane intersection — works for both, but the math is correct only if the ray origin is updated from the new perspective camera. Verify against the existing engine test that asserts `click+move` lands on the expected tile.
- **Font licensing**: do *not* use Jagex's "Runescape" / "Quill" / "Plain12" fonts even if URLs exist. Stick to OFL/MIT pixel fonts. Commit the license text.
- **`engine.state.player.specialEnergy`**: confirmed-or-skip before wiring V1.3's spec orb. If it doesn't exist, file a follow-up rather than guessing the field name.
- **`assetMode === "local-osrs"` interaction**: V1.2 (HP bar height) and V2.1 (camera distance) must still frame the scene correctly when a GLB Yama at a very different scale loads. Test both modes.

## Acceptance Criteria (whole plan)

Side-by-side comparison against an OSRS Yama Phase 3 screenshot, a viewer should agree that:

1. The HUD reads as OSRS (orbs, hitsplats, NPC HP bar, click X's).
2. The camera moves and reacts like the OSRS client (drag-rotate, scroll-zoom, fixed-mode option).
3. The arena looks volcanic and the side panel looks like a RuneScape UI frame.
4. No file under `src/`, `public/`, or `docs/` contains Jagex-owned art, audio, fonts, or model data.

