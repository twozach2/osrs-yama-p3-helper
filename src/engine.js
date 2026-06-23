import { findPath, hasTile, sameTile } from "./pathfinding.js";
import {
  DEFAULT_PLAYER_PROFILE,
  PRAYER_DRAIN_PER_TICK,
  RUN_DRAIN_PER_TILE,
  RUN_REGEN_PER_TICK,
  maxHitRoll,
  mulberry32,
  rollHit,
  styleToDefenceKey,
  yamaDefenceRoll
} from "./combat.js";
import { YamaController } from "./yamaAi.js";

const MAX_LOG_ITEMS = 80;
const DEFAULT_SEED = 0x9e3779b9;

export class SimulatorEngine {
  constructor(scenario, options = {}) {
    this.scenario = scenario;
    this.options = { ...options };
    this.reset(Object.keys(scenario.methods)[0], this.options);
  }

  reset(methodId = this.state?.methodId ?? Object.keys(this.scenario.methods)[0], options = {}) {
    const method = this.scenario.methods[methodId];
    const startTile = method?.waypoints[0]?.tile ?? this.scenario.playerStart;
    const seed = options.seed ?? this.options.seed ?? DEFAULT_SEED;
    this.options.seed = seed;
    this.rng = mulberry32(seed);
    this.yamaAi = new YamaController(this.scenario, this.rng);

    const yamaStats = this.scenario.yama;

    this.state = {
      tick: 0,
      running: false,
      methodId,
      previousPlayer: cloneTile(startTile),
      moveSegments: [{ from: cloneTile(startTile), to: cloneTile(startTile) }],
      target: null,
      queuedPath: [],
      intent: null,
      strictWaypoints: false,
      hazards: [],
      projectiles: [],
      clickMarkers: [],
      hitSplats: [],
      attackSwings: [],
      inputQueue: [],
      player: {
        ...cloneTile(startTile),
        hp: 99,
        maxHp: 99,
        prayerPoints: 99,
        maxPrayer: 99,
        runEnergy: 100,
        runEnabled: true,
        attackCooldown: 0,
        attackCount: 0,
        poison: 0,
        burn: 0,
        protect: "none",
        profile: { ...DEFAULT_PLAYER_PROFILE },
        dead: false
      },
      yama: {
        ...clone(yamaStats),
        hp: yamaStats.maxHp,
        style: "ranged",
        attackCooldown: yamaStats.attackSpeed,
        meteorTimer: 14,
        shadowTimer: yamaStats.shadow.everyTicks,
        flareTimer: yamaStats.flare.spawnEvery,
        flares: [],
        nextFlareId: 1,
        phaseComplete: false,
        telegraph: null
      },
      mistakes: [],
      eventLog: []
    };

    this.log("Ready. Click the floor to move or click Yama to attack.");
  }

  start() {
    this.state.running = true;
  }

  pause() {
    this.state.running = false;
  }

  toggleRunning() {
    this.state.running = !this.state.running;
  }

  setRunEnabled(enabled) {
    this.state.player.runEnabled = enabled;
  }

  setStrictWaypoints(enabled) {
    this.state.strictWaypoints = enabled;
  }

  setPrayer(prayer) {
    this.state.player.protect = prayer;
    this.log(`Prayer set to ${prayer}.`);
  }

  clickTile(tile) {
    const kind = this.isYamaTile(tile) ? "attack" : "move";
    this.state.inputQueue.push({ kind, tile: cloneTile(tile) });
    this.addClickMarker(tile, kind);
    return true;
  }

  // Retained for tests/back-compat: enqueue a move intent.
  queueMove(tile) {
    this.state.inputQueue.push({ kind: "move", tile: cloneTile(tile) });
    this.addClickMarker(tile, "move");
    return true;
  }

  queueAttack() {
    this.state.inputQueue.push({ kind: "attack", tile: this.getYamaCenterTile() });
    this.addClickMarker(this.getYamaCenterTile(), "attack");
    return true;
  }

  clickSpec() {
    this.state.inputQueue.push({ kind: "spec" });
    return true;
  }

  advanceTick() {
    if (this.state.player.dead || this.state.yama.phaseComplete) {
      this.state.tick += 1;
      return;
    }

    const tick = this.state.tick;
    this.state.previousPlayer = cloneTile(this.state.player);
    this.state.moveSegments = [];
    this.state.yama.telegraph = null;

    this.consumeInput(tick);        // 1. apply queued click/intent for THIS tick
    this.movePlayer(tick);          // 2. movement + run-energy drain/regen
    this.resolvePlayerCombat(tick); // 3. cooldown gate -> roll -> Yama hp -> hitsplat
    this.stepYamaAi(tick);          // 4. reactive Yama decide + telegraph + scheduled hits
    this.resolveHazards(tick);      // 5. meteor dmg, flare charge, shadow waves, projectile impacts
    this.resolveDots(tick);         // 6. prayer drain + poison/burn DoT
    this.checkEndStates(tick);      // 7. player death / phase-complete
    this.scoreWaypoint(tick);       // optional training overlay
    this.cleanup(tick);             // 8. expire transient effects
    this.state.player.attackCooldown = Math.max(0, this.state.player.attackCooldown - 1);

    this.state.tick += 1;
  }

  consumeInput(tick) {
    const queue = this.state.inputQueue;
    const input = queue.length > 0 ? queue[queue.length - 1] : null;
    queue.length = 0;
    if (!input) return;
    if (input.kind === "move") this.beginMove(input.tile);
    else if (input.kind === "attack") this.beginAttack(input.tile);
    else if (input.kind === "spec") this.beginSpec();
  }

  beginMove(tile) {
    const path = findPath(this.state.player, tile, this.scenario.arena);
    this.state.target = path.length > 0 ? cloneTile(tile) : null;
    this.state.queuedPath = path;
    this.state.intent = "move";

    if (path.length === 0 && !sameTile(this.state.player, tile)) {
      this.log(`No path to ${tile.x},${tile.y}.`);
      return;
    }

    this.log(`Queued move to ${tile.x},${tile.y}.`);
  }

  beginAttack(_tile) {
    this.state.intent = "attack";

    if (this.canAttackFrom(this.state.player)) {
      this.log("Queued Yama attack.");
      return;
    }

    const attackTile = this.findNearestAttackTile();
    if (!attackTile) {
      this.log("No attack tile found.");
      return;
    }

    const path = findPath(this.state.player, attackTile, this.scenario.arena);
    this.state.target = cloneTile(attackTile);
    this.state.queuedPath = path;
    this.log(`Pathing to attack tile ${formatTile(attackTile)}.`);
  }

  beginSpec() {
    const flares = this.state.yama.flares;
    if (flares.length === 0) {
      this.log("No void flares to pop.");
      return;
    }
    let nearest = flares[0];
    let bestDist = chebyshevTiles(this.state.player, nearest.tile);
    for (const f of flares) {
      const d = chebyshevTiles(this.state.player, f.tile);
      if (d < bestDist) { nearest = f; bestDist = d; }
    }
    const spec = this.scenario.yama.flare.specDamage;
    nearest.hp -= spec;
    this.log(`Spec'd void flare for ${spec}.`);
  }

  getMethod() {
    return this.scenario.methods[this.state.methodId];
  }

  getNextWaypoint() {
    return this.getExpectedWaypoint(this.state.tick + 1);
  }

  getExpectedWaypoint(tick = this.state.tick) {
    const method = this.getMethod();
    if (method.waypoints.length === 0) {
      return null;
    }

    const cycleTick = tick % method.waypoints.length;
    const waypoint = method.waypoints[cycleTick];
    return {
      ...waypoint,
      cycleTick,
      absoluteTick: tick
    };
  }

  getSnapshot() {
    return {
      ...this.state,
      scenario: this.scenario,
      method: this.getMethod(),
      expectedWaypoint: this.getExpectedWaypoint(),
      nextWaypoint: this.getNextWaypoint(),
      inMeleeRange: this.distanceToYama(this.state.player) === 1
    };
  }

  // Scenario.events is now reference/training data only — just emit any
  // residual "message" events (e.g. the boot banner).
  processEvents(tick) {
    const events = this.scenario.events.filter((event) => event.tick === tick);
    for (const event of events) {
      if (event.type === "message") this.log(event.text);
    }
  }

  movePlayer(tick) {
    this.processEvents(tick);

    if (tick < this.scenario.firstActionTick || this.state.queuedPath.length === 0) {
      this.state.moveSegments = [{ from: cloneTile(this.state.player), to: cloneTile(this.state.player) }];
      this.regenRunEnergy();
      return;
    }

    const player = this.state.player;
    const forceWalk = this.state.projectiles.some((p) => p.type === "meteor" && !p.resolvedImpact);
    const wantRun = player.runEnabled && player.runEnergy > 0 && !forceWalk;
    const maxSteps = wantRun ? 2 : 1;
    const moved = this.stepAlongPath(maxSteps);

    if (wantRun && moved > 0) {
      player.runEnergy = Math.max(0, player.runEnergy - RUN_DRAIN_PER_TILE * moved);
    } else {
      this.regenRunEnergy();
    }

    if (this.state.moveSegments.length === 0) {
      this.state.moveSegments = [{ from: cloneTile(player), to: cloneTile(player) }];
    }
  }

  stepAlongPath(maxSteps) {
    const player = this.state.player;
    let from = cloneTile(player);
    let moved = 0;

    for (let step = 0; step < maxSteps; step += 1) {
      const next = this.state.queuedPath.shift();
      if (!next) break;
      this.state.moveSegments.push({ from, to: cloneTile(next) });
      player.x = next.x;
      player.y = next.y;
      from = cloneTile(next);
      moved += 1;
    }

    if (this.state.queuedPath.length === 0) {
      this.state.target = null;
    }

    return moved;
  }

  regenRunEnergy() {
    const player = this.state.player;
    player.runEnergy = Math.min(100, player.runEnergy + RUN_REGEN_PER_TICK);
  }

  resolvePlayerCombat(tick) {
    if (this.state.intent !== "attack") return;
    if (!this.canAttackFrom(this.state.player)) return;
    if (this.state.player.attackCooldown > 0) return;

    const profile = this.state.player.profile;
    const baseRoll = profile.attackRoll;
    const atkRoll = profile.demonbane ? Math.floor(baseRoll * 1.2) : baseRoll;
    const defKey = styleToDefenceKey(profile.style, profile);
    const defRoll = yamaDefenceRoll(this.state.yama, defKey);
    const { hit, damage } = rollHit(atkRoll, defRoll, profile.maxHit, this.rng);

    this.state.player.attackCooldown = profile.attackSpeed;
    this.state.player.attackCount += 1;

    const center = this.getYamaCenterTile();
    const dealt = Math.min(hit ? damage : 0, this.state.yama.hp);
    this.state.yama.hp = Math.max(0, this.state.yama.hp - dealt);

    this.state.hitSplats.push({
      tick,
      amount: dealt,
      tile: center,
      kind: hit ? "player-hit" : "miss",
      target: "yama"
    });
    this.state.attackSwings.push({
      tick,
      from: cloneTile(this.state.player),
      to: center
    });
    this.log(hit ? `Hit Yama for ${dealt}.` : "Missed Yama.");
  }

  stepYamaAi(tick) {
    const ctx = {
      tick,
      player: this.state.player,
      yama: this.state.yama,
      inMelee: this.distanceToYama(this.state.player) === 1,
      distance: this.distanceToYama(this.state.player)
    };
    const intents = this.yamaAi.step(ctx);
    for (const intent of intents) {
      this.applyYamaIntent(tick, intent);
    }
  }

  applyYamaIntent(tick, intent) {
    if (intent.type === "autoSnap") {
      this.state.yama.telegraph = { type: "autoSnap", style: intent.style, snapTick: intent.snapTick };
      this.log(`Yama snaps to ${intent.style}.`);
      return;
    }

    if (intent.type === "fireballLine") {
      this.state.projectiles.push({
        id: `fireball-${tick}`,
        type: "fireballLine",
        label: `Yama ${intent.style} line`,
        style: intent.style,
        startTick: tick,
        impactTick: intent.damageTick,
        tiles: intent.line,
        resolvedImpact: false
      });
      return;
    }

    if (intent.type === "axeSwipe") {
      this.state.projectiles.push({
        id: `axe-${tick}`,
        type: "axeSwipe",
        label: "Yama axe swipe",
        style: "melee",
        startTick: tick,
        impactTick: intent.damageTick,
        tiles: [this.getYamaCenterTile()],
        resolvedImpact: false
      });
      return;
    }

    if (intent.type === "spawnFlare") {
      const cfg = this.scenario.yama.flare;
      this.state.yama.flares.push({
        id: `flare-${this.state.yama.nextFlareId++}`,
        tile: cloneTile(intent.tile),
        hp: cfg.hp,
        charge: 0,
        maxCharge: cfg.chargeTicks
      });
      this.log(intent.extra ? "Yama spawns extra void flare." : "Yama spawns void flare.");
      return;
    }

    if (intent.type === "meteor") {
      this.state.projectiles.push({
        id: `meteor-${tick}`,
        type: "meteor",
        label: "Meteor",
        startTick: tick,
        impactTick: intent.damageTick,
        tiles: [cloneTile(intent.tile)],
        resolvedImpact: false
      });
      this.log(`Meteor falls at ${formatTile(intent.tile)}; impact tick ${intent.damageTick}.`);
      return;
    }

    if (intent.type === "shadowWaves") {
      this.state.hazards.push({
        id: `shadow-${tick}`,
        type: "shadowWaves",
        label: "Shadow waves",
        startTick: tick,
        endTick: intent.damageTick + 1,
        damageTick: intent.damageTick,
        resolvedImpact: false,
        tiles: intent.tiles.map(cloneTile)
      });
      return;
    }
  }

  resolveHazards(tick) {
    const yamaStats = this.scenario.yama;

    for (const projectile of this.state.projectiles) {
      if (projectile.resolvedImpact || projectile.impactTick !== tick) continue;
      projectile.resolvedImpact = true;

      if (projectile.type === "meteor") {
        const target = projectile.tiles[0];
        const dist = chebyshev(this.state.player, target);
        if (dist < yamaStats.meteor.safeDist) {
          const dmg = dist === 0 ? yamaStats.meteor.edgeDamage : yamaStats.meteor.oneTileDamage;
          this.applyBossHit(tick, { style: "none", flatDamage: dmg, kind: "burn" });
          this.state.player.burn = 2;
          this.addMistake(tick, `Meteor impact at ${formatTile(target)} hit ${formatTile(this.state.player)}.`);
        }
        continue;
      }

      if (projectile.type === "fireballLine" || projectile.type === "axeSwipe") {
        if (hasTile(projectile.tiles, this.state.player) || projectile.type === "axeSwipe" && this.distanceToYama(this.state.player) <= 1) {
          this.applyBossHit(tick, {
            style: projectile.style,
            maxHit: yamaStats.maxHits.auto,
            kind: "yama-hit"
          });
        }
      }
    }

    for (const hazard of this.state.hazards) {
      if (hazard.type === "shadowWaves") {
        if (!hazard.resolvedImpact && hazard.damageTick === tick) {
          hazard.resolvedImpact = true;
          if (hasTile(hazard.tiles, this.state.player)) {
            this.applyBossHit(tick, {
              style: "magic",
              maxHit: yamaStats.maxHits.shadowStomp,
              kind: "yama-hit"
            });
            this.state.player.prayerPoints = Math.max(0, this.state.player.prayerPoints - 10);
          }
        }
      }
    }

    this.tickFlares(tick);
  }

  tickFlares(tick) {
    const cfg = this.scenario.yama.flare;
    const alive = [];
    for (const flare of this.state.yama.flares) {
      if (flare.hp <= 0) {
        this.log(`Void flare popped.`);
        continue;
      }
      flare.charge += 1;
      if (flare.charge >= cfg.chargeTicks) {
        const dmg = maxHitRoll(this.scenario.yama.maxHits.flare, this.rng);
        this.state.player.hp -= dmg;
        this.state.yama.hp = Math.min(this.scenario.yama.maxHp, this.state.yama.hp + dmg);
        this.state.hitSplats.push({
          tick,
          amount: dmg,
          tile: cloneTile(this.state.player),
          kind: "burn",
          target: "player"
        });
        this.log(`Void flare detonates for ${dmg}; Yama heals ${dmg}.`);
        continue;
      }
      alive.push(flare);
    }
    this.state.yama.flares = alive;
  }

  applyBossHit(tick, { style, maxHit, flatDamage, kind }) {
    let dmg = flatDamage != null ? flatDamage : maxHitRoll(maxHit ?? 0, this.rng);
    if (style && style !== "none" && this.state.player.protect === style && this.state.player.prayerPoints > 0) {
      const pierce = this.scenario.yama.prayerPierce[style] ?? 0;
      dmg = Math.min(dmg, pierce);
    }
    this.state.player.hp = Math.max(0, this.state.player.hp - dmg);
    this.state.hitSplats.push({
      tick,
      amount: dmg,
      tile: cloneTile(this.state.player),
      kind: kind ?? "yama-hit",
      target: "player"
    });
  }

  resolveDots(tick) {
    const player = this.state.player;
    if (player.protect !== "none" && player.prayerPoints > 0) {
      player.prayerPoints = Math.max(0, player.prayerPoints - PRAYER_DRAIN_PER_TICK);
      if (player.prayerPoints === 0) {
        player.protect = "none";
        this.log("Prayer ran out.");
      }
    }
    if (player.poison > 0) {
      const dmg = Math.min(player.hp, 4);
      player.hp -= dmg;
      this.state.hitSplats.push({ tick, amount: dmg, tile: cloneTile(player), kind: "poison", target: "player" });
      player.poison -= 1;
    }
    if (player.burn > 0) {
      const dmg = Math.min(player.hp, 3);
      player.hp -= dmg;
      this.state.hitSplats.push({ tick, amount: dmg, tile: cloneTile(player), kind: "burn", target: "player" });
      player.burn -= 1;
    }
  }

  checkEndStates(tick) {
    if (this.state.yama.hp <= 0 && !this.state.yama.phaseComplete) {
      this.state.yama.hp = 0;
      this.state.yama.phaseComplete = true;
      this.state.running = false;
      this.log("Yama Phase 3 complete!");
    }
    if (this.state.player.hp <= 0 && !this.state.player.dead) {
      this.state.player.hp = 0;
      this.state.player.dead = true;
      this.state.running = false;
      this.log("You died. Press Reset.");
    }
  }

  distanceToYama(tile) {
    return distanceToRect(tile, this.scenario.yama.origin, this.scenario.yama.size);
  }

  scoreWaypoint(tick) {
    if (!this.state.strictWaypoints) {
      return;
    }

    const waypoint = this.getExpectedWaypoint(tick);
    if (!waypoint) {
      return;
    }

    if (!sameTile(this.state.player, waypoint.tile)) {
      this.addMistake(
        tick,
        `Missed ${waypoint.label}: expected ${formatTile(waypoint.tile)}, got ${formatTile(this.state.player)}.`
      );
    }
  }

  cleanup(tick) {
    this.state.hazards = this.state.hazards.filter((hazard) => hazard.endTick > tick);
    this.state.projectiles = this.state.projectiles.filter((projectile) => {
      const finalTick = projectile.impactTick ?? 0;
      return finalTick >= tick || !projectile.resolvedImpact;
    });
    this.state.clickMarkers = this.state.clickMarkers.filter((marker) => tick - marker.tick < 4);
    this.state.hitSplats = this.state.hitSplats.filter((hit) => tick - hit.tick < 5);
    this.state.attackSwings = this.state.attackSwings.filter((swing) => tick - swing.tick < 3);
  }

  addMistake(tick, text) {
    const key = `${tick}:${text}`;
    if (this.state.mistakes.some((mistake) => mistake.key === key)) {
      return;
    }

    this.state.mistakes.push({ key, tick, text });
    this.log(text);
  }

  log(text) {
    this.state.eventLog.unshift({ tick: this.state.tick, text });
    this.state.eventLog = this.state.eventLog.slice(0, MAX_LOG_ITEMS);
  }

  isYamaTile(tile) {
    return isInsideRect(tile, this.scenario.yama.origin, this.scenario.yama.size);
  }

  canAttackFrom(tile) {
    if (this.isYamaTile(tile)) {
      return false;
    }

    const distance = distanceToRect(tile, this.scenario.yama.origin, this.scenario.yama.size);
    const style = this.state.player.profile?.style ?? "melee";
    if (style === "melee") return distance === 1;
    return distance <= (this.state.player.profile?.range ?? 7);
  }

  findNearestAttackTile() {
    const candidates = [];
    const { arena } = this.scenario;

    for (let y = 0; y < arena.height; y += 1) {
      for (let x = 0; x < arena.width; x += 1) {
        const tile = { x, y };
        if (!this.canAttackFrom(tile)) {
          continue;
        }

        const path = findPath(this.state.player, tile, arena);
        if (path.length > 0 || sameTile(this.state.player, tile)) {
          candidates.push({ tile, distance: path.length });
        }
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.tile ?? null;
  }

  getYamaCenterTile() {
    return {
      x: this.scenario.yama.origin.x + Math.floor(this.scenario.yama.size.width / 2),
      y: this.scenario.yama.origin.y + Math.floor(this.scenario.yama.size.height / 2)
    };
  }

  addClickMarker(tile, kind) {
    this.state.clickMarkers.push({
      tick: this.state.tick,
      tile: cloneTile(tile),
      kind
    });
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneTile(tile) {
  return { x: tile.x, y: tile.y };
}

function formatTile(tile) {
  return `${tile.x},${tile.y}`;
}

function isInsideRect(tile, origin, size) {
  return (
    tile.x >= origin.x &&
    tile.y >= origin.y &&
    tile.x < origin.x + size.width &&
    tile.y < origin.y + size.height
  );
}

function distanceToRect(tile, origin, size) {
  const minX = origin.x;
  const maxX = origin.x + size.width - 1;
  const minY = origin.y;
  const maxY = origin.y + size.height - 1;
  const dx = tile.x < minX ? minX - tile.x : tile.x > maxX ? tile.x - maxX : 0;
  const dy = tile.y < minY ? minY - tile.y : tile.y > maxY ? tile.y - maxY : 0;
  return Math.max(dx, dy);
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function chebyshevTiles(a, b) {
  return chebyshev(a, b);
}
