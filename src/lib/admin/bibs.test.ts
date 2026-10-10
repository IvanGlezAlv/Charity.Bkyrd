import { describe, expect, it } from "vitest";
import { planBibs } from "./bibs";

describe("planBibs", () => {
  it("pads to three digits from 001", () => {
    expect(planBibs([], 3, 1, 3)).toEqual(["001", "002", "003"]);
  });
  it("skips numbers already in use, padded or not", () => {
    expect(planBibs(["002", "4", "A1"], 3, 1, 3)).toEqual(["001", "003", "005"]);
  });
  it("grows past the width when needed", () => {
    expect(planBibs([], 2, 999, 3)).toEqual(["999", "1000"]);
  });
});
