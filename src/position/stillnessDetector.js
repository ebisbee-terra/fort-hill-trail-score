// Stands in for the real Core Motion / step-counter signal CLAUDE.md calls
// for (explicitly not GPS, not HealthKit) — but this dev harness only has
// mocked position, so stillness is derived from position instead: has the
// walker covered any real ground in the last ~3s?
//
// Measures cumulative distance traveled within the window (sum of
// consecutive-sample step lengths), not net displacement between the oldest
// and newest sample. Net displacement breaks on a curvy trail: someone
// actively walking through a tight bend can have their net displacement stay
// under the threshold even though they're genuinely moving, since a curved
// path can end up near where it started. Summing the actual steps is
// invariant to path shape and matches what a real pedometer measures.
//
// A window rather than a per-tick delta: at 20 Hz, even normal walking speed
// only moves ~7cm per tick, so comparing consecutive ticks alone would need
// an impractically tiny threshold. The window requires sustained calm before
// flipping true, while still reacting immediately once real movement resumes.
export function createStillnessDetector({ windowMs = 3000, moveThresholdMeters = 2 } = {}) {
  const history = []; // { t, x, y }, oldest first
  let firstSeenAt = null;

  function update(position, nowMs) {
    if (firstSeenAt === null) firstSeenAt = nowMs;

    history.push({ t: nowMs, x: position.x, y: position.y });
    while (history.length > 1 && nowMs - history[0].t > windowMs) {
      history.shift();
    }

    // Gated against a fixed start reference, not the current oldest-in-window
    // sample's age -- the eviction above guarantees that age never quite
    // reaches windowMs at steady state (it gets evicted right as it crosses
    // that line), so checking it directly would never pass once the window
    // is actually full of real 20Hz samples.
    if (nowMs - firstSeenAt < windowMs) {
      return false; // hasn't been running long enough yet to judge
    }

    let traveled = 0;
    for (let i = 1; i < history.length; i++) {
      traveled += Math.hypot(history[i].x - history[i - 1].x, history[i].y - history[i - 1].y);
    }
    return traveled < moveThresholdMeters;
  }

  return { update };
}
