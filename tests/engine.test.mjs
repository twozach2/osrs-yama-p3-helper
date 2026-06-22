import assert from "node:assert/strict";
import { SimulatorEngine } from "../src/engine.js";
import { coordToTile } from "../src/roboflyData.js";
import { YAMA_P3_SCENARIO } from "../src/yamaP3Scenario.js";

const engine = new SimulatorEngine(YAMA_P3_SCENARIO);

assert.equal(engine.state.tick, 0);
assert.deepEqual(engine.state.player, coordToTile("F3"));

engine.queueMove(coordToTile("F5"));
engine.advanceTick();
assert.deepEqual(engine.state.player, coordToTile("F5"), "run should move up to two path steps per tick");

engine.setStrictWaypoints(true);
engine.advanceTick();
assert.equal(engine.state.mistakes.length, 0, "strict waypoint scoring should allow the sourced tick 1 tile");

engine.reset("roboflyFlippedCycle");
engine.setRunEnabled(false);
engine.queueMove(coordToTile("J5"));
engine.advanceTick();
assert.deepEqual(engine.state.player, coordToTile("J4"), "walk should move one path step per tick");

engine.reset("roboflySource");
engine.queueMove(coordToTile("D11"));
for (let i = 0; i < 9; i += 1) {
  engine.advanceTick();
}
assert.ok(engine.state.eventLog.some((item) => item.text.includes("Meteor 1")), "meteor schedule should be active");

console.log("engine tests passed");
