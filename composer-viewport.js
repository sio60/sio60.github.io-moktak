(() => {
  "use strict";

  const app = document.querySelector("#app");
  const form = document.querySelector("#messageForm");
  const input = document.querySelector("#messageInput");
  const slot = document.querySelector(".composer-slot");
  const composer = document.querySelector(".composer-wrap");
  const sendButton = form.querySelector('button[type="submit"]');
  const viewport = window.visualViewport;
  const virtualKeyboard = window.navigator?.virtualKeyboard;
  const debugEnabled = /(?:^|[?&])keyboardDebug=1(?:&|$)/.test(window.location?.search ?? "");
  const debug = debugEnabled ? document.createElement("pre") : null;
  let frame = 0;
  let composing = false;
  let settleTimers = [];

  if (debug) {
    debug.className = "keyboard-debug";
    debug.setAttribute("aria-label", "키보드 화면 상태, 입력 내용은 포함하지 않습니다");
    app.append(debug);
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
    const keyboard = virtualKeyboard?.boundingRect;
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
      }
      const bounds = slot.getBoundingClientRect();
      app.style.setProperty("--composer-left", `${bounds.left}px`);
      app.style.setProperty("--composer-width", `${bounds.width}px`);
      app.style.setProperty("--composer-inset", `${inset}px`);
    }

    app.classList.toggle("is-composing", focused);
    app.classList.toggle("has-keyboard-inset", focused && inset > 0);
    composing = focused;

    if (focused) {
      // Read the docked form, not a guessed keyboard height, for message origins.
      const formTop = form.getBoundingClientRect().top;
      app.style.setProperty("--message-bottom", `${Math.max(96, layoutHeight - formTop + 16)}px`);
      app.style.setProperty("--float-distance", `${-Math.round(visibleHeight * 0.92)}px`);
    } else {
      for (const property of ["--composer-height", "--composer-left", "--composer-width",
        "--composer-inset", "--message-bottom", "--float-distance"]) {
        app.style.removeProperty(property);
      }
    }

    if (debug) {
      const bounds = form.getBoundingClientRect();
      const round = (value) => Number.isFinite(value) ? Math.round(value) : "—";
      debug.textContent = [
        "KEYBOARD 2 · 화면 수치만 표시 / 전송 없음",
        `focus ${focused ? "ON" : "OFF"} | lift ${round(inset)} | scroll ${round(window.scrollY)}`,
        `layout ${round(layoutHeight)} | inner ${round(window.innerHeight)}`,
        `visual ${round(viewport?.height)} | offset ${round(visibleTop)}`,
        `keyboard top ${round(keyboard?.top)} | height ${round(keyboard?.height)}`,
        `input ${round(bounds.top)} ~ ${round(bounds.bottom)} | edge ${round(visibleBottom)}`,
      ].join("\n");
    }
  }

  function scheduleUpdate() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function settleViewport() {
    settleTimers.forEach((timer) => window.clearTimeout(timer));
    scheduleUpdate();
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
