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
});
