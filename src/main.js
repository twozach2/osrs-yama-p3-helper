import * as THREE from "../node_modules/three/build/three.module.js";
import { GLTFLoader } from "../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "../node_modules/three/examples/jsm/utils/SkeletonUtils.js";
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
let engine = null;
let gameScene = null;

const ui = {
  tick: document.querySelector("#tick"),
  cooldown: document.querySelector("#cooldown"),
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
  prayerButtons: [...document.querySelectorAll("[data-prayer]")],
  spec: document.querySelector("#spec"),
  hudHp: document.querySelector("#hudHp"),
  hudPray: document.querySelector("#hudPray"),
  hudRun: document.querySelector("#hudRun"),
  hudYamaFill: document.querySelector("#hudYamaFill"),
  hudYamaText: document.querySelector("#hudYamaText")
};

let lastFrame = performance.now();
let accumulator = 0;

function bootstrap() {
  engine = new SimulatorEngine(YAMA_P3_SCENARIO);
  gameScene = new ThreeGameScene(canvas, YAMA_P3_SCENARIO);
  window.yamaPracticeDebug = {
    sceneKind: "threejs",
    getStats: () => gameScene.getStats()
  };
  init();
  requestAnimationFrame(loop);
}


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
    resetPractice();
  });

  ui.method.addEventListener("change", () => {
    resetPractice();
  });

  ui.speed.addEventListener("input", updateHud);
  ui.runToggle.addEventListener("change", () => engine.setRunEnabled(ui.runToggle.checked));
  ui.strictWaypoints.addEventListener("change", () => engine.setStrictWaypoints(ui.strictWaypoints.checked));
  ui.markers.addEventListener("change", () => gameScene.forceStaticRefresh());
  ui.showGrid.addEventListener("change", () => gameScene.forceStaticRefresh());
  ui.showMethod.addEventListener("change", () => gameScene.forceStaticRefresh());
  ui.showMarkers.addEventListener("change", () => gameScene.forceStaticRefresh());

  for (const button of ui.prayerButtons) {
    button.addEventListener("click", () => {
      engine.setPrayer(button.dataset.prayer);
      updateHud();
    });
  }

  if (ui.spec) {
    ui.spec.addEventListener("click", () => {
      engine.clickSpec();
      updateHud();
    });
  }

  canvas.addEventListener("pointerdown", (event) => {
    const tile = gameScene.pickTile(event.clientX, event.clientY);
    if (!tile || (!isWalkable(tile, YAMA_P3_SCENARIO.arena) && !engine.isYamaTile(tile))) {
      return;
    }

    engine.clickTile(tile);
    updateHud();
  });

  window.addEventListener("resize", () => gameScene.resize());
  window.addEventListener("keydown", handleKeydown);

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

  gameScene.render(engine.getSnapshot(), accumulator / TICK_MS, {
    markerPresetId: ui.markers.value,
    showGrid: ui.showGrid.checked,
    showMethod: ui.showMethod.checked,
    showMarkers: ui.showMarkers.checked
  });

  requestAnimationFrame(loop);
}

function resetPractice() {
  engine.reset(ui.method.value);
  accumulator = 0;
  gameScene.forceStaticRefresh();
  updateHud();
}

function updateHud() {
  const snapshot = engine.getSnapshot();
  const latest = snapshot.eventLog[0];

  ui.tick.textContent = String(snapshot.tick);
  ui.cooldown.textContent = String(snapshot.player.attackCooldown);
  ui.position.textContent = tileToCoord(snapshot.player);
  ui.mistakes.textContent = String(snapshot.mistakes.length);
  ui.startPause.textContent = snapshot.running ? "Pause" : "Start";
  ui.speedLabel.textContent = `${Number(ui.speed.value).toFixed(2)}x`;
  ui.status.textContent = statusText(snapshot, latest);

  for (const button of ui.prayerButtons) {
    button.classList.toggle("active", button.dataset.prayer === snapshot.player.protect);
  }

  if (ui.hudHp) ui.hudHp.textContent = String(Math.max(0, Math.round(snapshot.player.hp)));
  if (ui.hudPray) ui.hudPray.textContent = String(Math.max(0, Math.round(snapshot.player.prayerPoints)));
  if (ui.hudRun) ui.hudRun.textContent = String(Math.max(0, Math.round(snapshot.player.runEnergy)));
  if (ui.hudYamaFill) {
    const ratio = Math.max(0, snapshot.yama.hp / snapshot.yama.maxHp);
    ui.hudYamaFill.style.width = `${ratio * 100}%`;
  }
  if (ui.hudYamaText) ui.hudYamaText.textContent = `${Math.max(0, Math.round(snapshot.yama.hp))}/${snapshot.yama.maxHp}`;

  ui.eventLog.replaceChildren(
    ...snapshot.eventLog.slice(0, 16).map((item) => {
      const li = document.createElement("li");
      li.textContent = `t${item.tick}: ${item.text}`;
      return li;
    })
  );
}

function statusText(snapshot, latest) {
  const next = snapshot.nextWaypoint;
  if (next) {
    const distance = Math.max(Math.abs(snapshot.player.x - next.tile.x), Math.abs(snapshot.player.y - next.tile.y));
    return `${next.coord} on tick ${next.absoluteTick}; ${distance} tiles away. ${latest?.text ?? ""}`;
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
    resetPractice();
  }

  const prayerByKey = {
    "1": "magic",
    "2": "ranged",
    "3": "melee",
    "4": "none"
  };

  if (prayerByKey[event.key]) {
    engine.setPrayer(prayerByKey[event.key]);
    updateHud();
  }

  if (event.key.toLowerCase() === "s") {
    engine.clickSpec();
    updateHud();
  }
}

class ThreeGameScene {
  constructor(canvas, scenario) {
    this.canvas = canvas;
    this.scenario = scenario;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.Fog(0x050505, 15, 36);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    this.camera.position.set(11, 13, 14);
    this.camera.lookAt(0, 0, 0);

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.gltfLoader = new GLTFLoader();
    this.assetModels = new Map();
    this.assetManifest = null;

    this.staticGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.methodGroup = new THREE.Group();
    this.dynamicGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();

    this.scene.add(this.staticGroup, this.markerGroup, this.methodGroup, this.dynamicGroup, this.effectGroup);

    this.materials = createMaterials();
    this.lastStaticKey = "";

    this.addLights();
    this.buildStaticWorld(true);
    this.buildYama();
    this.buildPlayer();
    this.loadOptionalAssets();
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerWidth <= 820 ? Math.floor(window.innerHeight * 0.62) : window.innerHeight;
    const panelWidth = window.innerWidth <= 820 ? 0 : 292;
    const visibleWidth = Math.max(320, width - panelWidth);
    const aspect = visibleWidth / Math.max(1, height);
    const frustum = aspect > 1 ? 18 : 22;

    this.renderer.setSize(width, height, false);
    this.camera.left = (-frustum * aspect) / 2;
    this.camera.right = (frustum * aspect) / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.camera.updateProjectionMatrix();
  }

  forceStaticRefresh() {
    this.lastStaticKey = "";
  }

  pickTile(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera({ x, y }, this.camera);

    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) {
      return null;
    }

    return this.worldToTile(hit);
  }

  render(snapshot, partialTick, options) {
    this.refreshStaticOverlays(snapshot, options);
    clearGroup(this.dynamicGroup);
    clearGroup(this.effectGroup);

    this.updatePlayer(snapshot, partialTick);
    this.updateCameraTarget(snapshot, partialTick);
    this.drawUnsafeZone(snapshot);
    this.drawShadowWaves(snapshot, partialTick);
    this.drawActiveHazards(snapshot, partialTick);
    this.drawProjectiles(snapshot, partialTick);
    this.drawFireballLine(snapshot, partialTick);
    this.drawVoidFlares(snapshot, partialTick);
    this.drawQueuedPath(snapshot);
    this.drawTrueTile(snapshot);
    this.drawClickMarkers(snapshot, partialTick);
    this.drawAttackSwings(snapshot, partialTick);
    this.drawHitSplats(snapshot, partialTick);
    this.drawYamaHpBar(snapshot);

    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.sceneKind = "threejs";
    this.canvas.dataset.renderer = "webgl";
    this.canvas.dataset.dynamicObjects = String(this.dynamicGroup.children.length);
    try {
      this.lastPixelSample = this.sampleCenterPixels();
      this.canvas.dataset.pixelNonBlack = String(this.lastPixelSample.nonBlack);
    } catch (error) {
      this.canvas.dataset.pixelSampleError = error.message;
    }
    if (location.search.includes("capture=1") && !this.canvas.dataset.framePng) {
      try {
        this.canvas.dataset.framePng = this.canvas.toDataURL("image/png");
      } catch (error) {
        this.canvas.dataset.frameError = error.message;
      }
    }
  }

  addLights() {
    const ambient = new THREE.HemisphereLight(0xf8e7bd, 0x17120a, 1.6);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff0c4, 2.1);
    key.position.set(-6, 12, 8);
    key.castShadow = true;
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    this.scene.add(key);

    const red = new THREE.PointLight(0xff3434, 2.2, 14);
    red.position.set(0, 4, -1.5);
    this.scene.add(red);
  }

  buildStaticWorld(showGrid) {
    clearGroup(this.staticGroup);

    const floorGeometry = new THREE.BoxGeometry(0.98, 0.08, 0.98);
    const edgeGeometry = new THREE.EdgesGeometry(floorGeometry);

    for (let y = 0; y < this.scenario.arena.height; y += 1) {
      for (let x = 0; x < this.scenario.arena.width; x += 1) {
        const tile = { x, y };
        const position = this.tileToWorld(tile, 0);
        const material = (x + y) % 2 === 0 ? this.materials.floorA : this.materials.floorB;
        const mesh = new THREE.Mesh(floorGeometry, material);
        mesh.position.set(position.x, -0.04, position.z);
        mesh.receiveShadow = true;
        this.staticGroup.add(mesh);

        if (showGrid) {
          const edge = new THREE.LineSegments(edgeGeometry, this.materials.gridLine);
          edge.position.copy(mesh.position);
          this.staticGroup.add(edge);
        }
      }
    }

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(this.scenario.arena.width + 0.8, 0.55, this.scenario.arena.height + 0.8),
      this.materials.rim
    );
    rim.position.y = -0.36;
    rim.receiveShadow = true;
    this.staticGroup.add(rim);

    this.addCoordinateLabels();
  }

  buildYama() {
    this.yamaGroup = new THREE.Group();
    const center = rectCenter(this.scenario.yama);
    const position = this.tileToWorld(center, 0);
    this.yamaGroup.position.set(position.x, 0, position.z);

    const footprint = new THREE.Mesh(
      new THREE.BoxGeometry(this.scenario.yama.size.width, 0.12, this.scenario.yama.size.height),
      this.materials.yamaFootprint
    );
    footprint.position.y = 0.02;
    footprint.receiveShadow = true;
    this.yamaGroup.add(footprint);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 2.2, 8), this.materials.yamaBody);
    body.position.y = 1.18;
    body.castShadow = true;
    this.yamaGroup.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), this.materials.yamaHead);
    head.position.y = 2.55;
    head.castShadow = true;
    this.yamaGroup.add(head);

    const hornGeometry = new THREE.ConeGeometry(0.16, 0.7, 6);
    for (const offset of [-0.36, 0.36]) {
      const horn = new THREE.Mesh(hornGeometry, this.materials.bone);
      horn.position.set(offset, 3.05, -0.18);
      horn.rotation.x = -0.45;
      horn.castShadow = true;
      this.yamaGroup.add(horn);
    }

    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 2.6), this.materials.bone);
    weapon.position.set(0.95, 1.55, 0);
    weapon.rotation.z = 0.5;
    weapon.castShadow = true;
    this.yamaGroup.add(weapon);

    this.scene.add(this.yamaGroup);
  }

  buildPlayer() {
    this.playerGroup = new THREE.Group();
    this.playerGroup.add(makeShadowBlob(0.74, this.materials.shadow));

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.28), this.materials.playerLegs);
    legs.position.y = 0.32;
    legs.castShadow = true;
    this.playerGroup.add(legs);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.72, 8), this.materials.playerBody);
    body.position.y = 0.86;
    body.castShadow = true;
    this.playerGroup.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.materials.playerHead);
    head.position.y = 1.34;
    head.castShadow = true;
    this.playerGroup.add(head);

    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.08), this.materials.weapon);
    weapon.position.set(0.38, 0.86, -0.18);
    weapon.rotation.set(0.45, 0.15, -0.6);
    weapon.castShadow = true;
    this.playerWeapon = weapon;
    this.playerGroup.add(weapon);

    this.scene.add(this.playerGroup);
  }

  async loadOptionalAssets() {
    try {
      const response = await fetch("/assets/osrs/manifest.json", { cache: "no-store" });
      if (!response.ok) {
        this.canvas.dataset.assetMode = "fallback";
        return;
      }

      this.assetManifest = await response.json();
      const entries = Object.entries(this.assetManifest.models ?? {});
      await Promise.all(
        entries.map(async ([id, config]) => {
          if (!config.path) {
            return;
          }
          const gltf = await this.gltfLoader.loadAsync(config.path);
          this.assetModels.set(id, { scene: gltf.scene, config });
        })
      );

      this.applyAssetModel("yama", this.yamaGroup);
      this.applyAssetModel("player", this.playerGroup);
      this.canvas.dataset.assetMode = "local-osrs";
    } catch (error) {
      this.canvas.dataset.assetMode = "fallback";
      this.canvas.dataset.assetError = error.message;
      console.warn("OSRS asset manifest could not be loaded; using fallback models.", error);
    }
  }

  applyAssetModel(id, targetGroup) {
    const asset = this.assetModels.get(id);
    if (!asset || !targetGroup) {
      return;
    }

    for (const child of [...targetGroup.children]) {
      if (child.userData.keepOnAssetSwap) {
        continue;
      }
      targetGroup.remove(child);
      disposeObject(child);
    }

    const model = SkeletonUtils.clone(asset.scene);
    const scale = asset.config.scale ?? this.assetManifest?.scale ?? 1;
    model.scale.setScalar(scale);
    model.position.y = asset.config.yOffset ?? 0;
    model.rotation.y = asset.config.rotationY ?? 0;
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
      }
    });
    targetGroup.add(model);
  }

  refreshStaticOverlays(snapshot, options) {
    const key = JSON.stringify({
      methodId: snapshot.methodId,
      markerPresetId: options.markerPresetId,
      showGrid: options.showGrid,
      showMethod: options.showMethod,
      showMarkers: options.showMarkers
    });

    if (key === this.lastStaticKey) {
      return;
    }

    this.lastStaticKey = key;
    this.buildStaticWorld(options.showGrid);
    this.buildMarkers(options.markerPresetId, options.showMarkers);
    this.buildMethodGhost(snapshot.method, options.showMethod);
  }

  buildMarkers(markerPresetId, showMarkers) {
    clearGroup(this.markerGroup);
    if (!showMarkers) {
      return;
    }

    const preset = ROBOFLY_MARKER_PRESETS[markerPresetId];
    if (!preset) {
      return;
    }

    for (const [coord, label, argb] of preset.markers) {
      const tile = coordToTile(coord);
      const color = new THREE.Color(colorFromTileMarker(argb));
      const position = this.tileToWorld(tile, 0.065);
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.04, 0.66),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58 })
      );
      pad.position.set(position.x, position.y, position.z);
      this.markerGroup.add(pad);

      const sprite = makeTextSprite(label, {
        fill: "#ffffff",
        stroke: "#111111",
        fontSize: 28,
        scale: 0.58
      });
      sprite.position.set(position.x, 0.45, position.z);
      this.markerGroup.add(sprite);
    }
  }

  buildMethodGhost(method, showMethod) {
    clearGroup(this.methodGroup);
    if (!showMethod || !method) {
      return;
    }

    const points = method.waypoints.map((waypoint) => this.tileToWorld(waypoint.tile, 0.18));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, this.materials.routeLine);
    this.methodGroup.add(line);

    for (const waypoint of method.waypoints) {
      if (waypoint.tick !== 0 && waypoint.tick % 5 !== 0) {
        continue;
      }

      const position = this.tileToWorld(waypoint.tile, 0.2);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), this.materials.routeMarker);
      marker.position.set(position.x, position.y, position.z);
      this.methodGroup.add(marker);
    }
  }

  updatePlayer(snapshot, partialTick) {
    const position = this.playerVisualPosition(snapshot, partialTick);
    this.playerGroup.position.set(position.x, 0.04 + Math.sin((snapshot.tick + partialTick) * Math.PI * 2) * 0.03, position.z);

    const next = snapshot.queuedPath[0] ?? snapshot.target ?? snapshot.player;
    const from = this.tileToWorld(snapshot.player, 0);
    const to = this.tileToWorld(next, 0);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) {
      this.playerGroup.rotation.y = Math.atan2(dx, dz);
    }

    if (this.playerWeapon) {
      const swing = snapshot.attackSwings[0];
      this.playerWeapon.rotation.z = swing ? -1.05 + Math.sin(partialTick * Math.PI) * 0.7 : -0.6;
    }
  }

  updateCameraTarget(snapshot, partialTick) {
    const player = this.playerVisualPosition(snapshot, partialTick);
    const yama = this.tileToWorld(rectCenter(this.scenario.yama), 0);
    const center = new THREE.Vector3(
      player.x * 0.45 + yama.x * 0.55,
      0,
      player.z * 0.45 + yama.z * 0.55
    );
    this.camera.lookAt(center);
  }

  drawUnsafeZone(snapshot) {
    const zone = this.scenario.unsafeZone;
    const active = snapshot.hazards.some((hazard) => hazard.label.startsWith("Yama melee"));
    const center = this.tileToWorld(rectCenter(zone), 0.1);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(zone.size.width, 0.06, zone.size.height),
      active ? this.materials.dangerActive : this.materials.dangerIdle
    );
    mesh.position.set(center.x, center.y, center.z);
    this.dynamicGroup.add(mesh);
  }

  drawActiveHazards(snapshot, partialTick) {
    for (const hazard of snapshot.hazards) {
      if (hazard.type === "shadowWaves") continue;
      const progress = (snapshot.tick + partialTick - hazard.startTick) / Math.max(1, hazard.endTick - hazard.startTick);
      const opacity = Math.max(0.18, 0.5 - progress * 0.2);
      const material = new THREE.MeshBasicMaterial({
        color: 0xff3333,
        transparent: true,
        opacity,
        depthWrite: false
      });

      for (const tile of hazard.tiles) {
        const position = this.tileToWorld(tile, 0.15);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.92), material);
        mesh.position.set(position.x, position.y, position.z);
        this.dynamicGroup.add(mesh);
      }
    }
  }

  drawProjectiles(snapshot, partialTick) {
    for (const projectile of snapshot.projectiles) {
      if (projectile.type !== "meteor") continue;
      const total = Math.max(1, projectile.impactTick - projectile.startTick);
      const progress = THREE.MathUtils.clamp((snapshot.tick + partialTick - projectile.startTick) / total, 0, 1);

      for (const tile of projectile.tiles) {
        const floor = this.tileToWorld(tile, 0.17);
        const telegraph = new THREE.Mesh(
          new THREE.CylinderGeometry(0.43, 0.43, 0.04, 20),
          this.materials.meteorTelegraph
        );
        telegraph.position.set(floor.x, floor.y, floor.z);
        this.dynamicGroup.add(telegraph);

        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), this.materials.meteor);
        orb.position.set(floor.x, 3.6 - progress * 3.2, floor.z);
        orb.castShadow = true;
        this.dynamicGroup.add(orb);
      }
    }
  }

  drawQueuedPath(snapshot) {
    if (snapshot.queuedPath.length === 0) {
      return;
    }

    const points = [this.tileToWorld(snapshot.player, 0.28), ...snapshot.queuedPath.map((tile) => this.tileToWorld(tile, 0.28))];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, this.materials.pathLine);
    this.dynamicGroup.add(line);

    for (const tile of snapshot.queuedPath.slice(0, 4)) {
      const position = this.tileToWorld(tile, 0.19);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), this.materials.pathDot);
      marker.position.set(position.x, position.y, position.z);
      this.dynamicGroup.add(marker);
    }
  }

  drawTrueTile(snapshot) {
    const position = this.tileToWorld(snapshot.player, 0.24);
    const geometry = squareLineGeometry(0.96);
    const line = new THREE.LineLoop(geometry, this.materials.trueTile);
    line.position.set(position.x, position.y, position.z);
    this.dynamicGroup.add(line);

    const expected = snapshot.expectedWaypoint;
    if (expected) {
      const ghost = this.tileToWorld(expected.tile, 0.22);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.72), this.materials.expectedTile);
      marker.position.set(ghost.x, ghost.y, ghost.z);
      this.dynamicGroup.add(marker);
    }
  }

  drawClickMarkers(snapshot, partialTick) {
    for (const marker of snapshot.clickMarkers) {
      const age = snapshot.tick + partialTick - marker.tick;
      const scale = 0.32 + age * 0.16;
      const position = this.tileToWorld(marker.tile, 0.3);
      const material = marker.kind === "attack" ? this.materials.attackClick : this.materials.moveClick;
      const ring = new THREE.LineLoop(squareLineGeometry(scale), material);
      ring.position.set(position.x, position.y, position.z);
      this.effectGroup.add(ring);
    }
  }

  drawAttackSwings(snapshot, partialTick) {
    for (const swing of snapshot.attackSwings) {
      const age = snapshot.tick + partialTick - swing.tick;
      const alpha = Math.max(0, 1 - age / 3);
      const from = this.tileToWorld(swing.from, 1.15);
      const to = this.tileToWorld(swing.to, 1.8);
      const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: alpha
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), material);
      this.effectGroup.add(line);
    }
  }

  drawHitSplats(snapshot, partialTick) {
    for (const hit of snapshot.hitSplats) {
      const age = snapshot.tick + partialTick - hit.tick;
      const alpha = Math.max(0, 1 - age / 5);
      const baseHeight = hit.target === "player" ? 1.6 : 3.2;
      const position = this.tileToWorld(hit.tile, baseHeight + age * 0.08);
      const style = splatStyle(hit);
      const sprite = makeTextSprite(String(hit.amount), {
        fill: style.fill,
        stroke: style.stroke,
        background: style.background,
        fontSize: 34,
        scale: 0.72,
        opacity: alpha
      });
      sprite.position.copy(position);
      this.effectGroup.add(sprite);
    }
  }

  drawYamaHpBar(snapshot) {
    if (snapshot.yama.phaseComplete) return;
    const center = rectCenter(this.scenario.yama);
    const base = this.tileToWorld(center, 4);
    const width = 2.6;
    const ratio = Math.max(0, snapshot.yama.hp / snapshot.yama.maxHp);

    const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.22), this.materials.hpBarBg);
    bg.position.set(base.x, base.y, base.z);
    bg.lookAt(this.camera.position);
    this.effectGroup.add(bg);

    if (ratio > 0) {
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(width * ratio, 0.18), this.materials.hpBarFill);
      fill.position.set(base.x - (width * (1 - ratio)) / 2, base.y + 0.01, base.z);
      fill.lookAt(this.camera.position);
      this.effectGroup.add(fill);
    }
  }

  drawVoidFlares(snapshot, partialTick) {
    for (const flare of snapshot.yama.flares ?? []) {
      const position = this.tileToWorld(flare.tile, 0.9);
      const ratio = Math.min(1, flare.charge / Math.max(1, flare.maxCharge));
      const colour = new THREE.Color().lerpColors(
        new THREE.Color(0xa3e635),
        new THREE.Color(0xff3333),
        ratio
      );
      const material = new THREE.MeshStandardMaterial({
        color: colour,
        emissive: colour,
        emissiveIntensity: 0.6,
        roughness: 0.4
      });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), material);
      orb.position.set(position.x, position.y, position.z);
      this.effectGroup.add(orb);

      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.8 * ratio, 0.08), this.materials.flareCharge);
      bar.position.set(position.x, position.y + 0.6, position.z);
      bar.lookAt(this.camera.position);
      this.effectGroup.add(bar);
    }
  }

  drawShadowWaves(snapshot, partialTick) {
    for (const hazard of snapshot.hazards) {
      if (hazard.type !== "shadowWaves") continue;
      for (const tile of hazard.tiles) {
        const position = this.tileToWorld(tile, 0.16);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.92), this.materials.shadowTelegraph);
        mesh.position.set(position.x, position.y, position.z);
        this.dynamicGroup.add(mesh);
      }
    }
  }

  drawFireballLine(snapshot, partialTick) {
    for (const projectile of snapshot.projectiles) {
      if (projectile.type !== "fireballLine") continue;
      for (const tile of projectile.tiles) {
        const position = this.tileToWorld(tile, 0.18);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), this.materials.fireLine);
        mesh.position.set(position.x, position.y, position.z);
        this.dynamicGroup.add(mesh);
      }
    }
  }

  addCoordinateLabels() {
    for (let x = 0; x < this.scenario.arena.width; x += 1) {
      const coord = String.fromCharCode(65 + x);
      const position = this.tileToWorld({ x, y: this.scenario.arena.height - 1 }, 0.18);
      const sprite = makeTextSprite(coord, { fill: "#f6e983", stroke: "#000000", fontSize: 22, scale: 0.36 });
      sprite.position.set(position.x, 0.34, position.z + 0.62);
      this.staticGroup.add(sprite);
    }

    for (let y = 0; y < this.scenario.arena.height; y += 1) {
      const coord = String(15 - y);
      const position = this.tileToWorld({ x: 0, y }, 0.18);
      const sprite = makeTextSprite(coord, { fill: "#f6e983", stroke: "#000000", fontSize: 22, scale: 0.36 });
      sprite.position.set(position.x - 0.62, 0.34, position.z);
      this.staticGroup.add(sprite);
    }
  }

  playerVisualPosition(snapshot, partialTick) {
    const segments = snapshot.moveSegments?.length ? snapshot.moveSegments : [{ from: snapshot.player, to: snapshot.player }];
    const scaled = Math.min(0.999, Math.max(0, partialTick)) * segments.length;
    const index = Math.min(segments.length - 1, Math.floor(scaled));
    const local = scaled - index;
    const segment = segments[index];
    const from = this.tileToWorld(segment.from, 0);
    const to = this.tileToWorld(segment.to, 0);
    return new THREE.Vector3(
      from.x + (to.x - from.x) * local,
      0,
      from.z + (to.z - from.z) * local
    );
  }

  tileToWorld(tile, y = 0) {
    return new THREE.Vector3(
      tile.x - this.scenario.arena.width / 2 + 0.5,
      y,
      tile.y - this.scenario.arena.height / 2 + 0.5
    );
  }

  worldToTile(world) {
    const x = Math.floor(world.x + this.scenario.arena.width / 2);
    const y = Math.floor(world.z + this.scenario.arena.height / 2);
    if (x < 0 || y < 0 || x >= this.scenario.arena.width || y >= this.scenario.arena.height) {
      return null;
    }

    return { x, y };
  }

  getStats() {
    return {
      sceneKind: "threejs",
      renderer: "WebGLRenderer",
      objects: this.scene.children.length,
      staticObjects: this.staticGroup.children.length,
      markerObjects: this.markerGroup.children.length,
      methodObjects: this.methodGroup.children.length,
      dynamicObjects: this.dynamicGroup.children.length,
      effectObjects: this.effectGroup.children.length,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      pixelSample: this.lastPixelSample ?? null
    };
  }

  sampleCenterPixels() {
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(4 * 9);
    const x = Math.max(0, Math.floor(width / 2) - 1);
    const y = Math.max(0, Math.floor(height / 2) - 1);
    gl.readPixels(x, y, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let nonBlack = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 12) {
        nonBlack += 1;
      }
    }
    return { width, height, nonBlack };
  }
}

function createMaterials() {
  const materials = {
    floorA: new THREE.MeshStandardMaterial({ color: 0x51452f, roughness: 0.9 }),
    floorB: new THREE.MeshStandardMaterial({ color: 0x473b29, roughness: 0.9 }),
    gridLine: new THREE.LineBasicMaterial({ color: 0xe8d86a, transparent: true, opacity: 0.16 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x15100a, roughness: 1 }),
    yamaFootprint: new THREE.MeshBasicMaterial({ color: 0x5f1919, transparent: true, opacity: 0.34 }),
    yamaBody: new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.72, metalness: 0.08 }),
    yamaHead: new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.68 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.5 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34 }),
    playerLegs: new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.75 }),
    playerBody: new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.68 }),
    playerHead: new THREE.MeshStandardMaterial({ color: 0xc7a27a, roughness: 0.7 }),
    weapon: new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.28, metalness: 0.35 }),
    routeLine: new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.36 }),
    routeMarker: new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.62 }),
    dangerIdle: new THREE.MeshBasicMaterial({ color: 0xd83d3d, transparent: true, opacity: 0.07, depthWrite: false }),
    dangerActive: new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.28, depthWrite: false }),
    meteorTelegraph: new THREE.MeshBasicMaterial({ color: 0xff7a38, transparent: true, opacity: 0.46, depthWrite: false }),
    meteor: new THREE.MeshStandardMaterial({ color: 0xff8a22, emissive: 0x7a2200, roughness: 0.42 }),
    pathLine: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78 }),
    pathDot: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.86 }),
    trueTile: new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.96 }),
    expectedTile: new THREE.MeshBasicMaterial({ color: 0xa3e635, transparent: true, opacity: 0.26, depthWrite: false }),
    attackClick: new THREE.LineBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9 }),
    moveClick: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    flareCharge: new THREE.MeshBasicMaterial({ color: 0xff7a38, transparent: true, opacity: 0.86, depthTest: false }),
    shadowTelegraph: new THREE.MeshBasicMaterial({ color: 0x8a2be2, transparent: true, opacity: 0.42, depthWrite: false }),
    fireLine: new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.4, depthWrite: false }),
    hpBarBg: new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.82, depthTest: false }),
    hpBarFill: new THREE.MeshBasicMaterial({ color: 0xd83d3d, transparent: true, opacity: 0.95, depthTest: false })
  };

  Object.values(materials).forEach((material) => {
    material.userData.shared = true;
  });

  return materials;
}

function makeShadowBlob(radius, material) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.userData.keepOnAssetSwap = true;
  return mesh;
}

function makeTextSprite(text, options = {}) {
  const fontSize = options.fontSize ?? 28;
  const padding = 8;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `700 ${fontSize}px Trebuchet MS, Arial, sans-serif`;
  const width = Math.ceil(context.measureText(text).width + padding * 2);
  const height = Math.ceil(fontSize + padding * 2);
  canvas.width = nextPowerOfTwo(width);
  canvas.height = nextPowerOfTwo(height);

  context.font = `700 ${fontSize}px Trebuchet MS, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect((canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }

  context.lineWidth = 5;
  context.strokeStyle = options.stroke ?? "#000000";
  context.strokeText(text, canvas.width / 2, canvas.height / 2);
  context.fillStyle = options.fill ?? "#ffffff";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: options.opacity ?? 1,
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  const scale = options.scale ?? 0.5;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  return sprite;
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    disposeObject(child);
  }
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(child.material);
    }
  });
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  if (material.userData?.shared) {
    return;
  }

  material.map?.dispose?.();
  material.dispose?.();
}

function squareLineGeometry(size) {
  const half = size / 2;
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-half, 0, -half),
    new THREE.Vector3(half, 0, -half),
    new THREE.Vector3(half, 0, half),
    new THREE.Vector3(-half, 0, half)
  ]);
}

function rectCenter(rect) {
  return {
    x: rect.origin.x + rect.size.width / 2 - 0.5,
    y: rect.origin.y + rect.size.height / 2 - 0.5
  };
}

function splatStyle(hit) {
  const kind = hit.kind;
  if (hit.target === "player") {
    if (kind === "poison") return { fill: "#ffffff", stroke: "#0e6b1c", background: "#062b0c" };
    if (kind === "burn") return { fill: "#ffffff", stroke: "#d35400", background: "#3a1602" };
    return { fill: "#ffffff", stroke: "#7a1010", background: "#3a0606" };
  }
  if (kind === "miss") return { fill: "#cfe4ff", stroke: "#1f3a66", background: "#0a1626" };
  return { fill: "#ffffff", stroke: "#8b0000", background: "#1a1a1a" };
}

bootstrap();
