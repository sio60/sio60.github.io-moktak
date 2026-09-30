"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const scriptPath = path.join(__dirname, "..", "composer-viewport.js");

// Geometry/event regression tests, not an Android or Instagram native-keyboard
// emulator. Passing these does not establish that a device exposes useful API
// measurements or that its keyboard actually leaves the composer visible.
function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, details = {}) {
      const event = { type, button: 0, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...details };
      for (const listener of listeners.get(type) || []) listener(event);
      return event;
    },
  };
}

function createHarness({ visualViewport = true, resizeObserver = true,
  virtualKeyboard = false, navigator = true, overlaySetter = "accept", rectGetter = "accept" } = {}) {
  const properties = new Map();
  const writes = [];
  const classNames = new Set();
  const callbacks = new Map();
  const timers = new Map();
  const observed = [];
  const geometry = { appHeight: 800, stageHeight: 420, sceneSize: 288,
    appPadding: "16px 18px 24px", skyBottom: 820, slotLeft: 18, slotWidth: 324 };
  let nextFrame = 0;
  let nextTimer = 0;
  let clock = 0;
  let overlays = false;
  let overlayWrites = 0;
  let keyboardReads = 0;
  let scrollCalls = 0;
  const rect = (left, top, width, height) => ({ left, top, right: left + width,
    bottom: top + height, width, height });
  const app = {
    getBoundingClientRect() { return rect(0, 0, 360, geometry.appHeight); },
    style: {
      setProperty(name, value) { properties.set(name, String(value)); writes.push([name, String(value)]); },
      removeProperty(name) { properties.delete(name); },
      getPropertyValue(name) { return properties.get(name) || ""; },
    },
    classList: {
      toggle(name, enabled) { if (enabled) classNames.add(name); else classNames.delete(name); },
      contains(name) { return classNames.has(name); },
      remove(...names) { names.forEach((name) => classNames.delete(name)); },
    },
  };
  const stage = { getBoundingClientRect() { return rect(0, 230, 360, geometry.stageHeight); } };
  const scene = { getBoundingClientRect() { return rect(36, 260, geometry.sceneSize, geometry.sceneSize); } };
  const intro = { getBoundingClientRect() { return rect(0, 40, 360, 190); } };
  const copy = {};
  const kicker = {};
  const footer = {};
  const sky = { getBoundingClientRect() { return rect(0, 0, 360, geometry.skyBottom); } };
  const input = { ...eventTarget(), scrollIntoView() { scrollCalls++; } };
  const submit = eventTarget();
  const form = {
    ...eventTarget(),
    contains(element) { return [form, input, submit].includes(element); },
    getBoundingClientRect() {
      const bounds = wrap.getBoundingClientRect();
      return rect(bounds.left, bounds.top + 8, bounds.width, 54);
    },
    querySelector(selector) { assert.equal(selector, 'button[type="submit"]'); return submit; },
  };
  const documentElement = { clientHeight: 800, clientWidth: 360 };
  const slot = { getBoundingClientRect() { return rect(geometry.slotLeft, 680, geometry.slotWidth, 80); } };
  const wrap = {
    getBoundingClientRect() {
      const focused = classNames.has("is-keyboard-docked");
      // Focus hides the metadata and changes padding: 80px normal, 70px docked.
      const height = focused ? 70 : 80;
      const top = focused ? Number.parseFloat(properties.get("--composer-top")) || 0 : 680;
      return rect(geometry.slotLeft, top, geometry.slotWidth, height);
    },
  };
  const document = {
    activeElement: null, documentElement,
    querySelector(selector) {
      const elements = { "#app": app, "#messageForm": form, "#messageInput": input,
        "#messageSky": sky, "#stage": stage, "#moktakScene": scene,
        ".intro": intro, ".intro-copy": copy, ".intro-kicker": kicker, "footer": footer,
        ".composer-slot": slot, ".composer-wrap": wrap };
      assert.ok(selector in elements, `Unexpected selector: ${selector}`);
      return elements[selector];
    },
  };
  const viewport = visualViewport ? { ...eventTarget(), height: 800, width: 360,
    offsetTop: 0, offsetLeft: 0, scale: 1 } : undefined;
  const keyboardRect = rect(0, 0, 0, 0);
  const keyboard = virtualKeyboard ? {
    ...eventTarget(),
    get boundingRect() {
      keyboardReads++;
      if (rectGetter === "throw") throw new Error("WebView rejected keyboard geometry");
      return keyboardRect;
    },
    get overlaysContent() { return overlays; },
    set overlaysContent(value) {
      overlayWrites++;
      if (overlaySetter === "throw") throw new Error("WebView rejected overlaysContent");
      if (overlaySetter === "accept") overlays = value;
    },
  } : undefined;
  const window = {
    ...eventTarget(), innerHeight: 800, innerWidth: 360, visualViewport: viewport,
    scrollTo() { scrollCalls++; }, scrollBy() { scrollCalls++; },
    getComputedStyle(element) {
      assert.ok([app, intro, copy, kicker, footer].includes(element));
      return { padding: geometry.appPadding, marginTop: "8px", marginBottom: "6px", display: "block" };
    },
    requestAnimationFrame(callback) { const id = ++nextFrame; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    setTimeout(callback, delay = 0) {
      const id = ++nextTimer; timers.set(id, { callback, delay, due: clock + delay }); return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  if (navigator) window.navigator = { virtualKeyboard: keyboard };
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; }
    observe(element) { observed.push(element); }
  }
  const context = { window, document, console, requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame };
  if (resizeObserver) context.ResizeObserver = FakeResizeObserver;
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  function flushFrame() {
    const queued = [...callbacks.values()]; callbacks.clear();
    for (const callback of queued) callback(16);
  }
  function advanceTime(milliseconds) {
    const targetTime = clock + milliseconds;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= targetTime)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next; clock = timer.due; timers.delete(id); timer.callback();
    }
    clock = targetTime;
  }
  function focus({ flush = true } = {}) {
    document.activeElement = input; input.dispatch("focus"); form.dispatch("focusin", { target: input });
    if (flush) flushFrame();
  }
  function blur() {
    document.activeElement = null; input.dispatch("blur");
    form.dispatch("focusout", { target: input, relatedTarget: null }); flushFrame();
  }
  return { app, input, submit, form, document, window, viewport, keyboard, keyboardRect,
    properties, writes, classNames, callbacks, timers, observed, geometry, stage, scene, sky, slot, wrap,
    flushFrame, advanceTime, focus, blur, get overlayWrites() { return overlayWrites; },
    get keyboardReads() { return keyboardReads; }, get scrollCalls() { return scrollCalls; } };
}

function pixels(harness, property) {
  const value = harness.properties.get(property);
  assert.match(value || "", /^-?\d+(?:\.\d+)?px$/, `${property} should use CSS pixels`);
  return Number.parseFloat(value);
}
function assertDocked(harness, bottom) {
  assert.equal(harness.classNames.has("is-keyboard-docked"), true);
  assert.equal(pixels(harness, "--composer-top"), bottom - 70);
  assert.equal(harness.wrap.getBoundingClientRect().bottom, bottom);
}
function assertNativeFlow(harness) {
  assert.equal(harness.classNames.has("is-keyboard-docked"), false);
  assert.equal(harness.properties.has("--composer-top"), false);
  assert.equal(harness.wrap.getBoundingClientRect().top, 680);
  assert.equal(harness.scrollCalls, 0, "native focus reveal must not fight scripted scrolling");
}
function restGeometry(harness) {
  return Object.fromEntries(["--composer-height", "--rest-app-height", "--rest-stage-height",
    "--rest-scene-size", "--rest-app-padding", "--rest-intro-height", "--rest-intro-margin",
    "--rest-copy-display", "--rest-kicker-margin", "--rest-footer-display"].map((name) => [name, harness.properties.get(name)]));
}

test("focus synchronously preserves normal geometry but does not dock without a keyboard signal", () => {
  const h = createHarness(); h.focus({ flush: false });
  assert.equal(h.classNames.has("is-composing"), true); assertNativeFlow(h);
  assert.deepEqual(restGeometry(h), { "--composer-height": "80px", "--rest-app-height": "800px",
    "--rest-stage-height": "420px", "--rest-scene-size": "288px", "--rest-app-padding": "16px 18px 24px",
    "--rest-intro-height": "190px", "--rest-intro-margin": "8px", "--rest-copy-display": "block",
    "--rest-kicker-margin": "6px", "--rest-footer-display": "block" });
  assert.equal(h.properties.has("--app-height"), false, "do not shrink the app shell");
  assert.equal(h.properties.has("--composer-inset"), false, "do not invent a keyboard inset");
  h.viewport.height = 450; h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 450);
  assert.equal(pixels(h, "--composer-left"), 18); assert.equal(pixels(h, "--composer-width"), 324);
});
test("visual viewport pan contributes offsetTop exactly once", () => {
  const h = createHarness(); h.focus(); h.viewport.height = 450; h.viewport.offsetTop = 80;
  h.viewport.dispatch("scroll"); h.flushFrame(); assertDocked(h, 530);
});
test("resizes-content keyboard docks without a second upward offset", () => {
  const h = createHarness(); h.focus(); h.document.documentElement.clientHeight = 450;
  h.window.innerHeight = 450; h.viewport.height = 450; h.viewport.dispatch("resize"); h.flushFrame();
  assertDocked(h, 450); assert.equal(pixels(h, "--rest-app-height"), 800);
});
test("keyboard close while focused restores native flow without recapturing the scene", () => {
  const h = createHarness(); h.focus(); const frozen = restGeometry(h);
  h.viewport.height = 450; h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 450);
  h.viewport.height = 800; h.viewport.dispatch("resize"); h.flushFrame(); assertNativeFlow(h);
  assert.deepEqual(restGeometry(h), frozen);
  assert.equal(h.classNames.has("is-composing"), true);
});
test("page stage scene padding and slot geometry stay captured once throughout a focus session", () => {
  const h = createHarness(); h.focus(); const frozen = restGeometry(h);
  Object.assign(h.geometry, { appHeight: 470, stageHeight: 276, sceneSize: 240,
    appPadding: "11px 18px 8px", slotLeft: 22, slotWidth: 400 });
  h.window.innerHeight = 470; h.viewport.height = 470; h.window.dispatch("resize"); h.flushFrame();
  assertDocked(h, 470); assert.deepEqual(restGeometry(h), frozen);
  assert.equal(pixels(h, "--composer-left"), 22); assert.equal(pixels(h, "--composer-width"), 400);
  h.advanceTime(800); h.flushFrame(); assert.deepEqual(restGeometry(h), frozen);
  for (const property of Object.keys(frozen)) {
    assert.equal(h.writes.filter(([name]) => name === property).length, 1, property);
  }
  h.blur(); h.focus(); assert.equal(pixels(h, "--rest-stage-height"), 276);
  assert.equal(pixels(h, "--rest-scene-size"), 240);
});
test("shrinking innerHeight wins when VisualViewport is stale", () => {
  const h = createHarness(); h.window.innerHeight = 440; h.focus(); assertDocked(h, 440);
  assert.equal(pixels(h, "--float-distance"), -405);
});
test("innerHeight works without VisualViewport or ResizeObserver", () => {
  const h = createHarness({ visualViewport: false, resizeObserver: false }); h.focus();
  h.window.innerHeight = 430; h.window.dispatch("resize"); h.flushFrame(); assertDocked(h, 430);
});
test("zero layout height falls back to valid inner and visual measurements", () => {
  const h = createHarness(); h.document.documentElement.clientHeight = 0;
  h.viewport.height = 460; h.focus(); assertDocked(h, 460);
});
test("nonpositive and nonfinite values cannot invent a docking edge", () => {
  const h = createHarness(); h.window.innerHeight = 0; h.viewport.height = Number.NaN; h.focus();
  assertNativeFlow(h); h.window.innerHeight = Number.POSITIVE_INFINITY; h.viewport.height = 450;
  h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 450);
});
test("VirtualKeyboard overlay mode is never enabled and its rectangle is never read", () => {
  const h = createHarness({ virtualKeyboard: true });
  assert.equal(h.keyboard.overlaysContent, false); assert.equal(h.overlayWrites, 0);
  Object.assign(h.keyboardRect, { top: 420, width: 360, height: 380 }); h.focus(); assertNativeFlow(h);
  Object.assign(h.keyboardRect, { top: 400, height: 400 });
  h.keyboard.dispatch("geometrychange"); h.flushFrame(); assertNativeFlow(h);
  assert.equal(h.keyboardReads, 0);
});
test("throwing and ignored overlay setters are untouched", () => {
  for (const overlaySetter of ["throw", "ignore"]) {
    const h = createHarness({ virtualKeyboard: true, overlaySetter });
    assert.equal(h.keyboard.overlaysContent, false); assert.equal(h.overlayWrites, 0);
    h.viewport.height = 450; h.focus(); assertDocked(h, 450);
  }
});
test("a throwing keyboard geometry getter is never accessed", () => {
  const h = createHarness({ virtualKeyboard: true, rectGetter: "throw" });
  h.viewport.height = 470; h.focus(); assertDocked(h, 470); assert.equal(h.keyboardReads, 0);
});
test("corrupted Android VK top66 cannot pull input to the top when VV reports434", () => {
  const h = createHarness({ virtualKeyboard: true }); h.viewport.height = 434;
  Object.assign(h.keyboardRect, { top: 66, width: 360, height: 366 });
  h.focus(); assertDocked(h, 434); assert.equal(pixels(h, "--composer-top"), 364);
  assert.equal(h.keyboardReads, 0); assert.equal(h.overlayWrites, 0);
});
test("no VK rectangle supplies a docking edge without a viewport resize", () => {
  const h = createHarness({ virtualKeyboard: true }); h.focus();
  for (const bounds of [{ top: 300, width: 180, height: 300 },
    { top: 420, width: 360, height: 0 }, { top: 0, width: 360, height: 300 }]) {
    Object.assign(h.keyboardRect, bounds); h.keyboard.dispatch("geometrychange"); h.flushFrame();
    assertNativeFlow(h);
  }
  assert.equal(h.keyboardReads, 0);
});
test("meaningfully resized VisualViewport is authoritative over stale smaller innerHeight and VK", () => {
  const h = createHarness({ virtualKeyboard: true }); h.window.innerHeight = 200;
  h.viewport.height = 430; h.viewport.offsetTop = 20;
  Object.assign(h.keyboardRect, { top: 66, width: 360, height: 360 }); h.focus(); assertDocked(h, 450);
  assert.equal(pixels(h, "--float-distance"), -396);
  h.window.innerHeight = 800; h.viewport.height = 800; h.viewport.offsetTop = 0;
  Object.assign(h.keyboardRect, { top: 0, height: 0 }); h.viewport.dispatch("resize");
  h.flushFrame(); assertNativeFlow(h);
});
test("missing navigator does not prevent the visual viewport fallback", () => {
  const h = createHarness({ navigator: false }); h.viewport.height = 470; h.focus(); assertDocked(h, 470);
});
test("window scroll updates changed metrics without a viewport event", () => {
  const h = createHarness(); h.focus(); h.window.innerHeight = 425;
  h.window.dispatch("scroll"); h.flushFrame(); assertDocked(h, 425);
});
test("one bounded350ms settle check catches delayed metrics without repeated polling", () => {
  const h = createHarness(); h.focus();
  assert.deepEqual([...h.timers.values()].map((t) => t.delay), [350]);
  h.window.innerHeight = 430; h.advanceTime(350); h.flushFrame(); assertDocked(h, 430);
  assert.equal(h.timers.size, 0); h.advanceTime(5000); assert.equal(h.callbacks.size, 0);
});
test("repeated focus and blur replace timers instead of accumulating them", () => {
  const h = createHarness(); h.focus();
  for (let cycle = 0; cycle < 4; cycle++) {
    const opening = [...h.timers.keys()]; h.blur(); assert.ok(h.timers.size <= 1);
    assert.ok(opening.every((id) => !h.timers.has(id)));
    const closing = [...h.timers.keys()]; h.focus(); assert.equal(h.timers.size, 1);
    assert.ok(closing.every((id) => !h.timers.has(id)));
  }
  h.blur(); h.advanceTime(1000); h.flushFrame();
  assert.equal(h.timers.size, 0); assert.equal(h.callbacks.size, 0);
});
test("pagehide cancels the settle timers and queued animation frame", () => {
  const h = createHarness(); h.focus(); h.window.dispatch("resize");
  assert.equal(h.callbacks.size, 1); assert.equal(h.timers.size, 1); h.window.dispatch("pagehide");
  assert.equal(h.callbacks.size, 0); assert.equal(h.timers.size, 0);
  h.advanceTime(1000); assert.equal(h.callbacks.size, 0);
});
test("no-signal browsers retain native-flow input rather than fixing it behind an invisible keyboard", () => {
  for (const options of [{}, { visualViewport: false, resizeObserver: false }, { virtualKeyboard: true }]) {
    const h = createHarness(options); h.focus(); h.advanceTime(800); h.flushFrame(); assertNativeFlow(h);
    assert.equal(pixels(h, "--rest-app-height"), 800);
  }
  // Native host focus scrolling can still be broken; do not claim exact docking.
});
test("viewport and window event bursts coalesce to one frame", () => {
  const h = createHarness(); h.flushFrame(); h.viewport.dispatch("resize"); h.viewport.dispatch("scroll");
  h.window.dispatch("resize"); h.window.dispatch("orientationchange"); h.window.dispatch("pageshow");
  assert.equal(h.callbacks.size, 1); h.flushFrame(); assert.equal(h.callbacks.size, 0);
});
test("blur clears temporary geometry without removing unrelated app properties", () => {
  const h = createHarness(); h.app.style.setProperty("--brand-setting", "keep");
  h.viewport.height = 450; h.focus(); h.blur(); assert.equal(h.classNames.has("is-composing"), false);
  assert.equal(h.classNames.has("is-keyboard-docked"), false);
  for (const property of ["--composer-height", "--composer-left", "--composer-width", "--composer-top",
    "--message-bottom", "--float-distance", "--rest-app-height", "--rest-stage-height", "--rest-scene-size", "--rest-app-padding",
    "--rest-intro-height", "--rest-intro-margin", "--rest-copy-display", "--rest-kicker-margin", "--rest-footer-display"]) {
    assert.equal(h.properties.has(property), false, `${property} should clear on blur`);
  }
  assert.equal(h.properties.get("--brand-setting"), "keep");
});
test("message origin uses actual sky and focused form rectangles, not layout clientHeight", () => {
  const h = createHarness(); h.viewport.height = 450; h.focus(); assertDocked(h, 450);
  assert.equal(pixels(h, "--message-bottom"), 448); // 820 - (380 + 8) + 16
  assert.equal(pixels(h, "--float-distance"), -414);
  h.geometry.skyBottom = 860; h.viewport.offsetTop = 80; h.viewport.dispatch("scroll"); h.flushFrame();
  assert.equal(pixels(h, "--message-bottom"), 408); // 860 - (460 + 8) + 16
});
test("implausibly short viewport40px does not jump input to the top", () => {
  const h = createHarness(); h.viewport.offsetTop = 100; h.viewport.height = 40; h.focus();
  assertNativeFlow(h);
});
test("a larger viewport without keyboard reduction does not invent a fixed edge", () => {
  const h = createHarness(); h.viewport.height = 810; h.viewport.offsetTop = 2; h.focus(); assertNativeFlow(h);
});
test("primary send preserves input focus but other pointer actions are untouched", () => {
  const h = createHarness(); h.focus();
  assert.equal(h.submit.dispatch("pointerdown", { button: 0 }).defaultPrevented, true);
  assert.equal(h.submit.dispatch("pointerdown", { button: 2 }).defaultPrevented, false);
  h.document.activeElement = null;
  assert.equal(h.submit.dispatch("pointerdown", { button: 0 }).defaultPrevented, false);
});
test("moving focus within the form preserves composing mode and original scene geometry", () => {
  const h = createHarness(); h.focus(); const frozen = restGeometry(h); h.document.activeElement = h.submit;
  h.input.dispatch("blur", { relatedTarget: h.submit }); h.form.dispatch("focusout", { relatedTarget: h.submit });
  h.form.dispatch("focusin", { target: h.submit }); h.flushFrame();
  assert.equal(h.classNames.has("is-composing"), true); assert.deepEqual(restGeometry(h), frozen);
});
test("ResizeObserver watches the original flow slot and actual composer", () => {
  const h = createHarness(); assert.ok(h.observed.includes(h.slot)); assert.ok(h.observed.includes(h.wrap));
});

test("viewport panning does not cancel a keyboard reduction when the bottom edge is unchanged", () => {
  const h = createHarness(); h.focus(); h.viewport.height = 450; h.viewport.offsetTop = 350;
  h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 800);
  assert.equal(pixels(h, "--composer-top"), 730);
});

test("toolbar-sized changes do not dock and96px reduction starts docking", () => {
  const h = createHarness(); h.focus();
  for (const height of [760, 720, 705]) {
    h.viewport.height = height; h.viewport.dispatch("resize"); h.flushFrame(); assertNativeFlow(h);
  }
  h.viewport.height = 704; h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 704);
});

test("docking hysteresis avoids flicker and ends at40px remaining reduction", () => {
  const h = createHarness(); h.focus();
  for (const height of [500, 720, 750, 759]) {
    h.viewport.height = height; h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, height);
  }
  h.viewport.height = 760; h.viewport.dispatch("resize"); h.flushFrame(); assertNativeFlow(h);
});

test("pinch zoom is not a keyboard signal even if innerHeight also falls", () => {
  const h = createHarness(); h.focus(); h.viewport.scale = 2; h.viewport.height = 400;
  h.window.innerHeight = 400; h.viewport.dispatch("resize"); h.flushFrame(); assertNativeFlow(h);
  h.viewport.scale = 1; h.viewport.height = 450; h.viewport.dispatch("resize"); h.flushFrame();
  assertDocked(h, 450);
});

test("resting baseline survives blur before the keyboard closing animation finishes", () => {
  const h = createHarness(); h.focus(); h.viewport.height = 450;
  h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 450);
  h.blur(); assertNativeFlow(h); h.focus(); assertDocked(h, 450);
  h.viewport.height = 800; h.viewport.dispatch("resize"); h.flushFrame(); assertNativeFlow(h);
});

test("resting baseline retains the maximum height for the same width", () => {
  const h = createHarness(); h.viewport.height = 740; h.window.innerHeight = 740;
  h.window.dispatch("resize"); h.flushFrame(); h.focus(); assertNativeFlow(h);
  h.viewport.height = 700; h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 700);
});

test("orientation change while focused resets the baseline instead of pretending a keyboard opened", () => {
  const h = createHarness(); h.focus(); h.viewport.height = 450;
  h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 450);
  h.document.documentElement.clientWidth = 800; h.window.innerWidth = 800;
  h.viewport.width = 800; h.viewport.height = 360; h.window.innerHeight = 360;
  h.document.documentElement.clientHeight = 360;
  h.window.dispatch("orientationchange"); h.flushFrame(); assertNativeFlow(h);
  h.viewport.height = 240; h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 240);
});

test("orientation change while unfocused replaces the portrait baseline", () => {
  const h = createHarness(); h.document.documentElement.clientWidth = 800; h.window.innerWidth = 800;
  h.viewport.width = 800; h.viewport.height = 360; h.window.innerHeight = 360;
  h.document.documentElement.clientHeight = 360;
  h.window.dispatch("orientationchange"); h.flushFrame(); h.focus(); assertNativeFlow(h);
  h.viewport.height = 280; h.viewport.dispatch("resize"); h.flushFrame(); assertNativeFlow(h);
});

test("invalid unfocused innerHeight cannot poison the remembered resting baseline", () => {
  const h = createHarness(); h.window.innerHeight = Number.POSITIVE_INFINITY;
  h.window.dispatch("resize"); h.flushFrame();
  h.window.innerHeight = 800; h.window.dispatch("resize"); h.flushFrame();
  h.focus(); assertNativeFlow(h);
});

test("an invalid intermediate reading exits docking instead of clamping the input to the screen top", () => {
  const h = createHarness(); h.focus(); h.viewport.height = 450;
  h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 450);
  h.viewport.height = 1; h.viewport.dispatch("resize"); h.flushFrame(); assertNativeFlow(h);
  h.viewport.height = 450; h.viewport.dispatch("resize"); h.flushFrame(); assertDocked(h, 450);
});

test("CSS fixes only the keyboard-docked composer, not every focused input", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const composerRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector, body]) => selector.includes(".composer-wrap") && /position\s*:\s*fixed/.test(body));
  assert.ok(composerRules.length > 0, "there must be a measured-keyboard docking rule");
  for (const [, selector] of composerRules) {
    assert.ok(selector.includes(".is-keyboard-docked"), `unconditional fixed composer rule: ${selector}`);
  }
  assert.match(css, /\.app\.is-composing\s*\{[^}]*min-height:\s*var\(--rest-app-height\)/);
  assert.match(css, /\.app\.is-composing\s+\.stage\s*\{[^}]*--scene-size:\s*var\(--rest-scene-size\)/);
});
