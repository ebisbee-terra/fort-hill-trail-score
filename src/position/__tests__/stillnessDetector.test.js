import { describe, expect, it } from "vitest";
import { createStillnessDetector } from "../stillnessDetector.js";

describe("createStillnessDetector", () => {
  it("is not still until the window has fully elapsed", () => {
    const detector = createStillnessDetector({ windowMs: 3000, moveThresholdMeters: 2 });
    expect(detector.update({ x: 0, y: 0 }, 0)).toBe(false);
    expect(detector.update({ x: 0, y: 0 }, 1000)).toBe(false);
    expect(detector.update({ x: 0, y: 0 }, 2999)).toBe(false);
  });

  it("becomes still once position hasn't moved for the full window", () => {
    const detector = createStillnessDetector({ windowMs: 3000, moveThresholdMeters: 2 });
    detector.update({ x: 0, y: 0 }, 0);
    detector.update({ x: 0.1, y: 0 }, 1000);
    expect(detector.update({ x: 0.2, y: 0 }, 3000)).toBe(true);
  });

  it("is not still if it moved more than the threshold within the window", () => {
    const detector = createStillnessDetector({ windowMs: 3000, moveThresholdMeters: 2 });
    detector.update({ x: 0, y: 0 }, 0);
    detector.update({ x: 5, y: 0 }, 1500);
    expect(detector.update({ x: 5, y: 0 }, 3000)).toBe(false);
  });

  it("reacts immediately once real movement resumes after being still", () => {
    const detector = createStillnessDetector({ windowMs: 3000, moveThresholdMeters: 2 });
    detector.update({ x: 0, y: 0 }, 0);
    expect(detector.update({ x: 0, y: 0 }, 3000)).toBe(true);
    expect(detector.update({ x: 10, y: 0 }, 3050)).toBe(false);
  });

  it("is not still while actively walking a loop back near the start, even though net displacement is tiny", () => {
    // Traces most of a small square back to near its own starting corner --
    // net displacement is under the threshold, but real ground was covered
    // the whole way. This is the exact bug the straight-line-displacement
    // version had: a curvy trail (like the real Fort Hill Loop) can make an
    // actively-walking person's net displacement read as "still."
    const detector = createStillnessDetector({ windowMs: 3000, moveThresholdMeters: 2 });
    detector.update({ x: 0, y: 0 }, 0);
    detector.update({ x: 1, y: 0 }, 1000);
    detector.update({ x: 1, y: 1 }, 2000);
    // net displacement (0,0) -> (0,1) is only 1m, under the 2m threshold --
    // but 3m of ground was actually covered getting there.
    expect(detector.update({ x: 0, y: 1 }, 3000)).toBe(false);
  });

  it("becomes still and stays still under realistic 20Hz tick density", () => {
    // Regression test: the window-eviction logic guarantees the oldest
    // in-window sample's age never quite reaches windowMs once ticks are
    // dense enough (it gets evicted right as it crosses that line), so a
    // "not enough history" check based on that age never passes at 20Hz --
    // only sparse, hand-picked timestamps (like the other tests here) could
    // dodge it. This drives real tick density to catch that class of bug.
    const detector = createStillnessDetector({ windowMs: 3000, moveThresholdMeters: 2 });
    let result;
    for (let t = 0; t <= 6000; t += 50) {
      result = detector.update({ x: 0, y: 0 }, t);
    }
    expect(result).toBe(true);
  });
});
