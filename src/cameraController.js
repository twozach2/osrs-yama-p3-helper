import * as THREE from "three";

const PANEL_BREAKPOINT_PX = 820;
const PANEL_WIDTH_PX = 292;
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
const NEAR = 0.1;
const FAR = 100;

export class CameraController {
  constructor({ canvas, renderer } = {}) {
    this.canvas = canvas ?? null;
    this.renderer = renderer ?? null;

    this.camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, NEAR, FAR);
    this.target = new THREE.Vector3(0, 0, 0);
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.distance = DEFAULT_DISTANCE;
    this.applyPose();

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  resize() {
    const dims = this.computeViewport();
    if (this.renderer && typeof this.renderer.setSize === "function") {
      this.renderer.setSize(dims.width, dims.height, false);
    }
    this.applyAspect(dims.aspect);
  }

  computeViewport() {
    const width = typeof window !== "undefined" ? window.innerWidth : 1280;
    const winHeight = typeof window !== "undefined" ? window.innerHeight : 720;
    const height = width <= PANEL_BREAKPOINT_PX ? Math.floor(winHeight * 0.62) : winHeight;
    const panelWidth = width <= PANEL_BREAKPOINT_PX ? 0 : PANEL_WIDTH_PX;
    const visibleWidth = Math.max(320, width - panelWidth);
    const aspect = visibleWidth / Math.max(1, height);
    return { width, height, aspect };
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
    target.addEventListener("wheel", onWheel, { passive: false });

    this._detach = () => {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerEnd);
      target.removeEventListener("pointercancel", onPointerEnd);
      target.removeEventListener("lostpointercapture", onPointerEnd);
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
    // target's +Y axis (positive yaw -> camera moves east).
    const horizontal = Math.cos(this.pitch) * this.distance;
    const vertical = Math.sin(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + vertical,
      this.target.z + Math.cos(this.yaw) * horizontal
    );
    this.camera.lookAt(this.target);
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
  panelBreakpointPx: PANEL_BREAKPOINT_PX,
  panelWidthPx: PANEL_WIDTH_PX
});
