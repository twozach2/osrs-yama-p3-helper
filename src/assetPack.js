import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const ASSET_MANIFEST_PATH = "/assets/osrs/manifest.json";
const ASSET_PACK_CLASS_PREFIX = "asset-sprite-";
const HUD_SPRITE_VARS = {
  orbHp: "--asset-orb-hp-image",
  orbPrayer: "--asset-orb-prayer-image",
  orbRun: "--asset-orb-run-image"
};
const HIT_SPLAT_SPRITES = {
  miss: "hitsplatMiss",
  poison: "hitsplatPoison",
  burn: "hitsplatBurn",
  default: "hitsplatDamage"
};

export class AssetPack {
  constructor({ canvas, disposeObject } = {}) {
    this.canvas = canvas ?? null;
    this.disposeObject = typeof disposeObject === "function" ? disposeObject : () => {};
    this.gltfLoader = new GLTFLoader();
    // GLBs produced by `gltf-transform optimize --compress meshopt`
    // (see tools/extract-models/extract.mjs) declare
    // EXT_meshopt_compression as required. Without this decoder the
    // GLBs still parse but their vertex buffers come back empty, which
    // looks identical to no asset pack at all.
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    this.textureLoader = new THREE.TextureLoader();
    this.assetModels = new Map();
    this.assetSprites = new Map();
    this.assetFonts = new Map();
    this.assetManifest = null;
    this.assetReport = createAssetReport("fallback", "Looking for a local OSRS asset pack...");
  }

  async load({ yamaGroup = null, playerGroup = null, onRefresh = null } = {}) {
    this.setAssetReport(createAssetReport("loading", "Loading local OSRS asset pack..."));

    try {
      const response = await fetch(ASSET_MANIFEST_PATH, { cache: "no-store" });
      if (!response.ok) {
        this.resetAssetDomHooks();
        this.setAssetReport(createAssetReport("fallback", "No local OSRS asset manifest found; using fallback primitives."));
        return;
      }

      this.assetManifest = await response.json();
      const validation = validateAssetManifest(this.assetManifest);
      this.clearLoadedAssets();

      const [fontReport, spriteReport, modelReport] = await Promise.all([
        this.loadAssetFonts(this.assetManifest.fonts ?? {}),
        this.loadAssetSprites(this.assetManifest.sprites ?? {}),
        this.loadAssetModels(this.assetManifest.models ?? {})
      ]);

      this.applyModel("yama", yamaGroup);
      this.applyModel("player", playerGroup);
      this.applyAssetFontsToDocument();
      this.applyAssetSpritesToDocument();
      if (typeof onRefresh === "function") onRefresh();

      this.setAssetReport(createAssetReport("local-osrs", "Local OSRS asset pack loaded.", {
        version: String(this.assetManifest.version ?? 1),
        loaded: {
          fonts: fontReport.loaded,
          sprites: spriteReport.loaded,
          models: modelReport.loaded
        },
        warnings: [...validation.warnings, ...fontReport.warnings, ...spriteReport.warnings, ...modelReport.warnings],
        errors: [...validation.errors, ...fontReport.errors, ...spriteReport.errors, ...modelReport.errors]
      }));
    } catch (error) {
      this.resetAssetDomHooks();
      this.setAssetReport(createAssetReport("fallback", "OSRS asset manifest could not be loaded; using fallback primitives.", {
        errors: [error.message]
      }));
      console.warn("OSRS asset manifest could not be loaded; using fallback primitives.", error);
    }
  }

  async loadAssetModels(models) {
    const report = createLoadReport();
    await Promise.all(Object.entries(models).map(async ([id, rawConfig]) => {
      const config = normalizeAssetConfig(rawConfig);
      if (!config.path) {
        report.warnings.push(`Model "${id}" is missing a path.`);
        return;
      }
      try {
        const gltf = await this.gltfLoader.loadAsync(config.path);
        this.assetModels.set(id, {
          scene: gltf.scene,
          animations: gltf.animations ?? [],
          config
        });
        report.loaded += 1;
      } catch (error) {
        report.errors.push(`Model "${id}" failed to load: ${error.message}`);
      }
    }));
    return report;
  }

  async loadAssetSprites(sprites) {
    const report = createLoadReport();
    await Promise.all(Object.entries(sprites).map(async ([id, rawConfig]) => {
      const config = normalizeAssetConfig(rawConfig);
      if (!config.path) {
        report.warnings.push(`Sprite "${id}" is missing a path.`);
        return;
      }
      try {
        const texture = await this.textureLoader.loadAsync(config.path);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        this.assetSprites.set(id, { texture, config });
        report.loaded += 1;
      } catch (error) {
        report.errors.push(`Sprite "${id}" failed to load: ${error.message}`);
      }
    }));
    return report;
  }

  async loadAssetFonts(fonts) {
    const report = createLoadReport();
    const entries = Object.entries(fonts);
    if (entries.length > 0 && typeof FontFace === "undefined") {
      report.warnings.push("This browser does not support FontFace; local font assets were skipped.");
      return report;
    }
    await Promise.all(entries.map(async ([id, rawConfig]) => {
      const config = normalizeAssetConfig(rawConfig);
      if (!config.path) {
        report.warnings.push(`Font "${id}" is missing a path.`);
        return;
      }
      const family = config.family ?? `OSRS ${id}`;
      try {
        const face = new FontFace(family, `url("${config.path}")`, {
          style: config.style ?? "normal",
          weight: String(config.weight ?? "normal")
        });
        await face.load();
        document.fonts.add(face);
        this.assetFonts.set(id, { family, config, face });
        report.loaded += 1;
      } catch (error) {
        report.errors.push(`Font "${id}" failed to load: ${error.message}`);
      }
    }));
    return report;
  }

  applyModel(id, targetGroup) {
    const asset = this.assetModels.get(id);
    if (!asset || !targetGroup) {
      return;
    }

    for (const child of [...targetGroup.children]) {
      if (child.userData.keepOnAssetSwap) {
        continue;
      }
      targetGroup.remove(child);
      this.disposeObject(child);
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

    // Set up an AnimationMixer for the cloned scene if the source GLB
    // had any clips. Engine-event consumers in main.js drive playback
    // via setActiveClip() below; if no consumer kicks in, the first
    // available clip (conventionally `idle`) starts looping by default.
    const previousMixer = targetGroup.userData.assetMixer;
    if (previousMixer) previousMixer.stopAllAction();
    targetGroup.userData.assetMixer = null;
    targetGroup.userData.assetActions = null;
    targetGroup.userData.activeClipName = null;

    if (asset.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      const actions = new Map();
      for (const clip of asset.animations) {
        actions.set(clip.name, mixer.clipAction(clip));
      }
      targetGroup.userData.assetMixer = mixer;
      targetGroup.userData.assetActions = actions;
      const defaultName = actions.has("idle") ? "idle" : asset.animations[0].name;
      this.setActiveClip(targetGroup, defaultName);
    }
  }

  /**
   * Switch the currently playing AnimationClip on `targetGroup` to the
   * clip named `clipName`, crossfading from whatever was playing. No-op
   * if the model has no mixer or the named clip doesn't exist.
   */
  setActiveClip(targetGroup, clipName, { fade = 0.18 } = {}) {
    const mixer = targetGroup?.userData?.assetMixer;
    const actions = targetGroup?.userData?.assetActions;
    if (!mixer || !actions) return false;
    const next = actions.get(clipName);
    if (!next) return false;
    if (targetGroup.userData.activeClipName === clipName) return true;
    const previous = actions.get(targetGroup.userData.activeClipName);
    next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    if (previous && previous !== next) {
      next.crossFadeFrom(previous, fade, false);
    }
    targetGroup.userData.activeClipName = clipName;
    return true;
  }

  applyAssetFontsToDocument() {
    const font = this.assetFonts.get("ui")
      ?? this.assetFonts.get("osrs")
      ?? [...this.assetFonts.values()].find((entry) => entry.config.role === "ui")
      ?? null;

    if (!font) {
      document.documentElement.style.removeProperty("--ui-font");
      return;
    }

    document.documentElement.style.setProperty(
      "--ui-font",
      `${quoteCssFontFamily(font.family)}, "04B_03", "Trebuchet MS", Arial, sans-serif`
    );
  }

  applyAssetSpritesToDocument() {
    this.clearAssetSpriteClasses();
    for (const [id, asset] of this.assetSprites) {
      document.documentElement.classList.add(`${ASSET_PACK_CLASS_PREFIX}${safeCssIdent(id)}`);
      const cssVar = HUD_SPRITE_VARS[id];
      if (cssVar) {
        document.documentElement.style.setProperty(cssVar, `url("${asset.config.path}")`);
      }
    }
  }

  resetAssetDomHooks() {
    document.documentElement.style.removeProperty("--ui-font");
    for (const cssVar of Object.values(HUD_SPRITE_VARS)) {
      document.documentElement.style.removeProperty(cssVar);
    }
    this.clearAssetSpriteClasses();
  }

  clearAssetSpriteClasses() {
    for (const className of [...document.documentElement.classList]) {
      if (className.startsWith(ASSET_PACK_CLASS_PREFIX)) {
        document.documentElement.classList.remove(className);
      }
    }
  }

  clearLoadedAssets() {
    for (const asset of this.assetSprites.values()) {
      asset.texture.dispose();
    }
    this.assetModels.clear();
    this.assetSprites.clear();
    this.assetFonts.clear();
  }

  hitSplatSpriteImage(hit) {
    const spriteId = hit.kind === "miss"
      ? HIT_SPLAT_SPRITES.miss
      : hit.kind === "poison"
        ? HIT_SPLAT_SPRITES.poison
        : hit.kind === "burn"
          ? HIT_SPLAT_SPRITES.burn
          : HIT_SPLAT_SPRITES.default;
    return this.assetSprites.get(spriteId)?.texture.image ?? null;
  }

  setAssetReport(report) {
    this.assetReport = report;
    if (!this.canvas) return;
    this.canvas.dataset.assetMode = report.mode;
    this.canvas.dataset.assetMessage = report.message;
    this.canvas.dataset.assetManifestVersion = report.version ?? "";
    this.canvas.dataset.assetFonts = String(report.loaded.fonts);
    this.canvas.dataset.assetSprites = String(report.loaded.sprites);
    this.canvas.dataset.assetModels = String(report.loaded.models);
    this.canvas.dataset.assetWarnings = String(report.warnings.length);
    this.canvas.dataset.assetErrors = String(report.errors.length);
    if (report.errors.length > 0) {
      this.canvas.dataset.assetError = report.errors.slice(0, 3).join(" | ");
    } else {
      delete this.canvas.dataset.assetError;
    }
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("osrs-assets-updated"));
    }
  }

  assetStatusText() {
    const report = this.assetReport;
    const counts = `models ${report.loaded.models}, sprites ${report.loaded.sprites}, fonts ${report.loaded.fonts}`;
    if (report.mode === "local-osrs") {
      const suffix = report.errors.length > 0 ? ` ${report.errors.length} error(s); check canvas debug data.` : "";
      return `Local asset pack v${report.version ?? 1}: ${counts}.${suffix}`;
    }
    if (report.mode === "loading") {
      return report.message;
    }
    return `${report.message} Loaded: ${counts}.`;
  }

  textSpriteFontFamily(role = "ui") {
    const font = this.assetFonts.get(role)
      ?? this.assetFonts.get("ui")
      ?? this.assetFonts.get("osrs")
      ?? null;
    return font ? `${quoteCssFontFamily(font.family)}, Trebuchet MS, Arial, sans-serif` : "Trebuchet MS, Arial, sans-serif";
  }
}

function createAssetReport(mode, message, options = {}) {
  return {
    mode,
    message,
    version: options.version ?? "",
    loaded: {
      fonts: options.loaded?.fonts ?? 0,
      sprites: options.loaded?.sprites ?? 0,
      models: options.loaded?.models ?? 0
    },
    warnings: options.warnings ?? [],
    errors: options.errors ?? []
  };
}

function createLoadReport() {
  return { loaded: 0, warnings: [], errors: [] };
}

function validateAssetManifest(manifest) {
  const report = { warnings: [], errors: [] };

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    report.errors.push("Manifest must be a JSON object.");
    return report;
  }

  if (manifest.version === undefined) {
    report.warnings.push("Manifest has no version; treating it as v1-compatible.");
  } else if (Number(manifest.version) > 2) {
    report.warnings.push(`Manifest version ${manifest.version} is newer than this loader; unknown fields will be ignored.`);
  }

  validateAssetSection(report, manifest.models, "models", true);
  validateAssetSection(report, manifest.sprites, "sprites", false);
  validateAssetSection(report, manifest.fonts, "fonts", false);

  for (const [id, rawConfig] of Object.entries(manifest.models ?? {})) {
    const config = normalizeAssetConfig(rawConfig);
    const scale = config.scale ?? manifest.scale;
    if (scale !== undefined && (!Number.isFinite(Number(scale)) || Number(scale) <= 0)) {
      report.errors.push(`Model "${id}" has an invalid scale.`);
    }
  }

  return report;
}

function validateAssetSection(report, section, name, required) {
  if (section === undefined) {
    if (required) {
      report.warnings.push(`Manifest has no "${name}" section.`);
    }
    return;
  }

  if (!section || typeof section !== "object" || Array.isArray(section)) {
    report.errors.push(`Manifest "${name}" section must be an object.`);
    return;
  }

  for (const [id, rawConfig] of Object.entries(section)) {
    const config = normalizeAssetConfig(rawConfig);
    if (!config.path) {
      report.warnings.push(`${name.slice(0, -1)} "${id}" has no path.`);
    }
  }
}

function normalizeAssetConfig(config) {
  if (typeof config === "string") {
    return { path: config };
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  return config;
}

function quoteCssFontFamily(family) {
  return `"${String(family).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function safeCssIdent(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}
