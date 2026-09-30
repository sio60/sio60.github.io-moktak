(() => {
  "use strict";

  const app = document.querySelector("#app");
  const form = document.querySelector("#messageForm");
  const input = document.querySelector("#messageInput");
  const slot = document.querySelector(".composer-slot");
  const composer = document.querySelector(".composer-wrap");
  const messageSky = document.querySelector("#messageSky");
  const stage = document.querySelector("#stage");
  const scene = document.querySelector("#moktakScene");
  const intro = document.querySelector(".intro");
  const introCopy = document.querySelector(".intro-copy");
  const kicker = document.querySelector(".intro-kicker");
  const footer = document.querySelector("footer");
  const sendButton = form.querySelector('button[type="submit"]');
  const viewport = window.visualViewport;
  let frame = 0;
  let composing = false;
  let docked = false;
  let settleTimer = 0;
  let baseline;

  // Keep native keyboard avoidance enabled. In particular, do not opt into
  // VirtualKeyboard overlays: affected Android versions report corrupt rects.

  function positive(value) {
    return Number.isFinite(value) && value > 0;
  }

  function measureViewport() {
    const scale = positive(viewport?.scale) ? viewport.scale : 1;
    const height = positive(viewport?.height) ? viewport.height : 0;
    return {
      width: document.documentElement.clientWidth,
      innerHeight: positive(window.innerHeight) ? window.innerHeight :
        (positive(document.documentElement.clientHeight) ? document.documentElement.clientHeight : height),
      visualHeight: height * scale,
      height,
      top: Number.isFinite(viewport?.offsetTop) ? Math.max(0, viewport.offsetTop) : 0,
      scale,
    };
  }

  function rememberViewport(measurement) {
    const sameWidth = baseline && Math.abs(baseline.width - measurement.width) < 80;
    baseline = {
      ...measurement,
      // Blur can arrive before the keyboard's closing animation completes.
      // Don't learn that temporarily reduced height as the resting viewport.
      innerHeight: sameWidth ? Math.max(baseline.innerHeight, measurement.innerHeight) : measurement.innerHeight,
      visualHeight: sameWidth ? Math.max(baseline.visualHeight, measurement.visualHeight) : measurement.visualHeight,
    };
  }

  function keyboardViewport(measurement) {
    if (!baseline || Math.abs(measurement.scale - baseline.scale) > 0.05) return null;
    const isKeyboardReduction = (reduction) => docked ? reduction > 40 : reduction >= 96;
    // Choose ONE source. A stale small innerHeight must never override a
    // working VisualViewport, nor should panning cancel a height reduction.
    if (positive(measurement.height) && isKeyboardReduction(baseline.visualHeight - measurement.visualHeight)) {
      return { top: measurement.top, height: measurement.height };
    }
    if (isKeyboardReduction(baseline.innerHeight - measurement.innerHeight)) {
      return { top: 0, height: measurement.innerHeight };
    }
    return null;
  }

  function update() {
    frame = 0;
    const focused = form.contains(document.activeElement);
    const measurement = measureViewport();
    if (!baseline || !focused) rememberViewport(measurement);
    if (baseline && Math.abs(baseline.width - measurement.width) >= 80) {
      // Rotation is not a keyboard opening. Reflow once for the new width,
      // then preserve that layout rather than a portrait-sized frozen stage.
      app.classList.remove("is-composing", "is-keyboard-docked");
      composing = false;
      docked = false;
      rememberViewport(measurement);
    }

    if (focused) {
      if (!composing) {
        app.style.setProperty("--composer-height", `${composer.getBoundingClientRect().height}px`);
        app.style.setProperty("--rest-app-height", `${app.getBoundingClientRect().height}px`);
        app.style.setProperty("--rest-stage-height", `${stage.getBoundingClientRect().height}px`);
        app.style.setProperty("--rest-scene-size", `${scene.getBoundingClientRect().width}px`);
        app.style.setProperty("--rest-app-padding", window.getComputedStyle(app).padding);
        app.style.setProperty("--rest-intro-height", `${intro.getBoundingClientRect().height}px`);
        app.style.setProperty("--rest-intro-margin", window.getComputedStyle(intro).marginTop);
        app.style.setProperty("--rest-copy-display", window.getComputedStyle(introCopy).display);
        app.style.setProperty("--rest-kicker-margin", window.getComputedStyle(kicker).marginBottom);
        app.style.setProperty("--rest-footer-display", window.getComputedStyle(footer).display);
      }
      const bounds = slot.getBoundingClientRect();
      app.style.setProperty("--composer-left", `${bounds.left}px`);
      app.style.setProperty("--composer-width", `${bounds.width}px`);
    }

    app.classList.toggle("is-composing", focused);
    composing = focused;
    const visible = focused ? keyboardViewport(measurement) : null;
    // A near-zero animation reading is not permission to send the input to
    // the top of the screen. Retain native flow if no usable area is exposed.
    docked = Boolean(visible && visible.height >= composer.getBoundingClientRect().height + 24);
    app.classList.toggle("is-keyboard-docked", docked);

    if (docked) {
      // Measure AFTER hiding the counter and applying the focused padding.
      // Anchor the top directly: fixed-position layout bounds can differ from
      // clientHeight in an embedded browser, so a calculated bottom is unsafe.
      const height = composer.getBoundingClientRect().height;
      app.style.setProperty("--composer-top", `${visible.top + visible.height - height}px`);
      const formTop = form.getBoundingClientRect().top;
      app.style.setProperty("--message-bottom", `${Math.max(96, messageSky.getBoundingClientRect().bottom - formTop + 16)}px`);
      app.style.setProperty("--float-distance", `${-Math.round(visible.height * 0.92)}px`);
    } else {
      for (const property of ["--composer-top", "--message-bottom", "--float-distance"]) {
        app.style.removeProperty(property);
      }
    }
    if (!focused) {
      for (const property of ["--composer-height", "--composer-left", "--composer-width",
        "--composer-top", "--message-bottom", "--float-distance", "--rest-app-height",
        "--rest-stage-height", "--rest-scene-size", "--rest-app-padding", "--rest-intro-height",
        "--rest-intro-margin", "--rest-copy-display", "--rest-kicker-margin", "--rest-footer-display"]) {
        app.style.removeProperty(property);
      }
    }

  }

  function scheduleUpdate() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function settleViewport() {
    window.clearTimeout(settleTimer);
    if (frame) window.cancelAnimationFrame(frame);
    // Capture the resting page size during focus, before native keyboard resize.
    update();
    // One follow-up for hosts that finish their metrics after focus. Never
    // force a scroll or guess a keyboard height when all metrics stay unchanged.
    settleTimer = window.setTimeout(scheduleUpdate, 350);
  }

  input.addEventListener("pointerdown", () => {
    if (!composing) rememberViewport(measureViewport());
  });
  input.addEventListener("focus", settleViewport);
  input.addEventListener("blur", settleViewport);
  form.addEventListener("focusin", scheduleUpdate);
  form.addEventListener("focusout", scheduleUpdate);
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("orientationchange", scheduleUpdate);
  window.addEventListener("pageshow", scheduleUpdate);
  viewport?.addEventListener("resize", scheduleUpdate);
  viewport?.addEventListener("scroll", scheduleUpdate);
  window.addEventListener("pagehide", () => {
    window.clearTimeout(settleTimer);
    settleTimer = 0;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  });

  // A touch on Send must not dismiss the keyboard before the click is handled.
  sendButton.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && document.activeElement === input) event.preventDefault();
  });

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(slot);
    observer.observe(composer);
  }

  update();
})();
