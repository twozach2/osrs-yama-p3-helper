import * as THREE from "three";

/**
 * Optional chunky-pixel post-FX. When enabled, renders the scene into a
 * downsampled WebGLRenderTarget with NearestFilter sampling, then blits
 * that target back to the screen via a fullscreen quad. The result is
 * blocky, low-resolution pixels that read closer to OSRS's native render
 * size on a modern high-DPI display.
 *
 * Toggle-driven so it can ship off by default; bypassing the target
 * recovers the original render path with no observable cost.
 */
export class PixelPostFx {
  constructor({ renderer, scale = 3 } = {}) {
    this.renderer = renderer;
    this.enabled = false;
    this.scale = Math.max(1, Math.round(scale));
    this.target = null;
    this.targetSize = new THREE.Vector2();
    this.bufferSize = new THREE.Vector2();

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadMaterial = new THREE.MeshBasicMaterial({
      map: null,
      depthTest: false,
      depthWrite: false,
      transparent: false
    });
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeometry, this.quadMaterial);
    this.quadScene.add(this.quad);
  }

  setEnabled(value) {
    this.enabled = !!value;
  }

  setScale(value) {
    const next = Math.max(1, Math.round(value));
    if (next === this.scale) return;
    this.scale = next;
    this.disposeTarget();
  }

  ensureTarget(bufferWidth, bufferHeight) {
    const width = Math.max(1, Math.floor(bufferWidth / this.scale));
    const height = Math.max(1, Math.floor(bufferHeight / this.scale));
    if (this.target && this.targetSize.x === width && this.targetSize.y === height) {
      return;
    }
    this.disposeTarget();
    this.target = new THREE.WebGLRenderTarget(width, height, {
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat
    });
    this.targetSize.set(width, height);
    this.quadMaterial.map = this.target.texture;
    this.quadMaterial.needsUpdate = true;
  }

  disposeTarget() {
    if (this.target) {
      this.target.dispose();
      this.target = null;
    }
    this.targetSize.set(0, 0);
    this.quadMaterial.map = null;
  }

  render(scene, camera) {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }

    this.renderer.getDrawingBufferSize(this.bufferSize);
    this.ensureTarget(this.bufferSize.x, this.bufferSize.y);

    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.disposeTarget();
    this.quadGeometry.dispose();
    this.quadMaterial.dispose();
  }
}
