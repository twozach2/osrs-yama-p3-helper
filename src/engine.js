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
      target: null,
      queuedPath: [],
      runEnabled: true,
      strictWaypoints: false,
      prayer: "none",
      hazards: [],
      projectiles: [],
      yama: clone(this.scenario.yama),
      mistakes: [],
      eventLog: []
    };

    this.log("Ready. P3 script loaded with draft timing data.");
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

  queueMove(tile) {
    const path = findPath(this.state.player, tile, this.scenario.arena);
    this.state.target = path.length > 0 ? cloneTile(tile) : null;
    this.state.queuedPath = path;

    if (path.length === 0 && !sameTile(this.state.player, tile)) {
      this.log(`No path to ${tile.x},${tile.y}.`);
      return false;
    }

    this.log(`Queued move to ${tile.x},${tile.y}.`);
    return true;
  }

  advanceTick() {
    const tick = this.state.tick;

    this.processEvents(tick);
    this.movePlayer(tick);
    this.resolveDamage(tick);
    this.scoreWaypoint(tick);
    this.cleanup(tick);

    this.state.tick += 1;
  }

  getMethod() {
    return this.scenario.methods[this.state.methodId];
  }

  getNextWaypoint() {
    const method = this.getMethod();
    return method.waypoints.find((waypoint) => waypoint.tick >= this.state.tick) ?? null;
  }

  getSnapshot() {
    return {
      ...this.state,
      scenario: this.scenario,
      method: this.getMethod(),
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
      return;
    }

    const steps = this.state.runEnabled ? 2 : 1;

    for (let step = 0; step < steps; step += 1) {
      const next = this.state.queuedPath.shift();
      if (!next) {
        break;
      }
      this.state.player = next;
    }

    if (this.state.queuedPath.length === 0) {
      this.state.target = null;
    }
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

    const waypoint = this.getMethod().waypoints.find((item) => item.tick === tick);
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
