// Stands in for the real Core Motion / step-counter signal CLAUDE.md calls
// for (explicitly not GPS, not HealthKit) — but this dev harness only has
// mocked position, so stillness is derived from position instead: has the
// walker's position stayed within a small radius for the full window?
//
// A sliding window rather than a per-tick delta: at 20 Hz, even normal
// walking speed only moves ~7cm per tick, so comparing consecutive ticks
// would misread ordinary walking as "still." Comparing against a position
// from `windowMs` ago correctly requires sustained calm before flipping true,
// while still reacting immediately once real movement resumes.
export function createStillnessDetector({ windowMs = 3000, moveThresholdMeters = 2 } = {}) {
  const history = []; // { t, x, y }, oldest first

  function update(position, nowMs) {
    history.push({ t: nowMs, x: position.x, y: position.y });
    while (history.length > 1 && nowMs - history[0].t > windowMs) {
      history.shift();
    }

    const oldest = history[0];
    if (nowMs - oldest.t < windowMs) {
      return false; // not enough history yet to judge -- assume moving
    }

    const displacement = Math.hypot(position.x - oldest.x, position.y - oldest.y);
    return displacement < moveThresholdMeters;
  }

  return { update };
}
