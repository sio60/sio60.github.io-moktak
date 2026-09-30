"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "composer-viewport.js");

// These are measurement/event regression tests, not a real Android WebView or
// OS-keyboard emulator. Passing them does not verify on-device input visibility.

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== listener));
    },
    dispatch(type, details = {}) {
      const event = {
        type,
        button: 0,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...details,
      };
      for (const listener of listeners.get(type) || []) listener(event);
      return event;
    },
  };
}

function createHarness({ visualViewport = true, resizeObserver = true, virtualKeyboard = false, navigator = true, search = "" } = {}) {
  const properties = new Map();
  const classNames = new Set();
  const callbacks = new Map();
  const timers = new Map();
  const observed = [];
  const appended = [];
  let nextFrame = 0;
  let nextTimer = 0;
  let clock = 0;

  const app = {
    append(element) { appended.push(element); },
    style: {
      setProperty(name, value) { properties.set(name, String(value)); },
      removeProperty(name) { const value = properties.get(name) || ""; properties.delete(name); return value; },
      getPropertyValue(name) { return properties.get(name) || ""; },
    },
    classList: {
      add(name) { classNames.add(name); },
      remove(name) { classNames.delete(name); },
      contains(name) { return classNames.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !classNames.has(name) : force;
        if (enabled) classNames.add(name);
        else classNames.delete(name);
        return enabled;
      },
    },
  };
  const input = eventTarget();
  input.value = "PRIVATE-MESSAGE-MUST-NOT-APPEAR";
  const submit = eventTarget();
  const form = {
    ...eventTarget(),
    contains(element) { return [form, input, submit].includes(element); },
    getBoundingClientRect() {
      const bounds = wrap.getBoundingClientRect();
      return { ...bounds, top: bounds.top + 8, height: 54, bottom: bounds.top + 62 };
    },
    querySelector(selector) {
      assert.equal(selector, 'button[type="submit"]');
      return submit;
    },
  };
  const documentElement = { clientHeight: 800, clientWidth: 360 };
  const slot = {
    style: app.style,
    getBoundingClientRect() { return { left: 18, right: 342, top: 680, bottom: 760, width: 324, height: 80 }; },
  };
  const wrap = {
    offsetHeight: 80,
    getBoundingClientRect() {
      const inset = Number.parseFloat(properties.get("--composer-inset")) || 0;
      const layoutHeight = documentElement.clientHeight || window.innerHeight;
      const bottom = classNames.has("is-composing") ? layoutHeight - inset : 760;
      return { left: 18, right: 342, top: bottom - 80, bottom, width: 324, height: 80 };
    },
  };
  const document = {
    activeElement: null,
    documentElement,
    createElement(tagName) {
      assert.equal(tagName, "pre");
      return {
        className: "",
        textContent: "",
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
    querySelector(selector) {
      const elements = { "#app": app, "#messageForm": form, "#messageInput": input, ".composer-slot": slot, ".composer-wrap": wrap };
      assert.ok(selector in elements, `Unexpected selector: ${selector}`);
      return elements[selector];
    },
  };
  const viewport = visualViewport ? { ...eventTarget(), height: 800, width: 360, offsetTop: 0, offsetLeft: 0, scale: 1 } : undefined;
  const keyboard = virtualKeyboard ? {
    ...eventTarget(),
    boundingRect: { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 },
    overlaysContent: false,
  } : undefined;
  const window = {
    ...eventTarget(),
    innerHeight: 800,
    innerWidth: 360,
    visualViewport: viewport,
    location: { search },
    requestAnimationFrame(callback) { const id = ++nextFrame; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    setTimeout(callback, delay = 0) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay, due: clock + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  if (navigator) window.navigator = { virtualKeyboard: keyboard };
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; }
    observe(element) { observed.push(element); }
    disconnect() {}
  }
  if (resizeObserver) window.ResizeObserver = FakeResizeObserver;
  const context = {
    window,
    document,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    URLSearchParams,
    console,
  };
  if (resizeObserver) context.ResizeObserver = FakeResizeObserver;
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });

  function flushFrame() {
    const queued = [...callbacks.values()];
    callbacks.clear();
    for (const callback of queued) callback(16);
  }
  function advanceTime(milliseconds) {
    const targetTime = clock + milliseconds;
    for (;;) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.due <= targetTime)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, timer] = next;
      clock = timer.due;
      timers.delete(id);
      timer.callback();
    }
    clock = targetTime;
  }
  function focus() {
    document.activeElement = input;
    input.dispatch("focus");
    form.dispatch("focusin", { target: input });
    flushFrame();
  }
  function blur() {
    document.activeElement = null;
    input.dispatch("blur");
    form.dispatch("focusout", { target: input, relatedTarget: null });
    flushFrame();
  }
  return { app, input, submit, form, document, window, viewport, keyboard, properties, classNames, callbacks, timers, observed, appended, slot, wrap, flushFrame, advanceTime, focus, blur };
}

function pixels(harness, property) {
  const value = harness.properties.get(property);
  assert.match(value || "", /^-?\d+(?:\.\d+)?px$/, `${property} should use CSS pixels`);
  return Number.parseFloat(value);
}

test("visual-only keyboard raises the focused composer by the hidden area", () => {
  const harness = createHarness();
  harness.viewport.height = 450;
  harness.focus();
  assert.equal(harness.classNames.has("is-composing"), true);
  assert.equal(pixels(harness, "--composer-inset"), 350);
  assert.equal(pixels(harness, "--composer-left"), 18);
  assert.equal(pixels(harness, "--composer-width"), 324);
  assert.equal(pixels(harness, "--composer-height"), 80);
});

test("visual viewport pan is subtracted instead of double-counted", () => {
  const harness = createHarness();
  harness.focus();
  harness.viewport.height = 450;
  harness.viewport.offsetTop = 80;
  harness.viewport.dispatch("scroll");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 270);
});

test("resizes-content keyboard needs no extra bottom offset", () => {
  const harness = createHarness();
  harness.document.documentElement.clientHeight = 450;
  harness.window.innerHeight = 450;
  harness.viewport.height = 450;
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 0);
  assert.equal(harness.classNames.has("is-composing"), true);
});

test("closing the keyboard resets the offset while the input remains focused", () => {
  const harness = createHarness();
  harness.viewport.height = 450;
  harness.focus();
  harness.viewport.height = 800;
  harness.viewport.dispatch("resize");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 0);
});

test("unchanged geometry without viewport APIs is an undetectable overlay limitation, not proof of visibility", () => {
  const harness = createHarness({ visualViewport: false, resizeObserver: false });
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 0);
  harness.window.dispatch("resize");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 0);
});

test("shrinking innerHeight is used even when VisualViewport is present but stale", () => {
  const harness = createHarness();
  harness.window.innerHeight = 440;
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 360);
  assert.equal(pixels(harness, "--float-distance"), -405);
});

test("innerHeight remains a usable keyboard signal without VisualViewport", () => {
  const harness = createHarness({ visualViewport: false, resizeObserver: false });
  harness.focus();
  harness.window.innerHeight = 430;
  harness.window.dispatch("resize");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 370);
});

test("document height may fall back to innerHeight when layout clientHeight is zero", () => {
  const harness = createHarness();
  harness.document.documentElement.clientHeight = 0;
  harness.window.innerHeight = 800;
  harness.viewport.height = 460;
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 340);
});

test("nonpositive and nonfinite viewport signals cannot poison a valid measured edge", () => {
  const harness = createHarness();
  harness.window.innerHeight = 0;
  harness.viewport.height = Number.NaN;
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 0);
  harness.viewport.height = 450;
  harness.window.innerHeight = Number.POSITIVE_INFINITY;
  harness.viewport.dispatch("resize");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 350);
});

test("available docked VirtualKeyboard geometry raises composer without enabling overlays", () => {
  const harness = createHarness({ virtualKeyboard: true });
  Object.assign(harness.keyboard.boundingRect, { top: 420, y: 420, width: 360, height: 380, bottom: 800 });
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 380);
  assert.equal(harness.keyboard.overlaysContent, false);
  Object.assign(harness.keyboard.boundingRect, { top: 400, y: 400, height: 400 });
  harness.keyboard.dispatch("geometrychange");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 400);
});

test("narrow floating, hidden, and zero-top keyboard rectangles do not supply a docked edge", () => {
  const harness = createHarness({ virtualKeyboard: true });
  harness.focus();
  for (const bounds of [
    { top: 300, width: 180, height: 300 },
    { top: 420, width: 360, height: 0 },
    { top: 0, width: 360, height: 300 },
  ]) {
    Object.assign(harness.keyboard.boundingRect, bounds);
    harness.keyboard.dispatch("geometrychange");
    harness.flushFrame();
    assert.equal(pixels(harness, "--composer-inset"), 0);
  }
});

test("all available valid edges compete and a valid keyboard hide restores full height", () => {
  const harness = createHarness({ virtualKeyboard: true });
  harness.window.innerHeight = 480;
  harness.viewport.height = 430;
  harness.viewport.offsetTop = 20;
  Object.assign(harness.keyboard.boundingRect, { top: 440, width: 216, height: 360 });
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 360);
  assert.equal(pixels(harness, "--float-distance"), -386);
  harness.window.innerHeight = 800;
  harness.viewport.height = 800;
  harness.viewport.offsetTop = 0;
  Object.assign(harness.keyboard.boundingRect, { top: 0, height: 0 });
  harness.keyboard.dispatch("geometrychange");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 0);
  assert.equal(harness.classNames.has("is-composing"), true);
});

test("missing navigator is supported without requiring VirtualKeyboard", () => {
  const harness = createHarness({ navigator: false });
  harness.viewport.height = 470;
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 330);
});

test("a window scroll refreshes the measured bottom when no viewport event is emitted", () => {
  const harness = createHarness();
  harness.focus();
  harness.window.innerHeight = 425;
  harness.window.dispatch("scroll");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 375);
});

test("three bounded focus settle checks catch delayed metrics without resize events", () => {
  const harness = createHarness();
  harness.focus();
  assert.deepEqual([...harness.timers.values()].map((timer) => timer.delay).sort((a, b) => a - b), [100, 350, 800]);
  for (const [advance, height] of [[100, 600], [250, 480], [450, 430]]) {
    harness.window.innerHeight = height;
    harness.advanceTime(advance);
    harness.flushFrame();
    assert.equal(pixels(harness, "--composer-inset"), 800 - height);
  }
  assert.equal(harness.timers.size, 0);
  harness.advanceTime(5000);
  assert.equal(harness.callbacks.size, 0);
});

test("focus and blur replace pending settle checks with bounded opening and closing sequences", () => {
  const harness = createHarness();
  harness.focus();
  const first = [...harness.timers.keys()];
  harness.focus();
  assert.equal(harness.timers.size, 3);
  assert.ok(first.every((id) => !harness.timers.has(id)));
  const opening = [...harness.timers.keys()];
  harness.blur();
  assert.equal(harness.timers.size, 3);
  assert.ok(opening.every((id) => !harness.timers.has(id)));
  assert.equal(harness.classNames.has("is-composing"), false);
  assert.equal(harness.properties.has("--composer-inset"), false);
  assert.equal(harness.properties.has("--message-bottom"), false);
  for (let cycle = 0; cycle < 4; cycle++) {
    const closing = [...harness.timers.keys()];
    harness.focus();
    assert.equal(harness.timers.size, 3);
    assert.ok(closing.every((id) => !harness.timers.has(id)));
    harness.blur();
    assert.equal(harness.timers.size, 3);
  }
  harness.advanceTime(1000);
  harness.flushFrame();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.callbacks.size, 0);
});

test("pagehide cancels pending settle checks and the scheduled animation frame", () => {
  const harness = createHarness();
  harness.focus();
  harness.window.dispatch("resize");
  assert.equal(harness.callbacks.size, 1);
  assert.equal(harness.timers.size, 3);
  harness.window.dispatch("pagehide");
  assert.equal(harness.callbacks.size, 0);
  assert.equal(harness.timers.size, 0);
  harness.advanceTime(1000);
  assert.equal(harness.callbacks.size, 0);
});

test("unchanged geometry with viewport APIs reports zero inset without claiming the keyboard is visible", () => {
  const harness = createHarness({ virtualKeyboard: true });
  harness.focus();
  harness.advanceTime(800);
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 0);
  assert.equal(harness.classNames.has("has-keyboard-inset"), false);
});

test("on-device diagnostics are opt-in and do not reveal the message text", () => {
  const harness = createHarness({ search: "?v=keyboard2&keyboardDebug=1" });
  assert.equal(harness.appended.length, 1);
  harness.window.innerHeight = 430;
  harness.focus();
  const text = harness.appended[0].textContent;
  assert.match(text, /KEYBOARD 2/);
  assert.match(text, /focus ON/);
  assert.match(text, /inner 430/);
  assert.match(text, /edge 430/);
  assert.equal(text.includes(harness.input.value), false);
});

test("ordinary URLs and nonexact debug flags do not display diagnostics", () => {
  for (const search of ["", "?keyboardDebug=0", "?keyboardDebug=10", "?notkeyboardDebug=1"]) {
    const harness = createHarness({ search });
    assert.equal(harness.appended.length, 0, search || "ordinary URL");
  }
});

test("bursts of viewport and window events are coalesced into one animation frame", () => {
  const harness = createHarness();
  harness.flushFrame();
  harness.viewport.dispatch("resize");
  harness.viewport.dispatch("scroll");
  harness.window.dispatch("resize");
  harness.window.dispatch("orientationchange");
  harness.window.dispatch("pageshow");
  assert.equal(harness.callbacks.size, 1);
  harness.flushFrame();
  assert.equal(harness.callbacks.size, 0);
});

test("leaving the form clears the focused positioning mode", () => {
  const harness = createHarness();
  harness.viewport.height = 450;
  harness.focus();
  harness.blur();
  assert.equal(harness.classNames.has("is-composing"), false);
  assert.equal(harness.classNames.has("has-keyboard-inset"), false);
  for (const property of ["--composer-height", "--composer-left", "--composer-width", "--composer-inset", "--message-bottom", "--float-distance"]) {
    assert.equal(harness.properties.has(property), false, `${property} should be removed after focus exits`);
  }
});

test("message origins follow the raised form and animation distance uses visible height", () => {
  const harness = createHarness();
  harness.viewport.height = 450;
  harness.focus();
  assert.equal(harness.classNames.has("has-keyboard-inset"), true);
  assert.equal(pixels(harness, "--message-bottom"), 438);
  assert.equal(pixels(harness, "--float-distance"), -414);
  harness.viewport.offsetTop = 80;
  harness.viewport.dispatch("scroll");
  harness.flushFrame();
  assert.equal(pixels(harness, "--message-bottom"), 358);
});

test("negative viewport differences cannot move the composer below the viewport", () => {
  const harness = createHarness();
  harness.viewport.height = 810;
  harness.viewport.offsetTop = 2;
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 0);
  assert.equal(harness.classNames.has("has-keyboard-inset"), false);
});

test("primary send press preserves input focus but unrelated pointer actions are untouched", () => {
  const harness = createHarness();
  harness.focus();
  assert.equal(harness.submit.dispatch("pointerdown", { button: 0 }).defaultPrevented, true);
  assert.equal(harness.submit.dispatch("pointerdown", { button: 2 }).defaultPrevented, false);
  harness.document.activeElement = null;
  assert.equal(harness.submit.dispatch("pointerdown", { button: 0 }).defaultPrevented, false);
});

test("focus moving within the form keeps composing mode", () => {
  const harness = createHarness();
  harness.focus();
  harness.document.activeElement = harness.submit;
  harness.input.dispatch("blur", { relatedTarget: harness.submit });
  harness.form.dispatch("focusout", { relatedTarget: harness.submit });
  harness.form.dispatch("focusin", { target: harness.submit });
  harness.flushFrame();
  assert.equal(harness.classNames.has("is-composing"), true);
});

test("ResizeObserver tracks both the flow slot and the composer", () => {
  const harness = createHarness();
  assert.ok(harness.observed.includes(harness.slot));
  assert.ok(harness.observed.includes(harness.wrap));
});
