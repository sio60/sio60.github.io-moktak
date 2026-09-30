(() => {
  "use strict";

  const MAX_MESSAGE_LENGTH = 36;
  const MESSAGE_COOLDOWN_MS = 1400;
  const TAP_STORAGE_KEY = "innerpeace:taps:v1";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const config = window.INNERPEACE_CONFIG ?? {};

  const app = document.querySelector("#app");
  const button = document.querySelector("#moktakButton");
  const image = document.querySelector("#moktakImage");
  const mallet = document.querySelector("#malletImage");
  const shine = document.querySelector("#moktakShine");
  const flare = document.querySelector("#impactFlare");
  const effects = document.querySelector("#effects");
  const rings = [...document.querySelectorAll(".impact-ring")];
  const instagramLink = document.querySelector("#instagramLink");
  const form = document.querySelector("#messageForm");
  const input = document.querySelector("#messageInput");
  const charCount = document.querySelector("#charCount");
  const messageSky = document.querySelector("#messageSky");
  const toast = document.querySelector("#toast");
  const myTapCount = document.querySelector("#myTapCount");
  const onlineCount = document.querySelector("#onlineCount");
  const onlineStatus = document.querySelector("#onlineStatus");
  const practice = window.InnerpeacePracticeProgress;
  const practiceVision = document.querySelector("#practiceVision");
  const practiceHint = document.querySelector("#practiceHint");
  const practiceRewardTitle = document.querySelector("#practiceRewardTitle");
  const practiceWave = document.querySelector("#practiceWave");
  const practiceMotes = document.querySelector("#practiceMotes");

  const clientId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let ringIndex = 0;
  let particleIndex = 0;
  let dailyTaps = readDailyTaps();
  let lastMessageAt = 0;
  let lastTapAt = 0;
  let combo = 0;
  let toastTimer = 0;
  let realtimeClient = null;
  let channel = null;
  let connected = false;
  let connecting = false;
  let pageActive = true;
  let connectionAttempt = 0;

  const spring = {
    y: 0,
    vy: 0,
    rotation: 0,
    vr: 0,
    compression: 0,
    heat: 0,
    running: false,
    lastFrame: 0,
  };

  const particles = Array.from({ length: 18 }, (_, index) => {
    const particle = document.createElement("span");
    particle.className = "particle";
    particle.style.setProperty("--size", `${3 + (index % 4)}px`);
    effects.append(particle);
    return particle;
  });

  const rewardMotes = Array.from({ length: reducedMotion ? 0 : 16 }, (_, index) => {
    const mote = document.createElement("span");
    mote.className = "practice-mote";
    mote.style.left = `${15 + (index * 29) % 70}%`;
    mote.style.top = `${26 + (index * 17) % 50}%`;
    practiceMotes.append(mote);
    return mote;
  });

  setupInstagramLink();
  connectRealtime();
  renderTapCount();

  window.addEventListener("pagehide", () => {
    pageActive = false;
    disconnectRealtime();
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    pageActive = true;
    connectRealtime();
  });

  window.addEventListener("online", () => {
    if (!channel) connectRealtime();
  });

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    beginStrike();
  });

  button.addEventListener("click", (event) => {
    // 키보드·보조기술의 가상 클릭만 처리하고 pointerdown 뒤의 click은 무시합니다.
    if (event.detail === 0) beginStrike();
  });

  input.addEventListener("input", () => {
    charCount.textContent = `${[...input.value].length} / ${MAX_MESSAGE_LENGTH}`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = normalizeMessage(input.value);
    if (!text) {
      showToast("흘려보낼 말을 적어주세요.");
      input.focus();
      return;
    }

    const now = Date.now();
    if (now - lastMessageAt < MESSAGE_COOLDOWN_MS) {
      showToast("숨 한번 쉬고 다시 올려보내세요.");
      return;
    }

    lastMessageAt = now;
    input.value = "";
    charCount.textContent = `0 / ${MAX_MESSAGE_LENGTH}`;
    spawnMessage(text, true);

    if (channel && connected) {
      try {
        const result = await channel.send({
          type: "broadcast",
          event: "message",
          payload: { id: crypto.randomUUID?.() ?? `${clientId}-${now}`, text, from: clientId },
        });
        if (result !== "ok") showToast("연결이 잠시 끊겨 내 화면에만 보여요.");
      } catch {
        showToast("내 화면에만 흘려보냈어요.");
      }
    } else {
      showToast("아직 연결되지 않아 내 화면에만 보여요.");
    }
  });

  function beginStrike() {
    animateMallet();
    window.setTimeout(registerImpact, 38);
  }

  function registerImpact() {
    incrementTapCount();
    const now = performance.now();
    combo = now - lastTapAt < 330 ? Math.min(combo + 1, 24) : 1;
    lastTapAt = now;

    spring.y = Math.min(6.2, spring.y + 3.4);
    spring.vy -= 2.4 + Math.min(combo * 0.05, 0.7);
    spring.rotation += (Math.random() - 0.5) * 1.4;
    spring.vr += (Math.random() - 0.5) * 0.8;
    spring.compression = Math.min(1.45, spring.compression + 0.82);
    spring.heat = Math.min(1, spring.heat + 0.14);
    startSpring();

    if (!reducedMotion) {
      animateImpact();
      if (combo < 8 || combo % 2 === 0) burstParticles(combo >= 8 ? 5 : 9);
    } else {
      flare.animate([{ opacity: 0 }, { opacity: 0.58 }, { opacity: 0 }], { duration: 120 });
    }

    if (navigator.vibrate && now - (registerImpact.lastVibrate ?? 0) > 72) {
      navigator.vibrate(8);
      registerImpact.lastVibrate = now;
    }
  }

  function localDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function readDailyTaps() {
    const date = localDateKey();
    try {
      const stored = JSON.parse(localStorage.getItem(TAP_STORAGE_KEY));
      if (stored?.date === date && Number.isSafeInteger(stored.count) && stored.count >= 0) {
        return { date, count: stored.count };
      }
    } catch {
      // 저장소를 사용할 수 없어도 현재 화면에서는 타수를 셉니다.
    }
    return { date, count: 0 };
  }

  function renderTapCount() {
    myTapCount.textContent = dailyTaps.count.toLocaleString("ko-KR");
    renderPractice();
  }

  function renderPractice() {
    const progress = practice.getPracticeProgress(dailyTaps.count);
    practiceVision.style.setProperty("--reveal", progress.reveal.toFixed(4));
    practiceHint.textContent = `${progress.completedRounds}회 수련`;
  }

  function celebratePractice(milestone) {
    if (milestone.kind !== "complete") return;
    practiceRewardTitle.textContent = `${Math.floor(milestone.count / 108)}회 수련 완료`;
    if (reducedMotion) return;
    // A single slow wave gives feedback without rapidly flashing the screen.
    practiceWave.getAnimations().forEach((animation) => animation.cancel());
    practiceWave.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(.55)" },
        { opacity: 0.75, offset: 0.25 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.6)" },
      ],
      { duration: 2400, easing: "cubic-bezier(.2,.65,.3,1)" },
    );
    rewardMotes.forEach((mote, index) => {
      mote.getAnimations().forEach((animation) => animation.cancel());
      mote.animate(
        [
          { opacity: 0, transform: "translateY(18px) scale(.5)" },
          { opacity: 0.9, offset: 0.2 },
          { opacity: 0, transform: `translate(${(index % 2 ? 1 : -1) * 22}px, -100px) scale(.3)` },
        ],
        { duration: 2400 + (index % 4) * 220, delay: index * 35, easing: "ease-out" },
      );
    });
  }

  function incrementTapCount() {
    const date = localDateKey();
    if (dailyTaps.date !== date) dailyTaps = { date, count: 0 };
    const previousCount = dailyTaps.count;
    dailyTaps.count += 1;
    renderTapCount();
    const milestone = practice.getMilestone(previousCount, dailyTaps.count);
    if (milestone) celebratePractice(milestone);
    try {
      localStorage.setItem(TAP_STORAGE_KEY, JSON.stringify(dailyTaps));
    } catch {
      // 저장 실패는 타격 애니메이션에 영향을 주지 않습니다.
    }
  }

  function animateMallet() {
    if (reducedMotion) return;
    mallet.getAnimations().forEach((animation) => animation.cancel());
    mallet.animate(
      [
        { transform: "translate3d(0, 0, 0) rotate(4deg)", offset: 0 },
        {
          transform: "translate3d(-6%, 9%, 0) rotate(-18deg)",
          offset: 0.18,
          easing: "cubic-bezier(.55,.02,.78,.28)",
        },
        {
          transform: "translate3d(2%, -5%, 0) rotate(11deg)",
          offset: 0.48,
          easing: "cubic-bezier(.18,.85,.28,1.18)",
        },
        { transform: "translate3d(-1%, 1.5%, 0) rotate(-2deg)", offset: 0.72 },
        { transform: "translate3d(0, 0, 0) rotate(4deg)", offset: 1 },
      ],
      { duration: 330, easing: "ease-out" },
    );
  }

  function animateImpact() {
    const ring = rings[ringIndex++ % rings.length];
    ring.getAnimations().forEach((animation) => animation.cancel());
    ring.animate(
      [
        { opacity: 0.82, transform: "translate(-50%, -50%) scale(.42)" },
        { opacity: 0.32, offset: 0.55 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.65)" },
      ],
      { duration: 510, easing: "cubic-bezier(.12,.62,.24,1)" },
    );

    flare.getAnimations().forEach((animation) => animation.cancel());
    flare.animate(
      [
        { opacity: 0, transform: "scale(.2)" },
        { opacity: 0.72, transform: "scale(1)", offset: 0.18 },
        { opacity: 0, transform: "scale(1.55)" },
      ],
      { duration: 300, easing: "ease-out" },
    );

    shine.getAnimations().forEach((animation) => animation.cancel());
    shine.animate(
      [
        { opacity: 0, transform: "translateX(-32%)" },
        { opacity: 0.72, offset: 0.28 },
        { opacity: 0, transform: "translateX(34%)" },
      ],
      { duration: 430, easing: "ease-out" },
    );
  }

  function burstParticles(amount) {
    for (let index = 0; index < amount; index += 1) {
      const particle = particles[particleIndex++ % particles.length];
      particle.getAnimations().forEach((animation) => animation.cancel());
      const angle = (-150 + Math.random() * 120) * (Math.PI / 180);
      const distance = 34 + Math.random() * 74;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const rotate = -100 + Math.random() * 220;
      particle.animate(
        [
          { opacity: 0.95, transform: "translate(-50%, -50%) scale(1) rotate(0deg)" },
          { opacity: 0.68, offset: 0.55 },
          { opacity: 0, transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(.15) rotate(${rotate}deg)` },
        ],
        { duration: 430 + Math.random() * 230, easing: "cubic-bezier(.16,.68,.32,1)" },
      );
    }
  }

  function startSpring() {
    if (spring.running) return;
    spring.running = true;
    spring.lastFrame = performance.now();
    requestAnimationFrame(stepSpring);
  }

  function stepSpring(now) {
    const dt = Math.min((now - spring.lastFrame) / 16.667, 2);
    spring.lastFrame = now;

    spring.vy += -spring.y * 0.19 * dt;
    spring.vy *= 0.72 ** dt;
    spring.y += spring.vy * dt;
    spring.vr += -spring.rotation * 0.21 * dt;
    spring.vr *= 0.69 ** dt;
    spring.rotation += spring.vr * dt;
    spring.compression *= 0.54 ** dt;
    spring.heat *= 0.925 ** dt;

    const scaleX = 1 + spring.compression * 0.026;
    const scaleY = 1 - spring.compression * 0.043;
    image.style.transform = `translate3d(0, ${spring.y}px, 0) rotate(${spring.rotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
    app.style.setProperty("--heat", spring.heat.toFixed(3));

    const moving =
      Math.abs(spring.y) > 0.02 ||
      Math.abs(spring.vy) > 0.02 ||
      Math.abs(spring.rotation) > 0.02 ||
      spring.compression > 0.012 ||
      spring.heat > 0.012;

    if (moving) {
      requestAnimationFrame(stepSpring);
    } else {
      spring.running = false;
      image.style.transform = "";
      app.style.setProperty("--heat", "0");
    }
  }

  function spawnMessage(text, mine = false) {
    const element = document.createElement("div");
    element.className = `floating-message${mine ? " is-mine" : ""}`;
    element.textContent = text;

    const lanes = window.innerWidth < 560 ? [33, 50, 67] : [22, 36, 50, 64, 78];
    const left = lanes[Math.floor(Math.random() * lanes.length)];
    const drift = -34 + Math.random() * 68;
    const duration = reducedMotion ? 18 : 10.5 + Math.random() * 4.5;
    element.style.left = `${left}%`;
    element.style.setProperty("--drift", `${drift}px`);
    element.style.setProperty("--float-duration", `${duration}s`);
    element.style.animationDelay = `${Math.random() * 0.18}s`;
    messageSky.append(element);

    while (messageSky.children.length > 16) messageSky.firstElementChild?.remove();
    element.addEventListener("animationend", () => element.remove(), { once: true });
  }

  async function connectRealtime() {
    if (!pageActive || connecting || channel) return;
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      connected = false;
      renderOnlineCount(null);
      return;
    }

    const attempt = ++connectionAttempt;
    connecting = true;

    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      if (!pageActive || attempt !== connectionAttempt) return;

      realtimeClient ??= createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      const currentChannel = realtimeClient.channel(config.channelName || "innerpeace-main-v1", {
        config: {
          broadcast: { self: false, ack: true },
          presence: { key: clientId },
        },
      });
      channel = currentChannel;

      const isCurrentConnection = () => pageActive && channel === currentChannel;
      const syncOnlineCount = () => {
        if (!isCurrentConnection() || !connected) return;
        const presences = Object.values(currentChannel.presenceState());
        renderOnlineCount(presences.filter((entries) => entries.length > 0).length);
      };

      currentChannel
        .on("presence", { event: "sync" }, syncOnlineCount)
        .on("broadcast", { event: "message" }, ({ payload }) => {
          if (!isCurrentConnection() || !payload || typeof payload.text !== "string" || payload.from === clientId) return;
          const text = normalizeMessage(payload.text);
          if (text) spawnMessage(text, false);
        })
        .subscribe(async (status) => {
          if (!isCurrentConnection()) return;
          if (status === "SUBSCRIBED") {
            connected = true;
            try {
              // 접속할 때만 알립니다. 목탁을 두드리거나 글을 쓸 때는 갱신하지 않습니다.
              const result = await currentChannel.track({ online_at: new Date().toISOString() });
              if (!isCurrentConnection() || !connected) return;
              if (result === "ok") syncOnlineCount();
              else renderOnlineCount(null);
            } catch {
              if (isCurrentConnection()) renderOnlineCount(null);
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            connected = false;
            renderOnlineCount(null);
          }
        });
    } catch (error) {
      if (attempt !== connectionAttempt) return;
      console.warn("Realtime connection failed; continuing in solo mode.", error);
      channel = null;
      connected = false;
      renderOnlineCount(null);
    } finally {
      if (attempt === connectionAttempt) connecting = false;
    }
  }

  function renderOnlineCount(count) {
    if (!onlineCount) return;
    onlineCount.textContent = count === null ? "—" : String(count).padStart(3, "0");
    (onlineStatus ?? onlineCount).title = count === null
      ? "실시간 연결을 확인하고 있어요."
      : "현재 연결된 페이지 수예요. 같은 사람의 여러 탭은 각각 집계돼요.";
  }

  function disconnectRealtime() {
    connectionAttempt += 1;
    connecting = false;
    connected = false;
    renderOnlineCount(null);

    const leavingChannel = channel;
    const leavingClient = realtimeClient;
    channel = null;
    realtimeClient = null;
    if (leavingChannel && leavingClient) {
      // 뒤로 가기 캐시에서 돌아오면 pageshow에서 새 채널로 다시 접속합니다.
      void leavingClient.removeChannel(leavingChannel).catch(() => {});
    }
  }

  function setupInstagramLink() {
    const rawValue = String(config.instagramUrl ?? "").trim();
    if (!rawValue) {
      instagramLink.addEventListener("click", (event) => {
        event.preventDefault();
        showToast("인스타 계정 주소를 연결해주세요.");
      });
      return;
    }

    const url = rawValue.startsWith("@")
      ? `https://www.instagram.com/${rawValue.slice(1)}/`
      : rawValue.startsWith("http")
        ? rawValue
        : `https://www.instagram.com/${rawValue.replace(/^\/+|\/+$/g, "")}/`;
    instagramLink.href = url;
    instagramLink.target = "_blank";
    instagramLink.rel = "noopener noreferrer";
  }

  function normalizeMessage(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/https?:\/\/\S+|www\.\S+/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_MESSAGE_LENGTH);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1700);
  }
})();
