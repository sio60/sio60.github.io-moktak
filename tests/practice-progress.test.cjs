"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { getPracticeProgress, getMilestone } = require("../practice-progress.js");

test("a new practice starts hidden, with a full round remaining", () => {
  assert.deepEqual(getPracticeProgress(0), {
    count: 0, reveal: 0, completedRounds: 0,
    remaining: 108, cycleProgress: 0, nextTarget: 108,
  });
});

test("the figure progressively appears before the first 108 taps", () => {
  for (const count of [1, 12, 36, 72, 107]) {
    const progress = getPracticeProgress(count);
    assert.equal(progress.reveal, count / 108);
    assert.equal(progress.cycleProgress, count / 108);
    assert.equal(progress.remaining, 108 - count);
    assert.equal(progress.nextTarget, 108);
    assert.equal(progress.completedRounds, 0);
  }
});

test("exact completions retain full progress and point to the next round", () => {
  for (const count of [108, 216, 324, 1080]) {
    assert.deepEqual(getPracticeProgress(count), {
      count, reveal: 1, completedRounds: count / 108,
      remaining: 108, cycleProgress: 1, nextTarget: count + 108,
    });
  }
});

test("the statue stays revealed while subsequent rounds restart", () => {
  assert.deepEqual(getPracticeProgress(109), {
    count: 109, reveal: 1, completedRounds: 1,
    remaining: 107, cycleProgress: 1 / 108, nextTarget: 216,
  });
  assert.equal(getPracticeProgress(215).remaining, 1);
  assert.equal(getPracticeProgress(217).nextTarget, 324);
});

test("invalid counts stay safe and do not throw or coerce objects", () => {
  const hostileObject = { valueOf() { throw new Error("must not coerce"); } };
  for (const value of [undefined, null, NaN, Infinity, -Infinity, -4, "108", true, {}, [], Symbol(), 108n, hostileObject]) {
    const progress = getPracticeProgress(value);
    assert.equal(progress.count, 0);
    assert.equal(progress.reveal, 0);
    assert.equal(progress.remaining, 108);
  }
  assert.equal(getPracticeProgress(12.9).count, 12);
  assert.equal(getPracticeProgress(Number.MAX_VALUE).count, Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger(getPracticeProgress(Number.MAX_VALUE).count));
});

test("first-round hints trigger exactly on their boundaries", () => {
  for (const count of [12, 36, 72]) {
    assert.equal(getMilestone(count - 2, count - 1), null);
    assert.equal(getMilestone(count - 1, count).count, count);
    assert.equal(getMilestone(count - 1, count).kind, "hint");
    assert.equal(getMilestone(count, count + 1), null);
  }
});

test("every completed 108-tap round is rewarded, and only once", () => {
  for (const count of [108, 216, 324, 1080]) {
    const milestone = getMilestone(count - 1, count);
    assert.equal(milestone.count, count);
    assert.equal(milestone.kind, "complete");
    assert.equal(milestone.title, "108타, 잠깐의 이너피스.");
    assert.equal(getMilestone(count, count), null);
    assert.equal(getMilestone(count, count + 1), null);
  }
});

test("a jump selects only the highest newly crossed milestone", () => {
  assert.equal(getMilestone(0, 40).count, 36);
  assert.equal(getMilestone(11, 100).count, 72);
  assert.equal(getMilestone(0, 200).count, 108);
  assert.equal(getMilestone(107, 325).count, 324);
  assert.equal(getMilestone(216, 220), null);
});

test("hints do not repeat in later rounds", () => {
  for (const count of [120, 144, 180, 228, 252, 288]) {
    assert.equal(getMilestone(count - 1, count), null);
  }
});

test("restored, declining, or absent prior counts do not trigger a reward", () => {
  for (const count of [0, 12, 36, 72, 108, 216, 1000]) {
    assert.equal(getMilestone(count, count), null);
    assert.equal(getMilestone(count + 1, count), null);
    assert.equal(getMilestone(undefined, count), null);
    assert.equal(getMilestone(null, count), null);
  }
  assert.equal(getMilestone(999, 0), null);
});

test("malformed milestone inputs cannot create phantom completion rewards", () => {
  for (const value of [NaN, Infinity, -Infinity, "108", {}, Symbol(), 108n]) {
    assert.equal(getMilestone(0, value), null);
    assert.equal(getMilestone(value, 108), null);
  }
  assert.equal(getMilestone(108, -1), null);
  assert.equal(getMilestone(11.9, 12.1).count, 12);
  assert.equal(getMilestone(12.1, 12.9), null);
});

test("milestone data cannot mutate future rewards", () => {
  const first = getMilestone(11, 12);
  first.title = "changed";
  assert.equal(getMilestone(11, 12).title, "무언가 보이기 시작해요.");
});

test("classic browser script exposes the API without requiring Node or DOM", () => {
  const browser = { window: {} };
  const source = fs.readFileSync(path.join(__dirname, "..", "practice-progress.js"), "utf8");
  vm.runInNewContext(source, browser);
  const api = browser.window.InnerpeacePracticeProgress;
  assert.equal(typeof api.getPracticeProgress, "function");
  assert.equal(typeof api.getMilestone, "function");
  assert.equal(api.getPracticeProgress(108).reveal, 1);
  assert.equal(api.getMilestone(107, 108).kind, "complete");
});
