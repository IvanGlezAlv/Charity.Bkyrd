import { describe, expect, it } from "vitest";
import { bestOffset } from "./clock";

describe("bestOffset", () => {
  it("uses the sample with the shortest round trip", () => {
    const s = bestOffset([
      { t0: 0, server: 5_000, t1: 400 },
      { t0: 1_000, server: 6_020, t1: 1_040 },
    ]);
    expect(s).toEqual({ offsetMs: 5_000, rttMs: 40, syncedAt: 1_040 });
  });
  it("returns null without samples", () => {
    expect(bestOffset([])).toBeNull();
  });
});
