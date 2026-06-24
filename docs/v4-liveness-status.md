# V4 Liveness — Status & Remaining Work

Living tracker for the V4 phase of `docs/osrs-visual-parity-plan.md`. The
master plan describes the architecture; this doc tracks what's actually
been built, what's still pending, and what's blocked on external action.

The V4 implementation **pivoted from** the originally-planned custom
Sequence/Frame decoder **to** the community
[`osrscachereader`](https://github.com/Dezinater/osrscachereader) library
(the same one colosim uses). All asset extraction goes through
`tools/extract-models/extract.mjs`; runtime playback uses
`THREE.AnimationMixer` driven from `src/assetPack.js`.

## Done

- [x] Local extraction pipeline (`tools/extract-models/extract.mjs`)
      reads from `~/.runelite/jagexcache/oldschool/LIVE` via a symlink at
      `tools/extract-models/cache`. Output GLBs land in
      `public/assets/osrs/models/` (gitignored).
- [x] `MeshoptDecoder` registered on `GLTFLoader` so the optimized GLBs
      actually render (without it they parsed but came back empty).
- [x] Player model (NPC 385 "Man") loads and animates: `idle`, `walk`,
      `run`, `rotate-180`, `strafe-left/right`, `attack` (390 = 1H slash),
      `attack-punch` (422).
- [x] Yama model (3 merged model defs) loads as a static mesh.
- [x] Player facing derived from `snapshot.moveSegments[i]` (matches the
      tick the visible position is interpolating). Pre-fix the rotation
      lagged one tick behind the position.
- [x] `AssetPack.setActiveClip(group, name)` — looping clip with
      crossfade.
- [x] `AssetPack.playOneShotClip(group, name)` — non-looping one-shot
      that auto-returns to the background clip. Used by player attack
      swings.
- [x] Engine `attackSwings` array → player attack one-shot triggered
      each new swing tick.
- [x] Yama gets an idle loop using whichever clip from a fallback
      preference list actually loaded (since canonical 12140/12141 are
      missing from the user's current cache).

## Blocked — needs user action

- [ ] **Cache rehydration**. Yama's canonical animations (`idle=12140`,
      `walk=12141` — though Yama doesn't actually walk in P3, so walk is
      moot) need frame archives 543/545 in the local cache. Two options:

  1. **Visit Yama in RuneLite** — boot RL, log in, enter Yama's chamber,
     let the boss run one full attack cycle (so the client streams the
     frame archives), quit RL cleanly. Then `node tools/extract-models/extract.mjs yama`.

  2. **Pull from OpenRS2** — download the latest "Cache (Flat file)" zip
     from <https://archive.openrs2.org/caches> (filter
     `oldschool / live / en`), unzip into a folder, repoint
     `tools/extract-models/cache` at it. Doesn't require booting the game.

  Once either lands, drop the `idle-alt-*` / `attack-alt-*` fallback
  entries from `extract.mjs`'s `yama` target and re-run the extractor.

## Remaining — animations

Each item is independent; ordering is by visual impact. Estimates are
honest first-pass guesses, not budgets.

- [ ] **Yama attack one-shot** (~30 min). When the engine emits
      `intent.type === "axeSwipe"` (`engine.applyYamaIntent`), play
      Yama's attack clip via `playOneShotClip`. Needs the canonical
      attack anim id confirmed (probe sweep ran 12100..12200; candidates
      `12149`, `12137`, `12138` need visual identification — load one,
      eyeball it, lock it in).
- [ ] **Yama hit reaction** (~30 min). When `snapshot.hitSplats` gains
      an entry with `target === "yama"` and `amount > 0`, play a hit
      clip. Same identification work as above.
- [ ] **Yama death pose** (~20 min). When `state.yama.hp === 0`, switch
      to a death clip and let it clamp on the last frame
      (`clampWhenFinished = true`). Probably ID `12128` (78 frames is
      typical death length) — needs confirmation.
- [ ] **Player hit reaction** (~20 min). Hook off
      `hitSplats[target === "player"]`. Player anim `424` is the
      canonical "block / take damage" clip — already in the cache,
      needs adding to `extract.mjs` and a trigger.
- [ ] **Player death** (~20 min). Player anim `836`. Same wiring as
      above; freezes on last frame.

## Remaining — beyond animation (from the master plan's V4)

- [ ] **V4.4 Procedural sway fallback** (~1–2 hr). Subtle head-tracking
      + bob for the procedural primitive Yama when no GLB is loaded.
      Low priority since the GLB path is the default; matters only for
      first-run-no-cache users.
- [ ] **V4.6 Camera impact shake** (~1–2 hr). `applyImpulse()` on the
      `CameraController`, triggered on player damage > 0 and on
      meteor/shadow impact ticks. Adds weight to hits.
- [ ] **V4.5 Audio asset-pack slot** (~2–3 hr). `src/audio.js` +
      manifest sounds + Mute toggle. Lowest priority — silence is fine
      for practice.

## "Basic, completely useful" — assessment

Honest take: **it already is**, for the core practice loop.

V1 (HUD), V2 (camera/input), V3 (visual style), and the gameplay-side
engine (telegraphs, prayer flicks, hit splats, HP bar, method packs,
RoboFly schedule) are all done. You can drill prayer / position / tick
mechanics today and get correct feedback. The remaining V4 work is
**polish that makes hits feel weighty and the boss feel alive**, not
correctness.

Concrete checkpoint that I'd call "complete for daily practice":

- [ ] Cache rehydrated (Option A or B above) so Yama plays its real idle.
- [ ] Yama attack one-shot wired (most-noticed missing motion — the
      boss currently throws projectiles without visibly swinging).
- [ ] Player death + Yama death poses (avoids the "wait, did I die?"
      moment).
- [ ] Optional but cheap: V4.6 camera shake on player damage.

That's ~2 hours of code work plus the cache rehydration (5 minutes of
user-side action). Everything past that is feel-polish (audio, hit
reactions, fallback procedural sway) and doesn't block daily use.

## Process notes

- Re-extract after any change to `extract.mjs`:
  `npm run extract:models` (or `node tools/extract-models/extract.mjs
  yama` / `... player` for one target).
- Hard-refresh the browser (Cmd+Shift+R on macOS) after re-extracting —
  the GLBs are otherwise served from the disk cache.
- Probe new Yama anim IDs against your cache with
  `node tools/extract-models/probe-yama-anims.mjs <from> <to>`.
- `npm test` must stay 7/7 green after each landed change.
