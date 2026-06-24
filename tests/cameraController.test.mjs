import assert from "node:assert/strict";
import * as THREE from "three";
import { CAMERA_DEFAULTS, CameraController } from "../src/cameraController.js";

const renderer = createStubRenderer();
const canvas = createStubCanvas(800, 600);
const controller = new CameraController({ canvas, renderer });

assert.ok(controller.camera instanceof THREE.OrthographicCamera, "camera is OrthographicCamera");
assert.equal(controller.camera.position.x, CAMERA_DEFAULTS.position.x);
assert.equal(controller.camera.position.y, CAMERA_DEFAULTS.position.y);
assert.equal(controller.camera.position.z, CAMERA_DEFAULTS.position.z);

controller.applyFrustum(2);
assert.equal(controller.camera.top, CAMERA_DEFAULTS.orthoFrustumWide / 2, "wide aspect uses wide frustum");
assert.equal(controller.camera.bottom, -CAMERA_DEFAULTS.orthoFrustumWide / 2);

controller.applyFrustum(0.6);
assert.equal(controller.camera.top, CAMERA_DEFAULTS.orthoFrustumTall / 2, "tall aspect uses tall frustum");

const before = controller.camera.matrixWorld.clone();
controller.lookAt({ x: 0, y: 0, z: 0 });
const after = controller.camera.matrixWorld;
assert.ok(true, `lookAt(target) executed without throwing (before=${before.elements[0]}, after=${after.elements[0]})`);

renderer.calls.length = 0;
controller.applyFrustum(1.5);
controller.lookAt({ x: 5, y: 0, z: 5 });
assert.equal(renderer.calls.filter((entry) => entry.kind === "setSize").length, 0,
  "applyFrustum + lookAt should not touch renderer.setSize");

const ndcCenter = controller.pickGround(400, 300);
assert.ok(ndcCenter, "pickGround returns a hit for center of canvas");
assert.ok(Math.abs(ndcCenter.y) < 1e-6, `ground hit has y ~= 0 (got ${ndcCenter.y})`);

const offCanvasHit = controller.pickGround(400, 300);
assert.ok(offCanvasHit.x !== undefined && offCanvasHit.z !== undefined, "hit has x and z components");

const isolatedCanvas = createStubCanvas(640, 480);
const isolated = new CameraController({ canvas: isolatedCanvas, renderer: createStubRenderer() });
const isolatedHit = isolated.pickGround(0, 0);
const isolatedHit2 = isolated.pickGround(640, 480);
assert.ok(isolatedHit && isolatedHit2, "two distinct cursor positions both intersect the ground plane");
assert.ok(isolatedHit.x !== isolatedHit2.x || isolatedHit.z !== isolatedHit2.z,
  "different cursor positions produce different ground hits");

const noCanvas = new CameraController({ canvas: null, renderer: createStubRenderer() });
assert.equal(noCanvas.pickGround(10, 10), null, "pickGround returns null without a canvas");

console.log("cameraController tests passed");

function createStubRenderer() {
  const calls = [];
  return {
    calls,
    setSize(width, height, updateStyle) {
      calls.push({ kind: "setSize", width, height, updateStyle });
    }
  };
}

function createStubCanvas(width, height) {
  return {
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height, right: width, bottom: height };
    }
  };
}
