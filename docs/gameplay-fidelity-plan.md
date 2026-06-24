# Gameplay Fidelity — V5, V6, V7

V1–V4 made the picture and the world *look* like OSRS. This plan makes
the practice tool *play* like an actual Yama P3 session. Three phases,
land in order — each builds on the last.

> Sibling docs: [`osrs-visual-parity-plan.md`](./osrs-visual-parity-plan.md)
> (V1–V4 architecture), [`v4-liveness-status.md`](./v4-liveness-status.md)
> (V4 in-flight tracker).

## Why this matters

The current engine models movement, a single overhead prayer, prayer
drain, Yama's attack rotation, hit splats, and Yama's specials. It does
**not** model: food / eating, prayer potions, combat potions, offensive
prayers, gear swaps, weapon special attacks against Yama, ranged/magic
combat from the player, animation locks, or click-to-tick input delay.
Net effect: today you can move and pray-flick, but you can't actually
*survive* a Yama fight in the sim. That's the gap V5–V7 closes.

## Ground rules (same as V1–V4)

1. **No Jagex IP**. Item names / icons re-drawn or text-only.
2. **Tick-anchored**. Every new mechanic resolves on engine ticks, not
   wall-clock. Verified by `npm test` extensions per phase.
3. **Engine-first, UI second**. State changes land in `src/engine.js`
   with unit tests before any UI is wired.
4. **Hotkey + click parity**. Every new action has both a button and a
   keyboard hotkey, registered through the existing `handleKeydown` /
   button-listener pattern.
5. **One commit per sub-step**, each ending in `npm test` green.

---

## V5 — Tick Fidelity Foundation (~1 day)

Make tick mechanics legible and enforced. Cheap, foundational; the rest
of the plan reads weirdly without it.

- **V5.1 Tick HUD readout** (~30 min). HUD already has `#tick`; extend
  with a 4-pixel-wide pulse bar that fills over each tick (drives off
  `partialTick`). Lets the player *feel* the beat instead of reading a
  number.
- **V5.2 Click-to-tick input delay** (~1–2 hr). In real OSRS, clicks
  register on the next tick after the click. Today the engine processes
  the input queue on the same tick it arrived. Add `tickDelay: 1` so
  pathing / attack / prayer clicks land one tick later, matching live
  game feel. Toggle-able for users who prefer the snappier feel.
- **V5.3 Animation / action lock** (~1–2 hr). New
  `player.actionLockTicks` field. Set on eat (3 ticks), pot drink
  (3 ticks), spec swing (per weapon). While > 0, attack input is
  ignored; movement still allowed. Drives a "locked" indicator on the
  HUD.
- **V5.4 Step-by-tick drill mode** (~30 min). Already have a `Step`
  button; add a hotkey (`.`) and a "hold to slow-mo" mode at 0.25×
  speed for drilling.

**Done when**: HUD shows a tick pulse + current tick, clicks visibly
land on tick N+1 with the toggle on, eating/spec locks block attack
input for the right number of ticks, and you can scrub through
mechanics one tick at a time.

---

## V6 — Boss Read (~2 days)

Make Yama's intent legible at a glance, so the player has things to
react *to*.

- **V6.1 Overhead prayer icons** (~3 hr). Two billboarded sprites:
  one above Yama showing his current attack style (`yama.style`), one
  above the player showing `player.protect`. Re-drawn diamond icons
  (melee=sword, magic=swirl, ranged=arrow), not Jagex's. This is the
  single biggest "feels like OSRS" cue not yet rendered.
- **V6.2 Projectile rendering** (~3–4 hr). `fireballLine` and any
  ranged auto currently only render as tile telegraphs. Add a flying
  orb mesh that travels along `projectile.tiles` from start tick to
  impact tick. Different palettes per style. Axe swipe gets a sweeping
  arc decal under Yama's footprint instead of an orb.
- **V6.3 Yama attack one-shot** (~30 min). Wire `playOneShotClip` on
  the Yama group when `axeSwipe` or `fireballLine` intents resolve.
  Needs visual id confirmation of which probed alt-clip is the swing
  pose (see `v4-liveness-status.md`).
- **V6.4 Yama hit / death poses** (~1 hr). Hit-flinch on damage > 0,
  freeze-on-last-frame on `yama.hp === 0`.
- **V6.5 Player hit / death poses** (~1 hr). Same pattern, player anims
  424 (block) and 836 (death) — already extractable.
- **V6.6 Camera impact shake** (~1–2 hr). The carryover V4.6 item.
  Lands cleanly once V6.1–V6.5 give it something to react to.

**Done when**: you can tell what Yama is doing in any given frame
without reading the side panel — overhead icon says the style, a flying
orb says "incoming", the swing animation says "melee tick", the death
pose says the kill landed.

---

## V7 — Combat Loop (~3–4 days)

The player's response toolkit. Largest engine surface; gated behind V5
(action locks) and V6 (visible boss intent).

- **V7.1 Inventory + food** (~4–6 hr). Minimal inventory: array of
  `{ id, healAmount, eatTicks }`. Default loadout = 16 sharks. Click to
  eat (or hotkey `1`); heals, sets `actionLockTicks`. UI: 4-wide grid
  in the side panel.
- **V7.2 Prayer restore potions** (~2 hr). Restores 28 prayer points,
  sets action lock. Hotkey `2`. Same inventory model as food.
- **V7.3 Combat / super combat potions** (~2 hr). Temporary boost to
  player profile (max hit, attack roll) with the standard OSRS 1-minute
  drain. Hotkey `3`.
- **V7.4 Offensive prayer** (~2 hr). Extend `setPrayer` to take an
  *offensive* slot alongside the existing *overhead* slot. Piety +20%
  melee accuracy / +23% strength bonus, faster drain. New UI row with
  Piety / Rigour / Augury. Affects damage formula in `beginAttack`.
- **V7.5 Spec bar + weapon specs on Yama** (~4 hr). Track
  `player.specEnergy` (0–100, regenerates over time). Spec button
  consumes 50% for an Emberlight-style swing — bonus damage, locked
  animation. Per-weapon spec definitions live in the player profile.
  Today's "spec pops flare" becomes a special case of this.
- **V7.6 Gear / style swap** (~3 hr). Two profile presets the user can
  toggle: "DPS" (Torva-equivalent) and "Tank" (Justiciar-equivalent).
  Hotkey `=`. Affects damage taken multiplier + attack roll. Minimal —
  doesn't model individual slots.

**Done when**: you can run a Yama attempt where eating, drinking
prayer pots, switching gear, and spec'ing all matter to whether you
live — i.e., the practice tool actually drills the same decisions a
real Yama kill drills.

---

## Sequencing & verification

Land in order V5 → V6 → V7. Each phase's sub-steps are independent
inside the phase, but the phases gate on each other:

- V6 reads cleanest after V5.3 (action locks make swing timing
  meaningful).
- V7's eating / potting / spec'ing are pointless until V5.3 (lock) and
  V6.1 (overhead icon to react to) are in.

After every sub-step: `npm test` green, then smoke-test in the browser.
New tests required per phase: V5 adds tick-delay + lock tests to
`engine.test.mjs`; V7 adds inventory / spec / gear-swap tests.

## Honest total

Roughly **6–8 focused days** of work to land V5+V6+V7 in full. The
"feels-like-OSRS-gameplay" line crosses partway through V7 — once
eating + offensive prayer + a working spec exist, the sim starts
behaving like a real attempt. V5 + V6 + V7.1 + V7.4 + V7.5 alone
(~4 days) gets you there; the rest is rounding out the loadout.
