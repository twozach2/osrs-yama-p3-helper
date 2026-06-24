import assert from "node:assert/strict";
import * as THREE from "three";
import { CAMERA_DEFAULTS, CameraController } from "../src/cameraController.js";

const renderer = createStubRenderer();
const canvas = createStubCanvas(800, 600);
const controller = new CameraController({ canvas, renderer });

assert.ok(controller.camera instanceof THREE.PerspectiveCamera, "camera is PerspectiveCamera");
assert.equal(controller.camera.fov, CAMERA_DEFAULTS.fovDegrees);
assert.equal(controller.distance, CAMERA_DEFAULTS.defaultDistance);
assert.equal(controller.yaw, CAMERA_DEFAULTS.defaultYaw);
assert.equal(controller.pitch, CAMERA_DEFAULTS.defaultPitch);

const expectedY = Math.sin(controller.pitch) * controller.distance;
assert.ok(Math.abs(controller.camera.position.y - expectedY) < 1e-6, "initial camera y matches pitch + distance");
assert.ok(Math.abs(controller.camera.position.x) < 1e-6, "initial camera x is on the yaw=0 meridian");

controller.applyAspect(2);
assert.equal(controller.camera.aspect, 2);

controller.applyAspect(0.6);
assert.equal(controller.camera.aspect, 0.6);

controller.lookAt({ x: 5, y: 0, z: 5 });
assert.ok(Math.abs(controller.target.x - 5) < 1e-6 && Math.abs(controller.target.z - 5) < 1e-6,
  "lookAt updates the orbit target");
assert.ok(Math.abs(controller.camera.position.x - 5) < 1e-6, "camera x tracks the target x at yaw=0");

controller.setDistance(50);
assert.equal(controller.distance, CAMERA_DEFAULTS.maxDistance, "setDistance clamps to max");
controller.setDistance(1);
assert.equal(controller.distance, CAMERA_DEFAULTS.minDistance, "setDistance clamps to min");
controller.setDistance(CAMERA_DEFAULTS.defaultDistance);

controller.lookAt({ x: 0, y: 0, z: 0 });
controller.applyAspect(800 / 600);
const ndcCenter = controller.pickGround(400, 300);
assert.ok(ndcCenter, "pickGround returns a hit at center of canvas");
assert.ok(Math.abs(ndcCenter.y) < 1e-6, `ground hit has y ~= 0 (got ${ndcCenter.y})`);
assert.ok(Math.abs(ndcCenter.x) < 0.1 && Math.abs(ndcCenter.z) < 0.1,
  `center-of-canvas pick lands near target origin (got ${ndcCenter.x}, ${ndcCenter.z})`);

const left = controller.pickGround(100, 300);
const right = controller.pickGround(700, 300);
assert.ok(left && right, "edge-of-canvas picks both hit the ground plane");
assert.ok(left.x < right.x, "left pixel maps to smaller world x than right pixel");

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
