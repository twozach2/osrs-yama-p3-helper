// Reactive Yama phase-3 controller. Deterministic given the engine's injected
// RNG. step() reads a context snapshot, mutates only the yama slice's timers
// and style, and returns an ordered intent list. The engine is responsible for
// turning intents into projectiles/hazards/flares with damageTick/snapTick.

export class YamaController {
  constructor(scenario, rng) {
    this.scenario = scenario;
    this.rng = rng;
  }

  step(ctx) {
    const intents = [];
    const y = ctx.yama;
    const cfg = this.scenario.yama;

    // Periodic flare spawn (independent of melee bonus spawn).
    y.flareTimer = Math.max(0, (y.flareTimer ?? cfg.flare.spawnEvery) - 1);
    if (y.flareTimer === 0) {
      intents.push({ type: "spawnFlare", tile: this.pickFlareTile(ctx) });
      y.flareTimer = cfg.flare.spawnEvery;
    }

    // Meteor cadence — targets the player's current tile with telegraph window.
    y.meteorTimer = Math.max(0, (y.meteorTimer ?? cfg.flare.spawnEvery) - 1);
    if (y.meteorTimer === 0) {
      intents.push({
        type: "meteor",
        tile: { x: ctx.player.x, y: ctx.player.y },
        telegraphTicks: cfg.meteor.telegraphTicks,
        damageTick: ctx.tick + cfg.meteor.telegraphTicks
      });
      y.meteorTimer = Math.max(cfg.shadow.everyTicks, cfg.flare.spawnEvery);
    }

    // Shadow waves — wider AoE on a slower cadence.
    y.shadowTimer = Math.max(0, (y.shadowTimer ?? cfg.shadow.everyTicks) - 1);
    if (y.shadowTimer === 0) {
      intents.push({
        type: "shadowWaves",
        tiles: this.buildShadowTiles(ctx),
        damageTick: ctx.tick + cfg.shadow.telegraphTicks
      });
      y.shadowTimer = cfg.shadow.everyTicks;
    }

    // Main auto attack on attackSpeed (7) cadence.
    y.attackCooldown = Math.max(0, (y.attackCooldown ?? cfg.attackSpeed) - 1);
    if (y.attackCooldown === 0) {
      y.attackCooldown = cfg.attackSpeed;
      if (ctx.inMelee) {
        intents.push({ type: "axeSwipe", style: "melee", damageTick: ctx.tick + 1 });
        intents.push({ type: "spawnFlare", tile: this.pickFlareTile(ctx), extra: true });
      } else {
        const style = y.style === "ranged" ? "magic" : "ranged";
        intents.push({
          type: "fireballLine",
          style,
          line: this.buildFireballLine(ctx),
          damageTick: ctx.tick + 2
        });
        y.style = style;
        intents.push({ type: "autoSnap", style, snapTick: ctx.tick + 2 });
      }
    }

    return intents;
  }

  pickFlareTile(ctx) {
    const arena = this.scenario.arena;
    const center = yamaCenter(this.scenario.yama);
    // Spawn one tile in a cardinal direction from the centre, avoiding the
    // boss footprint and clamping inside the arena bounds.
    const dirs = [
      { x: 0, y: -2 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 },
      { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }, { x: -2, y: -2 }
    ];
    const pick = dirs[Math.floor(this.rng() * dirs.length)];
    const tile = {
      x: clamp(center.x + pick.x, 0, arena.width - 1),
      y: clamp(center.y + pick.y, 0, arena.height - 1)
    };
    return tile;
  }

  buildShadowTiles(ctx) {
    const center = yamaCenter(this.scenario.yama);
    const arena = this.scenario.arena;
    const ring = [];
    const radius = 3;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (dist !== radius) continue;
        const t = { x: center.x + dx, y: center.y + dy };
        if (t.x >= 0 && t.y >= 0 && t.x < arena.width && t.y < arena.height) {
          ring.push(t);
        }
      }
    }
    return ring;
  }

  buildFireballLine(ctx) {
    const center = yamaCenter(this.scenario.yama);
    const dx = Math.sign(ctx.player.x - center.x);
    const dy = Math.sign(ctx.player.y - center.y);
    const arena = this.scenario.arena;
    const tiles = [];
    let cx = center.x;
    let cy = center.y;
    for (let i = 0; i < 8; i += 1) {
      cx += dx;
      cy += dy;
      if (cx < 0 || cy < 0 || cx >= arena.width || cy >= arena.height) break;
      tiles.push({ x: cx, y: cy });
    }
    return tiles;
  }
}

function yamaCenter(yama) {
  return {
    x: yama.origin.x + Math.floor(yama.size.width / 2),
    y: yama.origin.y + Math.floor(yama.size.height / 2)
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
