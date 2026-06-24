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

// V2.2 drag math
const dragCtrl = new CameraController({ canvas: createStubCanvas(800, 600), renderer: createStubRenderer() });
const baseYaw = dragCtrl.yaw;
const basePitch = dragCtrl.pitch;
dragCtrl.applyDragDelta(100, 0);
assert.ok(Math.abs(dragCtrl.yaw - (baseYaw + 100 * CAMERA_DEFAULTS.yawPerPx)) < 1e-9,
  "applyDragDelta(100, 0) advances yaw by 100 * yawPerPx");
assert.equal(dragCtrl.pitch, basePitch, "horizontal drag does not change pitch");

dragCtrl.applyDragDelta(0, 10);
assert.ok(Math.abs(dragCtrl.pitch - (basePitch + 10 * CAMERA_DEFAULTS.pitchPerPx)) < 1e-9,
  "applyDragDelta(0, 10) advances pitch by 10 * pitchPerPx");

dragCtrl.applyDragDelta(0, 10000);
assert.equal(dragCtrl.pitch, CAMERA_DEFAULTS.maxPitch, "pitch clamps at maxPitch on huge downward drag");
dragCtrl.applyDragDelta(0, -10000);
assert.equal(dragCtrl.pitch, CAMERA_DEFAULTS.minPitch, "pitch clamps at minPitch on huge upward drag");

// V2.2 attach()
const stubCanvas = createStubEventCanvas(800, 600);
const detach = dragCtrl.attach(stubCanvas);
assert.equal(typeof detach, "function", "attach returns a detach function");
assert.ok(stubCanvas.listeners.has("pointerdown"), "attach registers pointerdown");
assert.ok(stubCanvas.listeners.has("pointermove"), "attach registers pointermove");
assert.ok(stubCanvas.listeners.has("pointerup"), "attach registers pointerup");

const yawBeforeMiddle = dragCtrl.yaw;
const pitchBeforeMiddle = dragCtrl.pitch;
stubCanvas.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
stubCanvas.dispatch("pointermove", { button: -1, pointerId: 1, clientX: 110, clientY: 10 });
assert.equal(dragCtrl.yaw, yawBeforeMiddle, "left-button drag does not rotate the camera");
assert.equal(dragCtrl.pitch, pitchBeforeMiddle, "left-button drag does not adjust pitch");

stubCanvas.dispatch("pointerdown", { button: 1, pointerId: 2, clientX: 10, clientY: 10 });
stubCanvas.dispatch("pointermove", { button: -1, pointerId: 2, clientX: 110, clientY: 10 });
assert.ok(Math.abs(dragCtrl.yaw - (yawBeforeMiddle + 100 * CAMERA_DEFAULTS.yawPerPx)) < 1e-9,
  "middle-button drag rotates yaw by dx * yawPerPx");
stubCanvas.dispatch("pointerup", { pointerId: 2 });
stubCanvas.dispatch("pointermove", { button: -1, pointerId: 2, clientX: 210, clientY: 10 });
assert.ok(Math.abs(dragCtrl.yaw - (yawBeforeMiddle + 100 * CAMERA_DEFAULTS.yawPerPx)) < 1e-9,
  "pointer release stops drag tracking");

// V2.3 zoom
const distAtStart = dragCtrl.distance;
dragCtrl.applyZoomNotch(1);
assert.ok(Math.abs(dragCtrl.distance - (distAtStart + CAMERA_DEFAULTS.zoomStepPerNotch)) < 1e-9,
  "applyZoomNotch(1) increases distance by one step");
dragCtrl.applyZoomNotch(-1);
assert.ok(Math.abs(dragCtrl.distance - distAtStart) < 1e-9, "applyZoomNotch(-1) reverses the step");

dragCtrl.applyZoomNotch(10000);
assert.equal(dragCtrl.distance, CAMERA_DEFAULTS.maxDistance, "applyZoomNotch clamps at maxDistance");
dragCtrl.applyZoomNotch(-10000);
assert.equal(dragCtrl.distance, CAMERA_DEFAULTS.minDistance, "applyZoomNotch clamps at minDistance");
dragCtrl.setDistance(CAMERA_DEFAULTS.defaultDistance);

assert.ok(stubCanvas.listeners.has("wheel"), "attach registers wheel listener");
const distBeforeWheel = dragCtrl.distance;
stubCanvas.dispatch("wheel", { deltaY: CAMERA_DEFAULTS.wheelPixelsPerNotch });
assert.ok(Math.abs(dragCtrl.distance - (distBeforeWheel + CAMERA_DEFAULTS.zoomStepPerNotch)) < 1e-9,
  "positive deltaY zooms out by one step");
stubCanvas.dispatch("wheel", { deltaY: -CAMERA_DEFAULTS.wheelPixelsPerNotch });
assert.ok(Math.abs(dragCtrl.distance - distBeforeWheel) < 1e-9, "negative deltaY zooms back in");
stubCanvas.dispatch("wheel", { deltaY: 0 });
assert.ok(Math.abs(dragCtrl.distance - distBeforeWheel) < 1e-9, "zero deltaY is a no-op");

detach();
assert.equal(stubCanvas.listeners.get("pointerdown").size, 0, "detach removes the pointerdown listener");
assert.equal(stubCanvas.listeners.get("wheel").size, 0, "detach removes the wheel listener");

// V2.5 fixed-mode viewport math
const fixedCtrl = new CameraController({ canvas: createStubCanvas(800, 600), renderer: createStubRenderer() });
const flexDims = fixedCtrl.computeViewport();
assert.equal(flexDims.updateStyle, false, "resizable mode keeps CSS-driven sizing");

fixedCtrl.fixedMode = true;
const fixedDims = fixedCtrl.computeViewport();
assert.ok(Math.abs(fixedDims.aspect - CAMERA_DEFAULTS.fixedModeAspect) < 1e-6,
  `fixed-mode aspect locks to OSRS 765:503 (got ${fixedDims.aspect})`);
assert.equal(fixedDims.updateStyle, true, "fixed-mode opts into inline canvas sizing");
const fixedRatio = fixedDims.width / fixedDims.height;
assert.ok(Math.abs(fixedRatio - CAMERA_DEFAULTS.fixedModeAspect) < 0.01,
  `fixed-mode canvas dimensions hold the target aspect (got ${fixedRatio})`);

const wideRenderer = createStubRenderer();
const wideCtrl = new CameraController({ canvas: createStubCanvas(800, 600), renderer: wideRenderer });
wideCtrl.setFixedMode(true);
const setSizeCalls = wideRenderer.calls.filter((entry) => entry.kind === "setSize");
assert.ok(setSizeCalls.length > 0, "setFixedMode(true) triggers renderer.setSize");
assert.equal(setSizeCalls.at(-1).updateStyle, true, "fixed-mode resize asks renderer to update style");
wideCtrl.setFixedMode(false);
assert.equal(wideRenderer.calls.at(-1).updateStyle, false, "leaving fixed-mode goes back to CSS-driven sizing");

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

function createStubEventCanvas(width, height) {
  const listeners = new Map();
  return {
    listeners,
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height, right: width, bottom: height };
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    dispatch(type, init) {
      const event = { type, preventDefault() {}, ...init };
      for (const listener of listeners.get(type) ?? []) listener(event);
    }
  };
}
