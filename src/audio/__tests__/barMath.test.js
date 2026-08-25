import { describe, expect, it } from "vitest";
import { secondsPerBar, barsToSeconds } from "../barMath.js";

describe("secondsPerBar", () => {
  it("computes bar length from tempo and beats per bar", () => {
    expect(secondsPerBar(120, 4)).toBeCloseTo(2, 5);
    expect(secondsPerBar(110, 4)).toBeCloseTo(2.181818, 5);
  });
});

describe("barsToSeconds", () => {
  it("scales bar length by the number of bars", () => {
    expect(barsToSeconds(1, 120, 4)).toBeCloseTo(2, 5);
    expect(barsToSeconds(2.5, 120, 4)).toBeCloseTo(5, 5);
  });
});
