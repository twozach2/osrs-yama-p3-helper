import * as THREE from "three";

const PANEL_BREAKPOINT_PX = 820;
const PANEL_WIDTH_PX = 292;
const FIXED_MODE_WIDTH = 765;
const FIXED_MODE_HEIGHT = 503;
const FIXED_MODE_ASPECT = FIXED_MODE_WIDTH / FIXED_MODE_HEIGHT;
const FOV_DEGREES = 40;
const DEFAULT_DISTANCE = 14;
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 28;
const DEFAULT_YAW = 0;
const DEFAULT_PITCH = (55 * Math.PI) / 180;
const MIN_PITCH = (15 * Math.PI) / 180;
const MAX_PITCH = (80 * Math.PI) / 180;
const YAW_PER_PX = (0.5 * Math.PI) / 180;
const PITCH_PER_PX = (0.35 * Math.PI) / 180;
const ZOOM_STEP_PER_NOTCH = 0.6;
const WHEEL_PIXELS_PER_NOTCH = 100;
const EDGE_PAN_DISTANCE_PX = 24;
const EDGE_PAN_SPEED = 4;
const MAX_TICK_DT = 0.05;
const NEAR = 0.1;
const FAR = 100;

export class CameraController {
  constructor({ canvas, renderer } = {}) {
    this.canvas = canvas ?? null;
    this.renderer = renderer ?? null;
    this.fixedMode = false;
    this.edgePanEnabled = false;

    this.camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, NEAR, FAR);
    this.target = new THREE.Vector3(0, 0, 0);
    this.targetOffset = new THREE.Vector3(0, 0, 0);
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.distance = DEFAULT_DISTANCE;
    this.applyPose();

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._cursorClient = null;
    this._canvasWidth = 0;
    this._canvasHeight = 0;
  }

  setFixedMode(value) {
    this.fixedMode = !!value;
    this.resize();
  }

  setEdgePan(enabled) {
    this.edgePanEnabled = !!enabled;
  }

  resetTargetOffset() {
    this.targetOffset.set(0, 0, 0);
    this.applyPose();
  }

  resize() {
    const dims = this.computeViewport();
    if (this.renderer && typeof this.renderer.setSize === "function") {
      this.renderer.setSize(dims.width, dims.height, dims.updateStyle);
    }
    // The canvas is sized to the visible area in CSS (resizable mode has
    // `right: 292px` so the canvas does not extend behind the panel), so
    // any leftover view offset from a previous configuration must be
    // cleared. The camera's projection is then driven purely by `aspect`.
    if (typeof this.camera.clearViewOffset === "function") {
      this.camera.clearViewOffset();
    }
    this.applyAspect(dims.aspect);
  }

  computeViewport() {
    const winWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
    const winHeight = typeof window !== "undefined" ? window.innerHeight : 720;
    const stacked = winWidth <= PANEL_BREAKPOINT_PX;
    const panelWidth = stacked ? 0 : PANEL_WIDTH_PX;
    const availableWidth = Math.max(320, winWidth - panelWidth);
    const availableHeight = stacked ? Math.floor(winHeight * 0.62) : winHeight;

    if (this.fixedMode) {
      const widthByHeight = availableHeight * FIXED_MODE_ASPECT;
      const fitW = Math.min(availableWidth, widthByHeight);
      const fitH = fitW / FIXED_MODE_ASPECT;
      this._canvasWidth = Math.floor(fitW);
      this._canvasHeight = Math.floor(fitH);
      return {
        width: this._canvasWidth,
        height: this._canvasHeight,
        aspect: FIXED_MODE_ASPECT,
        updateStyle: true
      };
    }

    // Resizable: the canvas is sized to the visible area by CSS
    // (`#world { right: 292px }` on the default selector). Drawing buffer
    // and camera aspect both follow the canvas, so the camera's principal
    // point IS the visible centre with no projection offset trickery.
    this._canvasWidth = availableWidth;
    this._canvasHeight = availableHeight;
    return {
      width: availableWidth,
      height: availableHeight,
      aspect: availableWidth / Math.max(1, availableHeight),
      updateStyle: false
    };
  }

  applyAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setDistance(distance) {
    this.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance));
    this.applyPose();
  }

  applyDragDelta(dxPx, dyPx) {
    this.yaw += dxPx * YAW_PER_PX;
    const nextPitch = this.pitch + dyPx * PITCH_PER_PX;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, nextPitch));
    this.applyPose();
  }

  applyZoomNotch(notches) {
    this.setDistance(this.distance + notches * ZOOM_STEP_PER_NOTCH);
  }

  attach(canvasOverride) {
    const target = canvasOverride ?? this.canvas;
    if (!target || typeof target.addEventListener !== "function") {
      return () => {};
    }
    this.detach();

    let dragging = false;
    let activePointer = null;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event) => {
      if (event.button !== 1) return;
      dragging = true;
      activePointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      try { target.setPointerCapture?.(event.pointerId); } catch { /* not supported */ }
      event.preventDefault();
    };
    const onPointerMove = (event) => {
      this._cursorClient = { clientX: event.clientX, clientY: event.clientY };
      if (!dragging || event.pointerId !== activePointer) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      this.applyDragDelta(dx, dy);
      event.preventDefault();
    };
    const onPointerEnd = (event) => {
      if (!dragging || event.pointerId !== activePointer) return;
      dragging = false;
      activePointer = null;
      try { target.releasePointerCapture?.(event.pointerId); } catch { /* not supported */ }
    };
    const onPointerLeave = () => {
      this._cursorClient = null;
    };

    const onWheel = (event) => {
      if (!event.deltaY) return;
      this.applyZoomNotch(event.deltaY / WHEEL_PIXELS_PER_NOTCH);
      event.preventDefault();
    };

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerEnd);
    target.addEventListener("pointercancel", onPointerEnd);
    target.addEventListener("lostpointercapture", onPointerEnd);
    target.addEventListener("pointerleave", onPointerLeave);
    target.addEventListener("wheel", onWheel, { passive: false });

    this._detach = () => {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerEnd);
      target.removeEventListener("pointercancel", onPointerEnd);
      target.removeEventListener("lostpointercapture", onPointerEnd);
      target.removeEventListener("pointerleave", onPointerLeave);
      target.removeEventListener("wheel", onWheel);
      this._detach = null;
    };
    return this._detach;
  }

  detach() {
    this._detach?.();
  }

  lookAt(target) {
    if (!target) return;
    this.target.set(target.x ?? 0, target.y ?? 0, target.z ?? 0);
    this.applyPose();
  }

  applyPose() {
    // OSRS default: north at top of screen, east on the right. That means the
    // camera sits south of (and above) its target looking north, with yaw=0
    // matching the in-game default angle. Yaw rotates the camera around the
    // target's +Y axis (positive yaw -> camera moves east). Horizontal
    // panel-inset compensation is handled by camera.setViewOffset() in
    // applyViewOffset(), so applyPose() can treat the target as the true
    // anchor without depth-dependent shifting.
    const fx = this.target.x + this.targetOffset.x;
    const fy = this.target.y + this.targetOffset.y;
    const fz = this.target.z + this.targetOffset.z;

    const horizontal = Math.cos(this.pitch) * this.distance;
    const vertical = Math.sin(this.pitch) * this.distance;
    this.camera.position.set(
      fx + Math.sin(this.yaw) * horizontal,
      fy + vertical,
      fz + Math.cos(this.yaw) * horizontal
    );
    this.camera.lookAt(fx, fy, fz);
  }

  tick(dtSec) {
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;
    const dt = Math.min(MAX_TICK_DT, dtSec);
    if (!this.edgePanEnabled || this.fixedMode) return;
    if (!this._cursorClient || !this.canvas || typeof this.canvas.getBoundingClientRect !== "function") return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = this._cursorClient.clientX - rect.left;
    const y = this._cursorClient.clientY - rect.top;
    if (x < -EDGE_PAN_DISTANCE_PX || y < -EDGE_PAN_DISTANCE_PX
      || x > rect.width + EDGE_PAN_DISTANCE_PX || y > rect.height + EDGE_PAN_DISTANCE_PX) return;
    let panX = 0;
    let panZ = 0;
    if (x < EDGE_PAN_DISTANCE_PX) panX = -1;
    else if (x > rect.width - EDGE_PAN_DISTANCE_PX) panX = 1;
    if (y < EDGE_PAN_DISTANCE_PX) panZ = -1;
    else if (y > rect.height - EDGE_PAN_DISTANCE_PX) panZ = 1;
    if (panX === 0 && panZ === 0) return;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    this.targetOffset.x += (panX * cos + panZ * sin) * EDGE_PAN_SPEED * dt;
    this.targetOffset.z += (-panX * sin + panZ * cos) * EDGE_PAN_SPEED * dt;
    this.applyPose();
  }

  pickGround(clientX, clientY) {
    if (!this.canvas || typeof this.canvas.getBoundingClientRect !== "function") {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera({ x, y }, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) {
      return null;
    }
    return hit;
  }
}

export const CAMERA_DEFAULTS = Object.freeze({
  fovDegrees: FOV_DEGREES,
  defaultDistance: DEFAULT_DISTANCE,
  minDistance: MIN_DISTANCE,
  maxDistance: MAX_DISTANCE,
  defaultYaw: DEFAULT_YAW,
  defaultPitch: DEFAULT_PITCH,
  minPitch: MIN_PITCH,
  maxPitch: MAX_PITCH,
  yawPerPx: YAW_PER_PX,
  pitchPerPx: PITCH_PER_PX,
  zoomStepPerNotch: ZOOM_STEP_PER_NOTCH,
  wheelPixelsPerNotch: WHEEL_PIXELS_PER_NOTCH,
  edgePanDistancePx: EDGE_PAN_DISTANCE_PX,
  edgePanSpeed: EDGE_PAN_SPEED,
  fixedModeWidth: FIXED_MODE_WIDTH,
  fixedModeHeight: FIXED_MODE_HEIGHT,
  fixedModeAspect: FIXED_MODE_ASPECT,
  panelBreakpointPx: PANEL_BREAKPOINT_PX,
  panelWidthPx: PANEL_WIDTH_PX
});
