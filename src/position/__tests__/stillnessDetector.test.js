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
});
