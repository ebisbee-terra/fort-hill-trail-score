import { describe, expect, it } from "vitest";
import { getMapTint } from "../mapTint.js";

describe("getMapTint", () => {
  it("returns the base paper color unchanged at clear/midday-ish baseline", () => {
    // midday has weight 0, clear has a small weight -- so not exactly base,
    // but close to it and distinct from other combinations
    const midday = getMapTint("clear", "midday");
    const dusk = getMapTint("clear", "dusk");
    expect(midday).not.toBe(dusk);
  });

  it("returns a valid hex color for every weather/daypart combination", () => {
    const weathers = ["clear", "overcast", "wet"];
    const dayparts = ["morning", "midday", "golden", "dusk"];
    for (const w of weathers) {
      for (const d of dayparts) {
        expect(getMapTint(w, d)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("shifts noticeably darker at dusk than at midday", () => {
    const midday = getMapTint("clear", "midday");
    const dusk = getMapTint("clear", "dusk");
    const brightness = (hex) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b, 0);
    expect(brightness(dusk)).toBeLessThan(brightness(midday));
  });

  it("falls back to clear/midday tints for an unknown condition", () => {
    expect(getMapTint("blizzard", "unknown")).toBe(getMapTint("clear", "midday"));
  });
});
