import { describe, expect, it } from "vitest";
import { FADE_IN_CURVE, FADE_OUT_CURVE } from "../loopCurves.js";

describe("loop crossfade curves", () => {
  it("fade-in starts silent and ends at full gain", () => {
    expect(FADE_IN_CURVE[0]).toBeCloseTo(0, 5);
    expect(FADE_IN_CURVE[FADE_IN_CURVE.length - 1]).toBeCloseTo(1, 5);
  });

  it("fade-out starts at full gain and ends silent", () => {
    expect(FADE_OUT_CURVE[0]).toBeCloseTo(1, 5);
    expect(FADE_OUT_CURVE[FADE_OUT_CURVE.length - 1]).toBeCloseTo(0, 5);
  });

  it("is equal-power: fade-in² + fade-out² stays close to 1 throughout", () => {
    for (let i = 0; i < FADE_IN_CURVE.length; i++) {
      const power = FADE_IN_CURVE[i] ** 2 + FADE_OUT_CURVE[i] ** 2;
      expect(power).toBeCloseTo(1, 5);
    }
  });
});
