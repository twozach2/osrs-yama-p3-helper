import * as THREE from "three";

const PANEL_BREAKPOINT_PX = 820;
const PANEL_WIDTH_PX = 292;
const ORTHO_FRUSTUM_WIDE = 18;
const ORTHO_FRUSTUM_TALL = 22;
const INITIAL_CAMERA_POSITION = Object.freeze({ x: 11, y: 13, z: 14 });

export class CameraController {
  constructor({ canvas, renderer } = {}) {
    this.canvas = canvas ?? null;
    this.renderer = renderer ?? null;

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    this.camera.position.set(INITIAL_CAMERA_POSITION.x, INITIAL_CAMERA_POSITION.y, INITIAL_CAMERA_POSITION.z);
    this.camera.lookAt(0, 0, 0);

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  resize() {
    const dims = this.computeViewport();
    if (this.renderer && typeof this.renderer.setSize === "function") {
      this.renderer.setSize(dims.width, dims.height, false);
    }
    this.applyFrustum(dims.aspect);
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

  applyFrustum(aspect) {
    const frustum = aspect > 1 ? ORTHO_FRUSTUM_WIDE : ORTHO_FRUSTUM_TALL;
    this.camera.left = (-frustum * aspect) / 2;
    this.camera.right = (frustum * aspect) / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.camera.updateProjectionMatrix();
  }

  lookAt(target) {
    if (!target) return;
    this.camera.lookAt(target.x ?? 0, target.y ?? 0, target.z ?? 0);
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
  position: INITIAL_CAMERA_POSITION,
  panelBreakpointPx: PANEL_BREAKPOINT_PX,
  panelWidthPx: PANEL_WIDTH_PX,
  orthoFrustumWide: ORTHO_FRUSTUM_WIDE,
  orthoFrustumTall: ORTHO_FRUSTUM_TALL
});
