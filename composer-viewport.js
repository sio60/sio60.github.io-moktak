(() => {
  "use strict";

  const app = document.querySelector("#app");
  const form = document.querySelector("#messageForm");
  const input = document.querySelector("#messageInput");
  const slot = document.querySelector(".composer-slot");
  const composer = document.querySelector(".composer-wrap");
  const sendButton = form.querySelector('button[type="submit"]');
  const viewport = window.visualViewport;
  let frame = 0;
  let composing = false;

  function update() {
    frame = 0;
    const focused = form.contains(document.activeElement);
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    const visibleHeight = viewport?.height ?? window.innerHeight;
    const visibleTop = viewport?.offsetTop ?? 0;
    const inset = Math.max(0, layoutHeight - visibleHeight - visibleTop);

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
  }

  function scheduleUpdate() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  input.addEventListener("focus", scheduleUpdate);
  input.addEventListener("blur", scheduleUpdate);
  form.addEventListener("focusin", scheduleUpdate);
  form.addEventListener("focusout", scheduleUpdate);
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("orientationchange", scheduleUpdate);
  window.addEventListener("pageshow", scheduleUpdate);
  viewport?.addEventListener("resize", scheduleUpdate);
  viewport?.addEventListener("scroll", scheduleUpdate);

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
