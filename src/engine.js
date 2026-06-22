import { findPath, hasTile, sameTile } from "./pathfinding.js";

const MAX_LOG_ITEMS = 80;

export class SimulatorEngine {
  constructor(scenario) {
    this.scenario = scenario;
    this.reset(Object.keys(scenario.methods)[0]);
  }

  reset(methodId = this.state?.methodId ?? Object.keys(this.scenario.methods)[0]) {
    const method = this.scenario.methods[methodId];
    const startTile = method?.waypoints[0]?.tile ?? this.scenario.playerStart;

    this.state = {
      tick: 0,
      running: false,
      methodId,
      player: cloneTile(startTile),
      previousPlayer: cloneTile(startTile),
      moveSegments: [{ from: cloneTile(startTile), to: cloneTile(startTile) }],
      target: null,
      queuedPath: [],
      intent: null,
      attackCooldown: 0,
      attackCount: 0,
      runEnabled: true,
      strictWaypoints: false,
      prayer: "none",
      hazards: [],
      projectiles: [],
      clickMarkers: [],
      hitSplats: [],
      attackSwings: [],
      yama: clone(this.scenario.yama),
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
    this.state.runEnabled = enabled;
  }

  setStrictWaypoints(enabled) {
    this.state.strictWaypoints = enabled;
  }

  setPrayer(prayer) {
    this.state.prayer = prayer;
    this.log(`Prayer set to ${prayer}.`);
  }

  clickTile(tile) {
    if (this.isYamaTile(tile)) {
      return this.queueAttack();
    }

    return this.queueMove(tile);
  }

  queueMove(tile) {
    const path = findPath(this.state.player, tile, this.scenario.arena);
    this.state.target = path.length > 0 ? cloneTile(tile) : null;
    this.state.queuedPath = path;
    this.state.intent = "move";
    this.addClickMarker(tile, "move");

    if (path.length === 0 && !sameTile(this.state.player, tile)) {
      this.log(`No path to ${tile.x},${tile.y}.`);
      return false;
    }

    this.log(`Queued move to ${tile.x},${tile.y}.`);
    return true;
  }

  queueAttack() {
    this.state.intent = "attack";
    this.addClickMarker(this.getYamaCenterTile(), "attack");

    if (this.canAttackFrom(this.state.player)) {
      this.log("Queued Yama attack.");
      return true;
    }

    const attackTile = this.findNearestAttackTile();
    if (!attackTile) {
      this.log("No attack tile found.");
      return false;
    }

    const path = findPath(this.state.player, attackTile, this.scenario.arena);
    this.state.target = cloneTile(attackTile);
    this.state.queuedPath = path;
    this.log(`Pathing to attack tile ${formatTile(attackTile)}.`);
    return path.length > 0;
  }

  advanceTick() {
    const tick = this.state.tick;
    this.state.previousPlayer = cloneTile(this.state.player);
    this.state.moveSegments = [];

    this.processEvents(tick);
    this.movePlayer(tick);
    this.resolveIntent(tick);
    this.resolveDamage(tick);
    this.scoreWaypoint(tick);
    this.cleanup(tick);
    this.state.attackCooldown = Math.max(0, this.state.attackCooldown - 1);

    this.state.tick += 1;
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
      nextWaypoint: this.getNextWaypoint()
    };
  }

  processEvents(tick) {
    const events = this.scenario.events.filter((event) => event.tick === tick);

    for (const event of events) {
      if (event.type === "message") {
        this.log(event.text);
      }

      if (event.type === "hazard") {
        this.state.hazards.push({
          id: `${event.label}-${tick}`,
          label: event.label,
          startTick: tick,
          endTick: tick + event.duration,
          tiles: event.tiles
        });
        this.log(`${event.label} active for ${event.duration} ticks.`);
      }

      if (event.type === "projectile") {
        this.state.projectiles.push({
          id: `${event.label}-${tick}`,
          label: event.label,
          startTick: tick,
          impactTick: event.impactTick,
          tiles: event.tiles,
          resolvedImpact: false
        });
        this.log(`${event.label} impacts on tick ${event.impactTick}.`);
      }

      if (event.type === "meteorFall") {
        const target = cloneTile(this.state.player);
        this.state.projectiles.push({
          id: `${event.label}-${tick}`,
          type: "meteor",
          label: event.label,
          startTick: tick,
          impactTick: event.damageTick,
          dodgeTick: event.dodgeTick,
          tiles: [target],
          resolvedImpact: false,
          resolvedDodge: false
        });
        this.log(`${event.label} falls at ${formatTile(target)}; damage ${event.damageTick}, dodge ${event.dodgeTick}.`);
      }
    }
  }

  movePlayer(tick) {
    if (tick < this.scenario.firstActionTick || this.state.queuedPath.length === 0) {
      this.state.moveSegments = [{ from: cloneTile(this.state.player), to: cloneTile(this.state.player) }];
      return;
    }

    const steps = this.state.runEnabled ? 2 : 1;
    let from = cloneTile(this.state.player);

    for (let step = 0; step < steps; step += 1) {
      const next = this.state.queuedPath.shift();
      if (!next) {
        break;
      }
      this.state.moveSegments.push({ from, to: cloneTile(next) });
      this.state.player = next;
      from = cloneTile(next);
    }

    if (this.state.queuedPath.length === 0) {
      this.state.target = null;
    }

    if (this.state.moveSegments.length === 0) {
      this.state.moveSegments = [{ from: cloneTile(this.state.player), to: cloneTile(this.state.player) }];
    }
  }

  resolveIntent(tick) {
    if (this.state.intent !== "attack") {
      return;
    }

    if (!this.canAttackFrom(this.state.player)) {
      return;
    }

    if (this.state.attackCooldown > 0) {
      return;
    }

    this.performAttack(tick);
  }

  resolveDamage(tick) {
    for (const projectile of this.state.projectiles) {
      if (!projectile.resolvedImpact && projectile.impactTick === tick) {
        projectile.resolvedImpact = true;
        if (hasTile(projectile.tiles, this.state.player)) {
          this.addMistake(tick, `${projectile.label} impact hit ${formatTile(this.state.player)}.`);
        }
      }

      if (projectile.type === "meteor" && !projectile.resolvedDodge && projectile.dodgeTick === tick) {
        projectile.resolvedDodge = true;
        const target = projectile.tiles[0];
        const dx = Math.abs(this.state.player.x - target.x);
        const dy = Math.abs(this.state.player.y - target.y);
        const validDiagonalDodge = (dx === 1 && dy === 1) || (dx === 2 && dy === 2);

        if (!validDiagonalDodge) {
          this.addMistake(
            tick,
            `${projectile.label} dodge expected diagonal 1 or 2 from ${formatTile(target)}, got ${formatTile(this.state.player)}.`
          );
        }
      }
    }

    for (const hazard of this.state.hazards) {
      const active = tick >= hazard.startTick && tick < hazard.endTick;
      if (active && hasTile(hazard.tiles, this.state.player)) {
        this.addMistake(tick, `${hazard.label} clipped ${formatTile(this.state.player)}.`);
      }
    }
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
      const finalTick = Math.max(projectile.impactTick ?? 0, projectile.dodgeTick ?? 0);
      if (projectile.type === "meteor") {
        return finalTick >= tick || !projectile.resolvedImpact || !projectile.resolvedDodge;
      }

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
    return distance <= 2;
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

  performAttack(tick) {
    const center = this.getYamaCenterTile();
    const amount = 18 + ((tick * 17 + this.state.attackCount * 11) % 34);
    this.state.attackCooldown = 3;
    this.state.attackCount += 1;
    this.state.hitSplats.push({
      tick,
      amount,
      tile: center,
      kind: "melee"
    });
    this.state.attackSwings.push({
      tick,
      from: cloneTile(this.state.player),
      to: center
    });
    this.log(`Attacked Yama for ${amount}.`);
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
