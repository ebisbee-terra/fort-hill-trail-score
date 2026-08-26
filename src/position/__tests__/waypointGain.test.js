import { describe, expect, it } from "vitest";
import { smoothstep, gainForDistance, computeGains } from "../waypointGain.js";

describe("smoothstep", () => {
  it("is 0 at t=0, 1 at t=1, and monotonic in between", () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0.25)).toBeLessThan(smoothstep(0.75));
  });
});

describe("gainForDistance", () => {
  it("is 1 at the waypoint center and 0 at or beyond the radius", () => {
    expect(gainForDistance(0, 100)).toBe(1);
    expect(gainForDistance(100, 100)).toBe(0);
    expect(gainForDistance(150, 100)).toBe(0);
  });

  it("falls off smoothly, never with a hard edge", () => {
    const near = gainForDistance(10, 100);
    const mid = gainForDistance(50, 100);
    const far = gainForDistance(90, 100);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });

  it("widens the effective falloff without changing the authored radius", () => {
    // just past the base radius: silent at factor 1, but audible once widened
    expect(gainForDistance(110, 100, 1)).toBe(0);
    expect(gainForDistance(110, 100, 1.5)).toBeGreaterThan(0);
  });

  it("stays at full gain throughout the inner plateau, not just at the exact center", () => {
    // default INNER_PLATEAU_FRACTION (0.45) * radius 100 = 45m plateau
    expect(gainForDistance(0, 100)).toBe(1);
    expect(gainForDistance(30, 100)).toBe(1);
    expect(gainForDistance(45, 100)).toBe(1);
    expect(gainForDistance(46, 100)).toBeLessThan(1);
  });

  it("plateau fraction is configurable", () => {
    expect(gainForDistance(20, 100, 1, 0.1)).toBeLessThan(1); // 10% plateau = 10m, 20m is past it
    expect(gainForDistance(20, 100, 1, 0.9)).toBe(1); // 90% plateau = 90m, 20m is well inside it
  });
});

describe("computeGains", () => {
  it("returns a gain per waypoint keyed by id", () => {
    const waypoints = [
      { id: "a", x: 0, y: 0, radius: 100 },
      { id: "b", x: 500, y: 0, radius: 100 },
    ];
    const gains = computeGains({ x: 0, y: 0 }, waypoints);
    expect(gains.a).toBe(1);
    expect(gains.b).toBe(0);
  });

  it("applies overlapFactor to every waypoint", () => {
    const waypoints = [{ id: "a", x: 0, y: 0, radius: 100 }];
    const base = computeGains({ x: 120, y: 0 }, waypoints);
    const widened = computeGains({ x: 120, y: 0 }, waypoints, 1.5);
    expect(base.a).toBe(0);
    expect(widened.a).toBeGreaterThan(0);
  });
});
