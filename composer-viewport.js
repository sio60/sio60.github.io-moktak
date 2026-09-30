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
  const virtualKeyboard = window.navigator?.virtualKeyboard;
  let frame = 0;
  let composing = false;
  let settleTimers = [];

  // Request keyboard geometry without asking the browser to resize the page.
  // Reading boundingRect alone does not opt in to this Chromium API.
  try {
    if (virtualKeyboard) virtualKeyboard.overlaysContent = true;
  } catch {
    // Safari and embedded browsers may not support control of keyboard overlays.
  }

  function positive(value) {
    return Number.isFinite(value) && value > 0;
  }

  function update() {
    frame = 0;
    const focused = form.contains(document.activeElement);
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    const visibleTop = viewport?.offsetTop ?? 0;
    // Some WebViews update innerHeight before (or instead of) visualViewport.
    // Never treat an API being present as proof that its dimensions are current.
    const bottomEdges = [layoutHeight, window.innerHeight];
    if (positive(viewport?.height)) bottomEdges.push(visibleTop + viewport.height);
    let keyboard;
    try { keyboard = virtualKeyboard?.boundingRect; } catch { /* Use viewport signals. */ }
    if (positive(keyboard?.height) && positive(keyboard?.top) &&
      keyboard.width >= document.documentElement.clientWidth * 0.6) {
      bottomEdges.push(keyboard.top);
    }
    const visibleBottom = Math.min(...bottomEdges.filter(positive));
    const visibleHeight = Math.max(0, visibleBottom - Math.min(visibleTop, visibleBottom));
    const inset = Math.max(0, layoutHeight - visibleBottom);

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
    app.classList.toggle("has-keyboard-inset", focused && inset > 0);
    composing = focused;

    if (focused) {
      // Measure AFTER hiding the counter and applying the focused padding.
      // Anchor the top directly: fixed-position layout bounds can differ from
      // clientHeight in an embedded browser, so a calculated bottom is unsafe.
      const height = composer.getBoundingClientRect().height;
      app.style.setProperty("--composer-top", `${Math.max(visibleTop, visibleBottom - height)}px`);
      const formTop = form.getBoundingClientRect().top;
      app.style.setProperty("--message-bottom", `${Math.max(96, messageSky.getBoundingClientRect().bottom - formTop + 16)}px`);
      app.style.setProperty("--float-distance", `${-Math.round(visibleHeight * 0.92)}px`);
    } else {
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
    settleTimers.forEach((timer) => window.clearTimeout(timer));
    if (frame) window.cancelAnimationFrame(frame);
    // Capture the resting page size during focus, before native keyboard resize.
    update();
    // Native keyboard animation can finish without a corresponding resize event.
    settleTimers = [100, 350, 800].map((delay) => window.setTimeout(scheduleUpdate, delay));
  }

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
  virtualKeyboard?.addEventListener("geometrychange", scheduleUpdate);
  window.addEventListener("pagehide", () => {
    settleTimers.forEach((timer) => window.clearTimeout(timer));
    settleTimers = [];
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
