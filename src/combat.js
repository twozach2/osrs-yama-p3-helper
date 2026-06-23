// Pure combat math, dependency-free. All randomness flows through an injected RNG
// (see mulberry32) so that engine ticks remain deterministic given the same seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function attackRollValue(effLvl, bonus) {
  return effLvl * (bonus + 64);
}

export function defenceRollValue(defLvl, defBonus) {
  return (defLvl + 9) * (defBonus + 64);
}

export function hitChance(atk, def) {
  return atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1));
}

export function maxHitRoll(maxHit, rng) {
  return Math.floor(rng() * (maxHit + 1));
}

export function rollHit(atkRoll, defRoll, maxHit, rng) {
  const chance = hitChance(atkRoll, defRoll);
  const hit = rng() < chance;
  const damage = hit ? maxHitRoll(maxHit, rng) : 0;
  return { hit, damage };
}

// Placeholder profile — Wiki-tunable. See plan "Risks & Tuning Knobs".
export const DEFAULT_PLAYER_PROFILE = {
  style: "melee",
  attackSpeed: 4,
  attackRoll: 28000,
  maxHit: 50,
  demonbane: true
};

export function styleToDefenceKey(style, profile = {}) {
  if (style === "ranged") return "ranged";
  if (style === "magic") return "magic";
  return profile.meleeDefenceKey ?? "crush";
}

export function yamaDefenceRoll(yamaStats, key) {
  const bonus = yamaStats?.defenceBonus?.[key] ?? 0;
  return defenceRollValue(yamaStats.defenceLevel, bonus);
}

// Engine tuning constants — central so they can be tweaked without spelunking.
export const RUN_DRAIN_PER_TILE = 0.6;
export const RUN_REGEN_PER_TICK = 0.45;
export const PRAYER_DRAIN_PER_TICK = 0.05;
