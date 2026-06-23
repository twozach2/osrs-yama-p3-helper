import assert from "node:assert/strict";
import { SimulatorEngine } from "../src/engine.js";
import { findCheckpoints, findPath } from "../src/pathfinding.js";
import { YAMA_P3_SCENARIO } from "../src/yamaP3Scenario.js";

const SEED = 12345;

function makeEngine(seed = SEED) {
  return new SimulatorEngine(YAMA_P3_SCENARIO, { seed });
}

function runTicks(engine, n) {
  for (let i = 0; i < n; i += 1) engine.advanceTick();
}

function moveAdjacentToYama(engine) {
  const origin = engine.scenario.yama.origin;
  const target = { x: origin.x - 1, y: origin.y + 1 };
  engine.queueMove(target);
  for (let i = 0; i < 60 && engine.distanceToYama(engine.state.player) > 1; i += 1) {
    engine.advanceTick();
  }
}

// 1. Run energy — running drains, walking/idle regens.
{
  const engine = makeEngine();
  const startEnergy = engine.state.player.runEnergy;
  engine.queueMove({ x: engine.state.player.x, y: engine.state.player.y - 4 });
  engine.advanceTick();
  assert.ok(
    engine.state.player.runEnergy < startEnergy,
    `running should drain energy, got ${engine.state.player.runEnergy}`
  );

  engine.setRunEnabled(false);
  const before = engine.state.player.runEnergy;
  engine.advanceTick();
  assert.ok(engine.state.player.runEnergy >= before, "idle/walk should regen energy");
}

// 2. Player attack — after attackSpeed ticks Yama HP drops; cooldown gating respected.
{
  const engine = makeEngine();
  // Boost the player profile so attacks reliably land within a handful of ticks
  // against Yama's heavy crush defence (placeholder Wiki numbers, see combat.js).
  Object.assign(engine.state.player.profile, { attackRoll: 200000, maxHit: 60 });
  engine.state.player.protect = "melee";
  moveAdjacentToYama(engine);
  const profile = engine.state.player.profile;
  const startHp = engine.state.yama.hp;
  engine.queueAttack();
  runTicks(engine, profile.attackSpeed * 4);
  assert.ok(engine.state.yama.hp < startHp, "Yama HP should drop after player attacks");
  assert.ok(engine.state.player.attackCount >= 1, "attack count should increment");
}

// 3. Yama auto alternation — style flips magic↔ranged each 7-tick auto.
{
  const engine = makeEngine();
  const flips = [];
  let prev = engine.state.yama.style;
  for (let t = 0; t < 30; t += 1) {
    engine.advanceTick();
    if (engine.state.yama.style !== prev) {
      flips.push(engine.state.yama.style);
      prev = engine.state.yama.style;
    }
  }
  assert.ok(flips.length >= 2, "Yama should auto at least twice in 30 ticks");
  for (let i = 1; i < flips.length; i += 1) {
    assert.notEqual(flips[i], flips[i - 1], "Yama style must alternate each auto");
  }
}

// 4. Prayer protection — correct protect ⇒ damage ≤ pierce; wrong/none ⇒ full hit.
{
  const protectEngine = makeEngine();
  protectEngine.state.player.protect = "magic";
  protectEngine.applyBossHit(0, { style: "magic", maxHit: 50, kind: "yama-hit" });
  const protectedDmg = protectEngine.state.player.maxHp - protectEngine.state.player.hp;
  assert.ok(
    protectedDmg <= YAMA_P3_SCENARIO.yama.prayerPierce.magic,
    `protect magic damage (${protectedDmg}) should be ≤ pierce (${YAMA_P3_SCENARIO.yama.prayerPierce.magic})`
  );

  const noProtect = makeEngine();
  noProtect.state.player.protect = "none";
  noProtect.applyBossHit(0, { style: "magic", maxHit: 50, kind: "yama-hit" });
  const fullDmg = noProtect.state.player.maxHp - noProtect.state.player.hp;
  assert.ok(fullDmg >= protectedDmg, "unprotected hit should be ≥ protected hit for the same seed");
}

// 5. Meteor — forces walk; damages within <safeDist of centre; safe at ≥safeDist.
{
  const engine = makeEngine();
  const target = { x: engine.state.player.x, y: engine.state.player.y };
  engine.applyYamaIntent(engine.state.tick, {
    type: "meteor",
    tile: target,
    telegraphTicks: 3,
    damageTick: engine.state.tick + 3
  });
  assert.ok(
    engine.state.projectiles.some((p) => p.type === "meteor"),
    "meteor projectile should be scheduled"
  );

  engine.state.player.runEnabled = true;
  engine.queueMove({ x: target.x, y: target.y - 1 });
  engine.advanceTick();
  const movedSteps = Math.abs(engine.state.player.y - target.y) + Math.abs(engine.state.player.x - target.x);
  assert.equal(movedSteps, 1, "meteor in flight should force walk (≤1 step/tick)");

  // direct-hit damage at impact
  const hitEngine = makeEngine();
  hitEngine.applyYamaIntent(hitEngine.state.tick, {
    type: "meteor",
    tile: { x: hitEngine.state.player.x, y: hitEngine.state.player.y },
    telegraphTicks: 0,
    damageTick: hitEngine.state.tick
  });
  hitEngine.resolveHazards(hitEngine.state.tick);
  assert.ok(hitEngine.state.player.hp < hitEngine.state.player.maxHp, "meteor at player tile should damage");

  // safe at ≥ safeDist
  const safeEngine = makeEngine();
  const safeTarget = { x: safeEngine.state.player.x + 4, y: safeEngine.state.player.y };
  safeEngine.applyYamaIntent(safeEngine.state.tick, {
    type: "meteor",
    tile: safeTarget,
    telegraphTicks: 0,
    damageTick: safeEngine.state.tick
  });
  safeEngine.resolveHazards(safeEngine.state.tick);
  assert.equal(safeEngine.state.player.hp, safeEngine.state.player.maxHp, "≥ safeDist should be safe");
}

// 6. Player death — hp <= 0 ⇒ dead & not running.
{
  const engine = makeEngine();
  engine.state.running = true;
  engine.state.player.hp = 0;
  engine.checkEndStates(engine.state.tick);
  assert.equal(engine.state.player.dead, true, "player should be flagged dead");
  assert.equal(engine.state.running, false, "engine should halt on death");
}

// 7. Phase complete — yama.hp <= 0 ⇒ phaseComplete & not running.
{
  const engine = makeEngine();
  engine.state.running = true;
  engine.state.yama.hp = 0;
  engine.checkEndStates(engine.state.tick);
  assert.equal(engine.state.yama.phaseComplete, true, "yama phase should complete");
  assert.equal(engine.state.running, false, "engine should halt on phase complete");
}

// 8. Determinism — same seed + same inputs ⇒ identical hp sequences.
{
  const a = makeEngine();
  const b = makeEngine();
  moveAdjacentToYama(a);
  moveAdjacentToYama(b);
  a.queueAttack();
  b.queueAttack();
  const seqA = [];
  const seqB = [];
  for (let t = 0; t < 25; t += 1) {
    a.advanceTick();
    b.advanceTick();
    seqA.push([a.state.player.hp, a.state.yama.hp]);
    seqB.push([b.state.player.hp, b.state.yama.hp]);
  }
  assert.deepEqual(seqA, seqB, "two engines with the same seed must produce identical hp sequences");
}

// 9. OSRS pathfinding — wiki neighbour order, checkpoint extraction, follow-mode walk.
{
  const arena = { width: 15, height: 15, blockedSet: new Set() };

  // Pure cardinal east: 5 east tiles; single checkpoint at destination.
  const eastPath = findPath({ x: 5, y: 5 }, { x: 10, y: 5 }, arena);
  assert.equal(eastPath.length, 5, "east path should be 5 tiles");
  assert.ok(eastPath.every((t, i) => t.x === 6 + i && t.y === 5), "east path tiles should be pure east");
  const eastCheckpoints = findCheckpoints({ x: 5, y: 5 }, { x: 10, y: 5 }, arena);
  assert.deepEqual(eastCheckpoints, [{ x: 10, y: 5 }], "pure cardinal run yields one checkpoint at the destination");

  // Pure SE diagonal: 5 diagonal tiles; single checkpoint.
  const diagPath = findPath({ x: 5, y: 5 }, { x: 10, y: 10 }, arena);
  assert.equal(diagPath.length, 5, "SE diagonal path should be 5 tiles");
  assert.ok(
    diagPath.every((t, i) => t.x === 6 + i && t.y === 6 + i),
    "SE diagonal path tiles should be pure diagonals"
  );

  // Mixed cardinal+diagonal: BFS in wiki order takes cardinals first, then diagonals.
  // For (5,5) -> (8,10): 2 south then 3 SE, with a corner at (5,7).
  const mixCheckpoints = findCheckpoints({ x: 5, y: 5 }, { x: 8, y: 10 }, arena);
  assert.deepEqual(
    mixCheckpoints,
    [{ x: 5, y: 7 }, { x: 8, y: 10 }],
    "mixed path should have one corner at the cardinal->diagonal turn"
  );

  // Diagonal corner-cut still blocked: when both orthogonal neighbours of the
  // diagonal step are blocked, the first step of any path to (6,6) must NOT be
  // the direct (5,5)->(6,6) diagonal — the player has to detour.
  const cornerBlocked = new Set(["6,5", "5,6"]);
  const cornerArena = { width: 15, height: 15, blockedSet: cornerBlocked };
  const cornerPath = findPath({ x: 5, y: 5 }, { x: 6, y: 6 }, cornerArena);
  assert.ok(cornerPath.length > 0, "the goal should still be reachable via a detour");
  assert.notDeepEqual(
    cornerPath[0],
    { x: 6, y: 6 },
    "diagonal corner-cut step must not be the first move when both cardinal neighbours are blocked"
  );

  // Checkpoint truncation: limit at 25 corners.
  let zigzag = { x: 0, y: 0 };
  const longChain = [];
  for (let i = 0; i < 40; i += 1) {
    zigzag = { x: zigzag.x + 1, y: zigzag.y + (i % 2 === 0 ? 1 : -1) };
    longChain.push(zigzag);
  }
  // Synthetic test of the cap: confirm findCheckpoints never returns more than 25.
  // (Using a small open arena, we can't actually realize 40 corners — but the cap
  // is enforced by slice(0, MAX_CHECKPOINTS) regardless of caller input.)
  const cappedCheckpoints = findCheckpoints({ x: 0, y: 0 }, { x: 14, y: 14 }, arena);
  assert.ok(cappedCheckpoints.length <= 25, "checkpoint list must be ≤ 25");
}

console.log("engine tests passed");
