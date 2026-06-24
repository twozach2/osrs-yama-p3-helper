import assert from "node:assert/strict";
import * as THREE from "three";
import { PixelPostFx } from "../src/postFx.js";

function createStubRenderer(bufferWidth = 1200, bufferHeight = 720) {
  const calls = [];
  let currentTarget = null;
  return {
    calls,
    get currentTarget() {
      return currentTarget;
    },
    setRenderTarget(target) {
      currentTarget = target ?? null;
      calls.push({ kind: "setRenderTarget", target: target ?? null });
    },
    clear() {
      calls.push({ kind: "clear", target: currentTarget });
    },
    render(scene, camera) {
      calls.push({ kind: "render", scene, camera, target: currentTarget });
    },
    getDrawingBufferSize(target) {
      target.set(bufferWidth, bufferHeight);
      return target;
    }
  };
}

const renderer = createStubRenderer(1200, 720);
const postFx = new PixelPostFx({ renderer, scale: 3 });
assert.equal(postFx.enabled, false, "disabled by default");
assert.equal(postFx.scale, 3, "scale stored as-is");
assert.equal(postFx.target, null, "no render target until first enabled render");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

// Disabled path: should just render scene to screen with no target setup.
postFx.render(scene, camera);
assert.equal(postFx.target, null, "disabled render does not allocate a target");
const disabledCalls = renderer.calls.slice();
assert.equal(disabledCalls.length, 2, "disabled render makes exactly 2 renderer calls");
assert.deepEqual(
  disabledCalls.map((c) => c.kind),
  ["setRenderTarget", "render"],
  "disabled path: setRenderTarget(null) then render(scene, camera)"
);
assert.equal(disabledCalls[0].target, null, "disabled render targets the screen");
assert.equal(disabledCalls[1].scene, scene, "disabled render passes the main scene");
assert.equal(disabledCalls[1].camera, camera, "disabled render passes the main camera");

// Enabled path: should allocate a downsampled target and do scene→target→screen.
renderer.calls.length = 0;
postFx.setEnabled(true);
postFx.render(scene, camera);
assert.ok(postFx.target, "enabled render allocates a render target");
assert.equal(postFx.targetSize.x, 400, "target width = buffer / scale (1200 / 3)");
assert.equal(postFx.targetSize.y, 240, "target height = buffer / scale (720 / 3)");
assert.equal(postFx.target.texture.magFilter, THREE.NearestFilter,
  "target uses NearestFilter magnification so the blit looks chunky");
assert.equal(postFx.target.texture.minFilter, THREE.NearestFilter,
  "target uses NearestFilter minification too");
assert.equal(postFx.quadMaterial.map, postFx.target.texture,
  "fullscreen quad samples from the target texture");

const enabledKinds = renderer.calls.map((c) => c.kind);
assert.deepEqual(
  enabledKinds,
  ["setRenderTarget", "clear", "render", "setRenderTarget", "render"],
  "enabled path: bind target, clear, render scene, bind screen, render quad"
);
assert.equal(renderer.calls[0].target, postFx.target,
  "first setRenderTarget binds the downsampled target");
assert.equal(renderer.calls[2].scene, scene,
  "scene is rendered to the target");
assert.equal(renderer.calls[3].target, null,
  "second setRenderTarget binds the screen");
assert.equal(renderer.calls[4].scene, postFx.quadScene,
  "final render blits the fullscreen quad to the screen");
assert.equal(renderer.calls[4].camera, postFx.quadCamera,
  "fullscreen quad is rendered with its own ortho camera");

// Scale change disposes and re-creates the target on next render.
const oldTarget = postFx.target;
postFx.setScale(4);
assert.equal(postFx.target, null, "setScale disposes the existing target");
postFx.render(scene, camera);
assert.ok(postFx.target, "render re-allocates target at the new scale");
assert.notStrictEqual(postFx.target, oldTarget, "new target is a distinct object");
assert.equal(postFx.targetSize.x, 300, "new target width = 1200 / 4");
assert.equal(postFx.targetSize.y, 180, "new target height = 720 / 4");

// Toggling off restores the bypass path; previous target stays allocated.
const targetBeforeDisable = postFx.target;
postFx.setEnabled(false);
renderer.calls.length = 0;
postFx.render(scene, camera);
assert.equal(postFx.target, targetBeforeDisable,
  "disabling does not implicitly dispose the target");
assert.deepEqual(
  renderer.calls.map((c) => c.kind),
  ["setRenderTarget", "render"],
  "disabled path is restored cleanly"
);

// Resize: buffer changes -> target reallocates on next enabled render.
const resizeRenderer = createStubRenderer(900, 540);
const resizeFx = new PixelPostFx({ renderer: resizeRenderer, scale: 3 });
resizeFx.setEnabled(true);
resizeFx.render(scene, camera);
assert.equal(resizeFx.targetSize.x, 300, "900/3 = 300");
assert.equal(resizeFx.targetSize.y, 180, "540/3 = 180");

// dispose() cleans up.
resizeFx.dispose();
assert.equal(resizeFx.target, null, "dispose() clears the target");

console.log("postFx tests passed");
