import { describe, expect, it } from "vitest";
import { createArrivalTracker } from "../arrivalHysteresis.js";

describe("createArrivalTracker", () => {
  it("fires once when gain crosses the buzz threshold", () => {
    const tracker = createArrivalTracker(["a"]);
    expect(tracker.update({ a: 0.5 })).toEqual([]);
    expect(tracker.update({ a: 0.9 })).toEqual(["a"]);
    // stays armed-off while hovering above rearm threshold — no repeat buzz
    expect(tracker.update({ a: 0.95 })).toEqual([]);
    expect(tracker.update({ a: 0.6 })).toEqual([]);
  });

  it("only re-arms after dropping below the rearm threshold, not just below buzz", () => {
    const tracker = createArrivalTracker(["a"]);
    tracker.update({ a: 0.9 }); // fires, disarms
    expect(tracker.update({ a: 0.6 })).toEqual([]); // below buzzAt but above rearmAt — still disarmed
    expect(tracker.update({ a: 0.9 })).toEqual([]); // back up without rearming — no repeat buzz
    expect(tracker.update({ a: 0.4 })).toEqual([]); // drops below rearmAt — rearms
    expect(tracker.update({ a: 0.9 })).toEqual(["a"]); // fires again
  });

  it("tracks each id independently", () => {
    const tracker = createArrivalTracker(["a", "b"]);
    expect(tracker.update({ a: 0.9, b: 0.1 })).toEqual(["a"]);
    expect(tracker.update({ a: 0.9, b: 0.9 })).toEqual(["b"]);
  });
});
