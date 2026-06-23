export function tileKey(tile) {
  return `${tile.x},${tile.y}`;
}

export function sameTile(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function hasTile(tiles, tile) {
  return tiles.some((candidate) => sameTile(candidate, tile));
}

export function makeTileSet(tiles) {
  return new Set(tiles.map(tileKey));
}

export function isInBounds(tile, arena) {
  return tile.x >= 0 && tile.y >= 0 && tile.x < arena.width && tile.y < arena.height;
}

export function isWalkable(tile, arena, extraBlocked = []) {
  if (!isInBounds(tile, arena)) {
    return false;
  }

  const blocked = arena.blockedSet ?? makeTileSet(arena.blocked ?? []);
  if (blocked.has(tileKey(tile))) {
    return false;
  }

  return !extraBlocked.some((blockedTile) => sameTile(blockedTile, tile));
}

// OSRS player-pathfinding model (see https://oldschool.runescape.wiki/w/Pathfinding):
// 1. Pure BFS in a fixed neighbour order (cardinals before diagonals) — never a
//    goal-biased sort. This is what makes OSRS prefer long straight cardinal runs.
// 2. Extract corner tiles from the BFS parent chain — these are the wiki's
//    "checkpoint tiles". The game truncates to the first 25.
// 3. Walk between consecutive checkpoints in NPC-style follow-mode: step
//    diagonally toward the next checkpoint until either dx or dy is 0, then
//    finish with a straight cardinal run.
//
// `findPath` continues to return a flat tile-by-tile array so callers don't
// have to change. `findCheckpoints` is exposed for callers that want the raw
// corner list (e.g. tests).

const MAX_CHECKPOINTS = 25;

const NEIGHBOR_ORDER = [
  { x: -1, y: 0 },  // W
  { x: 1, y: 0 },   // E
  { x: 0, y: 1 },   // S
  { x: 0, y: -1 },  // N
  { x: -1, y: 1 },  // SW
  { x: 1, y: 1 },   // SE
  { x: -1, y: -1 }, // NW
  { x: 1, y: -1 }   // NE
];

export function findPath(start, goal, arena, extraBlocked = []) {
  const checkpoints = findCheckpoints(start, goal, arena, extraBlocked);
  if (checkpoints.length === 0) return [];
  return expandCheckpoints(start, checkpoints);
}

export function findCheckpoints(start, goal, arena, extraBlocked = []) {
  if (sameTile(start, goal)) return [];
  if (!isWalkable(goal, arena, extraBlocked)) return [];

  const queue = [start];
  let head = 0;
  const visited = new Set([tileKey(start)]);
  const cameFrom = new Map();
  let found = null;

  while (head < queue.length) {
    const current = queue[head++];
    if (sameTile(current, goal)) {
      found = current;
      break;
    }

    for (const dir of NEIGHBOR_ORDER) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const key = tileKey(next);
      if (visited.has(key) || !canStep(current, next, arena, extraBlocked)) continue;
      visited.add(key);
      cameFrom.set(key, current);
      queue.push(next);
    }
  }

  if (!found) return [];

  const chain = [];
  let cursor = found;
  while (!sameTile(cursor, start)) {
    chain.push(cursor);
    cursor = cameFrom.get(tileKey(cursor));
    if (!cursor) return [];
  }
  chain.reverse();

  return extractCheckpoints(start, chain).slice(0, MAX_CHECKPOINTS);
}

function extractCheckpoints(start, chain) {
  if (chain.length === 0) return [];
  const checkpoints = [];
  let prev = start;
  let prevDx = 0;
  let prevDy = 0;

  for (let i = 0; i < chain.length; i += 1) {
    const next = chain[i];
    const dx = Math.sign(next.x - prev.x);
    const dy = Math.sign(next.y - prev.y);
    if (i > 0 && (dx !== prevDx || dy !== prevDy)) {
      checkpoints.push(chain[i - 1]);
    }
    prevDx = dx;
    prevDy = dy;
    prev = next;
  }

  const last = chain[chain.length - 1];
  if (checkpoints.length === 0 || !sameTile(checkpoints[checkpoints.length - 1], last)) {
    checkpoints.push(last);
  }
  return checkpoints;
}

function expandCheckpoints(start, checkpoints) {
  const path = [];
  let cursor = start;
  for (const checkpoint of checkpoints) {
    while (!sameTile(cursor, checkpoint)) {
      const dx = Math.sign(checkpoint.x - cursor.x);
      const dy = Math.sign(checkpoint.y - cursor.y);
      cursor = { x: cursor.x + dx, y: cursor.y + dy };
      path.push(cursor);
    }
  }
  return path;
}

function canStep(from, to, arena, extraBlocked) {
  if (!isWalkable(to, arena, extraBlocked)) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const diagonal = Math.abs(dx) === 1 && Math.abs(dy) === 1;
  if (!diagonal) return true;
  const horizontal = { x: from.x + dx, y: from.y };
  const vertical = { x: from.x, y: from.y + dy };
  return isWalkable(horizontal, arena, extraBlocked) && isWalkable(vertical, arena, extraBlocked);
}
