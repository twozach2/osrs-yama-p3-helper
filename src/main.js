import { SimulatorEngine } from "./engine.js";
import { isWalkable } from "./pathfinding.js";
import {
  colorFromTileMarker,
  coordToTile,
  ROBOFLY_MARKER_PRESETS,
  tileToCoord
} from "./roboflyData.js";
import { TICK_MS, YAMA_P3_SCENARIO } from "./yamaP3Scenario.js";

const canvas = document.querySelector("#world");
const ctx = canvas.getContext("2d");
const engine = new SimulatorEngine(YAMA_P3_SCENARIO);

const ui = {
  tick: document.querySelector("#tick"),
  time: document.querySelector("#time"),
  position: document.querySelector("#position"),
  mistakes: document.querySelector("#mistakes"),
  method: document.querySelector("#method"),
  markers: document.querySelector("#markers"),
  startPause: document.querySelector("#startPause"),
  step: document.querySelector("#step"),
  reset: document.querySelector("#reset"),
  speed: document.querySelector("#speed"),
  speedLabel: document.querySelector("#speedLabel"),
  runToggle: document.querySelector("#runToggle"),
  showGrid: document.querySelector("#showGrid"),
  showMethod: document.querySelector("#showMethod"),
  showMarkers: document.querySelector("#showMarkers"),
  strictWaypoints: document.querySelector("#strictWaypoints"),
  status: document.querySelector("#status"),
  eventLog: document.querySelector("#eventLog"),
  prayerButtons: [...document.querySelectorAll("[data-prayer]")]
};

let dimensions = null;
let lastFrame = performance.now();
let accumulator = 0;

init();
requestAnimationFrame(loop);

function init() {
  for (const [id, method] of Object.entries(YAMA_P3_SCENARIO.methods)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = method.name;
    ui.method.append(option);
  }

  ui.method.value = engine.state.methodId;

  for (const [id, preset] of Object.entries(ROBOFLY_MARKER_PRESETS)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = preset.name;
    ui.markers.append(option);
  }

  ui.startPause.addEventListener("click", () => {
    engine.toggleRunning();
    updateHud();
  });

  ui.step.addEventListener("click", () => {
    engine.advanceTick();
    updateHud();
  });

  ui.reset.addEventListener("click", () => {
    engine.reset(ui.method.value);
    accumulator = 0;
    updateHud();
  });

  ui.method.addEventListener("change", () => {
    engine.reset(ui.method.value);
    accumulator = 0;
    updateHud();
  });

  ui.speed.addEventListener("input", updateHud);
  ui.runToggle.addEventListener("change", () => engine.setRunEnabled(ui.runToggle.checked));
  ui.strictWaypoints.addEventListener("change", () => engine.setStrictWaypoints(ui.strictWaypoints.checked));
  ui.markers.addEventListener("change", updateHud);

  for (const button of ui.prayerButtons) {
    button.addEventListener("click", () => {
      engine.setPrayer(button.dataset.prayer);
      updateHud();
    });
  }

  canvas.addEventListener("pointerdown", (event) => {
    const tile = pointToTile(event.clientX, event.clientY);
    if (!tile || !isWalkable(tile, YAMA_P3_SCENARIO.arena)) {
      return;
    }

    engine.queueMove(tile);
    updateHud();
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", handleKeydown);

  resizeCanvas();
  updateHud();
}

function loop(now) {
  const elapsed = now - lastFrame;
  lastFrame = now;

  if (engine.state.running) {
    accumulator += elapsed * Number(ui.speed.value);

    while (accumulator >= TICK_MS) {
      engine.advanceTick();
      accumulator -= TICK_MS;
      updateHud();
    }
  }

  render(accumulator / TICK_MS);
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerWidth <= 820 ? Math.floor(window.innerHeight * 0.62) : window.innerHeight;

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const panelWidth = window.innerWidth <= 820 ? 0 : 292;
  const margin = 18;
  const arena = YAMA_P3_SCENARIO.arena;
  const availableWidth = cssWidth - panelWidth - margin * 2;
  const availableHeight = cssHeight - margin * 2;
  const tileSize = Math.max(12, Math.floor(Math.min(availableWidth / arena.width, availableHeight / arena.height)));
  const boardWidth = arena.width * tileSize;
  const boardHeight = arena.height * tileSize;

  dimensions = {
    tileSize,
    originX: Math.floor((availableWidth - boardWidth) / 2) + margin,
    originY: Math.floor((availableHeight - boardHeight) / 2) + margin,
    boardWidth,
    boardHeight,
    cssWidth,
    cssHeight
  };
}

function render(partialTick) {
  if (!dimensions) {
    return;
  }

  const snapshot = engine.getSnapshot();
  ctx.clearRect(0, 0, dimensions.cssWidth, dimensions.cssHeight);
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, dimensions.cssWidth, dimensions.cssHeight);

  drawArena(snapshot);
  drawSourceMarkers();
  drawMethod(snapshot);
  drawHazards(snapshot, partialTick);
  drawProjectiles(snapshot, partialTick);
  drawPath(snapshot);
  drawYama(snapshot);
  drawPlayer(snapshot, partialTick);
  drawLabels(snapshot);
}

function drawArena(snapshot) {
  const { arena } = snapshot.scenario;

  for (let y = 0; y < arena.height; y += 1) {
    for (let x = 0; x < arena.width; x += 1) {
      const blocked = arena.blockedSet.has(`${x},${y}`);
      ctx.fillStyle = blocked ? "#050505" : (x + y) % 2 === 0 ? "#282418" : "#302a1c";
      fillTile({ x, y });

      if (!blocked && ui.showGrid.checked) {
        ctx.strokeStyle = "rgba(232, 216, 106, 0.14)";
        ctx.lineWidth = 1;
        strokeTile({ x, y });
      }
    }
  }

  ctx.strokeStyle = "rgba(232, 216, 106, 0.72)";
  ctx.lineWidth = 2;
  ctx.strokeRect(dimensions.originX, dimensions.originY, dimensions.boardWidth, dimensions.boardHeight);
}

function drawMethod(snapshot) {
  if (!ui.showMethod.checked) {
    return;
  }

  for (const waypoint of snapshot.method.waypoints) {
    const past = waypoint.tick < snapshot.tick;
    const active = snapshot.nextWaypoint && waypoint.tick === snapshot.nextWaypoint.tick;
    ctx.fillStyle = active ? "rgba(163, 230, 53, 0.42)" : past ? "rgba(232, 216, 106, 0.12)" : "rgba(103, 232, 249, 0.22)";
    fillTile(waypoint.tile, 0.18);
    ctx.strokeStyle = active ? "#a3e635" : "#67e8f9";
    ctx.lineWidth = active ? 3 : 1;
    strokeTile(waypoint.tile, 0.18);

    if (active || waypoint.tick === 0 || waypoint.tick % 5 === 0) {
      drawTileText(waypoint.tile, active ? `${waypoint.tick}` : waypoint.coord, "#ffffff");
    }
  }
}

function drawSourceMarkers() {
  if (!ui.showMarkers.checked) {
    return;
  }

  const preset = ROBOFLY_MARKER_PRESETS[ui.markers.value];
  if (!preset) {
    return;
  }

  for (const [coord, label, argb] of preset.markers) {
    const tile = coordToTile(coord);
    ctx.save();
    ctx.globalAlpha = 0.64;
    ctx.fillStyle = colorFromTileMarker(argb);
    fillTile(tile, 0.08);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colorFromTileMarker(argb);
    ctx.lineWidth = 2;
    strokeTile(tile, 0.08);
    ctx.restore();
    drawTileText(tile, label, "#ffffff", 11);
  }
}

function drawHazards(snapshot, partialTick) {
  for (const hazard of snapshot.hazards) {
    const fade = Math.max(0.22, 1 - (snapshot.tick + partialTick - hazard.startTick) / Math.max(1, hazard.endTick - hazard.startTick));
    ctx.fillStyle = `rgba(216, 61, 61, ${0.22 + fade * 0.2})`;
    ctx.strokeStyle = `rgba(255, 178, 178, ${0.35 + fade * 0.35})`;
    ctx.lineWidth = 1;

    for (const tile of hazard.tiles) {
      fillTile(tile, 0.08);
      strokeTile(tile, 0.08);
    }
  }
}

function drawProjectiles(snapshot, partialTick) {
  for (const projectile of snapshot.projectiles) {
    const ticksToImpact = projectile.impactTick - snapshot.tick - partialTick;
    const intensity = Math.max(0.25, 1 - ticksToImpact / Math.max(1, projectile.impactTick - projectile.startTick));

    ctx.fillStyle = `rgba(255, 225, 89, ${0.12 + intensity * 0.28})`;
    ctx.strokeStyle = `rgba(255, 245, 190, ${0.4 + intensity * 0.45})`;
    ctx.lineWidth = 2;

    for (const tile of projectile.tiles) {
      fillTile(tile, 0.14);
      strokeTile(tile, 0.14);
    }

    const labelTile = projectile.tiles[Math.floor(projectile.tiles.length / 2)];
    drawTileText(labelTile, String(projectile.impactTick), "#fff6a6");
  }
}

function drawPath(snapshot) {
  if (snapshot.queuedPath.length === 0) {
    return;
  }

  ctx.strokeStyle = "#67e8f9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const start = tileCenter(snapshot.player);
  ctx.moveTo(start.x, start.y);

  for (const tile of snapshot.queuedPath) {
    const center = tileCenter(tile);
    ctx.lineTo(center.x, center.y);
  }

  ctx.stroke();

  if (snapshot.target) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    strokeTile(snapshot.target, 0.2);
  }
}

function drawYama(snapshot) {
  const { origin, size } = snapshot.yama;
  const x = dimensions.originX + origin.x * dimensions.tileSize;
  const y = dimensions.originY + origin.y * dimensions.tileSize;
  const width = size.width * dimensions.tileSize;
  const height = size.height * dimensions.tileSize;

  ctx.fillStyle = "#5f1919";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#f87171";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#ffd7d7";
  ctx.font = "700 14px Trebuchet MS, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("UNSAFE", x + width / 2, y + height / 2);
}

function drawPlayer(snapshot, partialTick) {
  const center = tileCenter(snapshot.player);
  const pulse = 1 + Math.sin((snapshot.tick + partialTick) * Math.PI) * 0.06;
  const radius = (dimensions.tileSize * 0.34) * pulse;

  ctx.fillStyle = snapshot.prayer === "none" ? "#67e8f9" : "#a3e635";
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (snapshot.tick < snapshot.scenario.firstActionTick) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = "700 12px Trebuchet MS, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DROP", center.x, center.y - dimensions.tileSize * 0.55);
  }
}

function drawLabels(snapshot) {
  const next = snapshot.nextWaypoint;
  const lines = [
    `Tick ${snapshot.tick}`,
    next ? `Next ${next.label} @ ${next.tick}` : "No next waypoint",
    snapshot.scenario.calibrationStatus === "draft-data" ? "Draft timing data" : "Calibrated"
  ];

  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillRect(16, 16, 250, 76);
  ctx.fillStyle = "#fff6a6";
  ctx.font = "14px Trebuchet MS, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  lines.forEach((line, index) => {
    ctx.fillText(line, 28, 26 + index * 20);
  });
}

function fillTile(tile, inset = 0) {
  const size = dimensions.tileSize;
  ctx.fillRect(
    dimensions.originX + tile.x * size + size * inset,
    dimensions.originY + tile.y * size + size * inset,
    size * (1 - inset * 2),
    size * (1 - inset * 2)
  );
}

function strokeTile(tile, inset = 0) {
  const size = dimensions.tileSize;
  ctx.strokeRect(
    dimensions.originX + tile.x * size + size * inset,
    dimensions.originY + tile.y * size + size * inset,
    size * (1 - inset * 2),
    size * (1 - inset * 2)
  );
}

function drawTileText(tile, text, color, size = 12) {
  const center = tileCenter(tile);
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Trebuchet MS, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, center.x, center.y);
}

function tileCenter(tile) {
  return {
    x: dimensions.originX + tile.x * dimensions.tileSize + dimensions.tileSize / 2,
    y: dimensions.originY + tile.y * dimensions.tileSize + dimensions.tileSize / 2
  };
}

function pointToTile(clientX, clientY) {
  const x = Math.floor((clientX - dimensions.originX) / dimensions.tileSize);
  const y = Math.floor((clientY - dimensions.originY) / dimensions.tileSize);
  const tile = { x, y };

  if (x < 0 || y < 0 || x >= YAMA_P3_SCENARIO.arena.width || y >= YAMA_P3_SCENARIO.arena.height) {
    return null;
  }

  return tile;
}

function updateHud() {
  const snapshot = engine.getSnapshot();
  const latest = snapshot.eventLog[0];

  ui.tick.textContent = String(snapshot.tick);
  ui.time.textContent = `${(snapshot.tick * TICK_MS / 1000).toFixed(1)}s`;
  ui.position.textContent = tileToCoord(snapshot.player);
  ui.mistakes.textContent = String(snapshot.mistakes.length);
  ui.startPause.textContent = snapshot.running ? "Pause" : "Start";
  ui.speedLabel.textContent = `${Number(ui.speed.value).toFixed(2)}x`;
  ui.status.textContent = statusText(snapshot, latest);

  for (const button of ui.prayerButtons) {
    button.classList.toggle("active", button.dataset.prayer === snapshot.prayer);
  }

  ui.eventLog.replaceChildren(
    ...snapshot.eventLog.slice(0, 16).map((item) => {
      const li = document.createElement("li");
      li.textContent = `t${item.tick}: ${item.text}`;
      return li;
    })
  );
}

function statusText(snapshot, latest) {
  if (snapshot.tick < snapshot.scenario.firstActionTick) {
    return `Dropping in. First action tick: ${snapshot.scenario.firstActionTick}.`;
  }

  if (snapshot.nextWaypoint) {
    const waypoint = snapshot.nextWaypoint;
    const distance = Math.max(Math.abs(snapshot.player.x - waypoint.tile.x), Math.abs(snapshot.player.y - waypoint.tile.y));
    return `${waypoint.coord} by tick ${waypoint.tick}; ${distance} tiles away. ${latest?.text ?? ""}`;
  }

  return latest?.text ?? "Ready.";
}

function handleKeydown(event) {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON") {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    engine.toggleRunning();
    updateHud();
  }

  if (event.key.toLowerCase() === "n") {
    engine.advanceTick();
    updateHud();
  }

  if (event.key.toLowerCase() === "r") {
    engine.reset(ui.method.value);
    accumulator = 0;
    updateHud();
  }

  const prayerByKey = {
    "1": "magic",
    "2": "range",
    "3": "melee",
    "4": "none"
  };

  if (prayerByKey[event.key]) {
    engine.setPrayer(prayerByKey[event.key]);
    updateHud();
  }
}
