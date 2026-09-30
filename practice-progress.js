(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InnerpeacePracticeProgress = api;
})(typeof window === "object" ? window : null, function () {
  "use strict";

  const ROUND_LENGTH = 108;
  const hints = [
    { count: 12, kind: "hint", title: "무언가 보이기 시작해요.", detail: "두드릴수록 조금씩 선명해져요." },
    { count: 36, kind: "hint", title: "조금씩 선명해지고 있어요.", detail: "108타를 채우면 빛이 퍼져요." },
    { count: 72, kind: "hint", title: "이제 거의 다 왔어요.", detail: "36번만 더, 천천히 두드려보세요." },
  ];

  function normalizeCount(value) {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
  }

  function getPracticeProgress(value) {
    const count = normalizeCount(value);
    const completedRounds = Math.floor(count / ROUND_LENGTH);
    const withinRound = count % ROUND_LENGTH;

    return {
      count,
      reveal: withinRound / ROUND_LENGTH,
      completedRounds,
      remaining: ROUND_LENGTH - withinRound,
      cycleProgress: withinRound / ROUND_LENGTH,
      nextTarget: (completedRounds + 1) * ROUND_LENGTH,
    };
  }

  // Call only for a new tap. Restoring a saved count uses getPracticeProgress.
  function getMilestone(previousValue, value) {
    if (!Number.isFinite(previousValue) || !Number.isFinite(value)) return null;
    const previousCount = normalizeCount(previousValue);
    const count = normalizeCount(value);
    if (count <= previousCount) return null;

    const completedRounds = Math.floor(count / ROUND_LENGTH);
    const completedAt = completedRounds * ROUND_LENGTH;
    if (completedAt > previousCount) {
      return {
        count: completedAt,
        kind: "complete",
        title: "108타, 잠깐의 이너피스.",
        detail: completedRounds === 1
          ? "잠깐 숨을 고르고, 다시 천천히."
          : `${completedRounds}번째 108타를 채웠어요.`,
      };
    }

    for (let index = hints.length - 1; index >= 0; index -= 1) {
      const hint = hints[index];
      if (previousCount < hint.count && count >= hint.count) return { ...hint };
    }
    return null;
  }

  return Object.freeze({ getPracticeProgress, getMilestone });
});
