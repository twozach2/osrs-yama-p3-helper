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

export function findPath(start, goal, arena, extraBlocked = []) {
  if (sameTile(start, goal)) {
    return [];
  }

  if (!isWalkable(goal, arena, extraBlocked)) {
    return [];
  }

  const queue = [start];
  const visited = new Set([tileKey(start)]);
  const cameFrom = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = sortedNeighbors(current, goal);

    for (const next of neighbors) {
      const key = tileKey(next);
      if (visited.has(key) || !canStep(current, next, arena, extraBlocked)) {
        continue;
      }

      visited.add(key);
      cameFrom.set(key, current);

      if (sameTile(next, goal)) {
        return reconstructPath(start, next, cameFrom);
      }

      queue.push(next);
    }
  }

  return [];
}

function sortedNeighbors(tile, goal) {
  const directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 }
  ];

  return directions
    .map((direction) => ({ x: tile.x + direction.x, y: tile.y + direction.y }))
    .sort((a, b) => distance(a, goal) - distance(b, goal));
}

function canStep(from, to, arena, extraBlocked) {
  if (!isWalkable(to, arena, extraBlocked)) {
    return false;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const diagonal = Math.abs(dx) === 1 && Math.abs(dy) === 1;

  if (!diagonal) {
    return true;
  }

  const horizontal = { x: from.x + dx, y: from.y };
  const vertical = { x: from.x, y: from.y + dy };
  return isWalkable(horizontal, arena, extraBlocked) && isWalkable(vertical, arena, extraBlocked);
}

function reconstructPath(start, end, cameFrom) {
  const path = [end];
  let cursor = end;

  while (!sameTile(cursor, start)) {
    cursor = cameFrom.get(tileKey(cursor));
    if (!cursor) {
      return [];
    }
    path.push(cursor);
  }

  path.reverse();
  path.shift();
  return path;
}

function distance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
