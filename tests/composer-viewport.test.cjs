"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "composer-viewport.js");

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

function createHarness({ visualViewport = true, resizeObserver = true } = {}) {
  const properties = new Map();
  const classNames = new Set();
  const callbacks = new Map();
  const observed = [];
  let nextFrame = 0;

  const app = {
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
      const bottom = classNames.has("is-composing") ? documentElement.clientHeight - inset : 760;
      return { left: 18, right: 342, top: bottom - 80, bottom, width: 324, height: 80 };
    },
  };
  const document = {
    activeElement: null,
    documentElement,
    querySelector(selector) {
      const elements = { "#app": app, "#messageForm": form, "#messageInput": input, ".composer-slot": slot, ".composer-wrap": wrap };
      assert.ok(selector in elements, `Unexpected selector: ${selector}`);
      return elements[selector];
    },
  };
  const viewport = visualViewport ? { ...eventTarget(), height: 800, width: 360, offsetTop: 0, offsetLeft: 0, scale: 1 } : undefined;
  const window = {
    ...eventTarget(),
    innerHeight: 800,
    innerWidth: 360,
    visualViewport: viewport,
    requestAnimationFrame(callback) { const id = ++nextFrame; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    setTimeout,
    clearTimeout,
  };
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
    console,
  };
  if (resizeObserver) context.ResizeObserver = FakeResizeObserver;
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });

  function flushFrame() {
    const queued = [...callbacks.values()];
    callbacks.clear();
    for (const callback of queued) callback(16);
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
  return { app, input, submit, form, document, window, viewport, properties, classNames, callbacks, observed, slot, wrap, flushFrame, focus, blur };
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

test("missing VisualViewport and ResizeObserver retain a safe bottom-zero fallback", () => {
  const harness = createHarness({ visualViewport: false, resizeObserver: false });
  harness.focus();
  assert.equal(pixels(harness, "--composer-inset"), 0);
  harness.window.dispatch("resize");
  harness.flushFrame();
  assert.equal(pixels(harness, "--composer-inset"), 0);
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
